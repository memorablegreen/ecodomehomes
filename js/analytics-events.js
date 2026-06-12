(function () {
  'use strict';

  // Safely fire a GA4 event. gtag() is loaded behind Klaro consent; until the
  // user grants the "google-analytics" service, gtag is unavailable and these
  // calls silently no-op. After consent, Klaro rewrites the script tags and
  // gtag becomes a real function - subsequent calls land in GA4 normally.
  function track(eventName, params) {
    try {
      if (typeof gtag === 'function') {
        gtag('event', eventName, params || {});
      }
    } catch (e) {
      // Never let analytics throw into the page.
    }
  }

  // Path matchers that ignore locale prefixes (/pt, /fr, /es).
  function currentPath() {
    return (window.location.pathname || '/').toLowerCase();
  }
  function isOnPage(slug) {
    var p = currentPath();
    var re = new RegExp('(^|/)(pt/|fr/|es/)?' + slug + '(\\.html)?(/)?$');
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

  // Fire an enriched page_view as soon as gtag is available. GA4 auto-fires a
  // basic page_view when gtag loads - this adds custom params on top of it so
  // we can segment reports by language, section, and template.
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

  function init() {
    var path = currentPath();
    var isInvestors = isOnPage('investors');
    var isPricing = isOnPage('pricing');
    var isContact = isOnPage('contact');

    sendEnrichedPageView();

    // ---- Email link clicks (delegated) ----
    document.addEventListener('click', function (e) {
      var anchor = e.target && e.target.closest && e.target.closest('a[href^="mailto:"]');
      if (!anchor) return;
      var email = emailFromHref(anchor.getAttribute('href'));
      if (!email) return;

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
    });

    // ---- Phone link clicks (delegated, any page) ----
    document.addEventListener('click', function (e) {
      var anchor = e.target && e.target.closest && e.target.closest('a[href^="tel:"]');
      if (!anchor) return;
      var number = numberFromHref(anchor.getAttribute('href'));
      track('phone_click', { page: path, number: number });
    });

    // ---- Contact form submit ----
    if (isContact) {
      var form =
        document.querySelector('.contact-section form') ||
        document.querySelector('form.form') ||
        document.querySelector('form');
      if (form) {
        form.addEventListener('submit', function () {
          track('contact_form_submit', { page: 'contact' });
        });
      }
    }

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
