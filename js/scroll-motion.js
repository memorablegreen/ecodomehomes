/*
  Premium scroll motion for the EcoDomeHomes homepage.
  - Lenis: site-wide smooth scroll, wired into ScrollTrigger + the GSAP ticker.
  - Cinematic hero entrance: headline split into words (wrapped by hand, no
    plugin), clip-mask + rise reveal, followed by the sub copy and CTAs.
  - Hero stats count up from 0 once they settle into view.
  - Section reveals: quick, play-once reveals (toggleActions: play none none
    none) that trigger early, around 'top 90%', as each section enters the
    viewport - clip-path wipes on headings, scale-in on card grids, a clip
    wipe on the full-bleed break images, and the same early play-once
    treatment for the two flagship sections (Engineered, Economics).
    Nothing pins or scrubs the page: scrolling always stays free and never
    holds or slows down, no matter how fast or slow the visitor scrolls.

  Hard accessibility requirement: when the user has requested reduced motion,
  this script does nothing at all (no Lenis, no GSAP, no reveals) and the
  page stays fully static and visible. Every "hidden" starting state is
  applied at runtime via gsap.set(), never in CSS, so a page with JS
  disabled or a failed CDN load always shows everything, fully readable.
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  // ---- Lenis smooth scroll, wired into ScrollTrigger + the GSAP ticker ----
  if (typeof Lenis !== 'undefined') {
    var lenis = new Lenis();

    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  // =========================================================================
  // Hero: word-split headline entrance + count-up stats
  // =========================================================================

  // Wraps every word of text inside `root` in a two-span mask/inner pair,
  // recursing through child elements (e.g. the .accent spans) so their
  // styling is preserved per-word. Whitespace is left as plain text nodes
  // so normal line-wrapping still applies. Returns the ordered list of
  // `.word-inner` spans to animate.
  function splitWords(root) {
    var innerEls = [];

    function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (child) {
        if (child.nodeType === 3) {
          var text = child.nodeValue;
          if (!text) return;
          var frag = document.createDocumentFragment();
          text.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) {
              frag.appendChild(document.createTextNode(part));
              return;
            }
            var mask = document.createElement('span');
            mask.className = 'word-mask';
            var inner = document.createElement('span');
            inner.className = 'word-inner';
            inner.textContent = part;
            mask.appendChild(inner);
            frag.appendChild(mask);
            innerEls.push(inner);
          });
          node.replaceChild(frag, child);
        } else if (child.nodeType === 1) {
          walk(child);
        }
      });
    }

    walk(root);
    return innerEls;
  }

  function heroEntrance() {
    var heroContent = document.querySelector('.hero-content');
    if (!heroContent) return;

    var h1 = heroContent.querySelector('h1');
    var sub = heroContent.querySelector('.hero-sub');
    var buttonRow = heroContent.querySelector('.button-row');
    var textlinksRow = heroContent.querySelector('.textlinks-row');

    var tl = gsap.timeline({ delay: 0.2 });

    if (h1) {
      var words = splitWords(h1);
      if (words.length) {
        gsap.set(words, { yPercent: 130, opacity: 0 });
        tl.to(words, {
          yPercent: 0, opacity: 1, duration: 1.05, ease: 'power4.out', stagger: 0.045
        }, 0);
      }
    }
    if (sub) {
      gsap.set(sub, { opacity: 0, y: 30 });
      tl.to(sub, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out' }, 0.55);
    }
    if (buttonRow) {
      gsap.set(buttonRow, { opacity: 0, y: 26 });
      tl.to(buttonRow, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.75);
    }
    if (textlinksRow) {
      gsap.set(textlinksRow, { opacity: 0, y: 22 });
      tl.to(textlinksRow, { opacity: 1, y: 0, duration: 0.8, ease: 'power3.out' }, 0.85);
    }
  }

  function countUp(strong, target, prefix, suffix, decimals) {
    var counter = { val: 0 };
    gsap.to(counter, {
      val: target,
      duration: 1.7,
      ease: 'power2.out',
      onUpdate: function () {
        var current = decimals ? counter.val.toFixed(decimals) : Math.round(counter.val);
        strong.textContent = prefix + current + suffix;
      }
    });
  }

  function heroStats() {
    var statEls = document.querySelectorAll('.hero-stats .hero-stat');
    var outer = document.querySelector('.hero-stats-outer');
    if (!statEls.length) return;

    gsap.set(statEls, { opacity: 0, y: 40, scale: 0.94 });

    ScrollTrigger.create({
      trigger: outer || statEls[0],
      start: 'top 92%',
      once: true,
      onEnter: function () {
        gsap.to(statEls, {
          opacity: 1, y: 0, scale: 1, duration: 0.8, ease: 'power3.out', stagger: 0.1
        });

        Array.prototype.forEach.call(statEls, function (stat) {
          var strong = stat.querySelector('strong');
          if (!strong) return;
          var raw = strong.textContent;
          var match = raw.match(/\d+(\.\d+)?/);
          if (!match) return;
          var target = parseFloat(match[0]);
          var prefix = raw.slice(0, match.index);
          var suffix = raw.slice(match.index + match[0].length);
          var decimals = match[0].indexOf('.') > -1 ? match[0].split('.')[1].length : 0;
          countUp(strong, target, prefix, suffix, decimals);
        });
      }
    });
  }

  heroEntrance();
  heroStats();

  // =========================================================================
  // Section reveals
  // =========================================================================

  // A group of heading elements (h2 / subtitle / desc / inline CTAs): a
  // clip-path wipe combined with a rise, staggered top to bottom.
  function headReveal(head) {
    if (!head) return;
    var kids = Array.prototype.slice.call(head.children);
    if (!kids.length) return;

    gsap.set(kids, { opacity: 0, y: 46, clipPath: 'inset(0 0 100% 0)' });
    gsap.to(kids, {
      opacity: 1, y: 0, clipPath: 'inset(0 0 0% 0)',
      duration: 1, ease: 'power4.out', stagger: 0.12,
      scrollTrigger: { trigger: head, start: 'top 90%', toggleActions: 'play none none none' }
    });
  }

  // A grid/row of cards or items: scale + rise in with stagger.
  function cardsReveal(container) {
    if (!container) return;
    var cards = Array.prototype.slice.call(container.children).filter(function (c) {
      return c.nodeType === 1;
    });
    if (!cards.length) return;

    gsap.set(cards, { opacity: 0, y: 64, scale: 0.9 });
    gsap.to(cards, {
      opacity: 1, y: 0, scale: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: { trigger: container, start: 'top 90%', toggleActions: 'play none none none' }
    });
  }

  // A single content block (table, form, lone paragraph): rise + fade.
  function blockReveal(el) {
    if (!el) return;
    gsap.set(el, { opacity: 0, y: 56 });
    gsap.to(el, {
      opacity: 1, y: 0, duration: 0.9, ease: 'power3.out',
      scrollTrigger: { trigger: el, start: 'top 90%', toggleActions: 'play none none none' }
    });
  }

  // Full-bleed section-break images: a top-to-bottom clip wipe on entrance.
  // No scrub, no pin - it plays once as the image enters view and never
  // ties itself to ongoing scroll position, so scrolling past it stays free.
  function fullBleedImage(container) {
    var img = container.querySelector('img');
    if (!img) return;

    gsap.set(img, { scale: 1.08 });

    gsap.fromTo(img,
      { clipPath: 'inset(0 0 100% 0)' },
      {
        clipPath: 'inset(0 0 0% 0)', duration: 1.1, ease: 'power4.inOut',
        scrollTrigger: { trigger: container, start: 'top 90%', toggleActions: 'play none none none' }
      }
    );
  }

  Array.prototype.forEach.call(document.querySelectorAll('.img-break, .greenhouse-photo'), fullBleedImage);

  // Every .section (except the two flagship sections below, which get their
  // own early play-once reveal): reveal its heading group, then its content.
  // Content that is a grid/list of items (pricing tiers, feature cards,
  // steps, chips, etc.) scales in with a stagger; a single content block
  // (a table, a form row) rises as one.
  Array.prototype.forEach.call(document.querySelectorAll('.section'), function (section) {
    if (section.id === 'engineered' || section.id === 'economics') return;

    Array.prototype.forEach.call(section.querySelectorAll('.wrap'), function (wrap) {
      var head = wrap.querySelector('.section-head');

      if (head && head.parentElement === wrap) {
        headReveal(head);
      }

      Array.prototype.forEach.call(wrap.children, function (child) {
        if (child === head) return;

        if (child.children && child.children.length > 1) {
          cardsReveal(child);
        } else {
          blockReveal(child);
        }
      });
    });
  });

  // =========================================================================
  // Flagship moments: Engineered + Economics
  // =========================================================================

  // Quick, play-once reveal for a flagship section's heading and item grid.
  // No pin, no scrub: the section animates in as it crosses 'top 90%' and
  // scrolling never holds, slows, or gets hijacked.
  function flagshipReveal(section, itemsSelector) {
    if (!section) return;
    var head = section.querySelector('.section-head');
    var items = section.querySelectorAll(itemsSelector);
    if (!items.length) return;

    var headKids = head ? Array.prototype.slice.call(head.children) : [];
    var trigger = { trigger: section, start: 'top 90%', toggleActions: 'play none none none' };

    if (headKids.length) {
      gsap.set(headKids, { opacity: 0, y: 40 });
      gsap.to(headKids, {
        opacity: 1, y: 0, duration: 0.8, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: trigger
      });
    }

    gsap.set(items, { opacity: 0, y: 56, scale: 0.94 });
    gsap.to(items, {
      opacity: 1, y: 0, scale: 1, duration: 0.75, ease: 'power3.out', stagger: 0.1,
      scrollTrigger: trigger
    });
  }

  flagshipReveal(document.getElementById('engineered'), '.feature-card');
  flagshipReveal(document.getElementById('economics'), '.stat-block');

  // Section reveal calculations depend on final layout (web fonts, images);
  // refresh once everything has actually loaded so trigger positions stay
  // accurate.
  window.addEventListener('load', function () {
    ScrollTrigger.refresh();
  });
})();
