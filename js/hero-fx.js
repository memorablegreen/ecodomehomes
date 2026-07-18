/*
  Hero-only Vanta.js (three.js) animated background for EcoDomeHomes.
  - Desktop only (window.innerWidth >= 900), skipped entirely on mobile.
  - Skipped entirely when prefers-reduced-motion: reduce.
  - Loaded lazily from CDN; on any failure (network, WebGL unsupported) the
    hero simply keeps its static <img> background, unaffected.
  - Destroyed automatically if the viewport is resized down to mobile,
    re-initialized if resized back up to desktop.
  - Fully independent of scroll-motion.js: no shared state, safe if either
    script fails to load.
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  var DESKTOP_MIN = 900;
  var THREE_SRC = 'https://cdn.jsdelivr.net/npm/three@0.134/build/three.min.js';
  var VANTA_SRC = 'https://cdn.jsdelivr.net/npm/vanta@0.5/dist/vanta.fog.min.js';

  var el = document.getElementById('hero-vanta');
  if (!el) return;

  var effect = null;
  var loading = false;
  var loaded = false;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('failed to load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function isDesktop() {
    return window.innerWidth >= DESKTOP_MIN;
  }

  function init() {
    if (effect || !isDesktop() || typeof window.VANTA === 'undefined') return;
    try {
      effect = window.VANTA.FOG({
        el: el,
        THREE: window.THREE,
        mouseControls: false,
        touchControls: false,
        gyroControls: false,
        minHeight: 200,
        minWidth: 200,
        highlightColor: 0x8fa678,
        midtoneColor: 0x2f4527,
        lowlightColor: 0x121a0c,
        baseColor: 0x0b0f07,
        blurFactor: 0.62,
        speed: 1.3,
        zoom: 1
      });
      el.classList.add('is-active');
    } catch (e) {
      effect = null;
    }
  }

  function destroy() {
    if (!effect) return;
    try { effect.destroy(); } catch (e) { /* noop */ }
    effect = null;
    el.classList.remove('is-active');
  }

  function ensureLoadedThenInit() {
    if (!isDesktop()) return;
    if (loaded) { init(); return; }
    if (loading) return;
    loading = true;
    loadScript(THREE_SRC)
      .then(function () { return loadScript(VANTA_SRC); })
      .then(function () {
        loaded = true;
        init();
      })
      .catch(function () {
        loading = false;
      });
  }

  ensureLoadedThenInit();

  var resizeTimer;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function () {
      if (isDesktop()) {
        ensureLoadedThenInit();
      } else {
        destroy();
      }
    }, 200);
  });
})();
