import { useState, useMemo, useRef } from "react";
import { routeText, pullChips, analyzeImage, generate } from "./api.js";

function parseToolbox(text) {
  const map={};const lines=text.split('\n');let cur=null,acc=[];
  const isSep=l=>/^[=\-]{4,}/.test(l.trim())||/^\*{4,}/.test(l.trim());
  const flush=()=>{if(cur&&acc.length){let v=acc.join(' ').trim();if(v.startsWith('(')&&v.endsWith(')'))v=v.slice(1,-1);map[cur]=v.trim();}};
  for(const raw of lines){const l=raw.trim();if(!l)continue;if(isSep(l)){flush();cur=null;acc=[];continue;}const m=l.match(/^([A-Z_][A-Z0-9_]+)\s*=\s*(.*)/);if(m){flush();cur=m[1];acc=[m[2]];}else if(cur&&!l.startsWith('==')&&!l.startsWith('**'))acc.push(l);}
  flush();return map;
}
function resolvePipes(str){
  let r=str,p='',i=0;
  while(r!==p&&i<8){p=r;r=r.replace(/\{([^{}]*)\}/g,(_,inner)=>{const parts=inner.split('|').map(x=>{const wm=x.match(/\^([\d./]+)$/);let w=1;if(wm){const ws=wm[1];w=ws.includes('/')?parseFloat(ws.split('/')[0])/parseFloat(ws.split('/')[1]):parseFloat(ws);if(isNaN(w))w=1;}return{text:x.replace(/\^[\d./]+$/,'').trim(),w};}).filter(p=>p.text&&p.w>0);if(!parts.length)return'';const tot=parts.reduce((s,p)=>s+p.w,0);let rv=Math.random()*tot;for(const p of parts){rv-=p.w;if(rv<=0)return p.text;}return parts[parts.length-1].text;});i++;}
  return r;
}
function resolveTag(tag,map,d=0){if(d>5)return'';const raw=map[tag];if(!raw)return`[${tag}]`;let v=raw;if(v.startsWith('(')&&v.endsWith(')'))v=v.slice(1,-1);v=resolvePipes(v);v=v.replace(/\[([A-Z_][A-Z0-9_]+)\]/g,(_,t)=>resolveTag(t,map,d+1));return v.replace(/\(\(\((.+?)\)\)\)/g,'$1').replace(/\(\((.+?)\)\)/g,'$1').replace(/\\n/g,' ').replace(/\s+/g,' ').trim();}
function resolveText(t,map){if(!t||!Object.keys(map).length)return t;return t.replace(/\[([A-Z_][A-Z0-9_]+)\]/g,(_,tag)=>resolveTag(tag,map));}
function resolveData(d,map){if(!Object.keys(map).length)return d;const out={};for(const[k,v]of Object.entries(d)){if(typeof v==='string')out[k]=resolveText(v,map);else if(Array.isArray(v))out[k]=v.map(x=>typeof x==='string'?resolveText(x,map):x);else out[k]=v;}return out;}

const MEDIA_FULL=["35mm film","medium format film","Polaroid instant","daguerreotype","cyanotype print","infrared photography","lomography","double exposure","long exposure photography","oil painting","watercolor wash","gouache","alcohol ink","fresco","egg tempera","encaustic wax","acrylic pour","impasto oil","en plein air oil","Chinese ink painting","sumi-e","ukiyo-e woodblock","charcoal sketch","pencil sketch","pen and ink","cross-hatching","lithograph","woodcut print","linocut","etching","mezzotint","risograph","screen print","pixel art","vector illustration","3D render","voxel art","ray-traced render","cel-shaded","collage","tapestry weave","embroidery","stained glass","enamel cloisonné","Coromandel lacquerwork","carved jade","blown glass","marble relief","bronze casting","hammered copper","holographic foil","thermochromic paint","iridescent film","neon light painting","black light reactive","glow-in-dark ink"];
const EMO=[{l:"grief",r:"grey overcast sky, bowed head, rain on glass, desaturated"},{l:"cosmic wonder",r:"wet iridescent surfaces, fractal light, deep scattered glints"},{l:"dread",r:"long low shadows, cold doorway light, heavy still air, blue cast"},{l:"serenity",r:"soft diffuse light, smooth surfaces, warm gradient, open space"},{l:"rage",r:"hard red rim light, cracked surfaces, scattered sparks, high contrast"},{l:"longing",r:"distant horizon, one warm window far off, cool foreground, haze"},{l:"joy",r:"bright bounce light, saturated warm color, scattered highlights, upward motion"},{l:"melancholy",r:"fading evening light, worn fabric, dust in sunbeam, muted palette"},{l:"awe",r:"vast scale, tiny figure, towering form, volumetric god-rays"},{l:"tenderness",r:"soft focus edges, warm skin-tone light, close contact, low even light"},{l:"unease",r:"tilted horizon, sickly green-yellow cast, uneven flickering light"},{l:"triumph",r:"low heroic angle, blazing backlight, rising dust, gold rim on figure"},{l:"isolation",r:"figure dwarfed by negative space, cold even light, stillness"},{l:"nostalgia",r:"faded warm tones, lens aberration, worn textures, aged light"},{l:"euphoria",r:"overexposed bloom, saturated color bleeding at edges, motion blur upward"}];
const PAL=["moss, silver, ember","bone, ink, oxblood","teal, brass, dusk rose","char, amber, ash","porcelain, cobalt, blush","verdigris, gold, slate","indigo, coral, sand","obsidian, magenta, cyan","sage, terracotta, cream","plum, copper, fog","arctic white, abyssal black, electric blue","rust, ochre, shadow","jade, ivory, carmine","midnight blue, gold, ivory"];
const LIGHTING=["golden hour","blue hour","overcast diffuse","harsh noon","moonlit","dawn mist","dappled forest light","storm light","sunset backlight","underwater caustics","arctic snow diffuse","desert glare","neon sign glow","candlelight","fluorescent overhead","single bare bulb","firelight","warm lantern","emergency red","TV flicker","bioluminescent","LED strip","sodium street lamp","stage footlights","rim light","god rays","chiaroscuro","high key","low key","volumetric fog","silhouette backlight","three-point studio","high contrast noir","soft bounce","practical light sources only","motivated side light","fog diffused","dusty haze","smoke filtered","rain-wet reflections","snow-diffused","heat shimmer","pollen haze"];
const SPECIES_D=["human","elf","orc","dwarf","fae","android","undead","beastkin","dragon-kin","construct","void being","celestial","demi-god"];
const BODY_D=["slight","wiry","lean","athletic","stocky","imposing","towering","compact","willowy","powerfully built"];
const AGE_D=["youthful","young adult","weathered mid-life","ancient deeply lined","ageless"];
const ARCH_D=["warrior","rogue","mage","cleric","ranger","noble","outcast","scholar","assassin","healer","bard","necromancer","paladin","cursed wanderer"];
const SKIN_D=["pale","warm brown","deep brown","dark","ashen grey","scaled","bark-textured","stone-grey","luminous gold","translucent","mottled","iridescent"];
const EYES_D=["sharp amber","deep brown","pale grey","bright blue","slit-pupil green","hollow dark","luminous silver","multicolored","solid black","glowing red","void-black"];
const HAIR_D=["short cropped","buzzed","tousled","long flowing","braided","tangled wild","shaved","silver-white","stark black","deep auburn","unnatural color","made of light"];
const EXPR_D=["stoic","fierce","haunted","warmly open","calculating","regal","feral","weary","manic","serene","guarded","sorrowful","joyful"];
const WORLD_D=["dark fantasy","high fantasy","solarpunk","gothic","sci-fi","post-apocalyptic","historical","cosmic horror","mythpunk","dieselpunk","biopunk","fairy tale","noir"];
const MMETA={image:"Standalone Image",overlay:"Overlay",costume:"Costume",character:"Character",scene:"Scene"};

// ---- OVERLAY DEFAULT CHIP POOLS ----
const OV_DEFAULTS = {
  medium: [
    "hand-pulled linocut","woodblock print","screen print","risograph","letterpress","etching","mezzotint","drypoint","cyanotype","daguerreotype","albumen print","cabinet card","wet plate collodion","salt print","gum bichromate","lithograph","woodcut","monoprint","rubber stamp","stencil print","alcohol ink on yupo","encaustic wax","marbled paper","paste paper","hand-laid paper","vellum","parchment","canvas weave","linen ground","burlap texture","kraft paper","newsprint","graph paper","tracing paper","acetate overlay","overhead projector film","photocopy","thermofax","spirit duplicator","carbon paper","typewriter ribbon","telegraphic ticker tape",
  ],
  texture: [
    "gouge mark pressing through midtones","wood grain embedded in flat planes","linen weave reading through all surfaces","canvas tooth catching highlights","laid paper chain lines","cross-hatch ink buildup","aquatint grain in shadows","mezzotint burr in darks","screen halftone dot pattern","risograph registration offset","letterpress deboss in heavy blacks","ink feathering at paper edges","brushwork visible in washes","palette knife ridges","impasto peaks catching light","craquelure network","age crack pattern","foxing spots scattered through lights","press plate texture","moiré pattern in overlapping screens","embossed blind stamp","blind deboss grid","felt texture reading through transparencies","dry brush drag","stipple dot texture","cross-contour hatching","woodgrain knot interrupting flat fills","sandpaper ground texture","glassine sheen","varnish brush streak",
  ],
  surface: [
    "moisture clings to all surfaces","misty dampness at edges","water tide mark ring","bloom spreading through lights","damp paper cockling","foxing and age spot scatter","sun-fading at all edges","yellowing at corners","tanning through fiber","dust mote scatter in light shafts","surface abrasion in high-use areas","rubbing loss at folds","crease line pressing through image","tear with deckled fiber edge","water damage tide ring","mold bloom in shadow corners","insect damage pinhole scatter","oil transfer stain","inkblot spread","resin drip trace","wax resist pooling","salt crystal deposit","rust bleed from clip or staple","adhesive residue halo","burn char at margin","candle wax drip","smoke deposit","patina oxidation","verdigris bloom","silver mirroring on photograph","fading emulsion","double exposure ghost","light leak streak","halation bloom around highlights",
  ],
  palette: [
    "unified sepia wash with no cool tones","warm brown pulling through all colors","tobacco and amber tint over everything","yellowed cream base with rust accents","iron gall brown dominating all values","monochromatic blue cyanotype","platinum gray with open whites","warm silver albumen tone","rose-brown salt print tone","deep olive with ochre highlights","coal black ink on cream","verdigris and oxidized copper","indigo and natural linen","madder red and raw umber","ultramarine and burnt sienna","viridian and cadmium yellow","lamp black and titanium white","prussian blue and ivory","venetian red and ash","raw sienna and payne's gray","cold gray overcast palette","warm ember glow palette","faded pastel with chalk white","muted earth with brick accent","no cool tones anywhere","no warm tones breaking through","all color reading as aged photograph","every hue desaturated toward gray","palette limited to three values","high contrast black and white only",
  ],
  light: [
    "lantern light warming central surfaces","window light diffusing all edges to haze","single candle source from lower left","overcast flat light with no shadows","raking side light revealing texture","backlighting flaring through translucent areas","dappled light through leaf canopy","firelight flickering across surface","gaslight amber pooling at center","UV black light activating fluorescent inks","cold north window light","sodium lamp orange cast","dust mote scatter in light shafts","god ray pressing through cloud break","caustic water reflection rippling","lens flare streak from strong source","halation bloom around bright areas","vignette darkening all corners","soft box bounce with no hard shadow","practical lamp as only source","light reading through paper as translucency","shadow box deep fall-off","fill light eliminating all shadow","rim light isolating edge from background","color gel wash over whole surface","moonlight cold blue cast","dawn pink gradient left to right","sunset warm-to-cool gradient","strobe freeze motion blur","bioluminescent self-illumination",
  ],
  mood: [
    "handmade and unhurried","worn at every edge","passed through many hands","rooted and slow","made before machines","aged into softness","ordinary and true","provincial and still","domestic and unguarded","labored over","imperfect by design","quietly ceremonial","utilitarian beauty","folk and unself-conscious","devotional and repetitive","memorized not designed","rural and grounded","creaturely and close","accumulated over time","evidence of use","marked by weather","built not bought","functional first","no flourish intended","tender without sentimentality","matter-of-fact","the residue of effort","honest material honesty","craft over concept","time made visible",
  ],
};

// Overlay chip prompt now lives in server/prompts/chips_overlay.txt.

// Section labels for display
// Locked six-segment contract: subject;;action;;scene;;props;;color palette;;mood
const SEG_LABELS=["Subject","Action","Scene","Props","Color palette","Mood"];

const CSS=`
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300..900;1,9..144,300..600&family=Hanken+Grotesk:wght@300..800&family=JetBrains+Mono:wght@400;500;700&display=swap');
.ab *{box-sizing:border-box;margin:0;padding:0}
.ab{--bg:#06000f;--panel:rgba(40,0,80,.22);--ink:#ffffff;--muted:#d4b8ff;--faint:#b090e0;--mag:#ff44dd;--cya:#33eeff;--pur:#b050ff;--line:rgba(180,0,255,.38);--lcya:rgba(0,229,255,.35);--good:#00ffb0;--bad:#ff4d6e;--iris:linear-gradient(135deg,#ff44dd,#b050ff,#33eeff);--df:'Fraunces',serif;--db:'Hanken Grotesk',sans-serif;--dm:'JetBrains Mono',monospace;font-family:var(--db);color:var(--ink);min-height:100vh;background:radial-gradient(ellipse 80% 60% at 15% 5%,rgba(100,0,180,.35),transparent 60%),radial-gradient(ellipse 60% 50% at 88% 15%,rgba(0,160,255,.18),transparent 55%),var(--bg);-webkit-font-smoothing:antialiased}
.ab .aura{position:fixed;inset:-40%;z-index:0;pointer-events:none;filter:blur(110px);opacity:.18;background:radial-gradient(40% 50% at 18% 22%,rgba(255,0,204,.3),transparent 70%),radial-gradient(40% 50% at 82% 18%,rgba(0,229,255,.18),transparent 70%),radial-gradient(50% 60% at 50% 90%,rgba(155,48,255,.22),transparent 70%)}
@keyframes folpulse{0%,100%{opacity:.16;filter:drop-shadow(0 0 8px rgba(0,229,255,.25))}33%{opacity:.22;filter:drop-shadow(0 0 16px rgba(155,48,255,.45))}66%{opacity:.14;filter:drop-shadow(0 0 12px rgba(255,0,204,.35))}}
@keyframes folspin{from{transform:rotate(0deg) translate(-600px,-600px)}to{transform:rotate(360deg) translate(-600px,-600px)}}
@keyframes folhalo{0%,100%{opacity:.25}50%{opacity:.45}}
@keyframes folhi{0%,100%{opacity:.6}50%{opacity:1}}
.fol-bg{animation:folpulse 9s ease-in-out infinite}
.fol-main{transform-origin:600px 600px;animation:folspin 180s linear infinite}
.fol-halo{animation:folhalo 7s ease-in-out infinite}
.fol-hi{animation:folhi 4s ease-in-out infinite}
.ab .pg{position:relative;z-index:2;padding:clamp(12px,2.5vw,24px)}
.ab .hd{margin-bottom:14px}
.ab .ht{font-family:var(--df);font-weight:320;font-size:clamp(1.5rem,3.5vw,2.2rem);letter-spacing:-.02em;line-height:1}
.ab .ht em{font-style:italic;background:var(--iris);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.ab .tabs{display:flex;gap:5px;flex-wrap:wrap;margin-top:9px}
.ab .tab{font-family:var(--dm);font-size:.68rem;letter-spacing:.06em;padding:.42rem .8rem;border-radius:999px;border:1px solid var(--line);background:rgba(0,0,0,.4);color:var(--ink);cursor:pointer;transition:.14s}
.ab .tab:hover{border-color:var(--pur);color:var(--ink)}
.ab .tab.on{background:var(--iris);color:#0d0020;font-weight:700;border-color:transparent}
.ab .tbstatus{margin-top:7px;font-family:var(--dm);font-size:.63rem;letter-spacing:.1em}
.ab .tbok{color:var(--good)}.ab .tbwait{color:var(--muted)}.ab .tberr{color:var(--bad)}
.ab .bd{display:grid;grid-template-columns:1fr 340px;gap:14px;align-items:start}
@media(max-width:760px){.ab .bd{grid-template-columns:1fr}}
.ab .sb{position:sticky;top:12px}
@media(max-width:760px){.ab .sb{position:static}}
.ab .sec{margin-bottom:16px}
.ab .sectl{font-family:var(--dm);font-size:.6rem;letter-spacing:.22em;text-transform:uppercase;color:var(--mag);margin-bottom:7px;display:flex;align-items:center;gap:.4rem}
.ab .sectl::after{content:"";flex:1;height:1px;background:rgba(255,0,204,.17)}
.ab .lbl{font-family:var(--dm);font-size:.6rem;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin:.6rem 0 .22rem}
.ab .slbl{font-family:var(--dm);font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;color:var(--mag);margin:.6rem 0 .2rem}
.ab input.fi,.ab textarea.fi{width:100%;background:rgba(0,0,0,.5);border:1px solid var(--line);border-radius:9px;color:var(--ink);font-family:var(--db);font-size:.9rem;padding:.58rem .76rem;outline:none;transition:.15s;resize:vertical}
.ab input.fi:focus,.ab textarea.fi:focus{border-color:var(--cya);box-shadow:0 0 0 3px rgba(0,229,255,.08)}
.ab input.fi::placeholder,.ab textarea.fi::placeholder{color:var(--muted)}
.ab .chips{display:flex;flex-wrap:wrap;gap:5px;margin:.18rem 0 .4rem}
.ab .chip{font-size:.72rem;padding:.3rem .6rem;border-radius:999px;border:1px solid var(--line);background:rgba(0,0,0,.35);color:var(--ink);cursor:pointer;transition:.12s;line-height:1.2;text-align:left}
.ab .chip:hover{border-color:var(--pur);color:var(--ink)}
.ab .chip.on{background:rgba(255,0,204,.28);border-color:var(--mag);color:#fff;box-shadow:0 0 8px rgba(255,0,204,.22)}
.ab .chip .cr{display:block;font-size:.59rem;color:var(--muted);margin-top:.13rem;max-width:200px;white-space:normal;line-height:1.25}
.ab .chip.on .cr{color:var(--cya)}
.ab .addrow{display:flex;gap:5px;margin-top:3px}
.ab .addbtn{flex:0 0 auto;padding:0 .72rem;border-radius:7px;border:1px solid var(--lcya);background:rgba(0,229,255,.06);color:var(--cya);cursor:pointer;font-family:var(--dm);font-size:.65rem;transition:.12s}
.ab .addbtn:hover{background:rgba(0,229,255,.16)}
.ab .tog{display:flex;align-items:center;gap:.55rem;padding:.5rem .65rem;border:1px solid var(--line);border-radius:8px;background:rgba(0,0,0,.28);cursor:pointer;transition:.15s;margin-top:.4rem}
.ab .tog:hover{border-color:var(--pur)}
.ab .tbox{width:30px;height:17px;border-radius:999px;background:rgba(255,255,255,.1);position:relative;flex:0 0 auto;transition:.17s}
.ab .tbox::after{content:"";position:absolute;top:2px;left:2px;width:13px;height:13px;border-radius:50%;background:var(--muted);transition:.17s}
.ab .tog.on .tbox{background:linear-gradient(90deg,var(--mag),var(--pur))}
.ab .tog.on .tbox::after{transform:translateX(13px);background:#fff}
.ab .tlb{font-size:.82rem;flex:1}
.ab .aibtn,.ab .smartbtn{width:100%;padding:.62rem;border-radius:8px;border:1px solid var(--lcya);background:rgba(0,229,255,.06);color:var(--cya);cursor:pointer;font-family:var(--dm);font-size:.68rem;letter-spacing:.06em;transition:.17s;margin:.5rem 0 .1rem;display:flex;align-items:center;justify-content:center;gap:.5rem}
.ab .aibtn:hover:not(:disabled),.ab .smartbtn:hover:not(:disabled){background:rgba(0,229,255,.14);border-color:var(--cya)}
.ab .aibtn:disabled,.ab .smartbtn:disabled{opacity:.36;cursor:wait}
.ab .smartbtn{border-color:rgba(155,48,255,.4);background:rgba(155,48,255,.08);color:var(--pur)}
.ab .smartbtn:hover:not(:disabled){background:rgba(155,48,255,.18);border-color:var(--pur)}
.ab .pulse{width:7px;height:7px;border-radius:50%;background:var(--cya);flex:0 0 auto;animation:ap 1s ease-in-out infinite}
.ab .pulse.pur{background:var(--pur)}
@keyframes ap{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.2;transform:scale(.45)}}
.ab .ainote{font-size:.68rem;color:var(--muted);margin-bottom:.28rem}
.ab .aiok{font-size:.68rem;color:var(--good);margin-top:.2rem}
.ab .imgdrop{border:1px dashed var(--lcya);border-radius:10px;padding:14px;text-align:center;cursor:pointer;transition:.15s;background:rgba(0,229,255,.03)}
.ab .imgdrop:hover,.ab .imgdrop.over{border-color:var(--cya);background:rgba(0,229,255,.08)}
.ab .imgdrop-txt{font-size:.74rem;color:var(--muted)}
.ab .imgdrop-sub{font-family:var(--dm);font-size:.6rem;color:var(--faint);margin-top:3px;letter-spacing:.06em}
.ab .imgpreview{display:flex;gap:10px;align-items:center;margin-top:8px}
.ab .imgthumb{width:64px;height:64px;border-radius:8px;object-fit:cover;border:1px solid var(--line);flex:0 0 auto}
.ab .imgmeta{flex:1;min-width:0}
.ab .imgname{font-size:.7rem;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ab .img-sec{background:rgba(0,160,255,.06);border:1px solid rgba(0,229,255,.22);border-radius:12px;padding:12px;margin-bottom:16px}
.ab .img-sec .sectl{color:var(--cya)}
.ab .img-sec .sectl::after{background:rgba(0,229,255,.16)}

.ab .smart-sec .sectl{color:var(--pur)}
.ab .smart-sec .sectl::after{background:rgba(155,48,255,.2)}
.ab .ce{display:flex;gap:5px;margin-bottom:5px;align-items:stretch}
.ab .xbtn{flex:0 0 32px;border-radius:7px;border:1px solid var(--line);background:var(--panel);color:var(--bad);cursor:pointer;font-size:.82rem;display:flex;align-items:center;justify-content:center}
.ab .addc{font-family:var(--dm);font-size:.64rem;padding:.4rem .74rem;border-radius:7px;border:1px dashed rgba(0,229,255,.35);background:transparent;color:var(--muted);cursor:pointer;margin-top:2px;width:100%;transition:.12s}
.ab .addc:hover{border-color:var(--cya);color:var(--cya)}
.ab .pvbox{background:rgba(0,0,0,.65);border:1px solid var(--line);border-radius:11px;padding:11px 13px;margin-bottom:9px}
.ab .pvlbl{font-family:var(--dm);font-size:.58rem;letter-spacing:.22em;text-transform:uppercase;color:var(--muted);margin-bottom:.26rem;display:flex;justify-content:space-between;align-items:center}
.ab .pvtxt{font-family:var(--dm);font-size:.72rem;color:var(--cya);line-height:1.55;word-break:break-word;white-space:pre-wrap}
.ab .ph{color:var(--muted);font-style:italic}
.ab .genbtn{width:100%;padding:.68rem;border-radius:9px;background:linear-gradient(135deg,var(--pur),var(--cya));border:none;color:#fff;cursor:pointer;font-family:var(--dm);font-size:.74rem;font-weight:700;letter-spacing:.06em;transition:.16s;box-shadow:0 4px 16px rgba(0,229,255,.16);margin-bottom:9px}
.ab .genbtn:hover{transform:translateY(-1px);box-shadow:0 6px 22px rgba(0,229,255,.3)}
.ab .genbtn:disabled{opacity:.36;cursor:wait;transform:none}
.ab .lints{display:flex;flex-direction:column;gap:5px;margin-bottom:8px}
.ab .lint{font-family:var(--dm);font-size:.65rem;padding:.38rem .6rem;border-radius:7px;background:rgba(255,96,128,.13);border:1px solid rgba(255,77,110,.5);color:var(--bad);line-height:1.4}
.ab .lint b{font-size:.58rem;letter-spacing:.14em;text-transform:uppercase;display:block;margin-bottom:.1rem}

/* Variation card — structured sentence layout */
.ab .vcard{background:rgba(40,0,80,.55);border:1px solid var(--line);border-radius:13px;padding:14px;margin-bottom:9px}
.ab .vcard-head{font-family:var(--dm);font-size:.56rem;letter-spacing:.22em;text-transform:uppercase;color:var(--mag);margin-bottom:10px;display:flex;justify-content:space-between;align-items:center}
.ab .vsections{display:flex;flex-direction:column;gap:8px;margin-bottom:10px}
.ab .vsec{border-left:2px solid rgba(180,0,255,.3);padding-left:9px}
.ab .vsec-lbl{font-family:var(--dm);font-size:.54rem;letter-spacing:.18em;text-transform:uppercase;color:var(--faint);margin-bottom:3px}
.ab .vsec-txt{font-family:var(--db);font-size:.82rem;line-height:1.6;color:#f0e8ff}
.ab .cprow{display:flex;gap:6px}
.ab .cpbtn{flex:1;padding:.46rem;border-radius:6px;border:1px solid var(--lcya);background:rgba(0,229,255,.05);color:var(--cya);cursor:pointer;font-family:var(--dm);font-size:.66rem;transition:.13s}
.ab .cpbtn:hover{background:rgba(0,229,255,.14)}
.ab .cpbtn.ok{background:rgba(0,229,255,.17);border-color:var(--cya)}
.ab .cpbtn-all{flex:0 0 auto;padding:.46rem .72rem;border-radius:6px;border:1px solid rgba(180,0,255,.4);background:rgba(155,48,255,.06);color:var(--pur);cursor:pointer;font-family:var(--dm);font-size:.66rem;transition:.13s}
.ab .cpbtn-all:hover{background:rgba(155,48,255,.16)}
.ab .err{font-size:.73rem;color:var(--bad);background:rgba(255,77,110,.12);border:1px solid rgba(255,77,110,.45);border-radius:7px;padding:.42rem .6rem;margin-bottom:7px;line-height:1.4}
.ab .tagpill{display:inline-block;font-family:var(--dm);font-size:.58rem;padding:.12rem .36rem;border-radius:4px;background:rgba(255,68,221,.22);border:1px solid rgba(255,68,221,.5);color:var(--mag);margin:.1rem}
.ab .uploadbtn{display:inline-block;padding:.42rem .9rem;border-radius:999px;border:1px solid var(--lcya);background:rgba(0,229,255,.07);color:var(--cya);font-family:var(--dm);font-size:.65rem;letter-spacing:.06em;cursor:pointer;transition:.14s;-webkit-tap-highlight-color:transparent}
.ab .uploadbtn:hover{background:rgba(0,229,255,.16);border-color:var(--cya)}
.ab .chunkloader{margin-top:10px;background:rgba(0,0,0,.45);border:1px solid var(--line);border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:7px}
.ab .chunktitle{font-family:var(--dm);font-size:.6rem;letter-spacing:.14em;text-transform:uppercase;color:var(--muted);margin-bottom:2px}
.ab .chunkrow{display:flex;gap:6px;align-items:flex-start}
.ab .chunknum{font-family:var(--dm);font-size:.62rem;font-weight:700;min-width:26px;height:26px;border-radius:6px;border:1px solid var(--line);background:rgba(0,0,0,.4);color:var(--faint);display:flex;align-items:center;justify-content:center;margin-top:2px;transition:.15s;flex-shrink:0}
.ab .chunknum.done{border-color:var(--good);color:var(--good);background:rgba(0,255,176,.08)}
.ab .chunkta{font-size:.72rem!important;padding:.4rem .6rem!important;min-height:44px}
`;

function FlowerOfLife(){
  const r=58,SQRT3=Math.sqrt(3),rings=4,W=1200,H=1200,cx=600,cy=600;
  const circles=useMemo(()=>{const pts=[],seen=new Set();for(let q=-rings;q<=rings;q++)for(let s=-rings;s<=rings;s++){const t=-q-s;if(Math.abs(t)>rings)continue;const x=Math.round(r*(q+s*0.5)*10)/10,y=Math.round(r*(s*SQRT3/2)*10)/10;const k=`${x},${y}`;if(!seen.has(k)){seen.add(k);pts.push({x,y});}}return pts;},[]);
  return(<svg className="fol-bg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" style={{position:'fixed',inset:0,width:'100%',height:'100%',zIndex:1,pointerEvents:'none'}}><defs><radialGradient id="fol-sph" cx="38%" cy="32%" r="62%"><stop offset="0%" stopColor="#00e5ff" stopOpacity="0.55"/><stop offset="45%" stopColor="#9b30ff" stopOpacity="0.18"/><stop offset="100%" stopColor="#ff00cc" stopOpacity="0.04"/></radialGradient><radialGradient id="fol-sph2" cx="42%" cy="36%" r="58%"><stop offset="0%" stopColor="#ff00cc" stopOpacity="0.45"/><stop offset="50%" stopColor="#9b30ff" stopOpacity="0.15"/><stop offset="100%" stopColor="#00e5ff" stopOpacity="0.03"/></radialGradient><filter id="fol-glow" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3.5" result="blur"/><feColorMatrix in="blur" type="matrix" values="0 0 0 0 0  0.5 0.9 1 0 0.05  0 0 0 0 0.8  0 0 0 0.8 0" result="c"/><feMerge><feMergeNode in="c"/><feMergeNode in="SourceGraphic"/></feMerge></filter><filter id="fol-soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7" result="b"/><feColorMatrix in="b" type="matrix" values="0 0 0 0 0.4  0 0 0 0 0  0.8 0 0 0 0.8  0 0 0 0.5 0"/></filter></defs><g filter="url(#fol-soft)" className="fol-halo">{circles.map(({x,y},i)=><circle key={i} cx={cx+x} cy={cy+y} r={r*0.95} fill="none" stroke="#9b30ff" strokeWidth="1.2" strokeOpacity="0.35"/>)}</g><g filter="url(#fol-glow)" className="fol-main">{circles.map(({x,y},i)=><circle key={i} cx={cx+x} cy={cy+y} r={r*0.96} fill={i%2===0?"url(#fol-sph)":"url(#fol-sph2)"} stroke={i%3===0?"#00e5ff":i%3===1?"#9b30ff":"#ff00cc"} strokeWidth="0.7" strokeOpacity="0.55"/>)}</g><g className="fol-hi">{circles.map(({x,y},i)=><circle key={i} cx={cx+x-(r*0.18)} cy={cy+y-(r*0.18)} r={r*0.22} fill="none" stroke="#ffffff" strokeWidth="0.5" strokeOpacity="0.12"/>)}</g></svg>);
}

// Model calls go through src/api.js to the server. Vision and chip prompts live in server/prompts/.
function downscaleImage(file,maxDim=1024){
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=e=>{
      const img=new Image();
      img.onload=()=>{
        let{width:w,height:h}=img;
        if(w>maxDim||h>maxDim){
          if(w>h){h=Math.round(h*maxDim/w);w=maxDim;}
          else{w=Math.round(w*maxDim/h);h=maxDim;}
        }
        const canvas=document.createElement('canvas');
        canvas.width=w;canvas.height=h;
        const ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        const dataUrl=canvas.toDataURL('image/jpeg',0.85);
        resolve({base64:dataUrl.split(',')[1],mediaType:'image/jpeg',dataUrl});
      };
      img.onerror=reject;
      img.src=e.target.result;
    };
    reader.onerror=reject;
    reader.readAsDataURL(file);
  });
}

// Smart Fill router prompt now lives in server/prompts/route.txt.

const MEDIUM_TAGS=/\[(RANDART|MXM|VESTOOL|RANDART2|ARTSTYLE|MEDIUM)\]/i;
const SCENE_TAGS=/\[(SCEN_|SCENERY|SCEN|RIMBA|WEATHER|SKYWOW|SOUP|SOUP2|SOUP3|BG)/i;
const ACTION_VERBS=/(swimming|flying|running|fighting|sitting|standing|walking|floating|falling|dancing|riding|wielding|holding|casting|emerging|rising|falling|diving|soaring|crawling|climbing)/i;

function localRoute(text,mode){
  const out={};
  const tokens=text.trim().split(/\s+/);
  const tagCount=(text.match(/\[[A-Z_][A-Z0-9_]*\]/g)||[]).length;
  if(mode==='image'){
    const verbMatch=text.match(ACTION_VERBS);
    if(verbMatch){
      const vi=text.indexOf(verbMatch[0]);
      const pre=text.slice(0,vi).trim().replace(/,$/,'').trim();
      const post=text.slice(vi).trim();
      const sceneMatch=post.match(/(through|across|over|beneath|above|into|under|inside|outside|within|beyond|among|amid)/i);
      if(sceneMatch){const si=post.indexOf(sceneMatch[0]);out.action=post.slice(0,si).trim().replace(/,$/,'').trim();out.scene=post.slice(si).trim();}
      else{out.action=post;}
      if(pre)out.subject=pre;
    }else{out.subject=text;}
    for(const f of['subject','action','scene','ideas']){if(out[f]&&MEDIUM_TAGS.test(out[f])){const med=out[f].match(new RegExp(MEDIUM_TAGS.source,'ig'));if(med){out.medium=(out.medium?out.medium+', ':'')+med.join(', ');out[f]=out[f].replace(new RegExp(MEDIUM_TAGS.source,'ig'),'').replace(/,\s*,/g,',').trim();}}}
    if(out.subject&&SCENE_TAGS.test(out.subject)){const sc=out.subject.match(new RegExp(SCENE_TAGS.source+'[A-Z0-9_]*\]','ig'));if(sc){out.ideas=(out.ideas?out.ideas+', ':'')+sc.join(', ');out.subject=out.subject.replace(new RegExp(SCENE_TAGS.source+'[A-Z0-9_]*\]','ig'),'').trim();}}
  }else if(mode==='character'){out.concept=text;}
  else if(mode==='overlay'){out.theme=text;}
  else if(mode==='costume'){out.theme=text;}
  else if(mode==='scene'){out.environment=text;}
  for(const k of Object.keys(out)){if(typeof out[k]==='string'&&!out[k].trim())delete out[k];}
  return out;
}

function buildPreview(d,mode){
  if(!mode)return"";const B=[];
  const sub=[d.medium,d.subject,d.concept,d.species?.join(", "),d.archetype?.join(", "),d.medium_arr?.join(", "),d.theme].filter(Boolean);if(sub.length)B.push(sub.join(", "));
  const act=[d.action,d.action_level].filter(Boolean);if(act.length)B.push(act.join(", "));
  const scn=[d.scene,d.environment,d.characters?.filter(Boolean).join(" and ")].filter(Boolean);if(scn.length)B.push(scn.join(", "));
  const prp=[d.props,d.top_sel?.join(", "),d.bottoms_sel?.join(", "),d.shoes_sel?.join(", "),d.accessories_sel?.join(", ")].filter(Boolean);if(prp.length)B.push(prp.join(", "));
  const pal=[d.palette?.join(", "),d.lighting?.join(", ")].filter(Boolean);if(pal.length)B.push(pal.join(", "));
  const mood=[d.emotion?.map(e=>e.r).join("; "),d.vibe,d.ideas].filter(Boolean);if(mood.length)B.push(mood.join(", "));
  return B.join(" · ");
}

function buildGenPrompt(d,mode){
  const L=["Mode: "+mode];
  const a=(k,v)=>{if(v)L.push(k+": "+v);};
  const aa=(k,arr)=>{if(arr?.length)L.push(k+": "+arr.join(", "));};
  if(mode==="image"){a("Subject",d.subject);a("Action",d.action);a("Scene",d.scene);a("Props",d.props);aa("Palette",d.palette);if(d.emotion?.length)aa("Emotion",d.emotion.map(e=>e.r));a("Medium",d.medium);if(d.overridePhoto)L.push("Override photorealism: yes");a("Ideas",d.ideas);if(d.inspirations?.filter(Boolean).length)a("Inspirations",d.inspirations.filter(Boolean).join("; "));}
  else if(mode==="overlay"){
    a("Theme",d.theme);
    aa("Medium & Material",d.ov_medium);
    aa("Texture Behaviors",d.ov_texture);
    aa("Surface Conditions",d.ov_surface);
    aa("Palette Rules",d.ov_palette);
    aa("Light Behavior",d.ov_light);
    aa("Closing Mood",d.ov_mood);
  }
  else if(mode==="costume"){a("Theme",d.theme);aa("Top",d.top_sel);aa("Bottoms",d.bottoms_sel);aa("Shoes",d.shoes_sel);aa("Accessories",d.accessories_sel);a("Vibe",d.vibe);}
  else if(mode==="character"){a("Concept",d.concept);aa("Species",d.species);aa("Body",d.body);aa("Age",d.age);aa("Archetype",d.archetype);aa("Skin",d.skin);aa("Eyes",d.eyes);aa("Hair",d.hair);a("Marks",d.marks);aa("Expression",d.expression);aa("World",d.world);}
  else if(mode==="scene"){if(d.characters?.filter(Boolean).length)a("Characters",d.characters.filter(Boolean).join(". "));a("Environment",d.environment);a("Action level",d.action_level);aa("Lighting",d.lighting);}
  return L.join("\n");
}

function buildGenPromptVaried(rd1,rd2,rd3,mode){
  const p1=buildGenPrompt(rd1,mode),p2=buildGenPrompt(rd2,mode),p3=buildGenPrompt(rd3,mode);
  if(p1===p2&&p2===p3)return p1;
  return`=== VARIATION 1 INPUTS ===\n${p1}\n\n=== VARIATION 2 INPUTS ===\n${p2}\n\n=== VARIATION 3 INPUTS ===\n${p3}\n\nGenerate exactly 3 variations, each using only its own labeled inputs.`;
}

// Parse one variation into labeled sections.
// Overlay: one flowing paragraph. Every other mode: the six ;; segments.
// Line breaks are collapsed because they fracture Perchance blocks.
function parseSections(raw,mode){
  if(Array.isArray(raw))return raw;
  if(typeof raw!=='string')return[];
  const text=raw.replace(/\s*\n+\s*/g,' ').trim();
  if(mode==='overlay')return[{label:"Overlay",sentence:text}];
  const parts=text.split(';;').map(s=>s.trim());
  if(parts.length>6)parts.splice(5,parts.length-5,parts.slice(5).join(' '));
  while(parts.length<6)parts.push('');
  return parts.map((sentence,i)=>({label:SEG_LABELS[i],sentence}));
}

// Rebuild the copyable block: ;; walls stay so the segment count is always six.
function flattenVariation(sections,mode){
  const join=mode==='overlay'?' ':';;';
  return sections.map(s=>s.sentence).join(join);
}

const NEG_RE=/\b(no|not|none|without|instead of|rather than|never|avoid|none of|free of|devoid)\b/;
function lintText(txt){
  const w=[];
  if(NEG_RE.test(txt))w.push({law:"Law I · Never negate",msg:"Negation detected. Describe what IS present."});
  if(/\bor\b/.test(txt))w.push({law:"Law V · Lock choices",msg:'"or" fork. Pick one.'});
  if(/\b\d+\s?(mm|cm|k|kelvin|years?|°|px)\b/.test(txt))w.push({law:"Law V · No numbers",msg:"Measurement detected. Use sensory language."});
  if(/\b(feeling of|energy of|sense of|vibe of|essence of)\b/.test(txt))w.push({law:"Law IV · Physical only",msg:"Abstract word. Use Emotion chips instead."});
  return w;
}
// Lint runs on resolved text (after [TAG] expansion) so a clean scene cannot
// hide a negation inherited from a toolbox block. Each warning lists the tags
// whose own block trips the same law, so the fix lands in the right file.
function lint(resolvedPreview,rd,tags,map){
  const txt=(resolvedPreview+" "+Object.values(rd).flat().filter(v=>typeof v==='string').join(" ")).toLowerCase();
  const w=lintText(txt);
  if(!w.length)return w;
  for(const t of tags){
    const key=t.replace(/[\[\]]/g,'');if(!map[key])continue;
    for(const h of lintText(resolveTag(key,map).toLowerCase())){
      const m=w.find(x=>x.law===h.law);
      if(m){m.from=m.from||[];if(!m.from.includes(t))m.from.push(t);}
    }
  }
  return w;
}

// Generation system prompt now lives in server/prompts/generate.txt.

function ChipGroup({opts=[],sel=[],onToggle,onAdd,showRender}){
  const[v,setV]=useState("");
  const sub=()=>{if(v.trim()){onAdd(v.trim());setV("");}};
  const custom=showRender?sel.filter(s=>!opts.some(o=>o.l===s.l)):sel.filter(s=>!opts.includes(s));
  return(<div><div className="chips">{opts.map(o=>{const key=showRender?o.l:o;const on=showRender?sel.some(x=>x.l===o.l):sel.includes(o);return(<button key={key} className={"chip"+(on?" on":"")} onClick={()=>onToggle(o)}>{showRender?o.l:o}{showRender&&<span className="cr">{o.r}</span>}</button>);})}{custom.map(s=><button key={showRender?s.l:s} className="chip on" onClick={()=>onToggle(s)}>{showRender?s.l:s} ✕</button>)}</div><div className="addrow"><input className="fi" value={v} placeholder="add your own or [TAG]…" onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")sub();}}/><button className="addbtn" onClick={sub}>+ add</button></div></div>);
}
const Tog=({on,onClick,label})=><div className={"tog"+(on?" on":"")} onClick={onClick}><div className="tbox"/><div className="tlb">{label}</div></div>;
const Sec=({title,children})=><div className="sec"><div className="sectl">{title}</div>{children}</div>;
const Lbl=({children})=><div className="lbl">{children}</div>;

function SmartFill({mode,d,setD,aiLoad}){
  const[v,setV]=useState("");const[loading,setLoading]=useState(false);const[err,setErr]=useState("");const[src,setSrc]=useState("");
  const applyResult=(result)=>{
    setD(prev=>{
      const next={...prev};
      for(const[k,val]of Object.entries(result)){
        if(Array.isArray(val)&&val.length){next[k]=[...new Set([...(prev[k]||[]),...val])];}
        else if(typeof val==='string'&&val.trim()){next[k]=val;}
      }
      return next;
    });
    setV("");
  };
  const doFill=async()=>{
    if(!v.trim())return;
    setLoading(true);setErr("");setSrc("");
    const tagCount=(v.match(/\[[A-Z_][A-Z0-9_]*\]/g)||[]).length;
    const tagRatio=tagCount/Math.max(v.trim().split(/\s+/).length,1);
    if(tagRatio>=0.5){setSrc("local");applyResult(localRoute(v,mode));setLoading(false);return;}
    setSrc("ai");
    try{
      const result=await routeText(mode,v);
      if(!result||typeof result!=="object"||Array.isArray(result)){setErr("Got unexpected response — try rephrasing.");setLoading(false);return;}
      applyResult(result);
    }catch(e){setErr("Parse failed — check your input or try again.");}
    setLoading(false);
  };
  return(<div className="smart-sec"><div className="sectl">✦ Smart Fill {src&&<span style={{fontSize:".55rem",color:src==="local"?'var(--good)':'var(--cya)',marginLeft:4}}>{src==="local"?"⚡ local route":"✦ AI parsed"}</span>}</div><textarea className="fi" rows={3} value={v} onChange={e=>setV(e.target.value)} placeholder={`Describe your ${mode}… [TAG] calls route instantly`}/><button className="smartbtn" disabled={loading||!v.trim()||aiLoad} onClick={doFill}>{loading?<><div className="pulse pur"/>Parsing…</>:"✦ Parse & fill fields"}</button>{err&&<div className="err" style={{marginTop:5}}>{err}</div>}</div>);
}

function ImageAnalyze({mode,setD}){
  const[img,setImg]=useState(null); // {dataUrl,base64,mediaType,name}
  const[loading,setLoading]=useState(false);
  const[err,setErr]=useState("");
  const[done,setDone]=useState(false);
  const[over,setOver]=useState(false);
  const dropRef=useRef(null);

  const applyResult=(result)=>{
    setD(prev=>{
      const next={...prev};
      for(const[k,val]of Object.entries(result)){
        if(Array.isArray(val)&&val.length){next[k]=[...new Set([...(prev[k]||[]),...val])];}
        else if(typeof val==='string'&&val.trim()){next[k]=val;}
      }
      return next;
    });
  };

  const handleFile=async(file)=>{
    if(!file||!file.type.startsWith('image/'))return;
    setErr("");setDone(false);
    try{
      const{base64,mediaType,dataUrl}=await downscaleImage(file);
      setImg({dataUrl,base64,mediaType,name:file.name||"pasted image"});
    }catch{setErr("Could not read image.");}
  };

  const onDrop=e=>{e.preventDefault();setOver(false);const f=e.dataTransfer.files?.[0];if(f)handleFile(f);};
  const onPaste=e=>{
    const items=e.clipboardData?.items;if(!items)return;
    for(const item of items){
      if(item.type.startsWith('image/')){const f=item.getAsFile();if(f){handleFile(f);return;}}
    }
  };

  const doAnalyze=async()=>{
    if(!img)return;
    setLoading(true);setErr("");setDone(false);
    try{
      const result=await analyzeImage(mode,img.base64,img.mediaType);
      applyResult(result);
      setDone(true);
    }catch(e){
      setErr(e.message==="MODEL_DECLINED"?"The model declined to analyze this image.":"Analysis failed — "+(e.message||"try again."));
    }
    setLoading(false);
  };

  return(
    <div className="img-sec" tabIndex={0} onPaste={onPaste}>
      <div className="sectl">◆ Analyze Image</div>
      {!img&&(
        <div
          ref={dropRef}
          className={"imgdrop"+(over?" over":"")}
          onDragOver={e=>{e.preventDefault();setOver(true);}}
          onDragLeave={()=>setOver(false)}
          onDrop={onDrop}
          onClick={()=>dropRef.current?.querySelector('input')?.click()}
        >
          <div className="imgdrop-txt">Click to upload, drag & drop, or paste an image (Ctrl/Cmd+V)</div>
          <div className="imgdrop-sub">extracts visual details into fields below</div>
          <input type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files?.[0];if(f)handleFile(f);}}/>
        </div>
      )}
      {img&&(
        <>
          <div className="imgpreview">
            <img className="imgthumb" src={img.dataUrl} alt="preview"/>
            <div className="imgmeta">
              <div className="imgname">{img.name}</div>
              <button className="addc" style={{marginTop:4}} onClick={()=>{setImg(null);setDone(false);setErr("");}}>✕ remove</button>
            </div>
          </div>
          <button className="aibtn" disabled={loading} onClick={doAnalyze} style={{marginTop:8}}>
            {loading?<><div className="pulse"/>Analyzing…</>:"◆ Extract details from image"}
          </button>
        </>
      )}
      {err&&<div className="err" style={{marginTop:6}}>{err}</div>}
      {done&&<div className="aiok">✓ Fields updated from image</div>}
    </div>
  );
}

function ModeFields({mode,d,up,toggleArr,toggleEmo,aiChips,onAiPull,aiLoad,aiErr,setD}){
  const ta=(k,v)=>toggleArr(k,v);
  const ac=cat=>aiChips[cat]||[];
  const cg=(opts,k)=><ChipGroup opts={opts} sel={d[k]||[]} onToggle={x=>ta(k,x)} onAdd={x=>up(k,[...(d[k]||[]),x])}/>;
  const AiBtn=({label})=>(<button className="aibtn" disabled={aiLoad||!(d.theme||d.concept||"").trim()} onClick={onAiPull}>{aiLoad?<><div className="pulse"/>{label}…</>:"✦ "+label}</button>);
  if(mode==="image")return(<><ImageAnalyze mode={mode} setD={setD}/><Sec title="Core"><Lbl>Subject — [ADVES] [ACHARS] [GENGIRL]</Lbl><input className="fi" value={d.subject||""} onChange={e=>up("subject",e.target.value)} placeholder="[ADVES], [ACHARS], or describe…"/><Lbl>Action</Lbl><input className="fi" value={d.action||""} onChange={e=>up("action",e.target.value)} placeholder="[ACTION], [ACTION2], or describe…"/><Lbl>Scene</Lbl><input className="fi" value={d.scene||""} onChange={e=>up("scene",e.target.value)} placeholder="[SCEN_FANTASY], [SCENERY], or describe…"/><Lbl>Props</Lbl><input className="fi" value={d.props||""} onChange={e=>up("props",e.target.value)} placeholder="key objects in frame"/></Sec><Sec title="Style"><Lbl>Color Palette</Lbl>{cg(PAL,"palette")}<Lbl>Emotion → physical</Lbl><ChipGroup opts={EMO} sel={d.emotion||[]} onToggle={toggleEmo} onAdd={t=>toggleEmo({l:t,r:t})} showRender/><Lbl>Medium — [RANDART] [MXM] [VESTOOL]</Lbl><input className="fi" value={d.medium||""} onChange={e=>up("medium",e.target.value)} placeholder="alcohol ink, oil painting — or [RANDART]"/><Tog on={!!d.overridePhoto} onClick={()=>up("overridePhoto",!d.overridePhoto)} label="Override default photorealism"/></Sec><Sec title="Extras"><Lbl>Ideas — [SOUP] [WEATHER] [SKYWOW] [RIMBA]</Lbl><textarea className="fi" rows={2} value={d.ideas||""} onChange={e=>up("ideas",e.target.value)} placeholder="[RIMBA], [WEATHER], [SOUP3]…"/><Lbl>Inspiration threads</Lbl>{(d.inspirations||[""]).map((v,i)=>(<div className="ce" key={i}><input className="fi" value={v} placeholder={"thread "+(i+1)+"…"} onChange={e=>{const n=[...(d.inspirations||[""])];n[i]=e.target.value;up("inspirations",n);}}/>{(d.inspirations||[""]).length>1&&<button className="xbtn" onClick={()=>up("inspirations",(d.inspirations||[]).filter((_,j)=>j!==i))}>✕</button>}</div>))}{(d.inspirations||[""]).length<5&&<button className="addc" onClick={()=>up("inspirations",[...(d.inspirations||[""]),""]) }>+ add</button>}</Sec></>);
  if(mode==="overlay"){
    const ovChips = Object.keys(aiChips).length>0 ? aiChips : OV_DEFAULTS;
    const ovCats = [
      {key:"medium", label:"Medium & Material"},
      {key:"texture", label:"Texture Behaviors"},
      {key:"surface", label:"Surface Conditions"},
      {key:"palette", label:"Palette Rules"},
      {key:"light",   label:"Light Behavior"},
      {key:"mood",    label:"Closing Mood"},
    ];
    return(<>
      <Sec title="Theme">
        <input className="fi" value={d.theme||""} onChange={e=>up("theme",e.target.value)} placeholder="folk, bioluminescence, oxidized copper…"/>
        <AiBtn label={Object.keys(aiChips).length>0?"Re-search theme":"Search theme for chips"}/>
        {aiErr&&<div className="err">{aiErr}</div>}
        {Object.keys(aiChips).length>0&&<div className="aiok">✓ Chips filtered for: {d.theme}</div>}
        {Object.keys(aiChips).length===0&&<div className="ainote">Showing defaults — search a theme to narrow chips</div>}
      </Sec>
      {ovCats.map(({key,label})=>(
        <Sec key={key} title={label}>
          <ChipGroup
            opts={ovChips[key]||[]}
            sel={d["ov_"+key]||[]}
            onToggle={x=>ta("ov_"+key,x)}
            onAdd={x=>up("ov_"+key,[...(d["ov_"+key]||[]),x])}
          />
        </Sec>
      ))}
    </>);
  }
  if(mode==="costume")return(<><ImageAnalyze mode={mode} setD={setD}/><Sec title="Concept"><input className="fi" value={d.theme||""} onChange={e=>up("theme",e.target.value)} placeholder="Victorian deep sea diver"/><AiBtn label="Generate costume ideas"/>{aiErr&&<div className="err">{aiErr}</div>}{Object.keys(aiChips).length>0&&<div className="aiok">✓ Ideas loaded</div>}</Sec>{["top","bottoms","shoes","accessories"].map(cat=>(<Sec key={cat} title={cat.charAt(0).toUpperCase()+cat.slice(1)}>{ac(cat).length>0&&<p className="ainote">AI suggestions:</p>}<ChipGroup opts={ac(cat)} sel={d[cat+"_sel"]||[]} onToggle={x=>ta(cat+"_sel",x)} onAdd={x=>up(cat+"_sel",[...(d[cat+"_sel"]||[]),x])}/></Sec>))}<Sec title="Mood / Vibe"><textarea className="fi" rows={2} value={d.vibe||""} onChange={e=>up("vibe",e.target.value)} placeholder="weathered, practical…"/></Sec></>);
  if(mode==="character")return(<><ImageAnalyze mode={mode} setD={setD}/><Sec title="Concept — [ADVES] [ADELYRIA] [ACHARS]"><input className="fi" value={d.concept||""} onChange={e=>up("concept",e.target.value)} placeholder="[ADVES], [ACHARS], or describe…"/><AiBtn label="Populate from concept"/>{aiErr&&<div className="err">{aiErr}</div>}{Object.keys(aiChips).length>0&&<div className="aiok">✓ Options loaded</div>}</Sec><Sec title="Foundation"><div className="slbl">Species</div>{cg([...SPECIES_D,...ac("species")],"species")}<div className="slbl">Body</div>{cg([...BODY_D,...ac("body")],"body")}<div className="slbl">Age feel</div>{cg([...AGE_D,...ac("age")],"age")}</Sec><Sec title="Appearance"><div className="slbl">Skin</div>{cg([...SKIN_D,...ac("skin")],"skin")}<div className="slbl">Eyes</div>{cg([...EYES_D,...ac("eyes")],"eyes")}<div className="slbl">Hair</div>{cg([...HAIR_D,...ac("hair")],"hair")}</Sec><Sec title="Identity"><div className="slbl">Archetype</div>{cg([...ARCH_D,...ac("archetype")],"archetype")}<div className="slbl">World</div>{cg([...WORLD_D,...ac("world")],"world")}</Sec><Sec title="Details"><Lbl>Defining marks</Lbl><input className="fi" value={d.marks||""} onChange={e=>up("marks",e.target.value)} placeholder="deep scar, bioluminescent tattoos…"/><div className="slbl">Expression</div>{cg([...EXPR_D,...ac("expression")],"expression")}</Sec></>);
  if(mode==="scene")return(<><Sec title="Characters — [ACHARS] [DGDRESSED]">{(d.characters||[""]).map((v,i)=>(<div className="ce" key={i}><input className="fi" value={v} placeholder={"Character "+(i+1)+" — or [ADVES]"} onChange={e=>{const n=[...(d.characters||[""])];n[i]=e.target.value;up("characters",n);}}/>{(d.characters||[""]).length>1&&<button className="xbtn" onClick={()=>up("characters",(d.characters||[]).filter((_,j)=>j!==i))}>✕</button>}</div>))}{(d.characters||[""]).length<6&&<button className="addc" onClick={()=>up("characters",[...(d.characters||[""]),""]) }>+ add character</button>}</Sec><Sec title="Setting"><Lbl>Environment — [SCENERY]</Lbl><textarea className="fi" rows={2} value={d.environment||""} onChange={e=>up("environment",e.target.value)} placeholder="[SCEN_RUINS], [SCEN_URBAN]…"/><Lbl>Action Level</Lbl><textarea className="fi" rows={2} value={d.action_level||""} onChange={e=>up("action_level",e.target.value)} placeholder="tense standoff — or [ACTION]"/></Sec><Sec title="Lighting — [RIMBA] [WEATHER]">{cg(LIGHTING,"lighting")}</Sec></>);
  return null;
}

// ---- Variation Card — structured sentences ----
function VariationCard({sections,idx,onCopySection,onCopyAll,cpState}){
  return(
    <div className="vcard">
      <div className="vcard-head">
        <span>Variation {idx+1}</span>
        <span style={{color:'var(--faint)',fontSize:'.54rem'}}>{sections.length} sections</span>
      </div>
      <div className="vsections">
        {sections.map((sec,si)=>(
          <div key={si} className="vsec">
            <div className="vsec-lbl">{sec.label}</div>
            <div className="vsec-txt">{sec.sentence}</div>
          </div>
        ))}
      </div>
      <div className="cprow">
        <button className={"cpbtn"+(cpState===`all-${idx}`?" ok":"")} onClick={()=>onCopyAll(idx)}>
          {cpState===`all-${idx}`?"✓ Copied full prompt":"copy full prompt"}
        </button>
      </div>
    </div>
  );
}

const TOTAL_PAGES=9;
export default function App(){
  const[mode,setMode]=useState("image");
  const[d,setD]=useState({});
  const[aiChips,setAiChips]=useState({});
  const[vars,setVars]=useState([]);
  const[loading,setLoading]=useState(false);
  const[aiLoad,setAiLoad]=useState(false);
  const[aiErr,setAiErr]=useState("");
  const[genErr,setGenErr]=useState("");
  const[cpState,setCpState]=useState(null);
  const[toolbox,setToolbox]=useState({});
  const[tbCount,setTbCount]=useState(0);
  const[chunks,setChunks]=useState(()=>Array(TOTAL_PAGES).fill(""));
  const[showLoader,setShowLoader]=useState(false);
  const[emitRaw,setEmitRaw]=useState(false); // true: send {braces} and [TAGS] untouched, for pasting into a Perchance generator
  const taRef=useRef(null);

  const loadMap=json=>{const map=parseToolbox(Object.values(json).join('\n'));setToolbox(map);setTbCount(Object.keys(map).length);};
  const handleUpload=e=>{const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=ev=>{try{loadMap(JSON.parse(ev.target.result));}catch{}};r.readAsText(file);};
  const buildFromChunks=(ch)=>{
    const filled=ch.filter(c=>c.trim());
    if(!filled.length){setToolbox({});setTbCount(0);return;}
    const map=parseToolbox(filled.join('\n'));
    setToolbox(map);setTbCount(Object.keys(map).length);
  };
  const handleChunk=(i,val)=>{setChunks(prev=>{const next=[...prev];next[i]=val;buildFromChunks(next);return next;});};
  const clearAll=()=>{const empty=Array(TOTAL_PAGES).fill("");setChunks(empty);setToolbox({});setTbCount(0);};

  const up=(k,v)=>setD(p=>({...p,[k]:v}));
  const toggleArr=(k,item)=>setD(p=>({...p,[k]:(p[k]||[]).includes(item)?(p[k]||[]).filter(x=>x!==item):[...(p[k]||[]),item]}));
  const toggleEmo=(o)=>setD(p=>({...p,emotion:(p.emotion||[]).some(x=>x.l===o.l)?(p.emotion||[]).filter(x=>x.l!==o.l):[...(p.emotion||[]),o]}));
  const switchMode=m=>{setMode(m);setD({});setAiChips({});setVars([]);setGenErr("");setAiErr("");};

  const doAiPull=async()=>{
    const ctx=(d.theme||d.concept||"").trim();if(!ctx)return;
    setAiLoad(true);setAiErr("");
    try{
      setAiChips(await pullChips(mode,ctx));
    }catch(e){setAiErr("AI pull failed.");}
    setAiLoad(false);
  };

  const doGenerate=async()=>{
    setLoading(true);setGenErr("");setVars([]);
    try{
      const rd1=emitRaw?d:resolveData(d,toolbox),rd2=emitRaw?d:resolveData(d,toolbox),rd3=emitRaw?d:resolveData(d,toolbox);
      const result=await generate(mode,buildGenPromptVaried(rd1,rd2,rd3,mode));
      const parsed=(result.variations||[]).map(v=>parseSections(v,mode));
      setVars(parsed);
    }catch(e){
      setGenErr(e.message==="MODEL_DECLINED"
        ?"The model declined — try softening the wording."
        :"Generation failed — "+(e.message||"try again."));
    }
    setLoading(false);
  };

  const doCopyAll=async(idx)=>{
    const text=flattenVariation(vars[idx],mode);
    try{await navigator.clipboard.writeText(text);}catch{if(taRef.current){taRef.current.value=text;taRef.current.select();document.execCommand("copy");}}
    setCpState(`all-${idx}`);setTimeout(()=>setCpState(null),1600);
  };

  const resolvedPreviewData=useMemo(()=>resolveData(d,toolbox),[d,mode,toolbox]);
  const resolvedPreview=useMemo(()=>buildPreview(resolvedPreviewData,mode),[resolvedPreviewData,mode]);
  const preview=useMemo(()=>emitRaw?buildPreview(d,mode):resolvedPreview,[emitRaw,d,mode,resolvedPreview]);
  const activeTags=useMemo(()=>[...new Set((Object.values(d).flat().filter(v=>typeof v==='string').join(' ')).match(/\[([A-Z_][A-Z0-9_]+)\]/g)||[])],[d]);
  const warnings=useMemo(()=>lint(resolvedPreview,resolvedPreviewData,activeTags,toolbox),[resolvedPreview,resolvedPreviewData,activeTags,toolbox]);

  return(
    <div className="ab">
      <style>{CSS}</style>
      <textarea ref={taRef} readOnly style={{position:"fixed",opacity:0,pointerEvents:"none",left:-9999}}/>
      <FlowerOfLife/>
      <div className="aura"/>
      <div className="pg">
        <div className="hd">
          <div className="ht">The Art of <em>Arting</em></div>
          <div className="tabs">{Object.entries(MMETA).map(([k,label])=>(<button key={k} className={"tab"+(mode===k?" on":"")} onClick={()=>switchMode(k)}>{label}</button>))}</div>
          <div className="tbstatus">
            {tbCount>0&&<span className="tbok">✦ Toolbox: {tbCount} tags · {chunks.filter(c=>c.trim()).length}/{TOTAL_PAGES} pages{activeTags.length>0&&<span> · {activeTags.map(t=><span key={t} className="tagpill">{t}</span>)}</span>}</span>}
            {tbCount===0&&<span className="tbwait">○ Toolbox empty — paste pages below</span>}
          </div>
          <div style={{display:"flex",gap:6,marginTop:6,flexWrap:"wrap",alignItems:"center"}}>
            <button className="uploadbtn" onClick={()=>setShowLoader(l=>!l)}>{showLoader?"▲ Hide loader":"⬆ Paste pages"}</button>
            <label className="uploadbtn">⬆ Upload JSON<input type="file" accept=".json" style={{display:"none"}} onChange={handleUpload}/></label>
            {tbCount>0&&<button className="uploadbtn" onClick={clearAll} style={{borderColor:"var(--bad)",color:"var(--bad)"}}>✕ Clear</button>}
          </div>
          <Tog on={!emitRaw} onClick={()=>setEmitRaw(r=>!r)} label={emitRaw?"Emitting raw {braces} and [TAGS] for pasting into a Perchance generator":"Resolving {braces} and [TAGS] locally for testing"}/>
          {showLoader&&(
            <div className="chunkloader">
              <div className="chunktitle">Paste each page from your notepad_export JSON</div>
              {chunks.map((val,i)=>(
                <div key={i} className="chunkrow">
                  <div className={"chunknum"+(val.trim()?" done":"")}>P{i+1}</div>
                  <textarea className="fi chunkta" rows={2} value={val} placeholder={`Paste page ${i+1} content…`} onChange={e=>handleChunk(i,e.target.value)}/>
                  {val.trim()&&<button className="xbtn" onClick={()=>handleChunk(i,"")}>✕</button>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="bd">
          <div>
            <SmartFill mode={mode} d={d} setD={setD} aiLoad={aiLoad}/>
            <ModeFields mode={mode} d={d} up={up} toggleArr={toggleArr} toggleEmo={toggleEmo} aiChips={aiChips} onAiPull={doAiPull} aiLoad={aiLoad} aiErr={aiErr} setD={setD}/>
          </div>
          <div className="sb">
            <div className="pvbox">
              <div className="pvlbl">
                <span>Building →</span>
                {activeTags.length>0&&<span style={{color:"var(--mag)",fontSize:".58rem"}}>{activeTags.length} tag{activeTags.length>1?'s':''} live</span>}
              </div>
              <div className="pvtxt">{preview||<span className="ph">fill fields… [TAG] calls toolbox</span>}</div>
            </div>
            {warnings.length>0&&<div className="lints">{warnings.map((w,i)=><div key={i} className="lint"><b>{w.law}</b>{w.msg}{w.from?.length>0&&<span> · from {w.from.join(', ')}</span>}</div>)}</div>}
            <button className="genbtn" onClick={doGenerate} disabled={loading}>{loading?"Generating…":"✦ Generate 3 variations"}</button>
            {genErr&&<div className="err">{genErr}</div>}
            {vars.map((sections,i)=>(
              <VariationCard
                key={i}
                sections={sections}
                idx={i}
                onCopyAll={doCopyAll}
                cpState={cpState}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
