(function () {
  'use strict';

  // Two analytics sinks fire from here:
  //
  //  1. GA4 via gtag(). gtag.js loads ungated in a Consent Mode v2 "denied"
  //     state, so these events still reach GA4 as cookieless, modeled pings for
  //     everyone, and become full hits once a visitor grants consent in Klaro.
  //     GA4 params may carry richer data (email address, phone number) because
  //     they only persist with consent and never leave Google.
  //
  //  2. Vercel Web Analytics via window.va('event', ...). This is cookieless by
  //     design and needs no consent, so it captures 100% of visitors. Vercel
  //     event data MUST stay small and PII-FREE: send page/section/language/
  //     template/kind only, NEVER an email address or phone number.

  // ---- GA4 sink (consent-gated by Google, richer params allowed) ----
  function track(eventName, params) {
    try {
      if (typeof gtag === 'function') {
        gtag('event', eventName, params || {});
      }
    } catch (e) {
      // Never let analytics throw into the page.
    }
  }

  // ---- Vercel sink (cookieless, 100% coverage, PII-free only) ----
  // The window.va queue shim is installed in the page <head> before the Vercel
  // script loads; this call queues until the real function drains it.
  function vaTrack(name, data) {
    try {
      if (typeof window.va === 'function') {
        window.va('event', { name: name, data: data || {} });
      }
    } catch (e) {
      // Never let analytics throw into the page.
    }
  }

  // Path matchers that ignore locale prefixes (/pt, /fr, /es, /us).
  function currentPath() {
    return (window.location.pathname || '/').toLowerCase();
  }
  function isOnPage(slug) {
    var p = currentPath();
    var re = new RegExp('(^|/)(pt/|fr/|es/|us/)?' + slug + '(\\.html)?(/)?$');
    return re.test(p);
  }

  function emailFromHref(href) {
    return (href || '')
      .replace(/^mailto:/i, '')
      .split('?')[0]
      .trim()
      .toLowerCase();
  }

  function numberFromHref(href) {
    return (href || '').replace(/^tel:/i, '').trim();
  }

  // Custom dimensions derived from the URL + <html lang>.
  function pageContext() {
    var p = currentPath();
    var lang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    if (!['en', 'pt', 'fr', 'es'].includes(lang)) lang = 'en';

    var section = 'home';
    if (/investors/.test(p)) section = 'investors';
    else if (/m45-systems/.test(p)) section = 'm45-systems';
    else if (/m45-agritech/.test(p)) section = 'm45-agritech';
    else if (/pricing/.test(p)) section = 'pricing';
    else if (/designs/.test(p)) section = 'designs';
    else if (/contact/.test(p)) section = 'contact';
    else if (/press/.test(p)) section = 'press';
    else if (/updates\/[^/]+\.html/.test(p)) section = 'article';
    else if (/updates/.test(p)) section = 'updates';
    else if (/privacy/.test(p)) section = 'privacy';

    var template = 'landing';
    if (section === 'pricing') template = 'calculator';
    else if (section === 'contact') template = 'form';
    else if (section === 'article') template = 'article';
    else if (section === 'updates') template = 'listing';

    return { language: lang, page_section: section, page_template: template };
  }

  // Compact, PII-free payload for the Vercel sink.
  function vaBase() {
    var ctx = pageContext();
    return {
      section: ctx.page_section,
      language: ctx.language,
      template: ctx.page_template,
    };
  }

  // Fire an enriched page_view as soon as gtag is available. GA4 auto-fires a
  // basic page_view when gtag loads - this adds custom params on top of it so
  // we can segment reports by language, section, and template. Vercel records
  // page views automatically, so we do NOT mirror page_view to Vercel.
  function sendEnrichedPageView() {
    var ctx = pageContext();
    track('page_view', {
      page_location: window.location.href,
      page_path: window.location.pathname,
      page_title: document.title,
      language: ctx.language,
      page_section: ctx.page_section,
      page_template: ctx.page_template,
    });
  }

  // ---- chatbot_open (best-effort, once per session) ----
  // The LeadConnector chat widget runs inside a cross-origin iframe, so the
  // parent page cannot see clicks inside it. We listen for postMessage traffic
  // from a leadconnector origin whose payload signals an open/expand action.
  // This is a heuristic: if LeadConnector's event names differ it will simply
  // not fire (no false positives). Verify the real widget event names if this
  // under-reports. Once-per-session to avoid double counting.
  function wireChatbotOpen() {
    var SESSION_KEY = 'edh_chatbot_open_fired';
    function alreadyFired() {
      try { return window.sessionStorage.getItem(SESSION_KEY) === '1'; }
      catch (e) { return false; }
    }
    function markFired() {
      try { window.sessionStorage.setItem(SESSION_KEY, '1'); } catch (e) {}
    }
    window.addEventListener('message', function (e) {
      try {
        var origin = (e.origin || '').toLowerCase();
        if (origin.indexOf('leadconnector') === -1) return;
        var blob = '';
        if (typeof e.data === 'string') blob = e.data;
        else if (e.data) blob = JSON.stringify(e.data);
        blob = blob.toLowerCase();
        if (/close|collapse|minimi/.test(blob)) return;
        if (!/open|expand|maximi|show/.test(blob)) return;
        if (alreadyFired()) return;
        markFired();
        var base = vaBase();
        track('chatbot_open', { page: currentPath(), language: base.language, page_section: base.section });
        vaTrack('chatbot_open', base);
      } catch (err) {}
    });
  }

  // ---- cta_click (delegated, any page) ----
  // Fires for booking links (cal.eu / cal.com / calendly) and styled CTA
  // buttons (nav-cta, next-cta, btn-primary/ghost, estimate-cta, press-cta).
  function ctaTargetFor(anchor, href) {
    var h = (href || '').toLowerCase();
    if (/calendly\.com|cal\.com|cal\.eu/.test(h)) return 'book_call';
    var cls = (anchor.className || '').toString().toLowerCase();
    if (cls.indexOf('nav-cta') !== -1) return 'nav';
    if (cls.indexOf('next-cta') !== -1) return 'next';
    if (cls.indexOf('estimate-cta') !== -1) return 'estimate';
    if (cls.indexOf('press-cta') !== -1) return 'press';
    if (cls.indexOf('btn-primary') !== -1) return 'primary';
    if (cls.indexOf('btn-ghost') !== -1) return 'ghost';
    if (anchor.getAttribute('data-cta')) return 'cta';
    return null;
  }
  function destFor(href) {
    var h = (href || '').toLowerCase();
    if (/calendly\.com|cal\.com|cal\.eu/.test(h)) return 'booking';
    if (/contact/.test(h)) return 'contact';
    if (/pricing/.test(h)) return 'pricing';
    if (/designs/.test(h)) return 'designs';
    if (/investors/.test(h)) return 'investors';
    return 'other';
  }
  function wireCtaClicks() {
    document.addEventListener('click', function (e) {
      var anchor = e.target && e.target.closest && e.target.closest('a');
      if (!anchor) return;
      var href = anchor.getAttribute('href') || '';
      if (/^mailto:/i.test(href) || /^tel:/i.test(href)) return; // handled elsewhere
      var base = vaBase();

      // Primary conversion: the free quick-chat booking link (cal.eu / cal.com
      // / calendly). This is the single conversion action for the site, so it
      // gets its own dedicated, GA4-conversion-marked event in addition to the
      // generic cta_click below.
      if (/calendly\.com|cal\.com|cal\.eu/.test(href.toLowerCase())) {
        track('book_consult_click', {
          page: currentPath(),
          language: base.language,
          page_section: base.section,
          // GA4: mark as a conversion / key event at hit time.
          send_to: 'G-2Z8EWMQHZP',
        });
        vaTrack('book_consult_click', base);
      }

      var target = ctaTargetFor(anchor, href);
      if (!target) return;
      var dest = destFor(href);
      track('cta_click', { page: currentPath(), cta_target: target, cta_dest: dest, language: base.language, page_section: base.section });
      vaTrack('cta_click', { target: target, dest: dest, section: base.section, language: base.language });
    });
  }

  function init() {
    var path = currentPath();
    var isInvestors = isOnPage('investors');
    var isPricing = isOnPage('pricing');

    sendEnrichedPageView();
    wireChatbotOpen();
    wireCtaClicks();

    // ---- Email link clicks (delegated) ----
    document.addEventListener('click', function (e) {
      var anchor = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (!anchor) return;
      var email = emailFromHref(anchor.getAttribute('href'));
      if (!email) return;

      var kind = isInvestors ? 'investor' : 'residential';

      // GA4 (consent-gated, address allowed) keeps the original split events.
      if (isInvestors) {
        if (
          email.indexOf('chris@memorablegreen.com') !== -1 ||
          email.indexOf('contact@memorablegreen.com') !== -1
        ) {
          track('investor_email_click', { page: 'investors', email: email });
        }
      } else {
        if (
          email.indexOf('contact@memorablegreen.com') !== -1 ||
          email.indexOf('ecodomehomes@memorablegreen.com') !== -1
        ) {
          track('residential_email_click', { page: path, email: email });
        }
      }

      var base = vaBase();

      // Unified contact conversion event (method:'email'), marked as a GA4
      // conversion. Fires on every mailto click alongside the split events above.
      track('contact_click', {
        method: 'email',
        page: path,
        language: base.language,
        page_section: base.section,
        send_to: 'G-2Z8EWMQHZP',
      });

      // Vercel (cookieless, PII-free): one collapsed event with a kind field,
      // fired for any mailto click. No address ever leaves to Vercel.
      vaTrack('email_click', { kind: kind, section: base.section, language: base.language });
    });

    // ---- Phone link clicks (delegated, any page) ----
    document.addEventListener('click', function (e) {
      var anchor = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
      if (!anchor) return;
      var number = numberFromHref(anchor.getAttribute('href'));
      var base = vaBase();
      track('phone_click', { page: path, number: number });
      // Unified contact conversion event (method:'phone'), marked as a GA4
      // conversion. Fires on every tel: click alongside phone_click above.
      track('contact_click', {
        method: 'phone',
        page: path,
        language: base.language,
        page_section: base.section,
        send_to: 'G-2Z8EWMQHZP',
      });
      // Vercel: no number.
      vaTrack('phone_click', { section: base.section, language: base.language });
    });

    // ---- Lead form conversions ----
    // js/contact-form.js POSTs the forms via fetch and dispatches this event only
    // after the server confirms the lead was captured, so the conversion fires on
    // success, never on a raw click. Both the contact form and the newsletter
    // signup route through here, so there is a single, non-duplicated source.
    document.addEventListener('edh:lead-success', function (e) {
      var formType = (e && e.detail && e.detail.formType) || 'contact';
      var base = vaBase();
      if (formType === 'subscribe') {
        track('newsletter_signup', {
          page: currentPath(),
          language: base.language,
          page_section: base.section,
        });
        vaTrack('newsletter_signup', base);
      } else {
        track('contact_form_submit', {
          page: 'contact',
          language: base.language,
          page_section: base.section,
        });
        vaTrack('contact_form_submit', base);
      }
    });

    // ---- Pricing calculator engagement (once per session) ----
    if (isPricing) {
      var calc =
        document.querySelector('.calc-container') ||
        document.querySelector('.calc-section');
      if (calc) {
        var SESSION_KEY = 'edh_pricing_engagement_fired';
        var fired = false;
        try {
          fired = window.sessionStorage.getItem(SESSION_KEY) === '1';
        } catch (e) {
          // sessionStorage may be unavailable (private mode, embedded contexts).
        }
        if (!fired) {
          var handler = function () {
            if (fired) return;
            fired = true;
            try {
              window.sessionStorage.setItem(SESSION_KEY, '1');
            } catch (e) {}
            track('pricing_calculator_engagement', { page: 'pricing' });
            vaTrack('pricing_calculator_engagement', vaBase());
            calc.removeEventListener('input', handler, true);
            calc.removeEventListener('change', handler, true);
          };
          // Capture-phase so we catch input on any descendant control.
          calc.addEventListener('input', handler, true);
          calc.addEventListener('change', handler, true);
        }
      }
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

// First-party analytics -> MG collector (assistant.web_events), added 2026-07-05,
// enriched same day: persistent visitor id (localStorage edh_vid), max scroll
// depth on the hidden-ping, query string on the pageview, visitor id on clicks.
// Cookieless, fail-open: any error is swallowed and never affects the page.
(function () {
  'use strict';
  var COLLECT = 'https://memorablegreen.com/api/hit';
  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2); }
  function getVid() {
    try {
      var v = localStorage.getItem('edh_vid');
      if (!v) { v = newId(); localStorage.setItem('edh_vid', v); }
      return v;
    } catch (e) {
      try {
        var v2 = sessionStorage.getItem('edh_vid');
        if (!v2) { v2 = newId(); sessionStorage.setItem('edh_vid', v2); }
        return v2;
      } catch (e2) { return ''; }
    }
  }
  try {
    var sid = sessionStorage.getItem('edh_sid');
    var firstOfSession = !sid;
    if (!sid) { sid = newId(); sessionStorage.setItem('edh_sid', sid); }
    var vid = getVid();
    var t0 = Date.now();
    var maxScroll = 0;
    function trackScroll() {
      try {
        var doc = document.documentElement;
        var h = doc.scrollHeight || 1;
        var pct = Math.round(((window.pageYOffset || doc.scrollTop || 0) + window.innerHeight) / h * 100);
        if (pct > maxScroll) maxScroll = Math.min(100, pct);
      } catch (e) {}
    }
    window.addEventListener('scroll', trackScroll, { passive: true });
    trackScroll();
    function payload(extra) {
      var base = { site: 'ecodomehomes.com', path: location.pathname, session_id: sid, visitor_id: vid };
      for (var k in extra) base[k] = extra[k];
      return JSON.stringify(base);
    }
    fetch(COLLECT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload({ referrer: document.referrer || null, query: location.search || null, first: firstOfSession ? 1 : 0 }), keepalive: true }).catch(function () {});
    var sent = false;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden' && !sent) {
        sent = true;
        var secs = Math.min(86400, Math.round((Date.now() - t0) / 1000));
        if (navigator.sendBeacon) navigator.sendBeacon(COLLECT, new Blob([payload({ seconds: secs, scroll_pct: maxScroll })], { type: 'application/json' }));
      }
    });
    document.addEventListener('click', function (e) {
      try {
        var a = e.target && e.target.closest ? e.target.closest('a[href], button[type="submit"], [data-track]') : null;
        if (!a) return;
        var href = (a.getAttribute && a.getAttribute('href')) || '';
        var isIntent = a.hasAttribute('data-track') || /^mailto:|^tel:/.test(href) || /cal\.eu|cal\.com|calendly/.test(href) || (a.tagName === 'BUTTON' && a.type === 'submit');
        if (!isIntent) return;
        var label = a.getAttribute('data-track') || href || (a.textContent || '').trim().slice(0, 80);
        if (navigator.sendBeacon) navigator.sendBeacon(COLLECT, new Blob([payload({ event: 'click', label: label })], { type: 'application/json' }));
      } catch (err) {}
    }, true);
    // Pricing-tool engagement -> first-party web_events (once per session), so the
    // dashboard counts a slider-working session as engaged, not a bounce. Mirrors
    // the GA4 pricing_calculator_engagement above but lands in our own collector.
    try {
      var calcEl = document.querySelector('.calc-container') || document.querySelector('.calc-section');
      if (calcEl) {
        var PRICE_KEY = 'edh_pricing_fp_fired';
        var priceFired = false;
        try { priceFired = sessionStorage.getItem(PRICE_KEY) === '1'; } catch (e3) {}
        if (!priceFired) {
          var priceHandler = function () {
            if (priceFired) return;
            priceFired = true;
            try { sessionStorage.setItem(PRICE_KEY, '1'); } catch (e4) {}
            if (navigator.sendBeacon) navigator.sendBeacon(COLLECT, new Blob([payload({ event: 'click', label: 'pricing-calculator' })], { type: 'application/json' }));
            calcEl.removeEventListener('input', priceHandler, true);
            calcEl.removeEventListener('change', priceHandler, true);
          };
          calcEl.addEventListener('input', priceHandler, true);
          calcEl.addEventListener('change', priceHandler, true);
        }
      }
    } catch (err2) {}
  } catch (e) { /* fail-open by design */ }
})();
