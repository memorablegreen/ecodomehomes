(function(){
  var style = document.createElement('style');
  style.textContent = '.lang-switch{display:flex;gap:9px;align-items:center;margin-right:16px}.lang-switch a{display:inline-flex;align-items:center;justify-content:center;width:40px;height:28px;border-radius:3px;overflow:hidden;transition:all .2s;opacity:.75;border:1px solid rgba(0,0,0,.12);box-shadow:0 1px 3px rgba(0,0,0,.12)}.lang-switch a:hover{opacity:1;transform:translateY(-1px);box-shadow:0 3px 8px rgba(0,0,0,.18)}.lang-switch a.active{opacity:1;border-color:rgba(47,69,39,.55);border-width:2px;box-shadow:0 2px 8px rgba(47,69,39,.28)}.lang-switch svg{display:block;width:100%;height:100%}@media(max-width:600px){.lang-switch{margin-right:10px;gap:7px}.lang-switch a{width:32px;height:22px}}';
  document.head.appendChild(style);

  var flags = {
    en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="t"><path d="M0,0v30h60V0z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>',
    us: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="60" height="40" fill="#fff"/><g fill="#B22234"><rect y="0" width="60" height="3.08"/><rect y="6.15" width="60" height="3.08"/><rect y="12.31" width="60" height="3.08"/><rect y="18.46" width="60" height="3.08"/><rect y="24.62" width="60" height="3.08"/><rect y="30.77" width="60" height="3.08"/><rect y="36.92" width="60" height="3.08"/></g><rect width="24" height="21.54" fill="#3C3B6E"/><g fill="#fff"><circle cx="4" cy="4" r="1.1"/><circle cx="12" cy="4" r="1.1"/><circle cx="20" cy="4" r="1.1"/><circle cx="8" cy="9" r="1.1"/><circle cx="16" cy="9" r="1.1"/><circle cx="4" cy="14" r="1.1"/><circle cx="12" cy="14" r="1.1"/><circle cx="20" cy="14" r="1.1"/><circle cx="8" cy="18.5" r="1.1"/><circle cx="16" cy="18.5" r="1.1"/></g></svg>',
    pt: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="24" height="40" fill="#006600"/><rect x="24" width="36" height="40" fill="#FF0000"/><circle cx="24" cy="20" r="6" fill="#FFE600" stroke="#000" stroke-width=".5"/></svg>',
    fr: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="20" height="40" fill="#002395"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ED2939"/></svg>',
    es: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/></svg>',
    nl: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="60" height="13.34" y="0" fill="#AE1C28"/><rect width="60" height="13.33" y="13.33" fill="#fff"/><rect width="60" height="13.33" y="26.67" fill="#21468B"/></svg>',
    de: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="60" height="13.34" y="0" fill="#000"/><rect width="60" height="13.33" y="13.33" fill="#DD0000"/><rect width="60" height="13.33" y="26.67" fill="#FFCE00"/></svg>'
  };

  var langs = [
    {code:'pt', label:'Português', prefix:'/pt'},
    {code:'us', label:'American English', prefix:'/us'},
    {code:'en', label:'British English', prefix:''},
    {code:'es', label:'Español', prefix:'/es'},
    {code:'fr', label:'Français', prefix:'/fr'},
    {code:'nl', label:'Nederlands', prefix:'/nl'},
    {code:'de', label:'Deutsch', prefix:'/de'}
  ];

  var path = window.location.pathname;
  var currentLang = 'en';
  var pagePath = path;

  // Match BOTH '/pt/pricing' and the bare '/pt'. vercel.json sets
  // trailingSlash:false, so a locale home page is served at '/pt' with no
  // trailing slash; a '/pt/'-only test missed it, left pagePath as '/pt', and
  // built every flag as '/us/pt', '/de/pt' and so on. Six 404s on the six
  // busiest pages on the site, and the middleware sends US traffic straight
  // to one of them.
  ['us', 'pt', 'fr', 'es', 'nl', 'de'].some(function (code) {
    var prefix = '/' + code;
    if (path !== prefix && path.indexOf(prefix + '/') !== 0) return false;
    currentLang = code;
    pagePath = path.substring(prefix.length);
    return true;
  });

  // Home page of a locale: keep pagePath empty so the flag points at the clean
  // '/pt' rather than '/pt/index.html', which cleanUrls only serves via a 308.
  if (pagePath === '/') pagePath = '';

  // press.html exists in every locale EXCEPT /us. Send the US flag to the EN
  // /press rather than a non-existent /us/press (which would 404).
  var isPress = (pagePath === '/press' || pagePath === '/press.html');

  var switcher = document.createElement('div');
  switcher.className = 'lang-switch';

  langs.forEach(function(lang) {
    var a = document.createElement('a');
    if (isPress) {
      a.href = (lang.code === 'pt' || lang.code === 'es' || lang.code === 'fr' || lang.code === 'nl' || lang.code === 'de') ? '/' + lang.code + '/press' : '/press';
    } else {
      a.href = (lang.prefix + pagePath) || '/';
    }
    a.title = lang.label;
    a.setAttribute('aria-label', lang.label);
    a.innerHTML = flags[lang.code];
    if (lang.code === currentLang) a.className = 'active';
    switcher.appendChild(a);
  });

  var nav = document.querySelector('.nav');
  if (!nav) return;
  var cta = nav.querySelector('.nav-cta');
  if (cta && cta.parentNode) {
    cta.parentNode.insertBefore(switcher, cta);
  } else {
    nav.appendChild(switcher);
  }
})();
