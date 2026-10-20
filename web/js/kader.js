// Kop en voet van de publieke pagina's (boeken, annuleren, verkopersrapport).

import { KANTOOR, LOGO, MONOGRAM, telLink } from "./merk.js";
import { icoon } from "./iconen.js";
import { el } from "./tekst.js";

export function kop() {
  const logo = el("a", { className: "kopbalk-logo", href: KANTOOR.website, "aria-label": "henry houser, naar de website" });
  logo.innerHTML = LOGO;
  return el("header", { className: "kopbalk" },
    logo,
    el("a", { className: "kopbalk-bel", href: telLink(KANTOOR.telefoon) },
      icoon("telefoon"), el("span", { className: "lang" }, "Vragen? "), KANTOOR.telefoon));
}

export function voet() {
  return el("footer", { className: "voet" },
    el("div", { className: "voet-binnen" },
      el("div", {}, el("img", { className: "voet-logo", src: "/img/logo-slogan.svg", alt: "henry houser, vastgoed maar beter", width: 190, height: 93 })),
      el("div", { className: "voet-blok" },
        el("strong", {}, "Kantoor"), el("span", {}, KANTOOR.straat), el("span", {}, KANTOOR.gemeente)),
      el("div", { className: "voet-blok" },
        el("strong", {}, "Contact"),
        el("a", { href: telLink(KANTOOR.telefoon) }, KANTOOR.telefoon),
        el("a", { href: `mailto:${KANTOOR.email}` }, KANTOOR.email),
        el("a", { href: KANTOOR.website }, KANTOOR.website.replace(/^https?:\/\/(www\.)?/, ""))),
      el("p", { className: "voet-klein" }, `© ${new Date().getFullYear()} ${KANTOOR.naam} · ${KANTOOR.biv}`)));
}

/** Lege boog met het monogram, als er (nog) geen foto is. */
export function boogLeeg(klasse = "") {
  const d = el("div", { className: `boog boog-leeg ${klasse}`.trim(), "aria-hidden": "true" });
  d.innerHTML = MONOGRAM;
  return d;
}

/** Foto in een boog, of de lege boog. */
export function boogFoto(url, alt, klasse = "") {
  if (!url) return boogLeeg(klasse);
  return el("figure", { className: `boog ${klasse}`.trim() },
    el("img", { src: url, alt: alt || "", loading: "eager", decoding: "async" }));
}
