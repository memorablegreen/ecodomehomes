(function () {
  'use strict';

  // Two jobs, both no-ops when their markup is absent:
  //
  //  1. On /designs, make the .model-card tiles open a lightbox. The cards
  //     already lift and shadow on hover, which reads as "clickable" to every
  //     visitor, but they were plain divs. Clarity recorded that as dead clicks
  //     on 6% of all sessions, concentrated on this page. A click on a design
  //     is the most specific buying intent the site collects, so the lightbox
  //     ends with a quote CTA carrying the design name.
  //
  //  2. On /contact, read ?design= off that CTA and prefill the message box, so
  //     the design a lead picked actually reaches the inbox.
  //
  // Analytics calls mirror js/analytics-events.js: fail silently, never throw
  // into the page, and stay out of the numbers when window.__NOTRACK is set.

  var STRINGS = {
    en: { quote: 'Get a quote for this design', close: 'Close', prev: 'Previous design', next: 'Next design', gallery: 'Design gallery', prefill: 'I am interested in the {design} design.' },
    de: { quote: 'Angebot für dieses Design anfordern', close: 'Schließen', prev: 'Vorheriges Design', next: 'Nächstes Design', gallery: 'Design-Galerie', prefill: 'Ich interessiere mich für das Design {design}.' },
    es: { quote: 'Solicitar presupuesto para este diseño', close: 'Cerrar', prev: 'Diseño anterior', next: 'Diseño siguiente', gallery: 'Galería de diseños', prefill: 'Me interesa el diseño {design}.' },
    fr: { quote: 'Demander un devis pour ce design', close: 'Fermer', prev: 'Design précédent', next: 'Design suivant', gallery: 'Galerie de designs', prefill: 'Je suis intéressé par le design {design}.' },
    nl: { quote: 'Vraag een offerte aan voor dit ontwerp', close: 'Sluiten', prev: 'Vorig ontwerp', next: 'Volgend ontwerp', gallery: 'Ontwerpgalerij', prefill: 'Ik heb interesse in het ontwerp {design}.' },
    pt: { quote: 'Pedir orçamento para este design', close: 'Fechar', prev: 'Design anterior', next: 'Design seguinte', gallery: 'Galeria de designs', prefill: 'Tenho interesse no design {design}.' }
  };

  function lang() {
    var l = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    return STRINGS[l] ? l : 'en';
  }
  var T = STRINGS[lang()];

  // /designs -> /contact, /pt/designs -> /pt/contact. cleanUrls is on, so no
  // .html suffix. Anything unexpected falls back to the root contact page.
  function contactUrl(design) {
    var m = (window.location.pathname || '').match(/^\/(de|es|fr|nl|pt|us)\//);
    var base = (m ? '/' + m[1] : '') + '/contact';
    return base + '?design=' + encodeURIComponent(design);
  }

  function track(name, params) {
    if (window.__NOTRACK) return;
    try { if (typeof gtag === 'function') gtag('event', name, params || {}); } catch (e) {}
    try { if (typeof window.va === 'function') window.va('event', { name: name, data: params || {} }); } catch (e) {}
  }

  // ---------------------------------------------------------------- lightbox
  function initGallery() {
    var grid = document.getElementById('gallery-grid');
    if (!grid) return;
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.model-card'));
    if (!cards.length) return;

    injectStyles();

    var overlay = buildOverlay();
    document.body.appendChild(overlay.root);

    var openIndex = -1;
    var lastFocus = null;

    // Only cards the active filter is showing, so prev/next walks what the
    // visitor can actually see rather than jumping into a hidden category.
    function visibleCards() {
      return cards.filter(function (c) { return c.style.display !== 'none'; });
    }

    function dataFor(card) {
      var img = card.querySelector('.model-img img');
      var h3 = card.querySelector('.model-body h3');
      var desc = card.querySelector('.model-body .model-desc');
      return {
        src: img ? (img.currentSrc || img.src) : '',
        alt: img ? (img.alt || '') : '',
        title: h3 ? h3.textContent.trim() : '',
        meta: desc ? desc.textContent.trim() : ''
      };
    }

    function open(card) {
      var list = visibleCards();
      var i = list.indexOf(card);
      if (i === -1) return;
      lastFocus = document.activeElement;
      render(list, i);
      overlay.root.classList.add('is-open');
      overlay.root.setAttribute('aria-hidden', 'false');
      document.body.style.overflow = 'hidden';
      overlay.close.focus();
      var d = dataFor(card);
      track('design_open', { design: d.title, position: i + 1 });
    }

    function render(list, i) {
      openIndex = i;
      var d = dataFor(list[i]);
      overlay.img.src = d.src;
      overlay.img.alt = d.alt;
      overlay.title.textContent = d.title;
      overlay.meta.textContent = d.meta;
      overlay.meta.style.display = d.meta ? '' : 'none';
      overlay.cta.href = contactUrl(d.title);
      overlay.counter.textContent = (i + 1) + ' / ' + list.length;
      var many = list.length > 1;
      overlay.prev.style.display = many ? '' : 'none';
      overlay.next.style.display = many ? '' : 'none';
    }

    function step(delta) {
      var list = visibleCards();
      if (!list.length) return;
      var i = (openIndex + delta + list.length) % list.length;
      render(list, i);
    }

    function close() {
      overlay.root.classList.remove('is-open');
      overlay.root.setAttribute('aria-hidden', 'true');
      document.body.style.overflow = '';
      openIndex = -1;
      if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    cards.forEach(function (card) {
      card.setAttribute('role', 'button');
      card.setAttribute('tabindex', '0');
      var h3 = card.querySelector('.model-body h3');
      if (h3) card.setAttribute('aria-label', h3.textContent.trim());
      card.style.cursor = 'pointer';
      card.addEventListener('click', function () { open(card); });
      card.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
          e.preventDefault();
          open(card);
        }
      });
    });

    overlay.close.addEventListener('click', close);
    overlay.prev.addEventListener('click', function () { step(-1); });
    overlay.next.addEventListener('click', function () { step(1); });
    overlay.root.addEventListener('click', function (e) {
      if (e.target === overlay.root) close();
    });
    overlay.cta.addEventListener('click', function () {
      track('design_quote_click', { design: overlay.title.textContent });
    });
    document.addEventListener('keydown', function (e) {
      if (!overlay.root.classList.contains('is-open')) return;
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'ArrowLeft') { step(-1); return; }
      if (e.key === 'ArrowRight') { step(1); return; }
      // Keep tabbing inside the dialog while it is open.
      if (e.key === 'Tab') {
        var f = overlay.root.querySelectorAll('button:not([style*="display: none"]), a[href]');
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
  }

  function buildOverlay() {
    var root = document.createElement('div');
    root.className = 'dlb';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', T.gallery);
    root.setAttribute('aria-hidden', 'true');

    root.innerHTML =
      '<div class="dlb-panel">' +
        '<button type="button" class="dlb-x" aria-label="' + T.close + '">&times;</button>' +
        // Nav lives inside the figure so the arrows stay centred on the image
        // whatever its aspect ratio, instead of guessing a percentage.
        '<div class="dlb-figure">' +
          '<img class="dlb-img" alt="">' +
          '<button type="button" class="dlb-nav dlb-prev" aria-label="' + T.prev + '">&#8249;</button>' +
          '<button type="button" class="dlb-nav dlb-next" aria-label="' + T.next + '">&#8250;</button>' +
        '</div>' +
        '<div class="dlb-body">' +
          '<span class="dlb-counter"></span>' +
          '<h3 class="dlb-title"></h3>' +
          '<p class="dlb-meta"></p>' +
          '<a class="dlb-cta" href="/contact">' + T.quote + '</a>' +
        '</div>' +
      '</div>';

    return {
      root: root,
      img: root.querySelector('.dlb-img'),
      title: root.querySelector('.dlb-title'),
      meta: root.querySelector('.dlb-meta'),
      cta: root.querySelector('.dlb-cta'),
      counter: root.querySelector('.dlb-counter'),
      close: root.querySelector('.dlb-x'),
      prev: root.querySelector('.dlb-prev'),
      next: root.querySelector('.dlb-next')
    };
  }

  function injectStyles() {
    if (document.getElementById('dlb-styles')) return;
    var css =
      '.dlb{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;' +
        'background:rgba(31,36,25,.82);padding:24px;overscroll-behavior:contain;}' +
      '.dlb.is-open{display:flex;}' +
      // The panel hugs its content rather than stretching to the viewport, so a
      // 4:3 image never sits in a field of empty grey on a tall phone screen.
      '.dlb-panel{position:relative;background:var(--white,#fff);border-radius:20px;overflow-y:auto;' +
        'max-width:920px;width:100%;max-height:92vh;display:flex;flex-direction:column;' +
        '-webkit-overflow-scrolling:touch;box-shadow:var(--shadow-lg,0 20px 50px rgba(0,0,0,.16));}' +
      '.dlb-figure{position:relative;background:#f0f0ea;flex:0 0 auto;display:flex;}' +
      '.dlb-img{width:100%;height:auto;max-height:64vh;object-fit:contain;margin:auto;}' +
      '.dlb-body{padding:20px 24px 24px;flex:0 0 auto;}' +
      '.dlb-counter{font-size:12.5px;letter-spacing:.08em;text-transform:uppercase;color:var(--subtle,#8a8f80);}' +
      '.dlb-title{font-size:22px;color:var(--ink,#1F2419);margin:6px 0 6px;}' +
      '.dlb-meta{color:var(--muted,#5b6152);font-size:14.5px;margin:0 0 16px;}' +
      '.dlb-cta{display:inline-block;background:var(--bright,#1A936F);color:#fff;text-decoration:none;' +
        'font-weight:600;font-size:15.5px;padding:13px 24px;border-radius:999px;transition:background .15s;}' +
      '.dlb-cta:hover{background:var(--bright-hover,#157a5c);}' +
      '.dlb-x{position:absolute;top:12px;right:12px;z-index:2;width:40px;height:40px;border:0;cursor:pointer;' +
        'border-radius:50%;background:rgba(255,255,255,.92);color:var(--ink,#1F2419);font-size:26px;line-height:1;}' +
      '.dlb-nav{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:44px;height:44px;border:0;' +
        'cursor:pointer;border-radius:50%;background:rgba(255,255,255,.92);color:var(--ink,#1F2419);' +
        'font-size:26px;line-height:1;}' +
      '.dlb-prev{left:12px;} .dlb-next{right:12px;}' +
      '.dlb-x:hover,.dlb-nav:hover{background:#fff;}' +
      '@media (max-width:640px){' +
        '.dlb{padding:14px;align-items:center;}' +
        '.dlb-panel{border-radius:16px;max-height:88vh;}' +
        '.dlb-img{max-height:56vh;}' +
        '.dlb-body{padding:16px 18px 20px;}' +
        '.dlb-cta{display:block;text-align:center;}' +
      '}' +
      '@media (prefers-reduced-motion:reduce){.model-card{transition:none !important;}}';
    var tag = document.createElement('style');
    tag.id = 'dlb-styles';
    tag.textContent = css;
    document.head.appendChild(tag);
  }

  // ------------------------------------------------------- contact prefill
  function initContactPrefill() {
    var box = document.getElementById('f-message');
    if (!box) return;
    var design = null;
    try { design = new URLSearchParams(window.location.search).get('design'); } catch (e) {}
    if (!design) return;
    design = design.slice(0, 120);
    // Never clobber something the visitor already typed.
    if (box.value.trim()) return;
    box.value = T.prefill.replace('{design}', design);
    track('design_quote_landed', { design: design });
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    initGallery();
    initContactPrefill();
  });
})();
