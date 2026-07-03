#!/usr/bin/env python3
"""One-shot optics pass for the homepage (root + es/fr/pt/us mirrors).
Idempotent: skips a file if the optics marker is already present."""
import sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
FILES = ["index.html", "es/index.html", "fr/index.html", "pt/index.html", "us/index.html"]
MARKER = "/* ===== EDH optics layer ===== */"

CSS = """
 /* ===== EDH optics layer ===== */
 :root{--moss-pale:#e3ecd8}

 /* Cinematic reveal: rise + defocus + settle */
 .reveal{opacity:0;transform:translateY(24px) scale(.99);filter:blur(6px);
 transition:opacity .85s cubic-bezier(.22,.61,.36,1),transform .85s cubic-bezier(.22,.61,.36,1),filter .85s cubic-bezier(.22,.61,.36,1)}
 .reveal.in{opacity:1;transform:none;filter:none}

 /* Hero: slow Ken Burns drift on the active video */
 .hero-video{transform:scale(1.05)}
 .hero-video.active{animation:edhKB 19s ease-out forwards}
 @keyframes edhKB{from{transform:scale(1.05)}to{transform:scale(1.14)}}
 /* Film grain over the hero footage */
 .hero::before{
 content:"";position:absolute;inset:0;z-index:1;pointer-events:none;opacity:.055;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E");
 }
 /* Hero eyebrow: periodic light sweep */
 .hero-eyebrow{position:relative;overflow:hidden}
 .hero-eyebrow::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.28),transparent);
 transform:skewX(-18deg);animation:edhSweep 6s ease-in-out infinite}
 @keyframes edhSweep{0%,72%{left:-60%}88%,100%{left:130%}}
 /* Hero stat values: soft metal gradient */
 .hero-stat .v{background:linear-gradient(155deg,#fff 30%,#c5d9b6 105%);
 -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
 .hero-stat .v .unit{-webkit-text-fill-color:rgba(255,255,255,.7)}
 .hero-stat .v .prefix{-webkit-text-fill-color:rgba(255,255,255,.55)}
 .hero-stats.reveal{transition-delay:.15s}

 /* Buttons: light sweep on hover */
 .btn{position:relative;overflow:hidden}
 .btn::after{content:"";position:absolute;top:0;bottom:0;left:-70%;width:44%;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.45),transparent);
 transform:skewX(-18deg);transition:left .55s ease;pointer-events:none}
 .btn:hover::after{left:130%}
 .nav-cta{position:relative;overflow:hidden}

 /* USP rotator: gradient frame + shimmering lead bar */
 .usp-rotator{border:1px solid transparent;
 background:linear-gradient(#fff,#fff) padding-box,
 linear-gradient(150deg,rgba(74,103,65,.45),rgba(232,227,214,.9) 40%,rgba(126,169,107,.35)) border-box;
 box-shadow:0 22px 60px rgba(31,36,25,.13)}
 .cmp-fill.us{position:relative;overflow:hidden}
 .cmp-fill.us::after{content:"";position:absolute;top:0;bottom:0;left:-40%;width:30%;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.35),transparent);
 animation:edhBarSheen 3.2s ease-in-out infinite}
 @keyframes edhBarSheen{0%,55%{left:-40%}85%,100%{left:120%}}

 /* Specs bar: quiet lift */
 .spec-item{transition:transform .3s cubic-bezier(.22,.61,.36,1)}
 .spec-item:hover{transform:translateY(-2px)}

 /* Steps: numbered pulse + hover light */
 .step{transition:background .35s}
 .step:hover{background:#fbfaf6}
 .step .num{animation:edhNumPulse 3.4s ease-in-out infinite}
 .step:nth-child(2) .num{animation-delay:1.1s}
 .step:nth-child(3) .num{animation-delay:2.2s}
 @keyframes edhNumPulse{0%,100%{box-shadow:0 0 0 0 rgba(74,103,65,.35)}50%{box-shadow:0 0 0 9px rgba(74,103,65,0)}}

 /* Proof section (dark): aurora depth + grain + living tiles */
 .proof-section{overflow:hidden}
 .proof-section::before{content:"";position:absolute;top:-160px;right:-140px;width:640px;height:640px;pointer-events:none;
 background:radial-gradient(circle,rgba(126,169,107,.14),rgba(126,169,107,.04) 45%,transparent 68%)}
 .proof-section::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E")}
 .proof-section .container{position:relative;z-index:1}
 .proof-tile{position:relative;overflow:hidden;transition:background .35s}
 .proof-tile:hover{background:rgba(126,169,107,.07)}
 .proof-tile::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;
 background:linear-gradient(90deg,var(--moss-bright),transparent 75%);
 transform:scaleX(0);transform-origin:left center;transition:transform .45s cubic-bezier(.22,.61,.36,1)}
 .proof-tile:hover::before{transform:scaleX(1)}
 .proof-tile .v{background:linear-gradient(150deg,#fff 30%,#a8c98f 110%);
 -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
 .proof-tile .v em{-webkit-text-fill-color:var(--moss-bright)}

 /* Lifetime economics: gradient figures + cell lift */
 .econ-cell{transition:background .35s}
 .econ-cell:hover{background:#fbfaf6}
 .econ-cell .v{background:linear-gradient(150deg,var(--moss-dark) 30%,var(--moss-bright) 115%);
 -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}

 /* Comparison table: our column carries a moss accent edge */
 .compare-row:not(.compare-header) .compare-cell.us{box-shadow:inset 3px 0 0 var(--moss)}
 .compare-row:not(.compare-header){transition:background .25s}
 .compare-row:not(.compare-header):hover .compare-cell.label{background:#f3efe4}

 /* Applications band: aurora + pill sheen */
 .apps{position:relative;overflow:hidden}
 .apps::before{content:"";position:absolute;bottom:-200px;left:-160px;width:620px;height:620px;pointer-events:none;
 background:radial-gradient(circle,rgba(126,169,107,.13),transparent 66%)}
 .apps>*{position:relative;z-index:1}
 .apps-pill{position:relative;overflow:hidden}
 .apps-pill::after{content:"";position:absolute;top:0;bottom:0;left:-70%;width:44%;
 background:linear-gradient(105deg,transparent,rgba(255,255,255,.25),transparent);
 transform:skewX(-18deg);transition:left .5s ease;pointer-events:none}
 .apps-pill:hover::after{left:130%}

 /* FAQ: hover indent + open accent */
 .faq-item{transition:padding-left .3s cubic-bezier(.22,.61,.36,1)}
 .faq-item:hover{padding-left:8px}
 details[open] .faq-q{color:var(--moss-dark)}

 /* CTA banner: aurora glow pair + grain */
 .cta-section{position:relative;overflow:hidden}
 .cta-section::before{content:"";position:absolute;inset:0;pointer-events:none;
 background:
 radial-gradient(560px 420px at 14% 0%,rgba(197,217,182,.16),transparent 65%),
 radial-gradient(560px 420px at 88% 100%,rgba(126,169,107,.18),transparent 65%)}
 .cta-section::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;
 background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='160' height='160' filter='url(%23n)' opacity='.55'/%3E%3C/svg%3E")}
 .cta-section>*{position:relative;z-index:1}
 .cta-section h2 em{text-shadow:0 0 34px rgba(197,217,182,.5)}

 /* 3D tilt cards (JS drives --rx/--ry) */
 .edh-tilt{transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg));
 transition:transform .5s cubic-bezier(.22,.61,.36,1),box-shadow .5s cubic-bezier(.22,.61,.36,1);will-change:transform}
 .edh-tilt.tilting{transition:transform .08s linear,box-shadow .5s cubic-bezier(.22,.61,.36,1)}
 .edh-tilt:hover{box-shadow:0 26px 60px rgba(31,36,25,.16)}
 /* Image zoom-on-hover frames */
 .edh-zoom img{transition:transform .8s cubic-bezier(.22,.61,.36,1)}
 .edh-zoom:hover img{transform:scale(1.045)}

 @media (prefers-reduced-motion: reduce){
 .reveal{opacity:1;transform:none;filter:none;transition:none}
 .hero-video,.hero-video.active{animation:none;transform:none}
 .hero-eyebrow::after,.cmp-fill.us::after,.step .num{animation:none}
 .btn::after,.apps-pill::after{display:none}
 .edh-tilt{transform:none;transition:none}
 .edh-zoom:hover img{transform:none}
 }
"""

JS = """<script>
/* EDH optics: pointer-tracked 3D tilt (desktop, motion-safe only) */
(function(){
 if(window.matchMedia&&(window.matchMedia('(prefers-reduced-motion: reduce)').matches||window.matchMedia('(pointer: coarse)').matches))return;
 document.querySelectorAll('.edh-tilt').forEach(function(el){
 var max=parseFloat(el.getAttribute('data-tilt'))||3.5,raf=null,px=0,py=0;
 function apply(){raf=null;el.style.setProperty('--rx',(py*-max).toFixed(2)+'deg');el.style.setProperty('--ry',(px*max).toFixed(2)+'deg');}
 el.addEventListener('pointerenter',function(){el.classList.add('tilting');});
 el.addEventListener('pointermove',function(e){var r=el.getBoundingClientRect();px=((e.clientX-r.left)/r.width-.5)*2;py=((e.clientY-r.top)/r.height-.5)*2;if(!raf)raf=requestAnimationFrame(apply);});
 el.addEventListener('pointerleave',function(){el.classList.remove('tilting');el.style.setProperty('--rx','0deg');el.style.setProperty('--ry','0deg');});
 });
})();
</script>
</body>"""

# (anchor, replacement) pairs — all exact-string, all verified present in every mirror
EDITS = [
    # 1. CSS block before the closing style tag (anchored on the last rule)
    (" .apps-pill:hover{background:var(--moss);border-color:var(--moss)}\n</style>",
     " .apps-pill:hover{background:var(--moss);border-color:var(--moss)}\n" + CSS + "</style>"),
    # 2. Hero stats join the reveal choreography
    ('<div class="hero-stats">', '<div class="hero-stats reveal">'),
    # 3. Pricing teaser card: 3D tilt
    ('style="background:#fff;border:1px solid var(--rule);border-radius:10px;padding:36px;box-shadow:0 1px 0 rgba(31,36,25,.02)">',
     'class="edh-tilt" style="background:#fff;border:1px solid var(--rule);border-radius:10px;padding:36px;box-shadow:0 1px 0 rgba(31,36,25,.02)">'),
    # 4. Greenhouse image: tilt + zoom frame
    ('style="border-radius:10px;overflow:hidden;background:#ddd5c8;aspect-ratio:4/5">',
     'class="edh-tilt edh-zoom" data-tilt="2.5" style="border-radius:10px;overflow:hidden;background:#ddd5c8;aspect-ratio:4/5">'),
    # 5. Tilt driver before </body>
    ("</body>", JS),
]

failures = 0
for rel in FILES:
    p = ROOT / rel
    html = p.read_text(encoding="utf-8")
    if MARKER in html:
        print(f"skip (already applied): {rel}")
        continue
    ok = True
    for old, new in EDITS:
        if html.count(old) != 1:
            print(f"FAIL {rel}: anchor not unique ({html.count(old)}x): {old[:60]!r}")
            ok = False
            failures += 1
            break
        html = html.replace(old, new)
    if ok:
        p.write_text(html, encoding="utf-8")
        print(f"applied: {rel}")

sys.exit(1 if failures else 0)
