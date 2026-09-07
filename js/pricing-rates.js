// js/pricing-rates.js
//
// SINGLE SOURCE OF TRUTH for every pricing constant used by the 7
// EcoDomeHomes pricing calculators (root/en, de, es, fr, nl, pt, us/en).
// THIS IS THE ONLY PLACE A PRICE MAY BE DEFINED. No pricing page may
// hardcode a rate, a fixed fee, an add-on/greenhouse cost, the EUR/USD rate,
// or the m2<->ft2 factor locally -- it must read window.EDH_PRICING instead.
//
// Before this file existed, each locale hand-copied these numbers into its
// own inline <script>. They drifted: us/pricing.html moved to a newer, flat
// per-m2 US rate (and the current EUR/USD rate) while the six EUR-labelled
// pages (root, de, es, fr, nl, pt) kept the OLD rate model, including a
// stale US figure -- {v:1010,f:81500} instead of the real {v:2100,f:0} --
// which quoted US buyers about 23% under the real price
// (117 m2 builder: $231,617 stale vs $285,700 correct).
//
// scripts/check-pricing-parity.mjs EXECUTES each page's real inline pricing
// engine in a node:vm sandbox and fails the build the moment any page's
// rate constants drift from this file again.
//
// Loaded as a plain classic script (no bundler, no ES modules on this
// site): `<script src="/js/pricing-rates.js"></script>`, placed
// immediately before the page's inline pricing-engine <script> (NOT
// deferred -- a deferred script on this site's markup runs after the
// page's own inline scripts, which would leave window.EDH_PRICING
// undefined when the engine reads it).
(function () {
  'use strict';

  // Per-country, per-tier build rate. total = size_m2 * v + f (fixed fee).
  // A flat per-m2 rate with no fixed fee (the US model) is just f: 0.
  var COUNTRY_RATES = {
    portugal: {
      watertight: { v: 795, f: 0 },
      builder: { v: 985, f: 120000 },
      custom: { v: 1545, f: 178000 }
    },
    us: {
      watertight: { v: 1260, f: 0 },
      builder: { v: 2100, f: 0 },
      custom: { v: 2840, f: 0 }
    }
  };

  // English display names. Used as-is by the root (en) and us (en) pages.
  // The 5 translated locale pages (de/es/fr/nl/pt) keep their own local
  // translated copy of this map -- it is UI text, not pricing data, so it
  // stays page-local by design and is out of scope for this file.
  var COUNTRY_NAMES = { portugal: 'Portugal', us: 'United States' };

  // $1 = EUR 0.86. This is the more recent of the two figures the site
  // carried (us/pricing.html's); the six EUR pages had a stale 1.16.
  var EUR_TO_USD = 1.1628;
  var M2_TO_FT2 = 10.7639;

  // Upper-floor add-on, EUR/m2 (or EUR-equivalent m2 for the US engine).
  // NOTE: the two engine families already used two different figures before
  // this file existed (330 on the six EUR pages, 700 on us/pricing.html),
  // and that was never part of the verified pricing defect this file fixes
  // (Chris's ledger only covers the Builder-tier, no-add-ons default, which
  // has the floor add-on off). Both real figures are kept here, unchanged,
  // so nothing's computed output changes and a future reconciliation (if
  // Chris wants one) has both numbers in one place instead of two.
  var FLOOR_RATE = { portugal: 330, us: 700 };

  var GREENHOUSE_META = { none: { cost: 0 }, integrated: { cost: 55000 }, standalone: { cost: 80000 } };
  var ADDON_META = {
    solar: { cost: 22000 },
    water: { cost: 14000 },
    glazing: { cost: 11000 },
    smart: { cost: 6500 },
    ev: { cost: 3500 }
  };

  window.EDH_PRICING = {
    COUNTRY_RATES: COUNTRY_RATES,
    COUNTRY_NAMES: COUNTRY_NAMES,
    EUR_TO_USD: EUR_TO_USD,
    M2_TO_FT2: M2_TO_FT2,
    FLOOR_RATE: FLOOR_RATE,
    GREENHOUSE_META: GREENHOUSE_META,
    ADDON_META: ADDON_META
  };
})();
