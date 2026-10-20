// Publieke boekingspagina: afspraak.henryhouser.be/<slug>
// Drie stappen: startuur kiezen, gegevens invullen, bevestiging met agendaknoppen.
// ?voorbeeld=1 toont de pagina in het beheer: er wordt niet geboekt of geteld, en het
// beheer stuurt de (nog niet bewaarde) inhoud door met postMessage.

import { KANTOOR, telLink } from "./merk.js";
import { icoon } from "./iconen.js";
import { boogFoto, boogLeeg, kop, voet } from "./kader.js";
import { cap, dagSleutel, datumKaal, datumLang, el, fotoUrl, getal, render, splitsAdres, startTekst, uur, vulIn } from "./tekst.js";

const cfg = window.AFSPRAAK_CONFIG || {};
const params = new URLSearchParams(window.AFSPRAAK_QS ?? location.search);
const slug = params.get("slug") || decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] || "");
const voorbeeld = params.has("voorbeeld");

// ---------------------------------------------------------------------------
// Gegevens. window.AFSPRAAK_API kan vooraf gezet worden (demo zonder server).
// ---------------------------------------------------------------------------

async function rpc(naam, args) {
  const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${naam}`, {
    method: "POST",
    // Publishable keys gaan alleen in de apikey-header, niet als Bearer-token.
    headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`${naam}: ${res.status}`);
  return res.json();
}

const api = window.AFSPRAAK_API || {
  pagina: (s) => rpc("pagina_publiek", { p_slug: s }),
  slots: (s) => rpc("vrije_slots", { p_slug: s }),
  async boek(body) {
    const res = await fetch(`${cfg.supabaseUrl}/functions/v1/boek`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey },
      body: JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  },
  log(args) {
    fetch(`${cfg.supabaseUrl}/rest/v1/rpc/log_weergave`, {
      method: "POST", keepalive: true,
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    }).catch(() => {});
  },
};

// ---------------------------------------------------------------------------
// Analytics: één id per paginalading, geen cookies.
// ---------------------------------------------------------------------------

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

const laadId = uuid();
const apparaat = matchMedia("(max-width: 767px)").matches || (matchMedia("(pointer: coarse)").matches && innerWidth < 1024)
  ? "mobiel" : "desktop";
const kanaal = (() => {
  const utm = params.get("utm_source");
  if (utm) return utm.toLowerCase().slice(0, 60);
  try {
    const r = new URL(document.referrer);
    if (r.hostname && r.host !== location.host) return r.hostname.replace(/^(www|m|l|lm|mobile)\./, "");
  } catch { /* geen verwijzer */ }
  return null;
})();
const gelogd = new Set();
function log(gebeurtenis) {
  if (voorbeeld || gelogd.has(gebeurtenis) || !pagina) return;
  gelogd.add(gebeurtenis);
  api.log({ p_slug: slug, p_gebeurtenis: gebeurtenis, p_laad_id: laadId, p_kanaal: kanaal, p_apparaat: apparaat });
}

// ---------------------------------------------------------------------------
// Toestand
// ---------------------------------------------------------------------------

let pagina = null;     // pagina_publiek
let slots = [];        // vrije_slots: [{ start, eind, plaatsen }]
let actieveDag = null; // "2026-10-31"
let gekozen = null;    // slot
let stap = 1;
let melding = null;    // tekst boven de tijdsloten (bv. slot net volzet)
let bevestigingsscherm = null; // alleen in het voorbeeld (de echte tekst komt van de server)

const $ = {};          // vaste elementen

function bouw() {
  const app = document.getElementById("app");
  app.replaceChildren();
  if (voorbeeld) app.append(el("div", { className: "voorbeeld-band" }, "Voorbeeld: zo zien bezoekers deze pagina. Hier wordt niet echt geboekt."));
  $.pand = el("section", { className: "pand", "aria-label": "Het pand" });
  $.plannen = el("section", { className: "plannen", id: "plannen", "aria-labelledby": "plannen-kop" });
  app.append(kop(), el("main", { className: "boeking" }, $.pand, $.plannen), voet());
}

// ---------------------------------------------------------------------------
// Het pand
// ---------------------------------------------------------------------------

const prijs = (n) => `${getal(n)} euro`;

function dagenTekst(dagen) {
  if (dagen.length === 1) return datumLang(dagen[0]);
  if (dagen.length <= 3) return dagen.map((d) => datumKaal(d)).join(", ");
  return `${datumKaal(dagen[0])} tot ${datumKaal(dagen.at(-1))}`;
}

function tekenPand() {
  const { straat, gemeente } = splitsAdres(pagina.adres);
  const dagen = pagina.komende_dagen || [];
  const feiten = el("dl", { className: "feiten" });
  if (dagen.length) {
    feiten.append(el("div", {}, el("dt", { className: "label" }, dagen.length === 1 ? "Homerun" : "Bezoekdagen"),
      el("dd", {}, dagenTekst(dagen))));
  }
  if (pagina.kickoff_prijs) {
    feiten.append(el("div", {}, el("dt", { className: "label" }, "Kick-off prijs"), el("dd", {}, prijs(pagina.kickoff_prijs))));
  }
  $.pand.replaceChildren(
    // foto_url komt alleen van het beheer (voorbeeld); anders de foto uit de bucket.
    boogFoto(pagina.foto_url || fotoUrl(cfg, pagina.foto_pad), `Foto van ${pagina.adres}`, "pand-foto"),
    el("div", { className: "pand-info" },
      gemeente ? el("p", { className: "oog" }, gemeente.replace(/^\d{4}\s*/, "")) : null,
      el("h1", {}, straat || pagina.adres),
      gemeente ? el("p", { className: "klein" }, gemeente) : null,
      feiten.children.length ? feiten : null,
      pagina.pand_url ? el("a", { className: "link pand-link", href: pagina.pand_url, target: "_blank", rel: "noopener" },
        "Meer info over het pand", icoon("pijlRechts")) : null));
  document.title = `${straat || pagina.adres} · Afspraak maken · Henry Houser`;
}

// ---------------------------------------------------------------------------
// Stappen
// ---------------------------------------------------------------------------

function stappenBalk() {
  const namen = ["Startuur", "Gegevens", "Bevestigd"];
  return el("ol", { className: "stappen", "aria-label": "Stappen" }, namen.map((n, i) => el("li", {
    className: i + 1 < stap ? "klaar" : "",
    "aria-current": i + 1 === stap ? "step" : null,
  }, el("b", {}, `0${i + 1}`), n)));
}

function teken() {
  const inhoud = stap === 1 ? stap1() : stap === 2 ? stap2() : stap3();
  $.plannen.replaceChildren(stappenBalk(), ...[].concat(inhoud));
}

function gaNaar(n, { focus = true } = {}) {
  stap = n;
  teken();
  if (!focus) return;
  const kop = $.plannen.querySelector("h2");
  kop?.setAttribute("tabindex", "-1");
  kop?.focus({ preventScroll: true });
  const top = $.plannen.getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * 0.6) $.plannen.scrollIntoView({ behavior: "smooth", block: "start" });
}

// Stap 1: startuur kiezen ------------------------------------------------------

function dagdeel(iso) {
  const h = Number(uur(iso).slice(0, 2));
  return h < 12 ? "Voormiddag" : h < 17 ? "Namiddag" : "Avond";
}

function contactKnoppen() {
  return el("div", { className: "knoppen" },
    el("a", { className: "knop aqua", href: telLink(KANTOOR.telefoon) }, icoon("telefoon"), `Bel ${KANTOOR.telefoon}`),
    el("a", { className: "knop lijn", href: `mailto:${KANTOOR.email}?subject=${encodeURIComponent(`Bezoek ${pagina.adres}`)}` },
      icoon("mail"), "Mail ons"));
}

function stap1() {
  const delen = [];
  if (pagina.intro) {
    const intro = el("div", { className: "tekst intro" });
    intro.innerHTML = render(pagina.intro);
    delen.push(intro);
  }

  if (!slots.length) {
    const geenDagen = !(pagina.komende_dagen || []).length;
    delen.push(el("div", { className: "leeg-blok" },
      el("h2", { id: "plannen-kop" }, geenDagen ? "Er zijn nog geen bezoekmomenten" : "Alle startmomenten zijn volzet"),
      el("p", { className: "tekst" }, geenDagen
        ? "Zodra de bezoekmomenten vastliggen, kies je hier je startuur. Wil je nu al iets vragen? Neem gerust contact met ons op."
        : "Het kan zijn dat er nog een plaatsje vrijkomt, kijk dus gerust later nog eens. Of neem contact met ons op, dan bekijken we samen wat kan."),
      contactKnoppen()));
    return delen;
  }

  const dagen = [...new Set(slots.map((s) => dagSleutel(s.start)))];
  if (!dagen.includes(actieveDag)) actieveDag = dagen[0];
  const metPlaatsen = slots.some((s) => s.plaatsen > 1);

  delen.push(el("h2", { id: "plannen-kop" }, "Kies je startuur"),
    el("p", { className: "onder-kop" }, dagen.length === 1
      ? cap(datumLang(actieveDag))
      : "Kies eerst een dag, daarna je startuur."));
  if (melding) delen.push(el("p", { className: "fout-blok", role: "alert" }, melding));

  if (dagen.length > 1) {
    const rij = el("div", { className: "dagen", role: "tablist", "aria-label": "Dagen" });
    for (const d of dagen) {
      const aantal = slots.filter((s) => dagSleutel(s.start) === d).length;
      const [naam, nr, maand] = datumKaal(d, { weekday: "short", day: "numeric", month: "short" }).split(" ");
      const knop = el("button", {
        type: "button", className: "dag", role: "tab", "aria-selected": String(d === actieveDag),
        "aria-label": `${cap(datumLang(d))}, ${aantal} startmomenten vrij`,
      }, el("span", { className: "dag-naam" }, naam), el("span", { className: "dag-nr" }, nr), el("span", { className: "dag-maand" }, maand),
        el("span", { className: "dag-vrij" }, aantal <= 3 ? `nog ${aantal} vrij` : `${aantal} vrij`));
      knop.addEventListener("click", () => {
        actieveDag = d;
        melding = null;
        teken();
        $.plannen.querySelector(`.dag[aria-selected="true"]`)?.focus();
      });
      rij.append(knop);
    }
    delen.push(rij);
  }

  const vandaag = slots.filter((s) => dagSleutel(s.start) === actieveDag);
  for (const deel of ["Voormiddag", "Namiddag", "Avond"]) {
    const lijst = vandaag.filter((s) => dagdeel(s.start) === deel);
    if (!lijst.length) continue;
    delen.push(el("div", { className: "dagdeel" },
      el("h3", {}, deel),
      el("div", { className: "slots" }, lijst.map((s) => {
        const knop = el("button", {
          type: "button", className: "slot", "aria-pressed": String(gekozen?.start === s.start),
          "aria-label": `${startTekst(s.start)}${metPlaatsen ? `, nog ${s.plaatsen} ${s.plaatsen === 1 ? "plaats" : "plaatsen"}` : ""}`,
        }, uur(s.start), metPlaatsen ? el("small", {}, `${s.plaatsen} ${s.plaatsen === 1 ? "plaats" : "plaatsen"}`) : null);
        knop.addEventListener("click", () => kies(s));
        return knop;
      }))));
  }
  return delen;
}

function kies(s) {
  gekozen = s;
  melding = null;
  log("slot_gekozen");
  gaNaar(2);
}

// Stap 2: gegevens -------------------------------------------------------------

const AUTO = { voornaam: "given-name", familienaam: "family-name", email: "email", telefoon: "tel" };
const PAREN = [["voornaam", "familienaam"], ["email", "telefoon"]];
const LEEG = {
  voornaam: "Vul je voornaam in.", familienaam: "Vul je familienaam in.",
  email: "Vul je e-mailadres in.", telefoon: "Vul je telefoonnummer in.", tel: "Vul je telefoonnummer in.",
};
const ingevuld = {};   // waarden blijven staan bij terugkeren of hertekenen

function veld(v) {
  const id = `veld-${v.key}`;
  const foutId = `${id}-fout`;
  let input;
  if (v.type === "select") {
    input = el("select", { id, name: v.key });
    input.append(el("option", { value: "", disabled: true, selected: true }, "Maak een keuze"),
      ...(v.opties || []).map((o) => el("option", { value: o }, o)));
  } else if (v.type === "textarea") {
    input = el("textarea", { id, name: v.key, rows: 4 });
  } else if (v.type === "checkbox") {
    input = el("input", { type: "checkbox", id, name: v.key });
  } else {
    input = el("input", {
      type: ["email", "tel"].includes(v.type) ? v.type : "text", id, name: v.key,
      autocomplete: AUTO[v.key] || "off", inputMode: v.type === "tel" ? "tel" : null,
    });
  }
  if (v.verplicht) input.required = true;
  input.setAttribute("aria-describedby", foutId);
  if (ingevuld[v.key] !== undefined) {
    if (v.type === "checkbox") input.checked = !!ingevuld[v.key];
    else input.value = ingevuld[v.key];
  }
  const bewaar = () => {
    ingevuld[v.key] = v.type === "checkbox" ? input.checked : input.value;
    if (input.getAttribute("aria-invalid") === "true") controleerVeld(v, input);
  };
  input.addEventListener(v.type === "select" || v.type === "checkbox" ? "change" : "input", bewaar);
  const fout = el("p", { className: "fout-tekst", id: foutId, hidden: true });

  if (v.type === "checkbox") {
    return el("div", { className: "veld" }, el("label", { className: "vinkje", for: id }, input, el("span", {}, v.label)), fout);
  }
  return el("div", { className: "veld" },
    el("label", { for: id }, v.label, v.verplicht ? el("span", { className: "ster", "aria-hidden": "true" }, " *") : null),
    input, fout);
}

function controleerVeld(v, input) {
  const leeg = v.type === "checkbox" ? !input.checked : input.value.trim() === "";
  let tekst = null;
  if (v.verplicht && leeg) {
    tekst = v.type === "checkbox" ? "Vink dit aan om verder te gaan."
      : v.type === "select" ? "Maak een keuze."
      : LEEG[v.key] || LEEG[v.type] || "Vul dit veld in.";
  } else if (!leeg && v.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(input.value.trim())) {
    tekst = "Dit e-mailadres klopt niet helemaal.";
  } else if (!leeg && v.type === "tel" && input.value.replace(/[^0-9]/g, "").length < 8) {
    tekst = "Dit telefoonnummer is te kort.";
  }
  input.setAttribute("aria-invalid", String(!!tekst));
  const fout = document.getElementById(`veld-${v.key}-fout`);
  fout.textContent = tekst || "";
  fout.hidden = !tekst;
  return !tekst;
}

function stap2() {
  const velden = pagina.formuliervelden || [];
  const form = el("form", { className: "formulier", noValidate: true });
  for (let i = 0; i < velden.length; i++) {
    const v = velden[i];
    const w = velden[i + 1];
    if (w && PAREN.some(([a, b]) => v.key === a && w.key === b)) {
      form.append(el("div", { className: "rij2" }, veld(v), veld(w)));
      i++;
    } else form.append(veld(v));
  }
  const hp = el("div", { className: "hp", "aria-hidden": "true" },
    el("label", {}, "Website", el("input", { type: "text", name: "website", tabIndex: -1, autocomplete: "off" })));
  const fout = el("p", { className: "fout-blok", role: "alert", hidden: true });
  const knop = el("button", { type: "submit", className: "knop groot" }, "Bevestig mijn bezoek");
  form.append(hp,
    el("p", { className: "privacy" }, "We gebruiken je gegevens alleen om je bezoek te regelen en je op de hoogte te houden over dit pand."),
    fout, el("div", { className: "formulier-acties" }, knop));
  form.addEventListener("submit", (e) => verstuur(e, form, knop, fout));

  const wijzig = el("button", { type: "button", className: "link" }, "Wijzig");
  wijzig.addEventListener("click", () => gaNaar(1));
  return [
    el("h2", { id: "plannen-kop" }, "Jouw gegevens"),
    el("p", { className: "onder-kop" }, "Nog één stap: laat weten wie er komt."),
    el("div", { className: "gekozen" }, icoon("kalender"),
      el("div", { className: "gekozen-tekst" },
        el("strong", {}, `${cap(datumLang(dagSleutel(gekozen.start)))} om ${uur(gekozen.start)}`),
        el("span", {}, pagina.adres)),
      wijzig),
    form,
  ];
}

async function verstuur(e, form, knop, fout) {
  e.preventDefault();
  fout.hidden = true;
  const velden = pagina.formuliervelden || [];
  let eerste = null;
  for (const v of velden) {
    const input = form.elements[v.key];
    if (!controleerVeld(v, input) && !eerste) eerste = input;
  }
  if (eerste) {
    eerste.focus();
    return;
  }
  const antwoorden = {};
  for (const v of velden) {
    const input = form.elements[v.key];
    antwoorden[v.key] = v.type === "checkbox" ? input.checked : input.value.trim();
  }

  if (voorbeeld) {
    klaar({
      start: gekozen.start,
      scherm: vulIn(bevestigingsscherm || "Hallo {voornaam}! Jouw afspraak ligt vast voor {start}.", {
        voornaam: antwoorden.voornaam || "Sofie", familienaam: antwoorden.familienaam || "",
        adres: pagina.adres, titel: pagina.titel, start: startTekst(gekozen.start),
        datum: datumLang(dagSleutel(gekozen.start)), start_uur: uur(gekozen.start),
      }),
      agenda: null,
    });
    return;
  }

  knop.disabled = true;
  knop.textContent = "Even geduld…";
  try {
    const { status, data } = await api.boek({
      slug, start: gekozen.start, antwoorden, website: form.elements.website.value,
      laad_id: laadId, kanaal, apparaat,
    });
    if (status === 409) {
      slots = await api.slots(slug).catch(() => slots.filter((s) => s.start !== gekozen.start));
      gekozen = null;
      melding = "Net te laat: dit startuur is intussen door iemand anders gekozen. Kies een ander moment.";
      gaNaar(1);
      return;
    }
    if (status < 200 || status >= 300) throw new Error(data.melding || "Er liep iets mis. Probeer het opnieuw.");
    klaar(data);
  } catch (err) {
    fout.textContent = err.message || "Er liep iets mis. Probeer het opnieuw.";
    fout.hidden = false;
  } finally {
    knop.disabled = false;
    knop.textContent = "Bevestig mijn bezoek";
  }
}

// Stap 3: bevestiging ----------------------------------------------------------

let resultaat = null;

function klaar(data) {
  resultaat = data;
  gaNaar(3);
}

function stap3() {
  const d = resultaat;
  const scherm = el("div", { className: "tekst" });
  scherm.innerHTML = render(d.scherm || "");
  const route = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(pagina.adres)}`;
  const agenda = d.agenda
    ? [["Google Agenda", d.agenda.google, true], ["Outlook", d.agenda.office365, true], ["Apple of andere (.ics)", d.agenda.ics, false]]
    : [["Google Agenda", "#"], ["Outlook", "#"], ["Apple of andere (.ics)", "#"]];
  const vink = el("div", { className: "vink-rond" }, icoon("vink"));
  return [
    el("div", { className: "klaar-kop" }, vink, el("h2", { id: "plannen-kop" }, "Je bezoek is ingepland")),
    scherm,
    el("div", { className: "afspraak-kaart" },
      el("span", { className: "label" }, "Jouw startuur"),
      el("span", { className: "wanneer" }, cap(datumLang(dagSleutel(d.start)))),
      el("span", { className: "uur" }, uur(d.start)),
      el("span", { className: "waar" }, pagina.adres),
      el("a", { className: "link route", href: route, target: "_blank", rel: "noopener" }, "Plan je route")),
    el("p", { className: "label" }, "Zet het in je agenda"),
    el("div", { className: "agenda-knoppen" }, agenda.map(([t, href, nieuw]) =>
      el("a", { className: "knop aqua klein", href, target: nieuw ? "_blank" : null, rel: nieuw ? "noopener" : null }, icoon("kalender"), t))),
    el("p", { className: "na-tekst" },
      "Je krijgt ook een bevestigingsmail met alle info. Kan je toch niet komen? Via de knop in die mail annuleer je in één klik, zodat iemand anders je startuur kan gebruiken."),
  ];
}

// ---------------------------------------------------------------------------
// Niet gevonden
// ---------------------------------------------------------------------------

function nietGevonden(titel, tekst) {
  const app = document.getElementById("app");
  const blok = el("main", { className: "niet-gevonden" });
  blok.append(boogLeeg(), el("h1", {}, titel), el("p", { className: "tekst" }, tekst),
    el("a", { className: "knop", href: KANTOOR.aanbod }, "Bekijk ons aanbod"));
  app.replaceChildren(kop(), blok, voet());
}

// ---------------------------------------------------------------------------
// Voorbeeld in het beheer: inhoud live bijwerken
// ---------------------------------------------------------------------------

function voorbeeldSlot() {
  if (slots.length) return slots[0];
  const d = new Date(Date.now() + 2 * 864e5);
  d.setUTCHours(8, 0, 0, 0);
  return { start: d.toISOString(), plaatsen: 1 };
}

if (voorbeeld) {
  window.addEventListener("message", (e) => {
    if (e.source !== window.parent || window.parent === window) return;
    const d = e.data;
    if (!d || d.type !== "hh-voorbeeld") return;
    const eerste = !pagina;
    if (d.pagina) pagina = { ...(pagina || {}), ...d.pagina };
    if (!pagina) return;
    if (Array.isArray(d.slots)) slots = d.slots;
    if (d.bevestigingsscherm !== undefined) bevestigingsscherm = d.bevestigingsscherm;
    if (eerste || !$.pand) bouw();
    tekenPand();
    if (d.stap && d.stap !== stap) {
      if (d.stap >= 2 && !gekozen) gekozen = voorbeeldSlot();
      if (d.stap === 3) {
        resultaat = {
          start: gekozen.start,
          scherm: vulIn(bevestigingsscherm || "Hallo {voornaam}! Jouw afspraak ligt vast voor {start}.", {
            voornaam: "Sofie", familienaam: "Vandamme", adres: pagina.adres, titel: pagina.titel,
            start: startTekst(gekozen.start), datum: datumLang(dagSleutel(gekozen.start)), start_uur: uur(gekozen.start),
          }),
          agenda: null,
        };
      }
      stap = d.stap;
    }
    if (stap === 3 && !resultaat) stap = 1;
    teken();
  });
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start() {
  if (voorbeeld && window.parent !== window) window.parent.postMessage({ type: "hh-klaar" }, "*");
  if (!slug) {
    if (!voorbeeld) location.replace(KANTOOR.aanbod);
    return;
  }
  try {
    const [p, s] = await Promise.all([api.pagina(slug), api.slots(slug).catch(() => [])]);
    if (!p) {
      // In het voorbeeld kan de pagina offline staan: het beheer stuurt de inhoud zelf door.
      if (voorbeeld) return;
      return nietGevonden("Deze pagina bestaat niet (meer)",
        "Misschien is het pand intussen verkocht of is de link veranderd. Bekijk ons actuele aanbod, of neem contact met ons op.");
    }
    if (pagina) return; // het beheer was sneller
    pagina = p;
    slots = s || [];
    bouw();
    tekenPand();
    teken();
    log("bekeken");
  } catch (err) {
    console.error(err);
    nietGevonden("Even geduld…", "De pagina kon niet geladen worden. Probeer het straks opnieuw of bel ons op " + KANTOOR.telefoon + ".");
  }
}

start();
