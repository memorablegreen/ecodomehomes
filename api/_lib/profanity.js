// Server-side profanity / slur filter for the pricing-calculator lead-capture
// Name field (api/validate-email.js). Blocks obviously abusive input before
// it reaches GHL, the lead-alert email, or Supabase.
//
// GUIDING PRINCIPLE: whole-token matching, not substring search. Each token
// of the input is normalized (leetspeak digits -> letters, repeated letters
// collapsed via a "one or more" match, common censor symbols like "*"
// standing in for a letter) and then matched against a flagged word with the
// pattern ANCHORED to the entire token. A real word that merely CONTAINS a
// flagged word as a substring -- the classic "Scunthorpe problem" -- can
// never match, because the extra letters around it have nowhere to go in an
// anchored pattern. A short ALLOWLIST covers the handful of real given
// names/surnames that are themselves spelled identically to a flagged word
// (e.g. "Dick", "Randy").
//
// Not exhaustive by design: this is a lead-capture form field, not a
// full-text moderation system. It raises the cost of an obviously abusive
// submission; it does not attempt to catch every conceivable slur or every
// conceivable obfuscation.

'use strict';

// Base (canonical) forms, lowercase, no separators.
const PROFANITY_WORDS = [
  // vulgar / general profanity
  'fuck', 'shit', 'bitch', 'bastard', 'cunt', 'dick', 'pussy', 'cock',
  'twat', 'wank', 'wanker', 'asshole', 'asswipe', 'motherfucker',
  'bollocks', 'bugger', 'douchebag', 'dumbass', 'jackass', 'prick',
  'slut', 'whore', 'fanny', 'crap',
  // slurs
  'nigger', 'nigga', 'faggot', 'fag', 'chink', 'spic', 'kike', 'gook',
  'tranny', 'dyke', 'retard',
];

// Real names/words spelled identically to one of the (milder) words above.
// Checked per-token, before the fuzzy match, case-insensitive.
const ALLOWLIST = new Set(['dick', 'randy', 'dyke', 'fanny']);

// Leetspeak digit/symbol -> letter. Applied to a token before matching, so
// "sh1t" normalizes to "shit".
const LEET_MAP = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

function deleet(token) {
  return token.replace(/[013457@$]/g, function (ch) { return LEET_MAP[ch] || ch; });
}

function escapeRegexChar(ch) {
  return ch.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// One compiled regex per flagged word, cached lazily. Each letter position
// matches either one-or-more of that letter (collapses "fuuuck" -> "fuck")
// or a single generic censor symbol standing in for it (catches "f*ck");
// positions are joined by an optional run of non-alphanumeric filler so
// "f.u.c.k" / "f_u_c_k" also match. The whole pattern is anchored to the
// FULL token (only optional filler allowed before/after), which is what
// keeps a real word that just contains the flagged word -- e.g.
// "Scunthorpe" containing "cunt" -- from ever matching.
const wordPatternCache = new Map();
function patternFor(word) {
  var cached = wordPatternCache.get(word);
  if (cached) { return cached; }
  var body = word
    .split('')
    .map(function (c) { return '(?:' + escapeRegexChar(c) + '+|[*#%])'; })
    .join('[^a-z0-9]*');
  var re = new RegExp('^[^a-z0-9]*' + body + '[^a-z0-9]*$', 'i');
  wordPatternCache.set(word, re);
  return re;
}

// Checks every whitespace-separated token of `text` against PROFANITY_WORDS.
// Returns true on the first flagged token. Never throws; a non-string input
// resolves to false.
function containsProfanity(text) {
  if (!text) { return false; }
  var tokens = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  return tokens.some(function (rawToken) {
    if (ALLOWLIST.has(rawToken)) { return false; }
    var normalized = deleet(rawToken);
    if (ALLOWLIST.has(normalized)) { return false; }
    return PROFANITY_WORDS.some(function (word) { return patternFor(word).test(normalized); });
  });
}

module.exports = { PROFANITY_WORDS, ALLOWLIST, containsProfanity };
