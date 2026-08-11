// Server-side profanity / slur filter for the pricing-calculator lead-capture
// Name field (api/validate-email.js). Blocks obviously abusive input before
// it reaches GHL, the lead-alert email, or Supabase.
//
// GUIDING PRINCIPLE: whole-token matching, not substring search. Each token of
// the input is normalized (accents and eszett folded, leetspeak digits ->
// letters, repeated letters collapsed, censor symbols like "*" standing in for
// a letter) and matched against a flagged word with the pattern ANCHORED to the
// entire token. A real word that merely CONTAINS a flagged word as a substring,
// the classic "Scunthorpe problem", can never match, because the extra letters
// have nowhere to go in an anchored pattern.
//
// WORD LIST rebuilt 2026-08-11 from LDNOOBW
// (List-of-Dirty-Naughty-Obscene-and-Otherwise-Bad-Words), merging its en, pt,
// es, fr, de and nl lists. The previous 35-word list was English only, so a
// French or Dutch obscenity went through untouched on a site that takes
// sign-ups in six languages. Multi-word phrases are dropped (they can never
// match a single name token), as are entries under three letters.
//
// THEN SUBTRACTED: every entry that is also a real given name or surname,
// against a ~22k names corpus. That source is built for moderating free text,
// so it flags ordinary words that are perfectly good names: it contains
// "peter" (French "peter"), "anita", "pinto", "johny", "quim", "del" and "pau",
// all common in Portugal, Spain and the Netherlands. Shipping those would have
// silently rejected real customers at the revenue gate, and nobody would ever
// have reported it. A short force-list puts back the unambiguous slurs the
// names corpus also happens to contain.
//
// KNOWN LIMIT, deliberate and unchanged: matching is anchored to the whole
// token, so inflections such as "fucking" are NOT caught. Relaxing that is
// exactly what would make "Cockburn" and "Scunthorpe" start failing.

'use strict';

// Base (canonical) forms, lowercase, no separators, already transliterated.
const PROFANITY_WORDS = [
  'aborto', 'acrotomophilia', 'afberen', 'aflebberen', 'afrossen', 'afrukken', 'aftrekken',
  'afwerkplaats', 'afzeiken', 'afzuigen', 'anal', 'analritter', 'anilingus', 'anus', 'apeshit',
  'aranha', 'ariano', 'arsch', 'arschficker', 'arschlecker', 'arschloch', 'arsehole', 'asbak',
  'asesinato', 'asno', 'aso', 'ass', 'asshole', 'assmunch', 'asswipe', 'autoerotic',
  'babeland', 'baiser', 'balalao', 'balen', 'bangbros', 'bangbus', 'bareback', 'barenaked',
  'bastard', 'bastardo', 'bastinado', 'bbw', 'bdsm', 'beaner', 'beaners', 'beastiality',
  'bedonderen', 'befborstel', 'beffen', 'bekken', 'belazeren', 'besodemieteren', 'bestiality',
  'beurt', 'bicha', 'bigornette', 'bimbo', 'bimbos', 'birdlock', 'biscate', 'bissexual',
  'bitch', 'bitches', 'bite', 'bitte', 'bloblos', 'blowjob', 'blumpkin', 'boceta', 'boemelen',
  'boerelul', 'boerenpummel', 'bokkelul', 'bollera', 'bollocks', 'bondage', 'boner', 'bonze',
  'boob', 'boobs', 'bordel', 'bosta', 'botergeil', 'bourre', 'bourree', 'brackmard',
  'branlage', 'branler', 'branlette', 'branleur', 'branleuse', 'bratze', 'broekhoesten',
  'brugpieper', 'buffelen', 'bugger', 'bukkake', 'bulldyke', 'bullshit', 'bumbum', 'bumsen',
  'bunghole', 'burro', 'busty', 'buttcheeks', 'butthole', 'cabrao', 'cabron', 'caca', 'cacete',
  'cagar', 'camgirl', 'camisinha', 'camslut', 'camwhore', 'caralho', 'carpetmuncher',
  'cerveja', 'chatte', 'chiasse', 'chier', 'chink', 'chiottes', 'chochota', 'chupada',
  'chupapollas', 'chupar', 'chupeton', 'cialis', 'circlejerk', 'clit', 'clito', 'clitoris',
  'clusterfuck', 'cocaina', 'cock', 'cocks', 'coito', 'colhoes', 'comer', 'cona', 'connard',
  'connasse', 'conne', 'cono', 'consolo', 'coon', 'coons', 'coprofagia', 'coprolagnia',
  'coprophilia', 'cornhole', 'corno', 'couilles', 'cramouille', 'crap', 'creampie', 'cul',
  'culo', 'cum', 'cumming', 'cumshot', 'cumshots', 'cunnilingus', 'cunt', 'darkie', 'daterape',
  'deconne', 'deconner', 'deepthroat', 'dendrophilia', 'dildo', 'dingleberries', 'dingleberry',
  'dodel', 'doggiestyle', 'doggystyle', 'dolcett', 'dombo', 'domination', 'dominatrix',
  'dommes', 'douchebag', 'draaikont', 'drogas', 'drol', 'drooggeiler', 'droogkloot', 'dumbass',
  'dvda', 'ecchi', 'eikel', 'ejaculation', 'emmerdant', 'emmerder', 'emmerdeur', 'emmerdeuse',
  'encule', 'enculee', 'enculeur', 'enculeurs', 'enfoire', 'enfoiree', 'engerd', 'erotic',
  'erotism', 'escort', 'esperma', 'esporra', 'etron', 'eunuch', 'fag', 'faggot', 'fecal',
  'felch', 'fellatio', 'feltch', 'femdom', 'fick', 'ficken', 'figging', 'fingerbang',
  'fingering', 'fisting', 'flamoes', 'flikken', 'flikker', 'flittchen', 'foda', 'fodase',
  'foder', 'follador', 'follar', 'folle', 'footjob', 'fotze', 'foutre', 'fratze', 'frotting',
  'fuck', 'fuckin', 'fucking', 'fucktards', 'fudgepacker', 'futanari', 'gadverdamme', 'galbak',
  'gangbang', 'gat', 'gedoogzone', 'geilneef', 'genitals', 'gerbe', 'gerber', 'gesodemieter',
  'gilipichis', 'gilipollas', 'goatcx', 'goatse', 'godverdomme', 'gokkun', 'goodpoop', 'gook',
  'goregasm', 'gouine', 'gozar', 'graftak', 'gratenkut', 'grelho', 'greppeldel', 'grogniasse',
  'grope', 'gspot', 'gueule', 'guro', 'hackfresse', 'handjob', 'hardcore', 'hentai', 'heroina',
  'heterosexual', 'hijaputa', 'hijoputa', 'hoempert', 'hoer', 'hoerenbuurt', 'hoerenloper',
  'hoerig', 'hol', 'homoerotic', 'homoerotico', 'homosexual', 'honkey', 'horny', 'hufter',
  'huisdealer', 'humping', 'hure', 'hurensohn', 'idiota', 'imbecil', 'incest', 'inferno',
  'infierno', 'intercourse', 'ische', 'jackass', 'jailbait', 'jigaboo', 'jiggaboo',
  'jiggerboo', 'jilipollas', 'jizz', 'jouir', 'juggs', 'kackbratze', 'kacke', 'kacken',
  'kackwurst', 'kampflesbe', 'kanake', 'kanen', 'kapullo', 'kettingzeug', 'kike', 'kimme',
  'kinbaku', 'kinkster', 'kinky', 'klaarkomen', 'klerebeer', 'klojo', 'klooien',
  'klootjesvolk', 'klootoog', 'klootzak', 'kloten', 'knobbing', 'knor', 'kont', 'kontneuken',
  'krentekakker', 'kut', 'kuttelikkertje', 'kwakkie', 'lameculos', 'lesbica', 'liefdesgrot',
  'livesex', 'lovemaking', 'lul', 'luldebehanger', 'lulhannes', 'lummel', 'maciza',
  'macizorra', 'mafketel', 'maldito', 'malpt', 'mama', 'mamada', 'marica', 'maricon',
  'mariconazo', 'martillo', 'masturbate', 'masturbating', 'masturbation', 'matennaaier',
  'matje', 'merda', 'merde', 'merdeuse', 'merdeux', 'meuf', 'mierda', 'milf', 'mof', 'mong',
  'mopse', 'morgenlatte', 'motherfucker', 'muffdiving', 'mufti', 'muschi', 'muts', 'naaien',
  'naakt', 'nackt', 'nambla', 'nawashi', 'nazi', 'neger', 'negre', 'negro', 'neonazi',
  'neuken', 'neukstier', 'nicht', 'nigga', 'nigger', 'nimphomania', 'nippel', 'nipple',
  'nipples', 'nsfw', 'nude', 'nudity', 'nutte', 'nutten', 'nympho', 'nymphomania', 'octopussy',
  'oetlul', 'omorashi', 'onanieren', 'opgeilen', 'opkankeren', 'oprotten', 'opsodemieteren',
  'opzouten', 'orgasm', 'orgasmus', 'orgy', 'orina', 'ouwehoer', 'ouwehoeren', 'paal',
  'paardelul', 'paedophile', 'paki', 'palen', 'palucher', 'paneleiro', 'panties', 'panty',
  'pedale', 'pede', 'pedo', 'pedobear', 'pedophile', 'pegging', 'peidar', 'pendejo', 'penis',
  'penoze', 'pervertido', 'pezon', 'piesen', 'pijpbekkieg', 'pijpen', 'pik', 'pikey', 'pimmel',
  'pimpern', 'pinche', 'pinkeln', 'pipi', 'pis', 'pissen', 'pisser', 'pissing', 'pisspig',
  'playboy', 'pleurislaaier', 'poep', 'poepen', 'ponyplay', 'poof', 'poon', 'poontang',
  'poopchute', 'poot', 'popel', 'poppen', 'porn', 'porno', 'pornography', 'porra',
  'portiekslet', 'pot', 'potverdorie', 'pouffiasse', 'poussecrotte', 'prick', 'prostituta',
  'pthc', 'pubes', 'publiciteitsgeil', 'punany', 'pussy', 'puta', 'putain', 'pute', 'queaf',
  'queca', 'queef', 'raaskallen', 'racista', 'raghead', 'ramera', 'ramoner', 'rape', 'raping',
  'rapist', 'rectum', 'reet', 'reetridder', 'remsporen', 'retard', 'reudig', 'reutelen',
  'rimjob', 'rimming', 'rothoer', 'rotzak', 'rukhond', 'rukken', 'sacanagem', 'saco', 'sadico',
  'sadism', 'salaud', 'salope', 'santorum', 'scat', 'schabracke', 'schatje', 'scheisse',
  'scheisser', 'schiesser', 'schijt', 'schijten', 'schlampe', 'schlong', 'schnackeln',
  'schoft', 'schuinsmarcheerder', 'schwanzlutscher', 'schwuchtel', 'scissoring', 'semen',
  'sex', 'sexcam', 'sexo', 'sexual', 'sexuality', 'sexually', 'sexy', 'shemale', 'shibari',
  'shit', 'shitblimp', 'shitty', 'shota', 'shrimping', 'skeet', 'slanteye', 'slempen', 'slet',
  'sletterig', 'slut', 'smut', 'snatch', 'snol', 'snowballing', 'sodomize', 'sodomy',
  'soplagaitas', 'soplapollas', 'spastic', 'spic', 'splooge', 'spooge', 'spuiten', 'spunk',
  'standje', 'stoephoer', 'stootje', 'strapon', 'strappado', 'stront', 'suce', 'suck', 'sucks',
  'sufferd', 'swastika', 'swinger', 'tanche', 'tapette', 'tapijtnek', 'teef', 'temeier',
  'teringlijer', 'teuch', 'threesome', 'throating', 'thumbzilla', 'tit', 'tits', 'tittchen',
  'titten', 'titties', 'titty', 'toeter', 'tongzoeng', 'topless', 'torneira', 'tosser',
  'towelhead', 'tranny', 'transar', 'travesti', 'tribadism', 'tringler', 'trio', 'triootjeg',
  'trique', 'troncher', 'trottoirteef', 'tubgirl', 'turlute', 'tushy', 'twat', 'twink',
  'twinkie', 'undressing', 'upskirt', 'urophilia', 'vadia', 'vagina', 'veado', 'verga',
  'vergallen', 'verkloten', 'verneuken', 'viagra', 'vibrador', 'vibrator', 'viespeuk',
  'vingeren', 'vleesroos', 'vogeln', 'vollpfosten', 'vorarephilia', 'voyeur', 'voyeurweb',
  'voyuer', 'vulva', 'wank', 'wanker', 'watje', 'welzijnsmafia', 'wetback', 'whore', 'wichse',
  'wichsen', 'wichser', 'wijf', 'wippen', 'worldsex', 'wuftje', 'xana', 'xochota', 'xxx',
  'yaoi', 'yiffy', 'zaadje', 'zakkenwasser', 'zeiken', 'zeiker', 'zigounette', 'zizi',
  'zoophilia', 'zuigen', 'zuiplap'
];

// Real names spelled identically to a flagged word, checked per token before
// the fuzzy match. "Butt" and "Hooker" are here because they are genuine
// surnames in the markets this site sells into, not only in the regions they
// are associated with.
const ALLOWLIST = new Set(['dick', 'randy', 'dyke', 'fanny', 'butt', 'hooker']);

// Fold the characters the word list was flattened with, so a visitor typing
// "Scheisse" and one typing "Scheiße" hit the same entry. Without this, adding
// the German and Portuguese lists would have been mostly decorative.
const TRANSLITERATE = { ß: 'ss', ø: 'o', æ: 'ae', å: 'a', œ: 'oe', ł: 'l', đ: 'd', þ: 'th', ð: 'd' };

function fold(token) {
  var out = token;
  Object.keys(TRANSLITERATE).forEach(function (ch) {
    out = out.split(ch).join(TRANSLITERATE[ch]);
  });
  return out.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

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
    var folded = fold(rawToken);
    if (ALLOWLIST.has(rawToken) || ALLOWLIST.has(folded)) { return false; }
    var normalized = deleet(folded);
    if (ALLOWLIST.has(normalized)) { return false; }
    return PROFANITY_WORDS.some(function (word) { return patternFor(word).test(normalized); });
  });
}

module.exports = { PROFANITY_WORDS, ALLOWLIST, containsProfanity };
