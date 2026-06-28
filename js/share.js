(function () {
  'use strict';

  // Wires up the social share links in each article's .share block.
  // The LinkedIn and X anchors ship with href="#"; we set them at runtime
  // from the page's canonical URL so we never hardcode a per-article URL.

  function shareUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    if (canonical && canonical.href) return canonical.href;
    return window.location.href;
  }

  function wire() {
    var blocks = document.querySelectorAll('.share');
    if (!blocks.length) return;
    var url = encodeURIComponent(shareUrl());
    var targets = {
      linkedin: 'https://www.linkedin.com/sharing/share-offsite/?url=' + url,
      x: 'https://twitter.com/intent/tweet?url=' + url
    };
    blocks.forEach(function (block) {
      block.querySelectorAll('a').forEach(function (a) {
        var label = (a.textContent || '').trim().toLowerCase();
        var href = null;
        if (label === 'linkedin') href = targets.linkedin;
        else if (label === 'x' || label === 'twitter') href = targets.x;
        if (!href) return; // leave Email (mailto) and anything else untouched
        a.setAttribute('href', href);
        a.setAttribute('target', '_blank');
        a.setAttribute('rel', 'noopener');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wire);
  } else {
    wire();
  }
})();
