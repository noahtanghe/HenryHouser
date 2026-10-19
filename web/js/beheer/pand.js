// Eén adres: kop met foto, status en link, en tabbladen voor de cijfers, de bezoekers,
// de bezoekdagen, de bezoekerspagina en de mails. Wisselen van tabblad laadt het adres
// niet opnieuw.

import { icoon } from "../iconen.js";
import { boogFoto } from "../kader.js";
import { datumKaal, datumLang, el, getal, splitsAdres } from "../tekst.js";
import { komendeDagen, laatsteDag } from "./datum.js";
import * as bezoekers from "./pand-bezoekers.js";
import * as dagen from "./pand-dagen.js";
import * as mails from "./pand-mails.js";
import * as overzicht from "./pand-overzicht.js";
import * as pagina from "./pand-pagina.js";
import { staat } from "./staat.js";
import { actiefInBeeld, badge, bevestig, foutTekst, kopieer, laadBlok, menuKnop, openDialoog, toast } from "./ui.js";

const TABS = [
  { naam: "overzicht", tekst: "Overzicht", module: overzicht },
  { naam: "bezoekers", tekst: "Bezoekers", module: bezoekers },
  { naam: "dagen", tekst: "Bezoekdagen", module: dagen },
  { naam: "pagina", tekst: "Bezoekerspagina", module: pagina },
  { naam: "mails", tekst: "Mails", module: mails },
];

let h = null; // { id, pagina, boekingen, beschikbaarheid, container, wrap, kop, tabs, paneel, tab }

export function isOpen(id, container) {
  return !!h && h.id === id && h.container === container && !!h.wrap?.isConnected;
}

const plaats = (gemeente) => gemeente.replace(/^\d{4}\s*/, "");
const nuKomend = (b) => b.status === "bevestigd" && new Date(b.start) >= Date.now();

export function statusPand(p, beschikbaarheid) {
  if (p.gearchiveerd) return { tekst: "Archief", klasse: "kaal" };
  if (!p.actief) return { tekst: "Offline", klasse: "slecht" };
  if (!beschikbaarheid.length) return { tekst: "Nog in te plannen", klasse: "aqua" };
  if (komendeDagen(beschikbaarheid).length) return { tekst: "Online", klasse: "goed" };
  return { tekst: "Afgelopen", klasse: "salie" };
}

function fase() {
  if (h.pagina.gearchiveerd) return "archief";
  if (!h.beschikbaarheid.length) return "nieuw";
  return komendeDagen(h.beschikbaarheid).length ? "komend" : "afgelopen";
}

/** Wat de tabbladen van het adres mogen gebruiken. */
export const ctx = {
  get id() { return h.id; },
  get pagina() { return h.pagina; },
  get boekingen() { return h.boekingen; },
  get beschikbaarheid() { return h.beschikbaarheid; },
  fase,
  async bewaar(velden) {
    h.pagina = await staat.api.paginaBewaren(h.id, velden);
    tekenKop();
    return h.pagina;
  },
  async herlaadBoekingen() {
    h.boekingen = await staat.api.boekingen(h.id);
    tekenKop();
    tekenTabs();
    return h.boekingen;
  },
  async herlaadBeschikbaarheid() {
    h.beschikbaarheid = await staat.api.beschikbaarheid(h.id);
    tekenKop();
    return h.beschikbaarheid;
  },
};

// Kop -------------------------------------------------------------------------------------------

function feiten() {
  const p = h.pagina;
  const komend = komendeDagen(h.beschikbaarheid);
  const uit = [];
  if (komend.length === 1) uit.push(`Homerun ${datumLang(komend[0])}`);
  else if (komend.length > 1) uit.push(`${komend.length} bezoekdagen vanaf ${datumKaal(komend[0])}`);
  else {
    const laatste = laatsteDag(h.beschikbaarheid);
    uit.push(laatste ? `Laatste bezoekdag ${datumKaal(laatste, { day: "numeric", month: "long", year: "numeric" })}` : "Nog geen bezoekdagen");
  }
  if (p.kickoff_prijs) uit.push(`Kick-off prijs ${getal(p.kickoff_prijs)} euro`);
  return uit.join(" · ");
}

function tekenKop() {
  const p = h.pagina;
  const { straat, gemeente } = splitsAdres(p.adres);
  const url = staat.api.publiekeUrl(p.slug);
  document.title = `${straat || p.adres} · Beheer Henry Houser`;

  const kopieerKnop = el("button", { type: "button", className: "knop lijn mini" }, icoon("kopie"), "Kopieer");
  kopieerKnop.addEventListener("click", () => kopieer(url, "Link gekopieerd."));
  const rapportKnop = el("button", { type: "button", className: "knop lijn klein" }, icoon("grafiek"),
    el("span", { className: "alleen-breed" }, "Verkopersrapport"), el("span", { className: "alleen-smal" }, "Rapport"));
  const kaal = url.replace(/^https?:\/\//, "");
  const knip = kaal.lastIndexOf("/") + 1;
  rapportKnop.addEventListener("click", rapportDialoog);

  h.kop.replaceChildren(
    el("a", { className: "terug", href: `#/adressen/${fase()}` }, icoon("terug"), "Adressen"),
    el("div", { className: "pand-kop" },
      boogFoto(staat.api.fotoUrl(p.foto_pad), "", "pand-kop-foto"),
      el("div", { className: "pand-kop-tekst" },
        el("div", { className: "pand-kop-oog" }, gemeente ? el("p", { className: "oog" }, plaats(gemeente)) : null,
          badge(statusPand(p, h.beschikbaarheid))),
        el("h1", { tabIndex: -1 }, straat || p.adres),
        el("p", { className: "pand-kop-feiten" }, feiten()),
        el("p", { className: "pand-kop-link" }, icoon("link"),
          el("a", { href: url, target: "_blank", rel: "noopener" }, kaal.slice(0, knip), el("wbr"), kaal.slice(knip)), kopieerKnop)),
      el("div", { className: "pand-kop-acties" },
        el("a", { className: "knop lijn klein", href: url, target: "_blank", rel: "noopener" }, icoon("extern"), "Bekijk pagina"),
        rapportKnop,
        menuKnop({ inhoud: icoon("meer"), label: "Meer acties", klasse: "knop lijn klein ikoon", items: menuItems }))));
}

function tekenTabs() {
  const komend = h.boekingen.filter(nuKomend).length;
  h.tabs.replaceChildren(...TABS.map((t) => el("a", {
    href: `#/p/${h.id}/${t.naam}`, id: `tab-${t.naam}`, "aria-current": t.naam === h.tab ? "page" : null,
  }, t.tekst, t.naam === "bezoekers" && komend
    ? el("span", { className: "tab-aantal" }, getal(komend), el("span", { className: "sr" }, " komend"))
    : null)));
  actiefInBeeld(h.tabs, h.tabs.querySelector('[aria-current="page"]'));
}

// Acties ------------------------------------------------------------------------------------------

function menuItems() {
  const p = h.pagina;
  const metAfspraken = h.boekingen.length > 0;
  return [
    p.actief
      ? { tekst: "Pagina offline zetten", icoon: "slot", actie: () => zetOnline(false) }
      : { tekst: "Pagina online zetten", icoon: "oog", actie: () => zetOnline(true) },
    { tekst: "Kopiëren naar een nieuw adres", icoon: "kopie", href: `#/nieuw?bron=${p.id}` },
    p.gearchiveerd
      ? { tekst: "Uit het archief halen", icoon: "archief", actie: uitArchief }
      : { tekst: "Archiveren", icoon: "archief", actie: archiveer },
    { lijn: true },
    {
      tekst: "Verwijderen", icoon: "prullenbak", gevaar: true, uit: metAfspraken, actie: verwijder,
      hint: metAfspraken ? "Kan niet: er zijn afspraken. Archiveer het adres." : null,
    },
  ];
}

async function zetOnline(aan) {
  if (!aan && h.boekingen.some(nuKomend) && !(await bevestig({
    titel: "Pagina offline zetten?",
    tekst: "Er zijn nog komende afspraken. Die blijven gewoon staan, maar nieuwe bezoekers kunnen niet meer boeken.",
    ja: "Offline zetten",
  }))) return;
  try {
    await ctx.bewaar(aan ? { actief: true, gearchiveerd: false } : { actief: false });
    toast(aan ? "De pagina staat online." : "De pagina staat offline. Bezoekers zien een melding.");
  } catch (err) {
    toast(foutTekst(err), { fout: true });
  }
}

async function archiveer() {
  if (!(await bevestig({
    titel: "Adres archiveren?",
    tekst: "De pagina gaat offline en het adres verhuist naar het archief. Afspraken en cijfers blijven bewaard, en je kan het later terughalen.",
    ja: "Archiveren",
  }))) return;
  try {
    await ctx.bewaar({ gearchiveerd: true, actief: false });
    toast("Gearchiveerd.");
  } catch (err) {
    toast(foutTekst(err), { fout: true });
  }
}

async function uitArchief() {
  try {
    await ctx.bewaar({ gearchiveerd: false });
    toast("Uit het archief gehaald. De pagina staat nog offline.");
  } catch (err) {
    toast(foutTekst(err), { fout: true });
  }
}

async function verwijder() {
  const p = h.pagina;
  if (!(await bevestig({
    titel: "Adres verwijderen?",
    tekst: `${p.adres} wordt definitief verwijderd, met de bezoekdagen, de foto en de paginaweergaven. Dit kan je niet ongedaan maken.`,
    ja: "Definitief verwijderen", gevaar: true,
  }))) return;
  try {
    await staat.api.paginaVerwijderen(p.id);
    if (p.foto_pad) await staat.api.fotoVerwijderen(p.foto_pad).catch((e) => console.warn(e));
    h = null;
    toast("Adres verwijderd.");
    location.hash = "#/adressen";
  } catch (err) {
    toast(foutTekst(err), { fout: true });
  }
}

function nieuwToken() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const x = [...b].map((v) => v.toString(16).padStart(2, "0")).join("");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function rapportDialoog() {
  const p = h.pagina;
  const url = staat.api.rapportUrl(p.rapport_token);
  const invoer = el("input", { className: "invoer", value: url, readOnly: true, "aria-label": "Link naar het verkopersrapport" });
  invoer.addEventListener("focus", () => invoer.select());
  const kopKnop = el("button", { type: "button", className: "knop zwart klein" }, icoon("kopie"), "Kopieer link");
  kopKnop.addEventListener("click", () => kopieer(url, "Link naar het verkopersrapport gekopieerd."));
  const nieuw = el("button", { type: "button", className: "link gevaar" }, "maak een nieuwe link");
  const naarMails = el("a", { href: `#/p/${p.id}/mails` }, "Mails");

  const { sluit } = openDialoog({
    titel: "Verkopersrapport",
    inhoud: [
      el("p", { className: "dialoog-tekst" },
        "Een eigen pagina voor de verkoper met de interesse in de woning: paginaweergaven, afspraken en de bezetting per bezoekdag. Zonder namen of contactgegevens van bezoekers."),
      el("div", { className: "kopieer-rij" }, invoer, kopKnop,
        el("a", { className: "knop lijn klein", href: url, target: "_blank", rel: "noopener" }, icoon("extern"), "Open")),
      p.eigenaar_email
        ? el("p", { className: "dialoog-tekst" }, `De verkoper (${p.eigenaar_email}) krijgt deze link automatisch bij elke nieuwe afspraak.`)
        : el("p", { className: "dialoog-tekst" }, "Vul het e-mailadres van de verkoper in bij ", naarMails,
          ", dan krijgt die de link automatisch bij elke nieuwe afspraak."),
      el("p", { className: "klein" }, "Link bij de verkeerde persoon beland? Dan ", nieuw, ". De oude link werkt daarna niet meer."),
    ],
  });
  naarMails.addEventListener("click", () => sluit());
  nieuw.addEventListener("click", async () => {
    if (!(await bevestig({
      titel: "Nieuwe link maken?",
      tekst: "De huidige link naar het verkopersrapport werkt daarna niet meer. Bezorg de verkoper de nieuwe link.",
      ja: "Nieuwe link maken", gevaar: true,
    }))) return;
    try {
      await ctx.bewaar({ rapport_token: nieuwToken() });
      sluit();
      rapportDialoog();
      toast("Nieuwe link gemaakt.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    }
  });
}

// Tonen -------------------------------------------------------------------------------------------

export async function toon(container, id, tabNaam, query) {
  const mijn = staat.navigatie;
  if (!isOpen(id, container)) {
    const [p, boekingen, beschikbaarheid] = await Promise.all([
      staat.api.pagina(id), staat.api.boekingen(id), staat.api.beschikbaarheid(id),
    ]);
    if (mijn !== staat.navigatie) return;
    h = { id, pagina: p, boekingen, beschikbaarheid, container };
    h.kop = el("header", { className: "pand-kop-wrap" });
    h.tabs = el("nav", { className: "tabs", "aria-label": "Onderdelen van dit adres" });
    h.paneel = el("div", { className: "tab-paneel" });
    h.wrap = el("div", { className: "pand" }, h.kop, h.tabs, h.paneel);
    container.replaceChildren(h.wrap);
  }
  const tab = TABS.find((t) => t.naam === tabNaam) || TABS[0];
  h.tab = tab.naam;
  tekenKop();
  tekenTabs();
  h.paneel.replaceChildren(laadBlok());
  await tab.module.toon(h.paneel, ctx, query);
}
