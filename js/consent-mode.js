(function () {
  'use strict';

  // Bridges Klaro consent decisions to Google Consent Mode v2 and the Microsoft
  // Clarity Consent API v2.
  //
  // GA4 (gtag.js) and Clarity now load UNGATED, but start in a denied /
  // cookieless state set in the page <head> before they load:
  //   - gtag('consent','default', { ...all denied, wait_for_update:500 })
  //   - clarity('consentv2', { ad_storage:'denied', analytics_storage:'denied' })
  // That yields cookieless, modeled data for 100% of visitors with no cookies
  // and no PII, which is GDPR-safe without prior consent.
  //
  // When a visitor grants the matching Klaro service we flip that signal to
  // granted so full, cookie-based collection begins. Declining (or never
  // choosing) leaves the denied/cookieless state untouched. refresh() is
  // idempotent, so it is safe to call from both the manager watcher and the
  // per-service callbacks in klaro-config.js.

  function applyAnalytics(granted) {
    try {
      if (typeof window.gtag !== 'function') return;
      window.gtag('consent', 'update', {
        analytics_storage: granted ? 'granted' : 'denied',
        ad_storage: granted ? 'granted' : 'denied',
        ad_user_data: granted ? 'granted' : 'denied',
        ad_personalization: granted ? 'granted' : 'denied',
      });
    } catch (e) {}
  }

  function applyClarity(granted) {
    try {
      if (typeof window.clarity !== 'function') return;
      window.clarity('consentv2', {
        ad_storage: granted ? 'granted' : 'denied',
        analytics_storage: granted ? 'granted' : 'denied',
      });
    } catch (e) {}
  }

  function refresh(manager) {
    if (!manager || typeof manager.getConsent !== 'function') return;
    try {
      applyAnalytics(manager.getConsent('google-analytics') === true);
      applyClarity(manager.getConsent('microsoft-clarity') === true);
    } catch (e) {}
  }

  // Exposed so klaro-config.js per-service callbacks can trigger a refresh too
  // (redundant with the watcher below; refresh() is idempotent).
  window.edhConsentRefresh = function () {
    try {
      if (window.klaro && typeof window.klaro.getManager === 'function') {
        refresh(window.klaro.getManager(window.klaroConfig));
      }
    } catch (e) {}
  };

  function init() {
    if (!window.klaro || typeof window.klaro.getManager !== 'function') return;
    var manager;
    try {
      manager = window.klaro.getManager(window.klaroConfig);
    } catch (e) {
      return;
    }
    // Apply whatever consent is already stored from a previous visit.
    refresh(manager);
    // React to every future change (save / accept / decline). refresh() reads
    // the manager state directly, so we do not depend on the event payload.
    if (typeof manager.watch === 'function') {
      manager.watch({
        update: function (mgr) {
          refresh(mgr || manager);
        },
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
