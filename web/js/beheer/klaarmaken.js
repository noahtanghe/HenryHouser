// "Klaar om te publiceren?" bovenaan het overzicht van een adres: alles wat de pagina nog nodig
// heeft, op één plek en meteen bewerkbaar (foto kiezen, bezoekdag inplannen of aanpassen,
// startmomenten, prijs en link), zonder naar een ander tabblad te gaan.
//  - Concept uit Monday: de Homerun-dag en 40 minuten staan er normaal al (uit Monday);
//    meestal rest alleen de foto en de knop Publiceren.
//  - Gewone pagina zonder bezoekdag, foto of nog offline: zelfde lijst, met "Online zetten".

import { icoon } from "../iconen.js";
import { boogFoto } from "../kader.js";
import { cap, datumKaal, datumLang, el, getal, vandaagSleutel } from "../tekst.js";
import { dagDialoog, startmomentenDialoog, startmomentenTekst, STANDAARD_TOT, STANDAARD_VAN } from "./bezoekdag.js";
import { dagenVan, komendeDagen, kortUur, startmomenten } from "./datum.js";
import { fotoHerkomst, fotoOpladen, fotoVanPandsite } from "./foto.js";
import { staat } from "./staat.js";
import { aantal, foutTekst, openDialoog, sectie, teKoop, toast, veld } from "./ui.js";

const komendeRijen = (rijen) => rijen.filter((r) => r.datum_tot >= vandaagSleutel());

/** Wat er nog ontbreekt voor bezoekers kunnen boeken (verplichte punten). */
export function teDoen(p, beschikbaarheid) {
  return [
    { sleutel: "bezoekdag", ok: komendeDagen(beschikbaarheid).length > 0, tekst: "bezoekdag" },
    { sleutel: "foto", ok: !!p.foto_pad, tekst: "foto" },
  ];
}

/** Moet de lijst getoond worden? */
export function toonKlaarmaken(ctx) {
  const p = ctx.pagina;
  if (p.gearchiveerd) return false;
  if (p.concept) return true;
  if (ctx.fase() === "afgelopen") return false;
  return !p.actief || teDoen(p, ctx.beschikbaarheid).some((i) => !i.ok);
}

/**
 * Bouwt de lijst. opGepubliceerd wordt opgeroepen als de pagina online kwam (het overzicht
 * tekent zich dan opnieuw met de cijfers).
 */
export function klaarmaken(ctx, { opGepubliceerd } = {}) {
  const wrap = el("div");
  const teken = () => wrap.replaceChildren(bouw());

  // Een punt: bolletje, titel en uitleg, rechts de actie. Klaar = groen vinkje.
  function punt({ ok, vrij = false, titel, tekst, extra = null, acties = [], klasse = "" }) {
    return el("li", { className: `klaar-punt${ok ? " ok" : ""}${vrij ? " vrij" : ""} ${klasse}`.trim() },
      el("span", { className: "check-bol", "aria-hidden": "true" }, ok ? icoon("vink") : null),
      el("div", { className: "klaar-tekst" },
        el("strong", {}, titel, el("span", { className: "sr" }, ok ? ", in orde" : vrij ? ", niet verplicht" : ", nog te doen")),
        tekst ? el("span", {}, tekst) : null,
        extra),
      acties.length ? el("div", { className: "klaar-acties" }, acties) : null);
  }

  const knop = (tekst, klasse, actie) => {
    const k = el("button", { type: "button", className: `knop klein ${klasse}` }, tekst);
    k.addEventListener("click", async () => {
      k.disabled = true;
      try {
        if (await actie()) teken();
      } finally {
        k.disabled = false;
      }
    });
    return k;
  };

  // Bezoekdag ---------------------------------------------------------------------------------

  function bezoekdagPunt() {
    const p = ctx.pagina;
    const rijen = komendeRijen(ctx.beschikbaarheid);
    const md = p.monday_bezoekdag && p.monday_bezoekdag >= vandaagSleutel() ? p.monday_bezoekdag : null;

    if (rijen.length) {
      const dagen = komendeDagen(ctx.beschikbaarheid);
      const enkel = rijen.length === 1 ? rijen[0] : null;
      const starts = enkel ? startmomenten(kortUur(enkel.van), kortUur(enkel.tot), p.duur_min, p.slot_interval_min) : [];
      const titel = dagen.length === 1 ? `Homerun ${datumLang(dagen[0])}` : `${dagen.length} bezoekdagen vanaf ${datumKaal(dagen[0])}`;
      const tekst = [
        enkel ? `${kortUur(enkel.van)} tot ${kortUur(enkel.tot)}, ${aantal(starts.length * p.max_per_slot, "plaats", "plaatsen")}` : null,
        enkel?.uit_monday ? "overgenomen uit Monday" : null,
        md && !dagen.includes(md) ? `let op: in Monday staat ${datumLang(md)}` : null,
      ].filter(Boolean).join(" · ");
      return punt({
        ok: true, titel, tekst, klasse: md && !dagen.includes(md) ? "afwijkend" : "",
        acties: [enkel
          ? knop("Uren aanpassen", "lijn", () => dagDialoog(ctx, { rij: enkel }))
          : el("a", { className: "knop klein lijn", href: `#/p/${ctx.id}/dagen` }, "Bezoekdagen")],
      });
    }

    // Nog geen bezoekdag: meteen hier inplannen, met de dag uit Monday als voorstel.
    const datum = el("input", { type: "date", value: md || "", min: vandaagSleutel() });
    const van = el("input", { type: "time", step: 300, value: STANDAARD_VAN });
    const tot = el("input", { type: "time", step: 300, value: STANDAARD_TOT });
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const plan = el("button", { type: "submit", className: "knop zwart klein" }, "Inplannen");
    const meer = el("button", { type: "button", className: "link zacht" }, "Meerdere dagen of een periode?");
    meer.addEventListener("click", async () => {
      if (await dagDialoog(ctx, { voorstel: datum.value || md })) teken();
    });
    const form = el("form", { className: "klaar-dag", noValidate: true },
      el("div", { className: "klaar-dag-velden" },
        veld({ label: "Datum", input: datum }), veld({ label: "Van", input: van }), veld({ label: "Tot", input: tot }), plan),
      fout, meer);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const w = { datum_van: datum.value, datum_tot: datum.value, van: van.value, tot: tot.value, weekdagen: [1, 2, 3, 4, 5, 6, 7] };
      const melding = !w.datum_van ? "Kies een datum."
        : w.datum_van < vandaagSleutel() ? "Die dag is al voorbij."
        : !w.van || !w.tot || w.tot <= w.van ? "Het einduur moet na het beginuur liggen."
        : !startmomenten(w.van, w.tot, p.duur_min, p.slot_interval_min).length ? `Tussen ${w.van} en ${w.tot} past geen bezoek van ${p.duur_min} minuten.`
        : !dagenVan(w).length ? "Kies een datum." : null;
      fout.textContent = melding || "";
      fout.hidden = !melding;
      if (melding) return;
      plan.disabled = true;
      try {
        await staat.api.beschikbaarheidNieuw({ pagina_id: ctx.id, ...w });
        await ctx.herlaadBeschikbaarheid();
        toast("Bezoekdag ingepland.");
        teken();
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        plan.disabled = false;
      }
    });
    return punt({
      ok: false, titel: "Bezoekdag",
      tekst: md ? `In Monday staat de Homerun op ${datumLang(md)}.`
        : p.monday_item_id ? "In Monday staat nog geen bezoekdag. Kies de dag hier, of vul ze in Monday in: dan komt ze vanzelf." : null,
      extra: form,
    });
  }

  // Startmomenten (standaard 40 minuten: alleen aanpassen als het anders moet) --------------------

  function startPunt() {
    return punt({
      ok: true, titel: "Startmomenten", tekst: startmomentenTekst(ctx.pagina),
      acties: [knop("Aanpassen", "lijn", () => startmomentenDialoog(ctx))],
    });
  }

  // Foto ----------------------------------------------------------------------------------------

  let fotoBezig = null; // statustekst tijdens het opladen
  function fotoPunt() {
    const p = ctx.pagina;
    const kies = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/*", className: "sr", id: "klaar-foto" });
    const label = el("label", { className: `knop klein ${p.foto_pad ? "lijn" : "zwart"}`, for: "klaar-foto" },
      icoon("upload"), p.foto_pad ? "Andere foto" : "Foto kiezen");
    const laadOp = async (bestand) => {
      if (fotoBezig) return;
      try {
        await fotoOpladen(ctx, bestand, (s) => {
          fotoBezig = s;
          teken();
        });
      } catch (err) {
        console.error(err);
        toast(foutTekst(err), { fout: true });
      }
      fotoBezig = null;
      teken();
    };
    kies.addEventListener("change", () => kies.files[0] && laadOp(kies.files[0]));
    // Nog geen foto maar wel een pandsite: de foto daar meteen ophalen (gebeurt anders binnen 10 minuten).
    const vanSite = !p.foto_pad && p.pand_url && !fotoBezig ? knop("Van pandsite", "lijn", async () => {
      fotoBezig = "Foto van de pandsite ophalen…";
      teken();
      try {
        await fotoVanPandsite(ctx);
      } catch (err) {
        console.error(err);
        toast(foutTekst(err), { fout: true });
      }
      fotoBezig = null;
      return true;
    }) : null;
    const herkomst = fotoHerkomst(p);
    const li = punt({
      ok: !!p.foto_pad, titel: "Foto",
      tekst: fotoBezig || (p.foto_pad
        ? `Bezoekers zien deze foto bovenaan de pagina.${herkomst ? ` ${herkomst}` : ""}`
        : herkomst || "Sleep een foto hierheen of kies er een. Een staande foto past het mooist."),
      extra: fotoBezig ? el("span", { className: "laad-balk", role: "status" }) : null,
      acties: [p.foto_pad ? boogFoto(staat.api.fotoUrl(p.foto_pad), "", "mini-boog") : null, kies, vanSite, fotoBezig ? null : label].filter(Boolean),
      klasse: "foto-punt",
    });
    li.addEventListener("dragover", (e) => {
      e.preventDefault();
      li.classList.add("sleep");
    });
    li.addEventListener("dragleave", () => li.classList.remove("sleep"));
    li.addEventListener("drop", (e) => {
      e.preventDefault();
      li.classList.remove("sleep");
      const f = e.dataTransfer?.files?.[0];
      if (f) laadOp(f);
    });
    return li;
  }

  // Prijs en link (niet verplicht; komen normaal uit Monday) -------------------------------------

  function gegevensDialoog() {
    return new Promise((klaar) => {
      const p = ctx.pagina;
      const prijs = el("input", { type: "text", inputMode: "numeric", value: p.kickoff_prijs ? getal(p.kickoff_prijs) : "", autocomplete: "off" });
      const url = el("input", { type: "url", value: p.pand_url || "", autocomplete: "off" });
      const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
      const bewaar = el("button", { type: "button", className: "knop zwart klein" }, "Bewaren");
      const annuleer = el("button", { type: "button", className: "knop lijn klein" }, "Annuleren");
      let bewaard = false;
      const { sluit } = openDialoog({
        titel: "Prijs en link",
        inhoud: [el("div", { className: "velden" },
          veld({ label: "Kick-off prijs (euro)", input: prijs, hulp: "Leeg = geen prijs op de pagina." }),
          veld({ label: "Link naar de site van het pand", input: url, hulp: "Leeg = geen knop “Meer info over het pand”." })), fout],
        voet: [annuleer, bewaar],
        opSluiten: () => klaar(bewaard),
      });
      annuleer.addEventListener("click", () => sluit());
      bewaar.addEventListener("click", async () => {
        const w = { kickoff_prijs: Number(prijs.value.replace(/[^0-9]/g, "")) || null, pand_url: url.value.trim() || null };
        if (w.pand_url && !/^https?:\/\//i.test(w.pand_url)) w.pand_url = `https://${w.pand_url}`;
        bewaar.disabled = true;
        try {
          await ctx.bewaar(w);
          bewaard = true;
          sluit();
          toast("Bewaard.");
        } catch (err) {
          fout.textContent = foutTekst(err);
          fout.hidden = false;
          bewaar.disabled = false;
        }
      });
    });
  }

  function gegevensPunt() {
    const p = ctx.pagina;
    const delen = [
      p.kickoff_prijs ? `Kick-off prijs ${getal(p.kickoff_prijs)} euro` : "Geen kick-off prijs",
      p.pand_url ? p.pand_url.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : "geen link naar de site van het pand",
    ];
    return punt({
      ok: !!(p.kickoff_prijs && p.pand_url), vrij: true, titel: "Prijs en link", tekst: cap(delen.join(" · ")),
      acties: [knop("Aanpassen", "lijn", gegevensDialoog)],
    });
  }

  // Publiceren of online zetten -------------------------------------------------------------------

  function bouw() {
    const p = ctx.pagina;
    const open = teDoen(p, ctx.beschikbaarheid).filter((i) => !i.ok);
    const dringend = p.concept && teKoop(p);
    const doe = el("button", { type: "button", className: "knop zwart klein", disabled: open.length > 0 }, icoon("oog"),
      p.concept ? "Publiceren" : "Online zetten");
    doe.addEventListener("click", async () => {
      doe.disabled = true;
      const gelukt = p.concept ? await ctx.publiceer() : await ctx.zetOnline(true);
      if (gelukt) opGepubliceerd?.();
      else doe.disabled = false;
    });
    const punten = [bezoekdagPunt(), fotoPunt(), startPunt(), gegevensPunt()];
    const toonKnop = p.concept || !p.actief;
    return sectie({
      titel: p.concept ? "Klaar om te publiceren?" : "Klaar voor bezoekers?",
      sub: dringend ? "Dit dossier staat in Monday al op te koop. Werk de pagina af zodat bezoekers kunnen boeken."
        : p.concept ? "Aangemaakt uit Monday. Bezoekers zien nog dat ze binnenkort een bezoek kunnen inplannen."
        : !p.actief ? "De pagina staat offline: bezoekers kunnen nog niet boeken."
        : "Bezoekers kunnen boeken, maar de pagina is nog niet volledig.",
      klasse: `checklist${dringend ? " dringend" : ""}`,
    },
    el("ul", { className: "klaar-lijst" }, punten),
    toonKnop ? el("div", { className: "publiceer-rij" }, doe,
      el("span", { className: "klein" }, open.length
        ? `Nog nodig: ${open.map((i) => i.tekst).join(" en ")}.`
        : p.concept ? "Alles is klaar. Na het publiceren kunnen bezoekers meteen boeken." : "Alles is klaar.")) : null);
  }

  teken();
  return wrap;
}
