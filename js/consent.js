(function () {
  'use strict';

  // EcoDomeHomes marketing-consent module.
  //
  // The site has no templating layer: 7 locale copies of pricing.html each
  // inline their own sign-in modal, and contact.html / updates.html exist per
  // locale too. Hand-copying consent wording into 21 files in 7 languages
  // guarantees drift (which is what docs/locale-parity.md exists to catch), so
  // every string, the region logic, the rendering and the read-back live here
  // instead. A page opts in with one script tag plus an empty host element:
  //
  //   <div data-edh-consent="signin"></div>     inside the sign-in modal
  //   <div data-edh-consent="contact"></div>    inside form[data-lead-form=contact]
  //   <div data-edh-consent="subscribe"></div>  inside form[data-lead-form=subscribe]
  //
  // Two regimes, decided by the visitor's country, not by which locale page
  // they happen to be reading:
  //
  //   opt_in  (EEA, UK, CH, IS, LI, NO, CA, BR) - GDPR/ePrivacy and CASL/LGPD.
  //           Marketing needs a separate, unticked, affirmative choice that is
  //           never a condition of using the page.
  //   opt_out (US and the rest of the world) - CAN-SPAM permits emailing until
  //           someone asks you to stop, so a clear notice is enough and the
  //           visitor is recorded as granted by notice.
  //
  // FAIL SAFE, in this order of preference: if /api/geo fails, times out, or
  // this script never loads at all, the strict opt_in treatment is what shows,
  // and with no affirmative tick nothing is ever recorded as granted. There is
  // no path through this file that turns a silent visitor in an unknown country
  // into a marketing contact.
  //
  // The newsletter form is deliberately notice-only in BOTH regions: submitting
  // a form whose entire purpose is "email me updates" is itself the affirmative
  // act, so a second checkbox asking permission to do the thing they just asked
  // for is redundant. It is still recorded, with method 'newsletter_form'.

  var VERSION = 'edh-consent-v1';
  var GEO_ENDPOINT = '/api/geo';
  var GEO_TIMEOUT_MS = 4000;
  var GEO_CACHE_KEY = 'edhConsentRegion';
  var STORE_EMAIL = 'edhConsentMarketing';
  var STORE_SMS = 'edhConsentSms';

  // ---------------------------------------------------------------- copy ----
  // One entry per locale the site ships. `en` serves root (en-GB) and any
  // unknown language; `enUS` differs from it only in postcode vs ZIP code.

  var COPY = {
    en: {
      privacy: 'Privacy Policy',
      optInEmail:
        'Email me occasional EcoDomeHomes updates and news. I can unsubscribe at any time.',
      noticeSignin:
        'We use your name, postcode and email to build and save your estimate and to reply to you.',
      noticeSigninOptOut:
        'We use your name, postcode and email to build and save your estimate. By continuing you agree we may email you about your estimate and occasional updates. You can unsubscribe at any time.',
      noticeContact: 'We use your details to reply to your enquiry.',
      noticeContactOptOut:
        'We use your details to reply to your enquiry. By sending this form you agree we may also email you occasional updates. You can unsubscribe at any time.',
      noticeSubscribe:
        'By subscribing you agree we may email you EcoDomeHomes updates. You can unsubscribe at any time.',
      optInSms:
        'Text me about my project. By ticking this box you agree that EcoDomeHomes (Memorable Green Unipessoal Lda) may send you marketing text messages, including by automated means, at the number above. Consent is not a condition of any purchase. Message and data rates may apply. Reply STOP to opt out, HELP for help.',
      seeOur: 'See our',
      prefUnsubscribe: 'Unsubscribe from updates',
      prefSubscribe: 'Email me updates',
    },
    enUS: {
      privacy: 'Privacy Policy',
      optInEmail:
        'Email me occasional EcoDomeHomes updates and news. I can unsubscribe at any time.',
      noticeSignin:
        'We use your name, ZIP code and email to build and save your estimate and to reply to you.',
      noticeSigninOptOut:
        'We use your name, ZIP code and email to build and save your estimate. By continuing you agree we may email you about your estimate and occasional updates. You can unsubscribe at any time.',
      noticeContact: 'We use your details to reply to your inquiry.',
      noticeContactOptOut:
        'We use your details to reply to your inquiry. By sending this form you agree we may also email you occasional updates. You can unsubscribe at any time.',
      noticeSubscribe:
        'By subscribing you agree we may email you EcoDomeHomes updates. You can unsubscribe at any time.',
      optInSms:
        'Text me about my project. By checking this box you agree that EcoDomeHomes (Memorable Green Unipessoal Lda) may send you marketing text messages, including by automated means, at the number above. Consent is not a condition of any purchase. Message and data rates may apply. Reply STOP to opt out, HELP for help.',
      seeOur: 'See our',
      prefUnsubscribe: 'Unsubscribe from updates',
      prefSubscribe: 'Email me updates',
    },
    de: {
      privacy: 'Datenschutzerklärung',
      optInEmail:
        'Senden Sie mir gelegentlich Neuigkeiten und Updates von EcoDomeHomes. Ich kann mich jederzeit abmelden.',
      noticeSignin:
        'Wir verwenden Ihren Namen, Ihre Postleitzahl und Ihre E-Mail-Adresse, um Ihre Schätzung zu erstellen und zu speichern und um Ihnen zu antworten.',
      noticeSigninOptOut:
        'Wir verwenden Ihren Namen, Ihre Postleitzahl und Ihre E-Mail-Adresse, um Ihre Schätzung zu erstellen und zu speichern. Wenn Sie fortfahren, stimmen Sie zu, dass wir Ihnen E-Mails zu Ihrer Schätzung und gelegentliche Updates senden dürfen. Sie können sich jederzeit abmelden.',
      noticeContact: 'Wir verwenden Ihre Angaben, um Ihre Anfrage zu beantworten.',
      noticeContactOptOut:
        'Wir verwenden Ihre Angaben, um Ihre Anfrage zu beantworten. Mit dem Absenden dieses Formulars stimmen Sie zu, dass wir Ihnen auch gelegentliche Updates per E-Mail senden dürfen. Sie können sich jederzeit abmelden.',
      noticeSubscribe:
        'Mit Ihrer Anmeldung stimmen Sie zu, dass wir Ihnen Updates von EcoDomeHomes per E-Mail senden dürfen. Sie können sich jederzeit abmelden.',
      optInSms:
        'Senden Sie mir SMS zu meinem Projekt. Mit dem Ankreuzen dieses Feldes stimmen Sie zu, dass EcoDomeHomes (Memorable Green Unipessoal Lda) Ihnen Werbe-SMS, auch automatisiert, an die oben angegebene Nummer senden darf. Die Einwilligung ist keine Voraussetzung für einen Kauf. Es können Nachrichten- und Datengebühren anfallen. Antworten Sie STOP, um sich abzumelden, oder HELP für Hilfe.',
      seeOur: 'Siehe unsere',
      prefUnsubscribe: 'Updates abbestellen',
      prefSubscribe: 'Updates per E-Mail erhalten',
    },
    es: {
      privacy: 'Política de Privacidad',
      optInEmail:
        'Envíenme novedades y actualizaciones ocasionales de EcoDomeHomes. Puedo darme de baja en cualquier momento.',
      noticeSignin:
        'Usamos su nombre, código postal y correo electrónico para calcular y guardar su estimación y para responderle.',
      noticeSigninOptOut:
        'Usamos su nombre, código postal y correo electrónico para calcular y guardar su estimación. Al continuar, acepta que podamos escribirle sobre su estimación y enviarle actualizaciones ocasionales. Puede darse de baja en cualquier momento.',
      noticeContact: 'Usamos sus datos para responder a su consulta.',
      noticeContactOptOut:
        'Usamos sus datos para responder a su consulta. Al enviar este formulario, acepta que también podamos enviarle actualizaciones ocasionales por correo electrónico. Puede darse de baja en cualquier momento.',
      noticeSubscribe:
        'Al suscribirse, acepta que podamos enviarle actualizaciones de EcoDomeHomes por correo electrónico. Puede darse de baja en cualquier momento.',
      optInSms:
        'Envíenme mensajes de texto sobre mi proyecto. Al marcar esta casilla, acepta que EcoDomeHomes (Memorable Green Unipessoal Lda) le envíe mensajes de texto promocionales, incluso por medios automatizados, al número indicado arriba. El consentimiento no es condición para ninguna compra. Pueden aplicarse tarifas de mensajes y datos. Responda STOP para darse de baja o HELP para obtener ayuda.',
      seeOur: 'Consulte nuestra',
      prefUnsubscribe: 'Cancelar las novedades',
      prefSubscribe: 'Recibir novedades por correo',
    },
    fr: {
      privacy: 'Politique de confidentialité',
      optInEmail:
        "Envoyez-moi occasionnellement des actualités et des nouvelles d'EcoDomeHomes. Je peux me désabonner à tout moment.",
      noticeSignin:
        'Nous utilisons votre nom, votre code postal et votre adresse e-mail pour établir et enregistrer votre estimation et pour vous répondre.',
      noticeSigninOptOut:
        'Nous utilisons votre nom, votre code postal et votre adresse e-mail pour établir et enregistrer votre estimation. En continuant, vous acceptez que nous puissions vous écrire au sujet de votre estimation et vous envoyer des actualités occasionnelles. Vous pouvez vous désabonner à tout moment.',
      noticeContact: 'Nous utilisons vos coordonnées pour répondre à votre demande.',
      noticeContactOptOut:
        'Nous utilisons vos coordonnées pour répondre à votre demande. En envoyant ce formulaire, vous acceptez que nous puissions également vous envoyer des actualités occasionnelles par e-mail. Vous pouvez vous désabonner à tout moment.',
      noticeSubscribe:
        "En vous inscrivant, vous acceptez que nous puissions vous envoyer les actualités d'EcoDomeHomes par e-mail. Vous pouvez vous désabonner à tout moment.",
      optInSms:
        "Envoyez-moi des SMS au sujet de mon projet. En cochant cette case, vous acceptez qu'EcoDomeHomes (Memorable Green Unipessoal Lda) vous envoie des SMS promotionnels, y compris par des moyens automatisés, au numéro indiqué ci-dessus. Le consentement n'est pas une condition d'achat. Des frais de message et de données peuvent s'appliquer. Répondez STOP pour vous désabonner ou HELP pour obtenir de l'aide.",
      seeOur: 'Consultez notre',
      prefUnsubscribe: 'Se désabonner des actualités',
      prefSubscribe: 'Recevoir les actualités',
    },
    nl: {
      privacy: 'Privacybeleid',
      optInEmail:
        'Stuur mij af en toe nieuws en updates van EcoDomeHomes. Ik kan mij op elk moment afmelden.',
      noticeSignin:
        'Wij gebruiken uw naam, postcode en e-mailadres om uw schatting te maken en te bewaren en om u te antwoorden.',
      noticeSigninOptOut:
        'Wij gebruiken uw naam, postcode en e-mailadres om uw schatting te maken en te bewaren. Door verder te gaan gaat u ermee akkoord dat wij u kunnen e-mailen over uw schatting en af en toe een update. U kunt zich op elk moment afmelden.',
      noticeContact: 'Wij gebruiken uw gegevens om uw vraag te beantwoorden.',
      noticeContactOptOut:
        'Wij gebruiken uw gegevens om uw vraag te beantwoorden. Door dit formulier te versturen gaat u ermee akkoord dat wij u ook af en toe een update kunnen e-mailen. U kunt zich op elk moment afmelden.',
      noticeSubscribe:
        'Door u aan te melden gaat u ermee akkoord dat wij u updates van EcoDomeHomes kunnen e-mailen. U kunt zich op elk moment afmelden.',
      optInSms:
        'Stuur mij sms-berichten over mijn project. Door dit vakje aan te vinken gaat u ermee akkoord dat EcoDomeHomes (Memorable Green Unipessoal Lda) u reclame-sms-berichten stuurt, ook langs geautomatiseerde weg, op het hierboven vermelde nummer. Toestemming is geen voorwaarde voor een aankoop. Bericht- en datakosten kunnen van toepassing zijn. Antwoord STOP om u af te melden of HELP voor hulp.',
      seeOur: 'Zie ons',
      prefUnsubscribe: 'Updates opzeggen',
      prefSubscribe: 'Updates ontvangen',
    },
    pt: {
      privacy: 'Política de Privacidade',
      optInEmail:
        'Enviem-me novidades e atualizações ocasionais da EcoDomeHomes. Posso cancelar a subscrição a qualquer momento.',
      noticeSignin:
        'Utilizamos o seu nome, código postal e email para calcular e guardar a sua estimativa e para lhe responder.',
      noticeSigninOptOut:
        'Utilizamos o seu nome, código postal e email para calcular e guardar a sua estimativa. Ao continuar, aceita que lhe possamos escrever sobre a sua estimativa e enviar atualizações ocasionais. Pode cancelar a subscrição a qualquer momento.',
      noticeContact: 'Utilizamos os seus dados para responder ao seu pedido.',
      noticeContactOptOut:
        'Utilizamos os seus dados para responder ao seu pedido. Ao enviar este formulário, aceita que lhe possamos enviar também atualizações ocasionais por email. Pode cancelar a subscrição a qualquer momento.',
      noticeSubscribe:
        'Ao subscrever, aceita que lhe possamos enviar atualizações da EcoDomeHomes por email. Pode cancelar a subscrição a qualquer momento.',
      optInSms:
        'Enviem-me mensagens de texto sobre o meu projeto. Ao assinalar esta caixa, aceita que a EcoDomeHomes (Memorable Green Unipessoal Lda) lhe envie mensagens de texto promocionais, incluindo por meios automatizados, para o número indicado acima. O consentimento não é condição de qualquer compra. Podem aplicar-se tarifas de mensagens e dados. Responda STOP para cancelar ou HELP para obter ajuda.',
      seeOur: 'Consulte a nossa',
      prefUnsubscribe: 'Cancelar as atualizações',
      prefSubscribe: 'Receber atualizações',
    },
  };

  // Countries whose visitors get the strict, unticked opt-in box. EEA + UK +
  // Switzerland (GDPR/ePrivacy), Canada (CASL) and Brazil (LGPD) all require a
  // positive act before marketing email. Kept here as well as in api/geo.js so
  // the client still classifies correctly if the endpoint returns only a
  // country code.
  var OPT_IN_COUNTRIES = [
    'AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT',
    'LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE',
    'IS','LI','NO','GB','CH','CA','BR',
  ];

  // -------------------------------------------------------------- helpers ---

  function localeKey() {
    var lang = (document.documentElement.getAttribute('lang') || 'en').toLowerCase();
    if (lang === 'en-us') return 'enUS';
    var base = lang.split('-')[0];
    return COPY[base] ? base : 'en';
  }

  var L = localeKey();
  var T = COPY[L];

  // de/, es/, fr/ and us/ pages all currently link to the English /privacy,
  // which means a German visitor reading a German consent notice would land on
  // an English policy. Consent has to be informed in the visitor's own
  // language, so derive the localised path from the page's own directory.
  function privacyHref() {
    var m = window.location.pathname.match(/^\/(de|es|fr|nl|pt|us)\//);
    return m ? '/' + m[1] + '/privacy' : '/privacy';
  }

  function readStore(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function writeStore(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  }

  // ------------------------------------------------------------- region -----

  var region = null; // null until resolved; 'opt_in' | 'opt_out'
  var regionResolved = false;

  function classify(country) {
    if (!country) return 'opt_in';
    return OPT_IN_COUNTRIES.indexOf(String(country).toUpperCase()) === -1
      ? 'opt_out'
      : 'opt_in';
  }

  function cachedRegion() {
    try {
      return window.sessionStorage.getItem(GEO_CACHE_KEY);
    } catch (e) {
      return null;
    }
  }

  function cacheRegion(value) {
    try {
      window.sessionStorage.setItem(GEO_CACHE_KEY, value);
    } catch (e) {}
  }

  // Read the cached verdict synchronously at load, before DOMContentLoaded, so
  // a page reached by coming BACK from an OAuth provider already knows the
  // region by the time captureLead() fires. sessionStorage survives that round
  // trip in the same tab. Without this, a US visitor returning from Google
  // could be recorded under the strict regime purely because the geo call had
  // not landed yet, and would silently never be emailable.
  (function primeRegionFromCache() {
    var cached = cachedRegion();
    if (cached === 'opt_in' || cached === 'opt_out') {
      region = cached;
      regionResolved = true;
    }
  })();

  // Resolved once at page load rather than when a form is opened, so by the
  // time anyone reaches the sign-in modal the answer is already in hand and no
  // one ever waits on a network call. Any failure lands on 'opt_in'.
  function resolveRegion(done) {
    var cached = cachedRegion();
    if (cached === 'opt_in' || cached === 'opt_out') {
      region = cached;
      regionResolved = true;
      done();
      return;
    }

    var settled = false;
    function settle(value) {
      if (settled) return;
      settled = true;
      region = value;
      regionResolved = true;
      cacheRegion(value);
      done();
    }

    var timer = window.setTimeout(function () {
      settle('opt_in');
    }, GEO_TIMEOUT_MS);

    try {
      window
        .fetch(GEO_ENDPOINT, { headers: { Accept: 'application/json' } })
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          window.clearTimeout(timer);
          var value =
            data && (data.region === 'opt_in' || data.region === 'opt_out')
              ? data.region
              : classify(data && data.country);
          settle(value);
        })
        .catch(function () {
          window.clearTimeout(timer);
          settle('opt_in');
        });
    } catch (e) {
      window.clearTimeout(timer);
      settle('opt_in');
    }
  }

  // ------------------------------------------------------------- styles -----

  function injectStyles() {
    if (document.getElementById('edh-consent-styles')) return;
    var css =
      '.edh-consent{margin:16px 0 0;text-align:left;}' +
      '.edh-consent-check{display:flex;align-items:flex-start;gap:10px;cursor:pointer;font-size:13px;line-height:1.55;color:var(--muted,#5b6152);}' +
      '.edh-consent-check+.edh-consent-check{margin-top:12px;}' +
      '.edh-consent-check input{flex:0 0 auto;width:18px;height:18px;min-width:18px;min-height:18px;margin:1px 0 0;accent-color:var(--bright,#1A936F);cursor:pointer;}' +
      '.edh-consent-check span{flex:1 1 auto;}' +
      '.edh-consent-note{margin:12px 0 0;font-size:12.5px;line-height:1.6;color:var(--subtle,#8a8f80);}' +
      '.edh-consent-note a,.edh-consent-check a{color:inherit;text-decoration:underline;}' +
      '.edh-consent-note a:hover,.edh-consent-check a:hover{color:var(--bright,#1A936F);}' +
      '.edh-consent-sms{margin-top:14px;padding-top:14px;border-top:1px solid var(--hairline,#e7e7df);}' +
      '.edh-consent-sms .edh-consent-check{font-size:12px;color:var(--subtle,#8a8f80);}' +
      // The newsletter form is a centred flex row on a dark forest panel, so the
      // consent block has to claim its own full-width line and switch to light
      // text. Without this it renders as a third flex item in near-invisible grey.
      // The signed-in status bar is justify-content:space-between, so its two
      // links have to be grouped or the preferences toggle would drift into the
      // middle of the bar.
      '.auth-status-actions{display:flex;gap:14px;align-items:center;flex-wrap:wrap;}' +
      '.subscribe-form .edh-consent{flex:1 1 100%;margin-top:4px;text-align:center;}' +
      '.section.dark .edh-consent-note,.section.dark .edh-consent-check{color:#cdd7c4;}' +
      '.section.dark .edh-consent-note a:hover,.section.dark .edh-consent-check a:hover{color:#a9e0c4;}';
    var el = document.createElement('style');
    el.id = 'edh-consent-styles';
    el.appendChild(document.createTextNode(css));
    document.head.appendChild(el);
  }

  // ------------------------------------------------------------- render -----

  function noticeText(scope, effectiveRegion) {
    if (scope === 'subscribe') return T.noticeSubscribe;
    if (scope === 'contact') {
      return effectiveRegion === 'opt_out' ? T.noticeContactOptOut : T.noticeContact;
    }
    return effectiveRegion === 'opt_out' ? T.noticeSigninOptOut : T.noticeSignin;
  }

  function buildNote(scope, effectiveRegion) {
    var p = document.createElement('p');
    p.className = 'edh-consent-note';
    var text = noticeText(scope, effectiveRegion);
    // Opt-in notices read "... See our Privacy Policy."; opt-out and newsletter
    // notices already end in a full sentence, so the link is simply appended.
    var lead = effectiveRegion === 'opt_out' || scope === 'subscribe'
      ? text + ' '
      : text + ' ' + T.seeOur + ' ';
    p.appendChild(document.createTextNode(lead));
    var a = document.createElement('a');
    a.href = privacyHref();
    a.textContent = T.privacy;
    p.appendChild(a);
    p.appendChild(document.createTextNode('.'));
    return p;
  }

  function buildCheckbox(id, labelText, checked, onChange) {
    var label = document.createElement('label');
    label.className = 'edh-consent-check';
    label.setAttribute('for', id);

    var input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.checked = !!checked;
    input.addEventListener('change', function () {
      onChange(input.checked);
    });

    var span = document.createElement('span');
    span.textContent = labelText;

    label.appendChild(input);
    label.appendChild(span);
    return label;
  }

  function phoneInputFor(host) {
    var form = host.closest ? host.closest('form') : null;
    if (!form) return null;
    return form.querySelector('input[type="tel"], input[name="phone"]');
  }

  function renderHost(host) {
    var scope = host.getAttribute('data-edh-consent');
    var effectiveRegion = regionResolved ? region : 'opt_in';

    // Preserve any tick the visitor has already made: this re-renders once when
    // the geo lookup lands, and wiping their choice at that moment would be
    // both rude and, for the SMS box, legally worthless.
    var priorEmail = readStore(STORE_EMAIL) === '1';
    var priorSms = readStore(STORE_SMS) === '1';

    host.innerHTML = '';
    host.className = 'edh-consent';

    // The email checkbox appears only where consent is actually required: an
    // opt_in region, and not on the newsletter form where submitting IS the act.
    if (effectiveRegion === 'opt_in' && scope !== 'subscribe') {
      host.appendChild(
        buildCheckbox('edh-consent-email-' + scope, T.optInEmail, priorEmail, function (on) {
          writeStore(STORE_EMAIL, on ? '1' : '0');
        })
      );
    }

    host.appendChild(buildNote(scope, effectiveRegion));

    // SMS is contact-form only, because that is the only page with a phone
    // field, and it stays hidden until a number is actually entered. Explicit
    // opt-in in every region: the TCPA wording satisfies GDPR too, so one box
    // and one string covers both regimes.
    if (scope === 'contact') {
      var phone = phoneInputFor(host);
      if (phone) {
        var smsWrap = document.createElement('div');
        smsWrap.className = 'edh-consent-sms';
        smsWrap.style.display = phone.value.trim() ? '' : 'none';
        smsWrap.appendChild(
          buildCheckbox('edh-consent-sms-' + scope, T.optInSms, priorSms, function (on) {
            writeStore(STORE_SMS, on ? '1' : '0');
          })
        );
        host.appendChild(smsWrap);

        var sync = function () {
          smsWrap.style.display = phone.value.trim() ? '' : 'none';
        };
        phone.addEventListener('input', sync);
        phone.addEventListener('change', sync);
      }
    }
  }

  function renderAll() {
    injectStyles();
    var hosts = document.querySelectorAll('[data-edh-consent]');
    Array.prototype.forEach.call(hosts, renderHost);
  }

  // --------------------------------------------------------------- read -----

  // Returns what the visitor was actually shown and what they chose. The server
  // stamps the time, the region it saw and a truncated IP itself; nothing here
  // is trusted for those.
  function read(scope) {
    scope = scope || 'signin';
    var effectiveRegion = regionResolved ? region : 'opt_in';
    var host = document.querySelector('[data-edh-consent="' + scope + '"]');
    var emailBox = document.getElementById('edh-consent-email-' + scope);
    var smsBox = document.getElementById('edh-consent-sms-' + scope);

    var granted;
    var method;
    var restored = false;
    if (scope === 'subscribe') {
      granted = true;
      method = 'newsletter_form';
    } else if (effectiveRegion === 'opt_out') {
      granted = true;
      method = 'notice';
    } else if (emailBox) {
      granted = !!emailBox.checked;
      method = 'checkbox';
    } else {
      // The checkbox has not rendered yet. This is the OAuth return leg: the
      // page has just come back from Google or LinkedIn and captureLead() can
      // fire before this module has drawn anything.
      //
      // A decision stored BEFORE the redirect is authoritative. Reporting it as
      // "unavailable" is what silently discarded a tick the visitor really
      // made, and in the data that is indistinguishable from someone who chose
      // not to tick, so nobody would ever have reported it. Only say
      // unavailable when there is genuinely no stored decision to honour.
      var stored = readStore(STORE_EMAIL);
      if (stored === '1' || stored === '0') {
        granted = stored === '1';
        method = 'checkbox';
        restored = true;
      } else {
        granted = false;
        method = 'unavailable';
      }
    }

    var smsGranted = null;
    if (smsBox) {
      var smsWrap = smsBox.closest ? smsBox.closest('.edh-consent-sms') : null;
      var smsVisible = !smsWrap || smsWrap.style.display !== 'none';
      smsGranted = smsVisible ? !!smsBox.checked : null;
    }

    return {
      version: VERSION,
      locale: L,
      region: effectiveRegion,
      regionResolved: regionResolved,
      scope: scope,
      marketingEmail: granted,
      marketingEmailMethod: method,
      // True when the decision came from storage rather than a rendered box,
      // i.e. it was made before an OAuth redirect. Still a real decision.
      marketingEmailRestored: restored,
      marketingEmailText:
        method === 'checkbox'
          ? T.optInEmail
          : noticeText(scope, effectiveRegion),
      marketingSms: smsGranted,
      marketingSmsText: smsGranted === null ? null : T.optInSms,
      pageUrl: window.location.href,
    };
  }

  window.edhConsent = {
    read: read,
    // Everything the signed-in preferences toggle on the pricing page needs, in
    // one call, so no locale string ever has to be duplicated into a page.
    labels: function () {
      return {
        subscribe: T.prefSubscribe,
        unsubscribe: T.prefUnsubscribe,
        marketingText: T.optInEmail,
        version: VERSION,
        locale: L,
        region: regionResolved ? region : null,
      };
    },
    region: function () {
      return regionResolved ? region : null;
    },
    refresh: renderAll,
  };

  function init() {
    renderAll();
    resolveRegion(function () {
      renderAll();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
