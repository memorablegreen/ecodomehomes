(function () {
  'use strict';

  // Progressive enhancement for the EcoDomeHomes lead forms:
  //   <form data-lead-form="contact">  on contact.html (all locales)
  //   <form data-lead-form="subscribe"> on updates.html (all locales)
  //
  // Intercepts submit, POSTs the fields as JSON to /api/contact or /api/subscribe,
  // and renders inline success / error states. On success it dispatches
  // 'edh:lead-success' so js/analytics-events.js fires the single conversion event
  // (no double-count: analytics no longer listens to the raw submit).

  var ENDPOINTS = { contact: '/api/contact', subscribe: '/api/subscribe' };
  var TOKEN_ENDPOINT = '/api/form-token';

  // Short-lived signed token fetched from the server and echoed back in the POST
  // body. Best-effort anti-abuse: if this fetch fails we submit WITHOUT it, and
  // the server still accepts a same-origin submission that carries no token, so a
  // real lead is never blocked by token logic.
  var formToken = '';
  var tokenFetched = false;

  function fetchToken() {
    if (tokenFetched && formToken) return;
    try {
      fetch(TOKEN_ENDPOINT, { headers: { Accept: 'application/json' } })
        .then(function (r) { return r.json(); })
        .then(function (b) { formToken = (b && b.token) || ''; tokenFetched = true; })
        .catch(function () { /* submit will proceed without a token */ });
    } catch (e) { /* no fetch available -> submit without a token */ }
  }

  // Localized copy. ASCII, no accents, no em or en dashes (matches the locale files).
  var COPY = {
    en: {
      sending: 'Sending...',
      contactOk: 'Thank you. Your inquiry is in. We typically reply within one business day.',
      contactErr: 'Something went wrong sending your inquiry. Please try again, or email EcoDomeHomes@memorablegreen.com.',
      subscribeOk: 'You are on the list. We will email you when the next update goes live.',
      subscribeErr: 'Something went wrong. Please try again in a moment.',
    },
    pt: {
      sending: 'A enviar...',
      contactOk: 'Obrigado. O seu pedido foi enviado. Normalmente respondemos no prazo de um dia util.',
      contactErr: 'Ocorreu um erro ao enviar o seu pedido. Tente novamente ou escreva para EcoDomeHomes@memorablegreen.com.',
      subscribeOk: 'A sua inscricao foi registada. Enviaremos um email quando sair a proxima atualizacao.',
      subscribeErr: 'Ocorreu um erro. Tente novamente dentro de momentos.',
    },
    fr: {
      sending: 'Envoi...',
      contactOk: 'Merci. Votre demande a bien ete envoyee. Nous repondons en general sous un jour ouvre.',
      contactErr: "Une erreur s'est produite lors de l'envoi. Reessayez ou ecrivez a EcoDomeHomes@memorablegreen.com.",
      subscribeOk: 'Votre inscription est enregistree. Nous vous ecrirons des la prochaine actualite.',
      subscribeErr: "Une erreur s'est produite. Reessayez dans un instant.",
    },
    es: {
      sending: 'Enviando...',
      contactOk: 'Gracias. Su solicitud se ha enviado. Normalmente respondemos en un dia habil.',
      contactErr: 'Se ha producido un error al enviar su solicitud. Intentelo de nuevo o escriba a EcoDomeHomes@memorablegreen.com.',
      subscribeOk: 'Su suscripcion se ha registrado. Le escribiremos cuando publiquemos la proxima actualizacion.',
      subscribeErr: 'Se ha producido un error. Intentelo de nuevo en un momento.',
    },
  };

  function copyFor() {
    var lang = (document.documentElement.lang || 'en').toLowerCase().split('-')[0];
    return COPY[lang] || COPY.en;
  }

  function collect(form) {
    var data = {};
    var els = form.querySelectorAll('input, select, textarea');
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      if (!el.name) continue;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) continue;
      data[el.name] = el.value;
    }
    return data;
  }

  function statusNode(form) {
    var existing = form.querySelector('[data-form-status]');
    if (existing) return existing;
    var el = document.createElement('div');
    el.setAttribute('data-form-status', '');
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.style.display = 'none';
    el.style.marginTop = '16px';
    el.style.padding = '14px 16px';
    el.style.borderRadius = '6px';
    el.style.fontSize = '14px';
    el.style.lineHeight = '1.55';
    form.appendChild(el);
    return el;
  }

  function showStatus(el, text, kind) {
    el.textContent = text;
    el.style.display = 'block';
    if (kind === 'success') {
      el.style.background = 'rgba(126,169,107,.16)';
      el.style.border = '1px solid #7ea96b';
      el.style.color = '#2f4527';
    } else {
      el.style.background = 'rgba(176,58,46,.10)';
      el.style.border = '1px solid #b03a2e';
      el.style.color = '#7a261d';
    }
  }

  function wire(form) {
    var type = form.getAttribute('data-lead-form');
    var endpoint = ENDPOINTS[type];
    if (!endpoint) return;
    var status = statusNode(form);
    var submitBtn = form.querySelector('[type="submit"], button:not([type])');
    var originalBtnText = submitBtn ? submitBtn.innerHTML : '';

    // Refresh the token when the user starts interacting (covers a failed
    // page-load fetch). Cheap and idempotent.
    form.addEventListener('focusin', fetchToken);

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      // Native HTML5 validation already ran; required fields are present.
      var copy = copyFor();
      status.style.display = 'none';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.loading = '1';
        submitBtn.innerHTML = copy.sending;
      }

      var payload = collect(form);
      if (formToken) payload.form_token = formToken;

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (resp) {
          return resp
            .json()
            .catch(function () {
              return { ok: resp.ok };
            })
            .then(function (body) {
              return { ok: resp.ok && body && body.ok, body: body };
            });
        })
        .then(function (result) {
          if (result.ok) {
            onSuccess(form, type, copy, status);
          } else {
            onError(submitBtn, originalBtnText, status, type, copy);
          }
        })
        .catch(function () {
          onError(submitBtn, originalBtnText, status, type, copy);
        });
    });
  }

  function onSuccess(form, type, copy, status) {
    // Fire the conversion event exactly once, on confirmed success.
    try {
      document.dispatchEvent(new CustomEvent('edh:lead-success', { detail: { formType: type } }));
    } catch (e) {}

    if (type === 'subscribe') {
      // Replace the input row with a confirmation line, keep the section styling.
      form.reset();
      showStatus(status, copy.subscribeOk, 'success');
      var controls = form.querySelectorAll('input:not([data-form-status]), button');
      for (var i = 0; i < controls.length; i++) {
        if (controls[i].getAttribute('data-form-status') === null) controls[i].style.display = 'none';
      }
      status.style.marginTop = '0';
    } else {
      // Contact form: swap the form body for a clean confirmation.
      var fields = form.querySelectorAll(
        '.field, .field-row, .form-section-label, .submit, .form-note, .check-group'
      );
      for (var j = 0; j < fields.length; j++) fields[j].style.display = 'none';
      showStatus(status, copy.contactOk, 'success');
    }
  }

  function onError(submitBtn, originalBtnText, status, type, copy) {
    if (submitBtn) {
      submitBtn.disabled = false;
      delete submitBtn.dataset.loading;
      submitBtn.innerHTML = originalBtnText;
    }
    showStatus(status, type === 'subscribe' ? copy.subscribeErr : copy.contactErr, 'error');
  }

  function init() {
    var forms = document.querySelectorAll('form[data-lead-form]');
    if (forms.length) fetchToken();
    for (var i = 0; i < forms.length; i++) wire(forms[i]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
