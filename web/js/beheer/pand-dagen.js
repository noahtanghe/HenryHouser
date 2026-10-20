// Bezoekdagen van één adres: wanneer bezoekers kunnen komen. Eén Homerun-dag of een periode
// met weekdagen, telkens met de uren. Daaronder de regels voor de startmomenten (duur, om de
// hoeveel minuten, plaatsen per startmoment, hoe lang op voorhand).

import { meter } from "../grafieken.js";
import { icoon } from "../iconen.js";
import { cap, dagSleutel, datumKaal, datumLang, el, getal, uur, vandaagSleutel } from "../tekst.js";
import { dagenVan, kortUur, minuten, startmomenten } from "./datum.js";
import { staat } from "./staat.js";
import { aantal, bevestig, datumBlad, foutTekst, ikoonKnop, leeg, openDialoog, sectie, segment, toast, veld } from "./ui.js";

const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const WD_LANG = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag", "zondag"];
const jaarErbij = (d) => (d.slice(0, 4) !== vandaagSleutel().slice(0, 4) ? ` ${d.slice(0, 4)}` : "");

/** Formulier voor één rij beschikbaarheid (nieuw of wijzigen). */
function dagForm(p, rij = null) {
  let soort = rij && rij.datum_van !== rij.datum_tot ? "periode" : "dag";
  const weekdagen = new Set(rij?.weekdagen || [1, 2, 3, 4, 5, 6, 7]);
  const dag = el("input", { type: "date", value: rij?.datum_van || "" });
  const vanD = el("input", { type: "date", value: rij?.datum_van || "" });
  const totD = el("input", { type: "date", value: rij?.datum_tot || "" });
  const van = el("input", { type: "time", step: 300, value: kortUur(rij?.van || "09:00") });
  const tot = el("input", { type: "time", step: 300, value: kortUur(rij?.tot || "19:00") });
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

function alsEind(start, duur) {
  const m = minuten(start) + duur;
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

export async function toon(paneel, ctx) {
  const lijstSectie = el("div");
  const toevoegSectie = el("div");
  const instellingenSectie = el("div");

  function telRij(r) {
    const p = ctx.pagina;
    const dagen = dagenVan(r);
    const starts = startmomenten(kortUur(r.van), kortUur(r.tot), p.duur_min, p.slot_interval_min);
    const set = new Set(dagen);
    const geboekt = ctx.boekingen.filter((b) => b.status !== "geannuleerd" && set.has(dagSleutel(b.start))
      && uur(b.start) >= kortUur(r.van) && uur(b.start) < kortUur(r.tot)).length;
    return { dagen, starts, geboekt, capaciteit: dagen.length * starts.length * p.max_per_slot };
  }

  function rijEl(r) {
    const t = telRij(r);
    const enkel = r.datum_van === r.datum_tot;
    const wanneer = enkel ? `${cap(datumLang(r.datum_van))}${jaarErbij(r.datum_van)}`
      : `${datumKaal(r.datum_van)} tot ${datumKaal(r.datum_tot)}${jaarErbij(r.datum_tot)}`;
    const wd = enkel ? null : r.weekdagen.length === 7 ? "elke dag" : [...r.weekdagen].sort().map((d) => WD[d - 1]).join(", ");
    const wijzig = ikoonKnop("potlood", "Wijzigen");
    const weg = ikoonKnop("prullenbak", "Verwijderen", "gevaar");
    wijzig.addEventListener("click", () => wijzigen(r));
    weg.addEventListener("click", () => verwijderen(r, t));
    return el("li", { className: "dag-rij" },
      datumBlad(r.datum_van),
      el("div", { className: "dag-rij-tekst" },
        el("strong", {}, wanneer),
        el("span", {}, [`${kortUur(r.van)} tot ${kortUur(r.tot)}`, wd, enkel ? null : aantal(t.dagen.length, "dag", "dagen")].filter(Boolean).join(" · "))),
      el("div", { className: "dag-rij-cijfers" },
        el("span", {}, `${aantal(t.starts.length, "startmoment", "startmomenten")}${enkel ? "" : " per dag"}`),
        meter(t.geboekt, t.capaciteit, { label: `${t.geboekt} van ${t.capaciteit} plaatsen geboekt` }),
        el("span", { className: "klein" }, `${getal(t.geboekt)} van ${getal(t.capaciteit)} geboekt`)),
      el("div", { className: "dag-rij-acties" }, wijzig, weg));
  }

  function tekenLijst() {
    const vandaag = vandaagSleutel();
    const rijen = ctx.beschikbaarheid;
    const komend = rijen.filter((r) => r.datum_tot >= vandaag);
    const voorbij = rijen.filter((r) => r.datum_tot < vandaag).reverse();
    lijstSectie.replaceChildren(sectie({
      titel: "Bezoekdagen",
      sub: ctx.pagina.actief ? "Bezoekers kiezen een startmoment op deze dagen." : "De pagina staat offline: bezoekers kunnen nog niet boeken.",
    },
    komend.length ? el("ul", { className: "dag-rijen" }, komend.map(rijEl))
      : leeg({ klein: true, titel: "Geen komende bezoekdagen", tekst: "Plan hieronder een Homerun of een periode in." }),
    voorbij.length ? el("details", { className: "voorbij-dagen" },
      el("summary", {}, `Voorbije bezoekdagen (${voorbij.length})`),
      el("ul", { className: "dag-rijen" }, voorbij.map(rijEl))) : null));
  }

  function tekenToevoegen() {
    const f = dagForm(ctx.pagina);
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const knop = el("button", { type: "submit", className: "knop zwart klein" }, icoon("plus"), "Bezoekdag toevoegen");
    const form = el("form", { noValidate: true }, f.blok, fout, el("div", { className: "form-acties" }, knop));
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const melding = f.controle();
      fout.textContent = melding || "";
      fout.hidden = !melding;
      if (melding) return;
      knop.disabled = true;
      try {
        await staat.api.beschikbaarheidNieuw({ pagina_id: ctx.id, ...f.waarden() });
        await ctx.herlaadBeschikbaarheid();
        tekenLijst();
        tekenToevoegen();
        toast(ctx.pagina.actief ? "Bezoekdag toegevoegd. Bezoekers kunnen meteen boeken." : "Bezoekdag toegevoegd. De pagina staat nog offline.");
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
    toevoegSectie.replaceChildren(sectie({ titel: "Bezoekdag toevoegen", sub: "Een Homerun op één dag, of een periode met vaste weekdagen." }, form));
  }

  async function wijzigen(r) {
    const f = dagForm(ctx.pagina, r);
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const knop = el("button", { type: "button", className: "knop zwart klein" }, "Bewaren");
    const annuleer = el("button", { type: "button", className: "knop lijn klein" }, "Annuleren");
    const { sluit } = openDialoog({
      titel: "Bezoekdag wijzigen", breed: true,
      inhoud: [f.blok, el("p", { className: "klein" }, "Bestaande afspraken blijven staan, ook als ze buiten de nieuwe uren vallen."), fout],
      voet: [annuleer, knop],
    });
    annuleer.addEventListener("click", () => sluit());
    knop.addEventListener("click", async () => {
      const melding = f.controle();
      fout.textContent = melding || "";
      fout.hidden = !melding;
      if (melding) return;
      knop.disabled = true;
      try {
        await staat.api.beschikbaarheidWijzigen(r.id, f.waarden());
        await ctx.herlaadBeschikbaarheid();
        sluit();
        tekenLijst();
        toast("Bezoekdag gewijzigd.");
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
  }

  async function verwijderen(r, t) {
    const komend = r.datum_tot >= vandaagSleutel();
    if (!(await bevestig({
      titel: "Bezoekdag verwijderen?",
      tekst: [
        komend ? "Bezoekers kunnen op deze dag(en) niet meer boeken." : "Deze voorbije bezoekdag telt dan niet meer mee in de bezetting.",
        t.geboekt ? `De ${aantal(t.geboekt, "afspraak", "afspraken")} op deze dag(en) blijven staan. Annuleer ze apart als het bezoek niet doorgaat.` : null,
      ].filter(Boolean),
      ja: "Verwijderen", gevaar: true,
    }))) return;
    try {
      await staat.api.beschikbaarheidWeg(r.id);
      await ctx.herlaadBeschikbaarheid();
      tekenLijst();
      toast("Bezoekdag verwijderd.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    }
  }

  function tekenInstellingen() {
    const p = ctx.pagina;
    const getalVeld = (waarde, min, max) => el("input", { type: "number", inputMode: "numeric", min, max, step: 1, value: waarde });
    const duur = getalVeld(p.duur_min, 5, 480);
    const interval = getalVeld(p.slot_interval_min, 5, 480);
    const plaatsen = getalVeld(p.max_per_slot, 1, 50);
    const vooraf = getalVeld(p.min_minuten_vooraf, 0, 10080);
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const knop = el("button", { type: "submit", className: "knop zwart klein", disabled: true }, "Bewaren");
    const velden = { duur_min: duur, slot_interval_min: interval, max_per_slot: plaatsen, min_minuten_vooraf: vooraf };
    const gewijzigd = () => Object.entries(velden).some(([k, i]) => Number(i.value) !== p[k]);
    staat.vuil = gewijzigd;
    const form = el("form", { noValidate: true },
      el("div", { className: "velden twee" },
        veld({ label: "Duur van een bezoek (minuten)", input: duur, hulp: "Bepaalt het laatste startmoment en de lengte van de agenda-afspraak." }),
        veld({ label: "Om de hoeveel minuten een startmoment", input: interval, hulp: "Gelijk aan de duur: bezoeken volgen elkaar op zonder overlap." }),
        veld({ label: "Bezoekers per startmoment", input: plaatsen, hulp: "Meer dan 1? Dan zien bezoekers hoeveel plaatsen er nog vrij zijn." }),
        veld({ label: "Minstens zoveel minuten op voorhand boeken", input: vooraf, hulp: "Later boeken kan alleen nog via het beheer." })),
      fout, el("div", { className: "form-acties" }, knop));
    form.addEventListener("input", () => (knop.disabled = !gewijzigd()));
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
        tekenInstellingen();
        tekenLijst();
        tekenToevoegen();
        toast("Bewaard. De startmomenten zijn aangepast.");
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
    instellingenSectie.replaceChildren(sectie({
      titel: "Startmomenten",
      sub: "Geldt voor alle bezoekdagen van dit adres. Bestaande afspraken blijven staan.",
    }, form));
  }

  paneel.replaceChildren(el("div", { className: "raster-dagen" },
    el("div", { className: "raster-kolom" }, lijstSectie, toevoegSectie),
    el("div", { className: "raster-kolom" }, instellingenSectie)));
  tekenLijst();
  tekenToevoegen();
  tekenInstellingen();
}
