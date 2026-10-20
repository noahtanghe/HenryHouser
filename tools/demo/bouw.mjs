// Bouwt de demo van het beheer als één HTML-bestand (Claude-artifact, zonder server).
// Gebruik: cd tools/demo && npm install && node bouw.mjs [uitvoer]   (standaard: beheer-demo.html)
// - huisstijl met lettertypes als data-URI, beheer.css, publiek.css
// - web/js/beheer/main.js, web/js/boek.js en web/js/rapport.js als iife-bundels
// - mock-api.js (voorbeeldgegevens) en een kleine demo-laag (venster, meldingen)
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const HIER = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.resolve(HIER, "../../web");

const lees = (p) => readFileSync(p, "utf8");
const dataUri = (p, type) => `data:${type};base64,${readFileSync(p).toString("base64")}`;
const js = (x) => JSON.stringify(x).replace(/</g, "\\u003c");

// CSS -------------------------------------------------------------------------------------------

const huisstijl = lees(`${WEB}/huisstijl.css`)
  .replace(/url\("\/fonts\/([a-z0-9-]+\.woff2)"\)/g, (_, f) => `url("${dataUri(`${WEB}/fonts/${f}`, "font/woff2")}")`);
if (/url\("\//.test(huisstijl)) throw new Error("huisstijl.css verwijst nog naar een bestand");
const beheerCss = lees(`${WEB}/beheer.css`);
const publiekCss = lees(`${WEB}/publiek.css`);
for (const [naam, css] of [["beheer.css", beheerCss], ["publiek.css", publiekCss]]) {
  if (/url\("?\//.test(css)) throw new Error(`${naam} verwijst naar een bestand`);
}

// JS --------------------------------------------------------------------------------------------

const logoSlogan = dataUri(`${WEB}/img/logo-slogan.svg`, "image/svg+xml");
async function bundel(invoer) {
  const r = await esbuild.build({
    entryPoints: [`${WEB}/js/${invoer}`], bundle: true, format: "iife", minify: true, write: false,
    target: ["es2020"], charset: "utf8", legalComments: "none",
  });
  let code = r.outputFiles[0].text.replaceAll("/img/logo-slogan.svg", logoSlogan);
  // (logo-mail.png staat in de Supabase-API van het beheer; de demo gebruikt DEMO_OPTIES.logo)
  if (/["'`]\/(img|fonts)\//.test(code.replaceAll('"/img/logo-mail.png"', ""))) throw new Error(`${invoer} verwijst nog naar /img of /fonts`);
  code = code.replace(/<\/(script)/gi, "<\\/$1");
  if (code.includes("<!--")) throw new Error(`${invoer} bevat <!-- (stoort een inline script)`);
  return code;
}
const [mainJs, boekJs, rapportJs] = await Promise.all([bundel("beheer/main.js"), bundel("boek.js"), bundel("rapport.js")]);

// Publieke pagina's als sjabloon (de demo vult <!--HUISSTIJL--> en <!--DEMO-KOP--> in) ------------

const sjabloon = (titel, code) => `<!doctype html><html lang="nl"><head><meta charset="utf-8">`
  + `<meta name="viewport" content="width=device-width, initial-scale=1"><title>${titel}</title>`
  + `<!--HUISSTIJL--><style>${publiekCss}</style><!--DEMO-KOP--></head><body>`
  + `<div id="app"><div class="boeking-laden" role="status" aria-label="Laden"><div class="laad-balk"></div></div></div>`
  + `<script>${code}</script></body></html>`;

const opties = {
  teksten: JSON.parse(lees(`${HIER}/teksten.json`)),
  fotos: {
    "aalbeek/1760890000000.jpg": dataUri(`${HIER}/fotos/tuin.jpg`, "image/jpeg"),
    "aalbeek/1760890000000-breed.jpg": dataUri(`${HIER}/fotos/tuin-breed.jpg`, "image/jpeg"),
  },
  logo: dataUri(`${WEB}/img/logo-mail.png`, "image/png"),
  paginaHtml: sjabloon("Bezoek plannen · Henry Houser", boekJs),
  rapportHtml: sjabloon("Verkopersrapport · Henry Houser", rapportJs),
  ingelogd: true,
};

// Demo-laag -------------------------------------------------------------------------------------

const demoCss = `
/* Demo: band bovenaan, venster voor de bezoekerspagina en het verkopersrapport */
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 44; background: var(--creme); }
.balk { top: env(safe-area-inset-top, 0px); }
.demo-band { background: var(--inkt); color: var(--creme); font: 400 13.5px/1.55 var(--font); }
.demo-band-binnen {
  max-width: 1360px; margin: 0 auto; padding-block: 9px;
  padding-left: max(32px, env(safe-area-inset-left, 0px)); padding-right: max(32px, env(safe-area-inset-right, 0px));
  display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 18px;
}
.demo-band strong {
  margin-right: 6px; padding: 2px 7px; background: var(--oranje); color: #fff;
  font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase;
}
.demo-band button {
  padding: 0; border: 0; background: none; color: inherit; font: inherit; font-weight: 500; cursor: pointer;
  text-decoration: underline; text-decoration-color: var(--oranje); text-decoration-thickness: 2px; text-underline-offset: 4px;
}
.demo-band button:hover { color: #fff; }
.demo-band button:focus-visible { outline: 2px solid var(--oranje); outline-offset: 3px; }
@media (max-width: 759px) {
  .demo-band-binnen { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
}

.demo-venster {
  width: min(1180px, calc(100vw - 48px)); height: calc(100dvh - 48px); max-width: none; max-height: none;
  padding: 0; border: 0; background: var(--creme); color: var(--tekst);
  box-shadow: 0 30px 80px -24px rgba(10, 10, 10, .55);
}
.demo-venster[open] { display: flex; flex-direction: column; animation: dialoog-in .18s ease-out; }
.demo-venster::backdrop { background: rgba(23, 21, 17, .6); }
.demo-venster-balk {
  display: flex; align-items: center; gap: 12px; padding: 10px 10px 10px 12px;
  background: var(--kaart); border-bottom: 1px solid var(--lijn);
}
.demo-venster-adres {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 16px;
  border-radius: 999px; background: var(--creme-licht); border: 1px solid var(--lijn-zacht); color: var(--zacht); font-size: 14px;
}
.demo-venster-adres svg { flex: none; width: 15px; height: 15px; }
.demo-venster-adres span { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.demo-venster iframe { flex: 1; width: 100%; min-height: 0; border: 0; background: var(--creme); }
@media (max-width: 640px) {
  .demo-venster { width: 100vw; height: 100dvh; }
  .demo-venster-balk { padding-top: calc(10px + env(safe-area-inset-top, 0px)); }
}
`;

const demoBand = `<div class="demo-band" role="note"><div class="demo-band-binnen">`
  + `<span><strong>Demo</strong>Verzonnen gegevens: probeer alles uit, niets wordt bewaard of verstuurd.</span>`
  + `<span>Bekijk ook <button type="button" data-demo="pagina">de bezoekerspagina</button> en `
  + `<button type="button" data-demo="rapport">het verkopersrapport</button>.</span>`
  + `</div></div>`;

// Draait vóór de mock en het beheer.
const demoLaag = `(function () {
  "use strict";
  var timer = null;
  function melding(tekst) {
    var t = document.getElementById("toast");
    if (!t) {
      t = document.createElement("div");
      t.id = "toast"; t.className = "toast"; t.setAttribute("role", "status"); t.setAttribute("aria-live", "polite");
    }
    var open = document.querySelectorAll("dialog[open]");
    var plek = open.length ? open[open.length - 1] : document.body;
    if (t.parentElement !== plek) plek.append(t);
    t.textContent = tekst; t.classList.remove("fout"); t.hidden = false;
    t.style.animation = "none"; void t.offsetHeight; t.style.animation = "";
    clearTimeout(timer);
    timer = setTimeout(function () { t.hidden = true; }, 4500);
  }

  // Afdrukken en downloaden kunnen niet in een artifact.
  window.print = function () {
    melding("Afdrukken werkt in het echte beheer, niet in deze demo.");
    setTimeout(function () { dispatchEvent(new Event("afterprint")); }, 0);
  };
  var klik = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    // Na de melding van het beheer zelf ("... geëxporteerd"), anders overschrijft die de uitleg.
    if (this.hasAttribute("download")) {
      setTimeout(function () { melding("Downloaden werkt in het echte beheer, niet in deze demo."); }, 40);
      return;
    }
    return klik.call(this);
  };

  // Na boeken of bekijken in het venster: het beheer opnieuw tekenen (tenzij er iets niet bewaard is).
  var gewijzigd = false;
  function bewaak(P) {
    if (P.bewaakt) return;
    var boek = P.boek, log = P.log;
    P.boek = function (b) { return boek(b).then(function (r) { if (r && r.status === 200) gewijzigd = true; return r; }); };
    P.log = function (a) { gewijzigd = true; log(a); };
    P.bewaakt = true;
  }

  var SLOT = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><rect x="5" y="10" width="14" height="10" rx="1.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>';
  function venster(adres, html, label) {
    var d = document.createElement("dialog");
    d.className = "demo-venster";
    d.setAttribute("aria-label", label);
    d.innerHTML = '<div class="demo-venster-balk"><div class="demo-venster-adres">' + SLOT + '<span></span></div>'
      + '<button type="button" class="knop zwart klein">Sluiten</button></div>';
    d.querySelector(".demo-venster-adres span").textContent = adres.replace(/^https?:\\/\\//, "");
    var frame = document.createElement("iframe");
    frame.title = label;
    frame.srcdoc = html;
    d.append(frame);
    document.body.append(d);
    var terug = document.activeElement;
    d.querySelector("button").addEventListener("click", function () { d.close(); });
    d.addEventListener("close", function () {
      d.remove();
      if (terug && terug.isConnected) terug.focus({ preventScroll: true });
      if (gewijzigd && !document.querySelector("dialog[open]") && !document.querySelector(".bewaarbalk:not([hidden])")) {
        dispatchEvent(new HashChangeEvent("hashchange"));
      }
      gewijzigd = false;
    });
    d.showModal();
    d.querySelector("button").focus();
  }

  function openPagina(slug, o) {
    var P = window.DEMO_PUBLIEK;
    if (!P || !P.paginaHtml) return;
    bewaak(P);
    venster(P.basis + "/" + slug + (o.utm ? "?utm_source=" + encodeURIComponent(o.utm) : ""),
      P.paginaHtml(slug, o), "Bezoekerspagina");
  }
  function openRapport(token) {
    var P = window.DEMO_PUBLIEK;
    if (!P || !P.rapportHtml) return;
    venster(P.basis + "/rapport?token=" + token, P.rapportHtml(token), "Verkopersrapport");
  }

  // Links naar de publieke site openen in de demo zelf; bellen en mailen doen niets.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a) return;
    var href = a.getAttribute("href") || "";
    if (/^(tel|mailto|sms):/i.test(href)) {
      e.preventDefault();
      return melding(/^mailto:/i.test(href) ? "Mailen gaat in het echte beheer, niet in deze demo." : "Bellen gaat in het echte beheer, niet in deze demo.");
    }
    var P = window.DEMO_PUBLIEK, u;
    if (!P) return;
    try { u = new URL(a.href); } catch (err) { return; }
    if (u.origin !== new URL(P.basis).origin) return;
    e.preventDefault();
    var pad = decodeURIComponent(u.pathname.replace(/^\\/+|\\/+$/g, ""));
    if (pad === "rapport") openRapport(u.searchParams.get("token") || "");
    else if (pad && pad.indexOf("/") < 0 && pad !== "beheer") {
      openPagina(pad, { voorbeeld: u.searchParams.has("voorbeeld"), utm: u.searchParams.get("utm_source") });
    } else melding("Deze link werkt zodra afspraak.henryhouser.be gekoppeld is.");
  }, true);

  // Knoppen in de demoband: de pagina en het rapport van het eerste voorbeeldadres.
  document.addEventListener("click", function (e) {
    var k = e.target.closest && e.target.closest("[data-demo]");
    if (!k || !window.BEHEER_API) return;
    window.BEHEER_API.pagina("aalbeek").then(function (p) {
      if (k.dataset.demo === "rapport") openRapport(p.rapport_token);
      else openPagina(p.slug, {});
    }, function () { melding("Dit voorbeeldadres bestaat niet meer in de demo. Herlaad de pagina."); });
  });
})();`;

// Samenstellen ----------------------------------------------------------------------------------

const mock = lees(`${HIER}/mock-api.js`).replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--DEMO-KOP-->", "\\x3C!--DEMO-KOP-->");
if (mock.includes("<!--")) throw new Error("mock-api.js bevat <!--");

const html = `<title>Henry Houser Afspraken</title>
<meta name="robots" content="noindex">
<style id="hh-huisstijl">${huisstijl}</style>
<style>${beheerCss}</style>
<style>${demoCss}</style>
<script>document.body.classList.add("beheer");</script>
${demoBand}
<div id="app"><div class="laad-blok" role="status"><div class="laad-balk"></div><span class="sr">Laden…</span></div></div>
<script>${demoLaag}</script>
<script>
window.DEMO_OPTIES = ${js(opties)};
(function () {
  var stijl = "<style>" + document.getElementById("hh-huisstijl").textContent + "<\\/style>";
  ["paginaHtml", "rapportHtml"].forEach(function (k) {
    window.DEMO_OPTIES[k] = window.DEMO_OPTIES[k].replace("\\x3C!--HUISSTIJL-->", function () { return stijl; });
  });
})();
</script>
<script>${mock}</script>
<script>${mainJs}</script>
`;

const uit = process.argv[2] || path.join(HIER, "beheer-demo.html");
writeFileSync(uit, html);
console.log(`${uit}: ${(Buffer.byteLength(html) / 1024).toFixed(0)} kB`);
