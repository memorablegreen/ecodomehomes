(function(){
  // Auto-injects a hamburger toggle on mobile widths. Reuses the existing
  // .nav-links inside .nav, so it works on every page without per-page HTML edits.

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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
