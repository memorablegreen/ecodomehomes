// js/geo-notice.js
//
// Offers a US visitor the US pricing page instead of silently redirecting them
// to it.
//
// WHY THIS REPLACED THE REDIRECT. middleware.js used to answer 307 on '/' and
// '/pricing' when x-vercel-ip-country was 'US'. That solved a real problem (a
// visitor in Oklahoma was captured as a EUR lead, ZIP 74028) but created a
// bigger one: Googlebot crawls predominantly from US addresses, so the crawler
// was redirected too. The English root is the x-default hreflang target and the
// page that ranks everywhere outside America, and an IP redirect is the one
// thing Google warns will stop alternate versions being crawled at all.
//
// IP redirection was also the wrong tool for the job it was hired for. It is
// invisible to a US visitor on a VPN, it strands anyone who travels, and
// because it fired once and then set a cookie, a US visitor who happened to
// land on /designs first was never routed at all.
//
// So: nobody is moved. Everybody lands on the URL they asked for, both URLs
// stay crawlable, and a US visitor gets one visible, dismissible offer. The
// lead-currency problem is handled where it actually occurs, at the postcode
// on the pricing page, not by guessing from an IP.
//
// Only '/' and '/pricing' are covered, exactly the two paths the middleware
// matched. The translated locales are left alone.
(function () {
  'use strict';

  var TARGET = { '/': '/us', '/pricing': '/us/pricing' };
  var DISMISSED = 'edhGeoNoticeDismissed';

  var path = location.pathname.replace(/\/+$/, '') || '/';
  var target = TARGET[path];
  if (!target) { return; }

  try { if (localStorage.getItem(DISMISSED) === '1') { return; } } catch (e) {}

  fetch('/api/geo', { credentials: 'omit' })
    .then(function (r) { return r.json(); })
    .then(function (d) { if (d && d.country === 'US') { show(target); } })
    .catch(function () { /* no notice is the correct failure mode */ });

  function show(href) {
    var bar = document.createElement('div');
    bar.className = 'edh-geo-notice';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Regional pricing');
    bar.innerHTML =
      '<span>You are seeing European pricing in euros.</span>' +
      '<a href="' + href + '">Switch to US pricing</a>' +
      '<button type="button" aria-label="Dismiss">&times;</button>';

    var css = document.createElement('style');
    css.textContent =
      '.edh-geo-notice{position:sticky;top:0;z-index:9999;display:flex;gap:12px;' +
      'align-items:center;justify-content:center;flex-wrap:wrap;' +
      'padding:10px 44px 10px 16px;background:#12281d;color:#f2efe6;' +
      'font-size:14px;line-height:1.4;text-align:center}' +
      '.edh-geo-notice a{color:#f2efe6;font-weight:700;text-decoration:underline;' +
      'text-underline-offset:3px}' +
      '.edh-geo-notice button{position:absolute;right:8px;top:50%;' +
      'transform:translateY(-50%);background:none;border:0;color:#f2efe6;' +
      'font-size:24px;line-height:1;cursor:pointer;padding:4px 10px;' +
      'min-width:44px;min-height:44px}' +
      '@media(max-width:600px){.edh-geo-notice{font-size:13px;padding:9px 44px 9px 12px}}';

    bar.style.position = 'relative';
    document.head.appendChild(css);
    document.body.insertBefore(bar, document.body.firstChild);

    bar.querySelector('button').addEventListener('click', function () {
      bar.remove();
      try { localStorage.setItem(DISMISSED, '1'); } catch (e) {}
    });
  }
})();
