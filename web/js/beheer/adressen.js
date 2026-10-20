// Alle adressen: komend, nog in te plannen, afgelopen en archief. Komende adressen als
// kaarten met foto, de rest als tabel (daar zoek je eerder in terug).

import { icoon } from "../iconen.js";
import { meter } from "../grafieken.js";
import { boogFoto } from "../kader.js";
import { datumKaal, datumLang, el, getal, procent, splitsAdres } from "../tekst.js";
import { staat } from "./staat.js";
import { aantal, badge, leeg, paginaKop, segment, statusAdres } from "./ui.js";

const FASEN = [
  { waarde: "komend", tekst: "Komend" },
  { waarde: "nieuw", tekst: "Nog in te plannen" },
  { waarde: "afgelopen", tekst: "Afgelopen" },
  { waarde: "archief", tekst: "Archief" },
  { waarde: "alle", tekst: "Alle" },
];

let zoekterm = ""; // blijft staan als je terugkomt

const plaats = (gemeente) => gemeente.replace(/^\d{4}\s*/, "");
const kort = (d) => datumKaal(d, { day: "numeric", month: "short" });
const metJaar = (d) => datumKaal(d, { day: "numeric", month: "short", year: "numeric" });

function periode(van, tot) {
  if (!van) return "–";
  if (van === tot) return metJaar(van);
  return van.slice(0, 4) === tot.slice(0, 4) ? `${kort(van)} – ${metJaar(tot)}` : `${metJaar(van)} – ${metJaar(tot)}`;
}

function wanneer(p) {
  if (p.fase === "komend") {
    return p.dagen === 1 ? `Homerun ${datumLang(p.eerste_dag)}` : `${p.dagen} bezoekdagen, ${kort(p.eerste_dag)} tot ${kort(p.laatste_dag)}`;
  }
  if (p.fase === "nieuw") return "Nog geen bezoekdagen";
  return `Laatste bezoekdag ${metJaar(p.laatste_dag_ooit)}`;
}

function kaart(p) {
  const { straat, gemeente } = splitsAdres(p.adres);
  const cijfers = p.fase === "komend"
    ? [aantal(p.boekingen, "komende afspraak", "komende afspraken"), aantal(p.weergaven, "weergave", "weergaven")]
    : [aantal(p.weergaven, "weergave", "weergaven")];
  return el("li", {}, el("a", { className: "adres-kaart", href: p.fase === "nieuw" ? `#/p/${p.id}/dagen` : `#/p/${p.id}` },
    boogFoto(staat.api.fotoUrl(p.foto_pad), "", "adres-foto"),
    el("div", { className: "adres-tekst" },
      el("div", { className: "adres-kop" }, el("p", { className: "oog" }, plaats(gemeente) || " "), badge(statusAdres(p))),
      el("h2", {}, straat || p.adres),
      el("p", { className: "adres-wanneer" }, icoon("kalender"), wanneer(p)),
      p.capaciteit
        ? el("div", { className: "adres-bezetting" },
          meter(p.geboekt, p.capaciteit, { label: `${p.geboekt} van ${p.capaciteit} plaatsen geboekt` }),
          el("span", {}, `${getal(p.geboekt)} van ${getal(p.capaciteit)} geboekt`))
        : null,
      el("p", { className: "adres-cijfers" }, cijfers.join(" · ")),
      p.fase === "nieuw" ? el("span", { className: "adres-actie" }, "Bezoekdag inplannen", icoon("pijlRechts")) : null)));
}

function tabel(lijst) {
  const rijen = lijst.map((p) => {
    const { straat, gemeente } = splitsAdres(p.adres);
    const link = el("a", { href: `#/p/${p.id}` }, straat || p.adres);
    const rij = el("tr", {},
      el("th", { scope: "row" },
        el("div", { className: "tabel-adres" },
          boogFoto(staat.api.fotoUrl(p.foto_pad), "", "mini-boog"),
          el("span", {}, link, el("small", {}, gemeente)))),
      el("td", { dataset: { label: "Bezoekdagen" } }, periode(p.eerste_dag_ooit, p.laatste_dag_ooit)),
      el("td", { dataset: { label: "Afspraken" }, className: "getal" }, getal(p.geboekt),
        p.geannuleerd ? el("small", {}, `${getal(p.geannuleerd)} geannuleerd`) : null),
      el("td", { dataset: { label: "Bezetting" }, className: "getal" },
        p.capaciteit ? el("span", { className: "tabel-bezetting" }, procent(p.geboekt, p.capaciteit),
          meter(p.geboekt, p.capaciteit, { label: `${p.geboekt} van ${p.capaciteit} plaatsen geboekt` })) : "–"),
      el("td", { dataset: { label: "Weergaven" }, className: "getal" }, getal(p.weergaven)),
      el("td", { dataset: { label: "Status" } }, badge(statusAdres(p))));
    // De hele rij is aanklikbaar; met het toetsenbord volstaat de link.
    rij.addEventListener("click", (e) => {
      if (!e.target.closest("a") && !getSelection().toString()) link.click();
    });
    return rij;
  });
  return el("div", { className: "tabel-wrap" },
    el("table", { className: "tabel adressen-tabel" },
      el("thead", {}, el("tr", {},
        el("th", { scope: "col" }, "Adres"), el("th", { scope: "col" }, "Bezoekdagen"),
        el("th", { scope: "col", className: "getal" }, "Afspraken"), el("th", { scope: "col", className: "getal" }, "Bezetting"),
        el("th", { scope: "col", className: "getal" }, "Weergaven"), el("th", { scope: "col" }, "Status"))),
      el("tbody", {}, rijen)));
}

function leegToestand(fase, q, lijst) {
  if (q) {
    const elders = FASEN.filter((f) => f.waarde !== "alle" && f.waarde !== fase)
      .map((f) => ({ ...f, n: lijst.filter((p) => p.fase === f.waarde && past(p, q)).length }))
      .filter((f) => f.n);
    return leeg({
      klein: true,
      titel: `Niets gevonden voor “${q}”`,
      tekst: elders.length ? "Wel bij:" : "Probeer een deel van de straatnaam of de gemeente.",
      acties: elders.map((f) => el("a", { className: "knop lijn mini", href: `#/adressen/${f.waarde}` }, `${f.tekst} (${f.n})`)),
    });
  }
  const teksten = {
    komend: ["Geen komende Homeruns", "Plan een bezoekdag in bij een adres, of maak een nieuw adres aan."],
    nieuw: ["Alles is ingepland", "Elk adres heeft minstens één bezoekdag."],
    afgelopen: ["Nog geen afgelopen adressen", "Na de laatste bezoekdag verschijnt een adres hier, met alle afspraken en cijfers."],
    archief: ["Het archief is leeg", "Archiveer een adres als het verkocht is: de pagina gaat offline, de cijfers blijven bewaard."],
    alle: ["Nog geen adressen", "Maak je eerste adres aan om afspraken te ontvangen."],
  }[fase];
  return leeg({
    titel: teksten[0], tekst: teksten[1],
    acties: fase === "komend" || fase === "alle" ? el("a", { className: "knop zwart klein", href: "#/nieuw" }, icoon("plus"), "Nieuw adres") : null,
  });
}

const past = (p, q) => `${p.adres} ${p.titel} ${p.slug}`.toLowerCase().includes(q);

export async function toon(container, fase) {
  const mijn = staat.navigatie;
  const lijst = await staat.api.overzicht();
  if (mijn !== staat.navigatie) return;
  if (!FASEN.some((f) => f.waarde === fase)) fase = "komend";
  document.title = `Adressen · Beheer Henry Houser`;

  const tel = (f) => (f === "alle" ? lijst.length : lijst.filter((p) => p.fase === f).length);
  const zoek = el("input", {
    type: "search", className: "invoer", value: zoekterm, placeholder: "Zoek op straat of gemeente",
    "aria-label": "Zoek een adres", autocomplete: "off",
  });
  const resultaat = el("div", { className: "adressen-resultaat", "aria-live": "polite" });
  const teken = () => {
    const q = zoekterm.trim().toLowerCase();
    const binnen = lijst.filter((p) => (fase === "alle" || p.fase === fase) && (!q || past(p, q)));
    resultaat.replaceChildren(!binnen.length ? leegToestand(fase, q, lijst)
      : fase === "komend" || fase === "nieuw" ? el("ul", { className: "adres-kaarten" }, binnen.map(kaart))
      : tabel(binnen));
  };
  zoek.addEventListener("input", () => {
    zoekterm = zoek.value;
    teken();
  });

  const komend = tel("komend");
  container.replaceChildren(
    paginaKop({
      titel: "Adressen",
      sub: el("p", {}, `${aantal(lijst.length, "adres", "adressen")}${komend ? `, waarvan ${getal(komend)} met komende bezoekdagen` : ""}.`),
    }),
    el("div", { className: "werkbalk" },
      segment({
        label: "Welke adressen", actief: fase,
        opties: FASEN.map((f) => ({ ...f, aantal: tel(f.waarde), href: `#/adressen/${f.waarde}` })),
      }),
      el("label", { className: "zoek" }, icoon("zoek"), zoek)),
    resultaat);
  teken();
}
