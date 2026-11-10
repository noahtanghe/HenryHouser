// Bezoekdagen van één adres: wanneer bezoekers kunnen komen. Eén Homerun-dag of een periode
// met weekdagen, telkens met de uren. Daaronder de regels voor de startmomenten (duur, om de
// hoeveel minuten, plaatsen per startmoment, hoe lang op voorhand).

import { meter } from "../grafieken.js";
import { icoon } from "../iconen.js";
import { cap, dagSleutel, datumKaal, datumLang, el, getal, uur, vandaagSleutel } from "../tekst.js";
import { dagDialoog, dagForm, startmomentenForm } from "./bezoekdag.js";
import { dagenVan, komendeDagen, kortUur, startmomenten } from "./datum.js";
import { staat } from "./staat.js";
import { aantal, badge, bevestig, datumBlad, foutTekst, ikoonKnop, leeg, sectie, toast } from "./ui.js";

const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"];
const jaarErbij = (d) => (d.slice(0, 4) !== vandaagSleutel().slice(0, 4) ? ` ${d.slice(0, 4)}` : "");

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
        el("strong", {}, wanneer, r.uit_monday ? badge({ tekst: "uit Monday", klasse: "kaal" }) : null),
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
      sub: ctx.pagina.actief ? "Bezoekers kiezen een startmoment op deze dagen."
        : ctx.pagina.concept ? "De pagina is nog een concept: bezoekers kunnen pas boeken na het publiceren."
        : "De pagina staat offline: bezoekers kunnen nog niet boeken.",
    },
    komend.length ? el("ul", { className: "dag-rijen" }, komend.map(rijEl))
      : leeg({ klein: true, titel: "Geen komende bezoekdagen", tekst: "Plan hieronder een Homerun of een periode in." }),
    voorbij.length ? el("details", { className: "voorbij-dagen" },
      el("summary", {}, `Voorbije bezoekdagen (${voorbij.length})`),
      el("ul", { className: "dag-rijen" }, voorbij.map(rijEl))) : null));
  }

  function tekenToevoegen() {
    // Bezoekdag uit Monday als voorstel, zolang er nog geen komende dag is.
    const md = ctx.pagina.monday_bezoekdag;
    const voorstel = md && md >= vandaagSleutel() && !komendeDagen(ctx.beschikbaarheid).length ? md : null;
    const f = dagForm(ctx.pagina, null, voorstel);
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
        toast(ctx.pagina.actief ? "Bezoekdag toegevoegd. Bezoekers kunnen meteen boeken."
          : ctx.pagina.concept ? "Bezoekdag toegevoegd. Publiceer de pagina bij Overzicht." : "Bezoekdag toegevoegd. De pagina staat nog offline.");
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
    toevoegSectie.replaceChildren(sectie({
      titel: "Bezoekdag toevoegen",
      sub: voorstel ? `In Monday staat de bezoekdag op ${datumLang(voorstel)}. Kijk de uren na en voeg toe.`
        : "Een Homerun op één dag, of een periode met vaste weekdagen.",
    }, form));
  }

  async function wijzigen(r) {
    if (await dagDialoog(ctx, { rij: r })) tekenLijst();
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
    const { form, gewijzigd } = startmomentenForm(ctx, {
      opBewaard: () => {
        tekenInstellingen();
        tekenLijst();
        tekenToevoegen();
      },
    });
    staat.vuil = gewijzigd;
    instellingenSectie.replaceChildren(sectie({
      titel: "Startmomenten",
      sub: "Standaard bezoeken van 40 minuten, om de 40 minuten. Geldt voor alle bezoekdagen van dit adres; bestaande afspraken blijven staan.",
    }, form));
  }

  paneel.replaceChildren(el("div", { className: "raster-dagen" },
    el("div", { className: "raster-kolom" }, lijstSectie, toevoegSectie),
    el("div", { className: "raster-kolom" }, instellingenSectie)));
  tekenLijst();
  tekenToevoegen();
  tekenInstellingen();
}
