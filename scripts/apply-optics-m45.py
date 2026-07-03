#!/usr/bin/env python3
"""Optics pass for the M45 pages (systems + agritech, root + es/fr/pt/us).
Same visual language as the homepage pass: cinematic reveals, film grain,
aurora depth, gradient figures, 3D tilt cards. Idempotent via marker."""
import sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
LOCALES = ["", "es/", "fr/", "pt/", "us/"]
MARKER = "/* ===== M45 optics layer ===== */"

GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E\")"

# {A}=accent var, {AB}=bright accent var (steel vs ochre per page)
COMMON_CSS = """
 /* ===== M45 optics layer ===== */
 /* Cinematic reveal: rise + defocus + settle */
 .reveal{opacity:0;transform:translateY(24px) scale(.99);filter:blur(6px);
 transition:opacity .85s cubic-bezier(.22,.61,.36,1),transform .85s cubic-bezier(.22,.61,.36,1),filter .85s cubic-bezier(.22,.61,.36,1)}
 .reveal.in{opacity:1;transform:none;filter:none}
 .apps .reveal:nth-child(2n){transition-delay:.1s}

 /* Hero: film grain + eyebrow light sweep */
 .hero::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.055;background-image:GRAIN}
 .hero-content{position:relative;z-index:2}
 .hero-eyebrow{position:relative;overflow:hidden}
 .hero-eyebrow::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.28),transparent);
 transform:skewX(-18deg);animation:edhSweep 6s ease-in-out infinite}
 @keyframes edhSweep{0%,72%{left:-60%}88%,100%{left:130%}}
 h1.headline em{text-shadow:0 0 34px ABGLOW}

 /* Buttons: light sweep on hover */
 .btn{position:relative;overflow:hidden}
 .btn::after{content:"";position:absolute;top:0;bottom:0;left:-70%;width:44%;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.45),transparent);
 transform:skewX(-18deg);transition:left .55s ease;pointer-events:none}
 .btn:hover::after{left:130%}
 .nav-cta{position:relative;overflow:hidden}

 /* Application cards: 3D tilt + image light sweep */
 .edh-tilt{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateY(var(--lift,0px));
 transition:transform .5s cubic-bezier(.22,.61,.36,1),box-shadow .5s cubic-bezier(.22,.61,.36,1);will-change:transform}
 .edh-tilt.tilting{transition:transform .08s linear,box-shadow .5s cubic-bezier(.22,.61,.36,1)}
 .app.edh-tilt:hover{--lift:-3px}
 .app-img{position:relative}
 .app-img::after{content:"";position:absolute;top:0;bottom:0;left:-70%;width:44%;z-index:1;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.22),transparent);
 transform:skewX(-18deg);transition:left .7s ease;pointer-events:none}
 .app:hover .app-img::after{left:135%}
 .app-tag{position:relative}
 .app-tag::after{content:"";position:absolute;left:0;bottom:-4px;width:28px;height:2px;
 background:linear-gradient(90deg,ACCENT,transparent);transform:scaleX(0);transform-origin:left center;
 transition:transform .4s cubic-bezier(.22,.61,.36,1)}
 .app:hover .app-tag::after{transform:scaleX(1)}

 @media (prefers-reduced-motion: reduce){
 .reveal{opacity:1;transform:none;filter:none;transition:none}
 .hero-eyebrow::after{animation:none}
 .btn::after,.app-img::after{display:none}
 .edh-tilt{transform:none;transition:none}
 }
"""

SYSTEMS_CSS = """
 /* Systems extras: breathing steel aurora, floating watermark, living caps tiles */
 .hero::before{animation:m45Aur 9s ease-in-out infinite alternate}
 @keyframes m45Aur{from{opacity:.75}to{opacity:1.25}}
 .hero-watermark{animation:m45Float 14s ease-in-out infinite alternate}
 @keyframes m45Float{from{transform:translateY(-52%)}to{transform:translateY(-47%)}}
 .caps-section{overflow:hidden}
 .caps-section::before{content:"";position:absolute;top:-160px;right:-140px;width:620px;height:620px;pointer-events:none;
 background:radial-gradient(circle,rgba(109,141,166,.16),rgba(109,141,166,.04) 45%,transparent 68%)}
 .caps-section::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;background-image:GRAIN}
 .caps-section .container{position:relative;z-index:1}
 .cap{position:relative;overflow:hidden;transition:background .35s}
 .cap:hover{background:rgba(109,141,166,.08)}
 .cap::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;
 background:linear-gradient(90deg,var(--steel-bright),transparent 75%);
 transform:scaleX(0);transform-origin:left center;transition:transform .45s cubic-bezier(.22,.61,.36,1)}
 .cap:hover::before{transform:scaleX(1)}
 .cap h4{background:linear-gradient(150deg,#fff 30%,#9fb9cd 115%);
 -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
 .contact-section{position:relative;overflow:hidden}
 .contact-section::before{content:"";position:absolute;top:-180px;left:50%;transform:translateX(-50%);width:760px;height:520px;pointer-events:none;
 background:radial-gradient(ellipse,rgba(109,141,166,.12),transparent 65%)}
 .contact-container{position:relative;z-index:1}
"""

AGRI_CSS = """
 /* Agri-Tech extras: gradient figures, living why-cards, dark CTA aurora */
 .why-num{background:linear-gradient(150deg,var(--ochre) 25%,var(--ochre-bright) 115%);
 -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
 .why-item{transition:transform .5s cubic-bezier(.22,.61,.36,1),box-shadow .5s cubic-bezier(.22,.61,.36,1),border-color .35s}
 .why-item:hover{border-color:var(--ochre);box-shadow:0 18px 44px rgba(42,34,24,.12)}
 .why-grid .reveal:nth-child(2){transition-delay:.1s}
 .why-grid .reveal:nth-child(3){transition-delay:.2s}
 .contact-section{position:relative;overflow:hidden}
 .contact-section::before{content:"";position:absolute;inset:0;pointer-events:none;
 background:
 radial-gradient(560px 420px at 12% 0%,rgba(214,160,96,.14),transparent 65%),
 radial-gradient(560px 420px at 90% 100%,rgba(214,160,96,.12),transparent 65%)}
 .contact-section::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;background-image:GRAIN}
 .contact-section>*{position:relative;z-index:1}
"""

JS = """<script>
/* M45 optics: reveals + pointer-tracked 3D tilt (desktop, motion-safe) */
(function(){
 var els=document.querySelectorAll('.reveal');
 if('IntersectionObserver' in window){
 var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target);}});},{threshold:.12});
 els.forEach(function(el){io.observe(el);});
 }else{els.forEach(function(el){el.classList.add('in');});}
 if(window.matchMedia&&(window.matchMedia('(prefers-reduced-motion: reduce)').matches||window.matchMedia('(pointer: coarse)').matches))return;
 document.querySelectorAll('.edh-tilt').forEach(function(el){
 var max=parseFloat(el.getAttribute('data-tilt'))||2.5,raf=null,px=0,py=0;
 function apply(){raf=null;el.style.setProperty('--rx',(py*-max).toFixed(2)+'deg');el.style.setProperty('--ry',(px*max).toFixed(2)+'deg');}
 el.addEventListener('pointerenter',function(){el.classList.add('tilting');});
 el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();px=((e.clientX-r.left)/r.width-.5)*2;py=((e.clientY-r.top)/r.height-.5)*2;if(!raf)raf=requestAnimationFrame(apply);});
 el.addEventListener('pointerleave',function(){el.classList.remove('tilting');el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg');});
 });
})();
</script>
</body>"""


def build_css(page):
    if page == "m45-systems.html":
        css = COMMON_CSS + SYSTEMS_CSS
        css = css.replace("ABGLOW", "rgba(109,141,166,.55)").replace("ACCENT", "var(--steel-bright)")
    else:
        css = COMMON_CSS + AGRI_CSS
        css = css.replace("ABGLOW", "rgba(214,160,96,.5)").replace("ACCENT", "var(--ochre-bright)")
    return css.replace("GRAIN", GRAIN)


failures = 0
for page in ["m45-systems.html", "m45-agritech.html"]:
    for loc in LOCALES:
        p = ROOT / loc / page
        html = p.read_text(encoding="utf-8")
        if MARKER in html:
            print(f"skip (already applied): {loc}{page}")
            continue
        edits_ok = True
        # 1. CSS before </style> (single occurrence, verified)
        for anchor, count in [("</style>", 1), ("</body>", 1)]:
            if html.count(anchor) != count:
                print(f"FAIL {loc}{page}: {anchor} x{html.count(anchor)}")
                edits_ok = False
        if not edits_ok:
            failures += 1
            continue
        html = html.replace("</style>", build_css(page) + "</style>")
        # 2. Reveal choreography + tilt on cards
        html = html.replace('class="app">', 'class="app reveal edh-tilt" data-tilt="2">')
        html = html.replace('<div class="section-head">', '<div class="section-head reveal">')
        if page == "m45-agritech.html":
            html = html.replace('class="why-item">', 'class="why-item reveal edh-tilt" data-tilt="3">')
        else:
            html = html.replace('<div class="cap">', '<div class="cap reveal">')
        # 3. Reveal observer + tilt driver
        html = html.replace("</body>", JS)
        p.write_text(html, encoding="utf-8")
        print(f"applied: {loc}{page}")

sys.exit(1 if failures else 0)
