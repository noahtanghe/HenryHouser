// Bezoekdagen en startmomenten bewerken: gedeeld door het tabblad Bezoekdagen en de lijst
// "Klaar om te publiceren?" op het overzicht van een adres (daar in een dialoog, zonder van
// pagina te wisselen).

import { el, vandaagSleutel } from "../tekst.js";
import { dagenVan, kortUur, minuten, startmomenten } from "./datum.js";
import { staat } from "./staat.js";
import { aantal, foutTekst, openDialoog, segment, toast, veld } from "./ui.js";

const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const WD_LANG = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];

/** Standaarduren van een Homerun (zelfde als monday_plan_bezoekdag() in de databank). */
export const STANDAARD_VAN = "09:00";
export const STANDAARD_TOT = "19:00";

export function alsEind(start, duur) {
  const m = minuten(start) + duur;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** "Bezoeken van 40 minuten, om de 40 minuten" (+ plaatsen als dat meer dan 1 is). */
export function startmomentenTekst(p) {
  const delen = [p.duur_min === p.slot_interval_min
    ? `Bezoeken van ${p.duur_min} minuten, aansluitend`
    : `Bezoeken van ${p.duur_min} minuten, om de ${p.slot_interval_min} minuten een startmoment`];
  if (p.max_per_slot > 1) delen.push(`${p.max_per_slot} bezoekers per startmoment`);
  return delen.join(" · ");
}

/** Formulier voor één rij beschikbaarheid (nieuw of wijzigen). */
export function dagForm(p, rij = null, voorstel = null) {
  let soort = rij && rij.datum_van !== rij.datum_tot ? "periode" : "dag";
  const weekdagen = new Set(rij?.weekdagen || [1, 2, 3, 4, 5, 6, 7]);
  const dag = el("input", { type: "date", value: rij?.datum_van || voorstel || "" });
  const vanD = el("input", { type: "date", value: rij?.datum_van || "" });
  const totD = el("input", { type: "date", value: rij?.datum_tot || "" });
  const van = el("input", { type: "time", step: 300, value: kortUur(rij?.van || STANDAARD_VAN) });
  const tot = el("input", { type: "time", step: 300, value: kortUur(rij?.tot || STANDAARD_TOT) });
  if (!rij) for (const i of [dag, vanD, totD]) i.min = vandaagSleutel();

  const soortRij = el("div", {});
  const datums = el("div", { className: "datums" });
  const wdRij = el("div", { className: "weekdagen", role: "group", "aria-label": "Op welke weekdagen" });
  const voorbeeld = el("div", { className: "starts-voorbeeld", "aria-live": "polite" });

  function teken() {
    soortRij.replaceChildren(segment({
      label: "Soort", actief: soort,
      opties: [{ waarde: "dag", tekst: "Eén dag" }, { waarde: "periode", tekst: "Meerdere dagen" }],
      opKies: (w) => {
        soort = w;
        teken();
        (soort === "dag" ? dag : vanD).focus();
      },
    }));
    datums.replaceChildren(...(soort === "dag"
      ? [veld({ label: "Datum", input: dag }), veld({ label: "Van", input: van }), veld({ label: "Tot", input: tot })]
      : [veld({ label: "Eerste dag", input: vanD }), veld({ label: "Laatste dag", input: totD }),
        veld({ label: "Van", input: van }), veld({ label: "Tot", input: tot })]));
    wdRij.hidden = soort === "dag";
    wdRij.replaceChildren(el("span", { className: "veld-label" }, "Op"), ...WD.map((w, i) => {
      const k = el("button", { type: "button", className: "wd", "aria-pressed": String(weekdagen.has(i + 1)), "aria-label": WD_LANG[i] }, w);
      k.addEventListener("click", () => {
        if (weekdagen.has(i + 1)) weekdagen.delete(i + 1);
        else weekdagen.add(i + 1);
        k.setAttribute("aria-pressed", String(weekdagen.has(i + 1)));
        tekenVoorbeeld();
      });
      return k;
    }));
    tekenVoorbeeld();
  }

  function waarden() {
    const enkel = soort === "dag";
    return {
      datum_van: enkel ? dag.value : vanD.value,
      datum_tot: enkel ? dag.value : totD.value,
      van: van.value,
      tot: tot.value,
      weekdagen: enkel ? [1, 2, 3, 4, 5, 6, 7] : [...weekdagen].sort(),
    };
  }

  function controle() {
    const w = waarden();
    if (!w.datum_van) return soort === "dag" ? "Kies een datum." : "Kies de eerste dag.";
    if (!w.datum_tot) return "Kies de laatste dag.";
    if (w.datum_tot < w.datum_van) return "De laatste dag ligt voor de eerste.";
    if (!w.weekdagen.length) return "Kies minstens één weekdag.";
    if (!w.van || !w.tot || w.tot <= w.van) return "Het einduur moet na het beginuur liggen.";
    if (!startmomenten(w.van, w.tot, p.duur_min, p.slot_interval_min).length) {
      return `Tussen ${w.van} en ${w.tot} past geen bezoek van ${p.duur_min} minuten.`;
    }
    if (!dagenVan(w).length) return "In deze periode valt geen enkele van de gekozen weekdagen.";
    return null;
  }

  function tekenVoorbeeld() {
    const w = waarden();
    const starts = w.van && w.tot ? startmomenten(w.van, w.tot, p.duur_min, p.slot_interval_min) : [];
    const n = w.datum_van && w.datum_tot && w.datum_tot >= w.datum_van ? dagenVan(w).length : soort === "dag" ? 1 : 0;
    if (!starts.length) {
      voorbeeld.replaceChildren(el("p", { className: "klein" }, "Kies de uren om de startmomenten te zien."));
      return;
    }
    voorbeeld.replaceChildren(
      el("p", { className: "klein" },
        `${aantal(starts.length, "startmoment", "startmomenten")}${n > 1 ? ` per dag, ${aantal(n, "dag", "dagen")}` : ""}`,
        ` · ${aantal(starts.length * Math.max(1, n) * p.max_per_slot, "plaats", "plaatsen")} in totaal. Laatste start om ${starts.at(-1)}, bezoek tot ${alsEind(starts.at(-1), p.duur_min)}.`),
      el("ul", { className: "starts" }, starts.map((s) => el("li", {}, s))));
  }

  for (const i of [dag, vanD, totD, van, tot]) i.addEventListener("input", tekenVoorbeeld);
  teken();
  return {
    blok: el("div", { className: "dag-form" }, soortRij, datums, wdRij, voorbeeld),
    waarden, controle,
    focus: () => (soort === "dag" ? dag : vanD).focus(),
  };
}

/**
 * Bezoekdag toevoegen (rij = null) of wijzigen in een dialoog. Bewaart, herlaadt de
 * beschikbaarheid van het adres en geeft true als er iets veranderde.
 */
export function dagDialoog(ctx, { rij = null, voorstel = null } = {}) {
  return new Promise((klaar) => {
    const f = dagForm(ctx.pagina, rij, voorstel);
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const knop = el("button", { type: "button", className: "knop zwart klein" }, rij ? "Bewaren" : "Inplannen");
    const annuleer = el("button", { type: "button", className: "knop lijn klein" }, "Annuleren");
    let bewaard = false;
    const { sluit } = openDialoog({
      titel: rij ? "Bezoekdag wijzigen" : "Bezoekdag inplannen", breed: true,
      inhoud: [f.blok, rij ? el("p", { className: "klein" }, "Bestaande afspraken blijven staan, ook als ze buiten de nieuwe uren vallen.") : null, fout],
      voet: [annuleer, knop],
      opSluiten: () => klaar(bewaard),
    });
    annuleer.addEventListener("click", () => sluit());
    knop.addEventListener("click", async () => {
      const melding = f.controle();
      fout.textContent = melding || "";
      fout.hidden = !melding;
      if (melding) return;
      knop.disabled = true;
      try {
        if (rij) await staat.api.beschikbaarheidWijzigen(rij.id, f.waarden());
        else await staat.api.beschikbaarheidNieuw({ pagina_id: ctx.id, ...f.waarden() });
        await ctx.herlaadBeschikbaarheid();
        bewaard = true;
        sluit();
        toast(rij ? "Bezoekdag gewijzigd." : "Bezoekdag ingepland.");
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
    setTimeout(() => f.focus(), 0);
  });
}

/**
 * Formulier voor de startmomenten (duur, interval, plaatsen, hoe lang op voorhand).
 * opBewaard wordt opgeroepen na het bewaren. Geeft { form, gewijzigd }.
 */
export function startmomentenForm(ctx, { opBewaard, knopTekst = "Bewaren", altijdActief = false } = {}) {
  const p = ctx.pagina;
  const getalVeld = (waarde, min, max) => el("input", { type: "number", inputMode: "numeric", min, max, step: 1, value: waarde });
  const duur = getalVeld(p.duur_min, 5, 480);
  const interval = getalVeld(p.slot_interval_min, 5, 480);
  const plaatsen = getalVeld(p.max_per_slot, 1, 50);
  const vooraf = getalVeld(p.min_minuten_vooraf, 0, 10080);
  const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
  const knop = el("button", { type: "submit", className: "knop zwart klein", disabled: !altijdActief }, knopTekst);
  const velden = { duur_min: duur, slot_interval_min: interval, max_per_slot: plaatsen, min_minuten_vooraf: vooraf };
  const gewijzigd = () => Object.entries(velden).some(([k, i]) => Number(i.value) !== p[k]);
  const form = el("form", { noValidate: true },
    el("div", { className: "velden twee" },
      veld({ label: "Duur van een bezoek (minuten)", input: duur, hulp: "Bepaalt het laatste startmoment en de lengte van de agenda-afspraak." }),
      veld({ label: "Om de hoeveel minuten een startmoment", input: interval, hulp: "Gelijk aan de duur: bezoeken volgen elkaar op zonder overlap." }),
      veld({ label: "Bezoekers per startmoment", input: plaatsen, hulp: "Meer dan 1? Dan zien bezoekers hoeveel plaatsen er nog vrij zijn." }),
      veld({ label: "Minstens zoveel minuten op voorhand boeken", input: vooraf, hulp: "Later boeken kan alleen nog via het beheer." })),
    fout, el("div", { className: "form-acties" }, knop));
  form.addEventListener("input", () => (knop.disabled = !altijdActief && !gewijzigd()));
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const w = Object.fromEntries(Object.entries(velden).map(([k, i]) => [k, Number(i.value)]));
    const melding = !(w.duur_min >= 5 && w.duur_min <= 480) ? "Een bezoek duurt tussen 5 en 480 minuten."
      : !(w.slot_interval_min >= 5 && w.slot_interval_min <= 480) ? "Kies tussen 5 en 480 minuten tussen de startmomenten."
      : !(w.max_per_slot >= 1 && Number.isInteger(w.max_per_slot)) ? "Minstens 1 bezoeker per startmoment."
      : !(w.min_minuten_vooraf >= 0) ? "Vul 0 of meer minuten in." : null;
    fout.textContent = melding || "";
    fout.hidden = !melding;
    if (melding) return;
    knop.disabled = true;
    try {
      await ctx.bewaar(w);
      toast("Bewaard. De startmomenten zijn aangepast.");
      opBewaard?.();
    } catch (err) {
      fout.textContent = foutTekst(err);
      fout.hidden = false;
      knop.disabled = false;
    }
  });
  return { form, gewijzigd };
}

/** Startmomenten aanpassen in een dialoog. Geeft true als er bewaard werd. */
export function startmomentenDialoog(ctx) {
  return new Promise((klaar) => {
    let bewaard = false;
    let sluitDialoog = () => {};
    const { form } = startmomentenForm(ctx, {
      opBewaard: () => {
        bewaard = true;
        sluitDialoog();
      },
    });
    const { sluit } = openDialoog({
      titel: "Startmomenten", breed: true,
      inhoud: [el("p", { className: "dialoog-tekst" }, "Geldt voor alle bezoekdagen van dit adres. Bestaande afspraken blijven staan."), form],
      opSluiten: () => klaar(bewaard),
    });
    sluitDialoog = sluit;
  });
}
