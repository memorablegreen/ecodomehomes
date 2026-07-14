(function(){
  // Auto-injects a hamburger toggle on mobile widths. Reuses the existing
  // .nav-links inside .nav, so it works on every page without per-page HTML edits.
  // Also injects the mobile sticky bottom action bar (Call + Book) on every page.

  // Single conversion action: free 30-min build consult (Cal.com).
  var CONSULT_URL = 'https://cal.eu/memorablegreen/1-2-hour-meeting';
  var CALL_TEL = 'tel:+351967291572';
  // Localized labels for the sticky bar, keyed off <html lang>.
  var LANG = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
  var BAR_LABELS = {
    en: { call: 'Call', book: 'Book a Consult' },
    pt: { call: 'Ligar', book: 'Marcar Consulta' },
    fr: { call: 'Appeler', book: 'Reserver' },
    es: { call: 'Llamar', book: 'Reservar' },
  };
  var L = BAR_LABELS[LANG] || BAR_LABELS.en;

  var style = document.createElement('style');
  style.textContent = [
    // ---- Site-wide mobile overflow + font-size guards ----
    // Headlines clamped with a 44px minimum that overflows narrow phones.
    // Tighten on small viewports so long words don't get clipped at the right edge.
    '@media(max-width:600px){',
    '  h1, h1.headline{font-size:clamp(30px,9vw,44px)!important;word-wrap:break-word;hyphens:auto}',
    '  h2{font-size:clamp(26px,7vw,34px)!important;word-wrap:break-word}',
    '  h3{font-size:clamp(22px,6vw,28px)!important;word-wrap:break-word}',
    '  body{word-wrap:break-word;overflow-wrap:break-word}',
    '  .hero-logo{height:64px!important;right:14px!important;top:14px!important;transform:none!important;border-radius:8px!important;box-shadow:0 4px 12px rgba(0,0,0,.25)!important}',
    '  .hero{padding-left:20px!important;padding-right:20px!important}',
    '  .hero-sub{font-size:15px!important;max-width:100%!important}',
    '  section{padding-left:20px!important;padding-right:20px!important}',
    // Inline 2/3-column grids stack to 1 column on phones
    '  div[style*="grid-template-columns:1fr 1fr"],',
    '  div[style*="grid-template-columns: 1fr 1fr"],',
    '  div[style*="grid-template-columns:1fr 1fr 1fr"],',
    '  div[style*="grid-template-columns: 1fr 1fr 1fr"]{',
    '    grid-template-columns:1fr!important;',
    '    gap:24px!important;',
    '  }',
    // Card content sometimes uses large inline padding that overflows
    '  div[style*="padding:36px"]{padding:20px!important}',
    // Fixed pixel widths on small content boxes
    '  div[style*="width:90px"][style*="height:64px"]{width:64px!important;height:48px!important}',
    '}',
    '@media(max-width:380px){',
    '  h1, h1.headline{font-size:28px!important}',
    '  .hero-logo{height:54px!important}',
    '}',
    // ---- Hamburger toggle and panel ----
    '.mn-toggle{display:none;flex-direction:column;background:transparent;border:0;padding:8px;cursor:pointer;margin-left:auto;align-items:center;justify-content:center;gap:5px}',
    '.mn-toggle:focus{outline:2px solid rgba(74,103,65,.4);outline-offset:2px;border-radius:4px}',
    '.mn-toggle .mn-bar{display:block;width:24px;height:2px;background:#1f2419;border-radius:2px;transition:transform .25s ease,opacity .25s ease}',
    '.mn-toggle[aria-expanded="true"] .mn-bar:nth-child(1){transform:translateY(7px) rotate(45deg)}',
    '.mn-toggle[aria-expanded="true"] .mn-bar:nth-child(2){opacity:0}',
    '.mn-toggle[aria-expanded="true"] .mn-bar:nth-child(3){transform:translateY(-7px) rotate(-45deg)}',
    '.mn-panel{display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(255,255,255,.98);backdrop-filter:blur(10px);z-index:100;padding:80px 24px 32px;overflow-y:auto;flex-direction:column}',
    '.mn-panel.open{display:flex}',
    '.mn-panel-close{position:absolute;top:18px;right:18px;background:transparent;border:0;padding:8px;cursor:pointer;font-size:24px;color:#1f2419;line-height:1}',
    '.mn-panel a{display:block;padding:16px 0;font-size:18px;font-weight:500;color:#1f2419;border-bottom:1px solid #e8e3d6;text-decoration:none}',
    '.mn-panel a:active,.mn-panel a:hover{color:#2f4527}',
    '.mn-panel .mn-section-title{font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#a8a89c;margin:24px 0 4px}',
    '.mn-panel .mn-cta{margin-top:24px;display:block;background:#2f4527;color:#fff;padding:14px 20px;border-radius:4px;font-size:14px;font-weight:600;text-align:center;text-decoration:none;border-bottom:0}',
    '.mn-panel .mn-cta:hover,.mn-panel .mn-cta:active{background:#4a6741;color:#fff}',
    '@media(max-width:880px){.mn-toggle{display:flex}.nav-cta{display:none}}',
    'body.mn-locked{overflow:hidden}',
    // ---- Header CTA cluster (guarantees layout even where the page inline
    //      <style> does not define .nav-right, e.g. the M45 sister pages) ----
    '.nav-right{display:flex;gap:14px;align-items:center}',
    // ---- Header Call button (sits next to the CTA on every page) ----
    '.nav-call{display:inline-flex;align-items:center;gap:7px;padding:11px 16px;border-radius:4px;border:1.5px solid #d9dccf;font-size:13px;font-weight:600;color:#2f4527;background:#fff;transition:border-color .2s,background .2s;white-space:nowrap}',
    '.nav-call:hover{border-color:#4a6741;background:#f8f6f1}',
    '.nav-call .nav-call-ic{width:14px;height:14px;flex:0 0 auto}',
    // On phones the header Call collapses (the sticky bottom bar carries Call+Book).
    '@media(max-width:880px){.nav-call{display:none}}',
    // ---- Mobile sticky bottom action bar (Call + Book) ----
    '.mn-bar-wrap{display:none}',
    '@media(max-width:880px){',
    '  .mn-bar-wrap{display:flex;position:fixed;left:0;right:0;bottom:0;z-index:90;gap:10px;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px));background:rgba(255,255,255,.97);backdrop-filter:blur(10px);border-top:1px solid #e8e3d6;box-shadow:0 -4px 18px rgba(31,36,25,.10)}',
    '  .mn-bar-wrap a{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:52px;border-radius:6px;font-size:16px;font-weight:600;text-decoration:none;letter-spacing:.01em}',
    '  .mn-bar-call{color:#2f4527;background:#fff;border:1.5px solid #cdd2c2}',
    '  .mn-bar-call:active{background:#f0ede4}',
    '  .mn-bar-book{color:#fff;background:#2f4527}',
    '  .mn-bar-book:active{background:#4a6741}',
    '  .mn-bar-ic{width:18px;height:18px;flex:0 0 auto}',
    // Keep the sticky bar from covering the footer bottom on scroll end.
    '  body{padding-bottom:74px}',
    '  .mn-panel{padding-bottom:96px}',
    '}',
  ].join('');
  document.head.appendChild(style);

  function init(){
    var nav = document.querySelector('.nav');
    if (!nav) return;

    // Gather all link sources: nav-links (links + dropdowns), top-bar CTA, etc.
    var sources = [];
    nav.querySelectorAll('.nav-links > a, .nav-links > .nav-group, .nav-links > .nav-investors').forEach(function(el){
      sources.push(el);
    });

    // Build the hamburger toggle
    var btn = document.createElement('button');
    btn.className = 'mn-toggle';
    btn.setAttribute('aria-label', 'Open menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="mn-bar"></span><span class="mn-bar"></span><span class="mn-bar"></span>';

    // Insert before the CTA (or at end of nav if no CTA). On some pages the
    // CTA is wrapped in a div (e.g., .nav-right), so insert relative to its
    // actual parent rather than assuming it's a direct child of .nav.
    var cta = nav.querySelector('.nav-cta');
    if (cta && cta.parentNode) {
      cta.parentNode.insertBefore(btn, cta);
    } else {
      nav.appendChild(btn);
    }

    // Build the slide-in panel
    var panel = document.createElement('div');
    panel.className = 'mn-panel';
    panel.setAttribute('aria-hidden', 'true');

    var closeBtn = document.createElement('button');
    closeBtn.className = 'mn-panel-close';
    closeBtn.setAttribute('aria-label', 'Close menu');
    closeBtn.innerHTML = '×';
    panel.appendChild(closeBtn);

    // Mirror nav links into the panel
    sources.forEach(function(src){
      if (src.classList && src.classList.contains('nav-group')) {
        // Flatten dropdown items into a section
        var trigger = src.querySelector('.nav-group-trigger');
        if (trigger) {
          var title = document.createElement('div');
          title.className = 'mn-section-title';
          title.textContent = trigger.textContent.trim();
          panel.appendChild(title);
        }
        src.querySelectorAll('.nav-group-menu a').forEach(function(a){
          var link = document.createElement('a');
          link.href = a.href;
          var titleEl = a.querySelector('.menu-title');
          link.textContent = titleEl ? titleEl.textContent.trim() : a.textContent.trim();
          panel.appendChild(link);
        });
      } else if (src.tagName === 'A') {
        var link = document.createElement('a');
        link.href = src.href;
        link.textContent = src.textContent.trim();
        if (src.classList.contains('active')) link.style.color = '#2f4527';
        panel.appendChild(link);
      }
    });

    // Add the CTA at the bottom
    var navCta = nav.querySelector('.nav-cta');
    if (navCta) {
      var ctaLink = document.createElement('a');
      ctaLink.href = navCta.href;
      ctaLink.className = 'mn-cta';
      ctaLink.textContent = navCta.textContent.trim();
      panel.appendChild(ctaLink);
    }

    document.body.appendChild(panel);

    function open(){
      panel.classList.add('open');
      panel.setAttribute('aria-hidden', 'false');
      btn.setAttribute('aria-expanded', 'true');
      btn.setAttribute('aria-label', 'Close menu');
      document.body.classList.add('mn-locked');
    }
    function close(){
      panel.classList.remove('open');
      panel.setAttribute('aria-hidden', 'true');
      btn.setAttribute('aria-expanded', 'false');
      btn.setAttribute('aria-label', 'Open menu');
      document.body.classList.remove('mn-locked');
    }

    btn.addEventListener('click', function(){
      if (btn.getAttribute('aria-expanded') === 'true') close(); else open();
    });
    closeBtn.addEventListener('click', close);
    // Close when any link inside the panel is tapped
    panel.addEventListener('click', function(e){
      if (e.target.tagName === 'A') close();
    });
    // Close on escape
    document.addEventListener('keydown', function(e){
      if (e.key === 'Escape') close();
    });

    // ---- Mobile sticky bottom action bar (Call + Book) ----
    // Injected once per page. The Book link points at the consult URL; the
    // href carries a data-track label so the first-party collector and the
    // cal.eu matcher in analytics-events.js both fire book_consult_click.
    if (!document.querySelector('.mn-bar-wrap')) {
      var phoneIc = '<svg class="mn-bar-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
      var calIc = '<svg class="mn-bar-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>';
      var bar = document.createElement('div');
      bar.className = 'mn-bar-wrap';
      bar.innerHTML =
        '<a class="mn-bar-book" href="' + CONSULT_URL + '" target="_blank" rel="noopener" data-track="mobile-bar-book">' + calIc + L.book + '</a>';
      document.body.appendChild(bar);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
