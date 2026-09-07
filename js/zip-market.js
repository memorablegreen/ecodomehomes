// js/zip-market.js
//
// Classifies a postcode BY FORMAT. It does not claim to know where a person
// is, and nothing here changes a price on its own.
//
// WHY IT IS ONLY A FORMAT CHECK. Germany, Spain, France and Italy all use
// five digits, exactly like a US ZIP, so "five digits" is not evidence of an
// American on its own. Anything that silently switched a visitor to dollars on
// that signal would quote a German in the wrong currency, which is a worse bug
// than the one being fixed. So the caller decides: the English root pricing
// page OFFERS a switch and never performs one, and the format is recorded on
// the lead either way, so a US-format postcode sitting on a euro quote is
// findable in the data instead of silently wrong.
//
// Loaded as a plain classic script, like js/pricing-rates.js.
(function () {
  'use strict';

  var US = /^\d{5}(-\d{4})?$/;          // 74028, 74028-1234
  var PT = /^\d{4}-\d{3}$/;             // 1234-567
  var NL = /^\d{4}\s*[A-Za-z]{2}$/;     // 1234 AB
  var ALPHA = /[A-Za-z]/;               // UK, Ireland, Canada, Netherlands

  window.EDH_ZIP = {
    // Returns 'us' | 'pt' | 'nl' | 'alphanumeric' | 'other' | null.
    // 'us' means "formatted like a US ZIP", never "this person is American".
    format: function (zip) {
      if (zip === null || zip === undefined) { return null; }
      var z = String(zip).trim().toUpperCase();
      if (!z) { return null; }
      if (PT.test(z)) { return 'pt'; }
      if (NL.test(z)) { return 'nl'; }
      if (US.test(z)) { return 'us'; }
      if (ALPHA.test(z)) { return 'alphanumeric'; }
      return 'other';
    }
  };
})();
