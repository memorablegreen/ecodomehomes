/*
  Premium scroll motion for the EcoDomeHomes homepage.
  - Lenis: site-wide smooth scroll, wired into ScrollTrigger + the GSAP ticker.
  - GSAP ScrollTrigger: gentle fade-up reveals on section headings/content,
    hero stats, pricing tiers, and the engineered/economics stat blocks.

  Hard accessibility requirement: when the user has requested reduced motion,
  this script does nothing at all (no Lenis, no reveals) and the page stays
  fully static and visible. All "hidden" starting states are applied at
  runtime via gsap.set(), never in CSS, so a page with JS disabled or a
  failed CDN load always shows everything.
*/
(function () {
  'use strict';

  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;

  if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

  gsap.registerPlugin(ScrollTrigger);

  // ---- Lenis smooth scroll, wired into ScrollTrigger + the GSAP ticker ----
  if (typeof Lenis !== 'undefined') {
    var lenis = new Lenis();

    lenis.on('scroll', ScrollTrigger.update);

    gsap.ticker.add(function (time) {
      lenis.raf(time * 1000);
    });
    gsap.ticker.lagSmoothing(0);
  }

  // ---- Reveal helpers ----
  var FROM = { opacity: 0, y: 24 };
  var STAGGER = 0.08;

  function reveal(target, trigger) {
    var els = target && typeof target.length === 'number' ? Array.prototype.slice.call(target) : [target];
    els = els.filter(Boolean);
    if (!els.length) return;

    gsap.set(els, FROM);
    gsap.to(els, {
      opacity: 1,
      y: 0,
      duration: 0.7,
      ease: 'power2.out',
      stagger: STAGGER,
      scrollTrigger: {
        trigger: trigger || els[0],
        start: 'top 85%',
        toggleActions: 'play none none none'
      }
    });
  }

  // Hero stats
  var heroStats = document.querySelectorAll('.hero-stats .hero-stat');
  if (heroStats.length) {
    reveal(heroStats, document.querySelector('.hero-stats-outer'));
  }

  // Every .section: reveal its heading group, then its content.
  // Content that is a grid/list of items (pricing tiers, engineered and
  // economics stat blocks, steps, chips, etc.) staggers its individual
  // items; a single content block (a table, a form row) fades up as one.
  Array.prototype.forEach.call(document.querySelectorAll('.section'), function (section) {
    Array.prototype.forEach.call(section.querySelectorAll('.wrap'), function (wrap) {
      var head = wrap.querySelector('.section-head');

      if (head && head.parentElement === wrap) {
        reveal(head.children, head);
      }

      Array.prototype.forEach.call(wrap.children, function (child) {
        if (child === head) return;

        if (child.children && child.children.length > 1) {
          reveal(child.children, child);
        } else {
          reveal(child, child);
        }
      });
    });
  });
})();
