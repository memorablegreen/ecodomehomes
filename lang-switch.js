(function(){
  var style = document.createElement('style');
  style.textContent = '.lang-switch{display:flex;gap:6px;align-items:center;margin-right:14px}.lang-switch a{display:inline-flex;align-items:center;justify-content:center;width:26px;height:18px;border-radius:2px;overflow:hidden;transition:all .2s;opacity:.55;border:1px solid transparent;box-shadow:0 1px 2px rgba(0,0,0,.08)}.lang-switch a:hover{opacity:.9;transform:translateY(-1px)}.lang-switch a.active{opacity:1;border-color:rgba(47,69,39,.35);box-shadow:0 2px 6px rgba(47,69,39,.18)}.lang-switch svg{display:block;width:100%;height:100%}@media(max-width:600px){.lang-switch{margin-right:8px;gap:4px}.lang-switch a{width:22px;height:15px}}';
  document.head.appendChild(style);

  var flags = {
    en: '<svg viewBox="0 0 60 30" preserveAspectRatio="xMidYMid slice"><clipPath id="t"><path d="M0,0v30h60V0z"/></clipPath><rect width="60" height="30" fill="#012169"/><path d="M0,0L60,30M60,0L0,30" stroke="#fff" stroke-width="6"/><path d="M0,0L60,30M60,0L0,30" clip-path="url(#t)" stroke="#C8102E" stroke-width="4"/><path d="M30,0v30M0,15h60" stroke="#fff" stroke-width="10"/><path d="M30,0v30M0,15h60" stroke="#C8102E" stroke-width="6"/></svg>',
    pt: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="24" height="40" fill="#006600"/><rect x="24" width="36" height="40" fill="#FF0000"/><circle cx="24" cy="20" r="6" fill="#FFE600" stroke="#000" stroke-width=".5"/></svg>',
    fr: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="20" height="40" fill="#002395"/><rect x="20" width="20" height="40" fill="#fff"/><rect x="40" width="20" height="40" fill="#ED2939"/></svg>',
    es: '<svg viewBox="0 0 60 40" preserveAspectRatio="xMidYMid slice"><rect width="60" height="40" fill="#AA151B"/><rect y="10" width="60" height="20" fill="#F1BF00"/></svg>'
  };

  var langs = [
    {code:'en', label:'English', prefix:''},
    {code:'pt', label:'Português', prefix:'/pt'},
    {code:'fr', label:'Français', prefix:'/fr'},
    {code:'es', label:'Español', prefix:'/es'}
  ];

  var path = window.location.pathname;
  var currentLang = 'en';
  var pagePath = path;

  if (path.indexOf('/pt/') === 0) { currentLang = 'pt'; pagePath = path.substring(3); }
  else if (path.indexOf('/fr/') === 0) { currentLang = 'fr'; pagePath = path.substring(3); }
  else if (path.indexOf('/es/') === 0) { currentLang = 'es'; pagePath = path.substring(3); }

  if (pagePath === '/' || pagePath === '') pagePath = '/index.html';

  var switcher = document.createElement('div');
  switcher.className = 'lang-switch';

  langs.forEach(function(lang) {
    var a = document.createElement('a');
    a.href = lang.prefix + pagePath;
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
