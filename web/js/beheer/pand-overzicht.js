// Overzicht van één adres: wat er nog ontbreekt, de cijfers (weergaven, afspraken, bezetting,
// conversie), de trechter, de opvolging na de Homerun, per dag, per startuur, per bezoekdag en
// de herkomst van bezoekers. Weergaven zijn oranje, afspraken zwart, in elke grafiek.

import { balken, capaciteitKolommen, kolommen, meter, trechter } from "../grafieken.js";
import { icoon } from "../iconen.js";
import { cap, datumKaal, datumLang, el, getal, procent, uur, vandaagSleutel } from "../tekst.js";
import { komendeDagen } from "./datum.js";
import { staat } from "./staat.js";
import { aantal, datumBlad, kopieer, leeg, sectie, tegel } from "./ui.js";

const KANAAL_LABEL = { direct: "Rechtstreeks of onbekend", beheer: "Ingevoerd in het beheer" };
const APPARAAT_LABEL = { mobiel: "Gsm of tablet", desktop: "Computer", onbekend: "Onbekend" };
const BRONNEN_LINK = [
  ["immoweb", "Immoweb"], ["zimmo", "Zimmo"], ["realo", "Realo"], ["facebook", "Facebook"], ["instagram", "Instagram"],
  ["nieuwsbrief", "Nieuwsbrief"], ["mailing", "Mailing"], ["bord", "QR-code op het bord"], ["website", "Website Henry Houser"],
];

function checklist(ctx) {
  const p = ctx.pagina;
  const items = [
    { ok: !!p.foto_pad, tekst: "Foto toevoegen", tab: "pagina" },
    { ok: komendeDagen(ctx.beschikbaarheid).length > 0, tekst: "Bezoekdag inplannen", tab: "dagen" },
    { ok: !!p.kickoff_prijs, tekst: "Kick-off prijs invullen", tab: "pagina" },
    { ok: !!p.pand_url, tekst: "Link naar het pand op henryhouser.be", tab: "pagina" },
    { ok: !!(p.eigenaar_email || "").trim(), tekst: "E-mailadres van de verkoper", tab: "mails" },
    { ok: p.actief, tekst: "Pagina online zetten", tab: "pagina" },
  ];
  const open = items.filter((i) => !i.ok).length;
  if (!open || ["afgelopen", "archief"].includes(ctx.fase())) return null;
  return sectie({
    titel: "Klaar voor bezoekers?", sub: `Nog ${aantal(open, "punt", "punten")} om af te werken.`, klasse: "checklist",
  }, el("ul", { className: "check-lijst" }, items.map((i) => el("li", { className: i.ok ? "ok" : "" },
    el("span", { className: "check-bol", "aria-hidden": "true" }, i.ok ? icoon("vink") : null),
    i.ok ? el("span", {}, i.tekst, el("span", { className: "sr" }, ", klaar"))
      : el("a", { href: `#/p/${ctx.id}/${i.tab}` }, i.tekst)))));
}

function linkMaker(ctx, { los = false } = {}) {
  const url = staat.api.publiekeUrl(ctx.pagina.slug);
  const keuze = el("select", { "aria-label": "Waar plaats je de link?" },
    BRONNEN_LINK.map(([w, t]) => el("option", { value: w }, t)));
  const uit = el("input", { className: "invoer", readOnly: true, "aria-label": "Link met bron" });
  const knop = el("button", { type: "button", className: "knop zwart klein" }, icoon("kopie"), "Kopieer");
  const zet = () => (uit.value = `${url}?utm_source=${keuze.value}`);
  keuze.addEventListener("change", zet);
  uit.addEventListener("focus", () => uit.select());
  knop.addEventListener("click", () => kopieer(uit.value, "Link gekopieerd."));
  zet();
  return el("div", { className: `link-maker${los ? " los" : ""}` },
    el("p", { className: "klein" }, "Gebruik in elke advertentie een eigen link, dan zie je precies hoeveel bezoekers via welk kanaal kwamen."),
    el("div", { className: "link-maker-rij" }, el("div", { className: "veld" }, keuze), uit, knop));
}

const kortDag = (d) => datumKaal(d, { day: "numeric", month: "short" });
const langDag = (d) => cap(datumKaal(d, { weekday: "long", day: "numeric", month: "long" }));

function perBezoekdag(lijst) {
  if (!lijst.length) return leeg({ klein: true, tekst: "Nog geen bezoekdagen ingepland." });
  const vandaag = vandaagSleutel();
  return el("ul", { className: "dag-bezetting" }, lijst.map((d) => el("li", { className: d.dag < vandaag ? "voorbij" : "" },
    datumBlad(d.dag),
    el("div", { className: "dag-bezetting-tekst" },
      el("strong", {}, cap(datumLang(d.dag))),
      el("span", { className: "klein" }, `${d.dag < vandaag ? "Voorbij · " : ""}startmomenten van ${uur(d.van)} tot ${uur(d.tot)}`)),
    el("div", { className: "dag-bezetting-cijfer" },
      el("span", {}, el("strong", {}, getal(d.geboekt)), ` van ${getal(d.capaciteit)}`),
      meter(d.geboekt, d.capaciteit, { label: `${d.geboekt} van ${d.capaciteit} plaatsen geboekt` }),
      d.geannuleerd ? el("small", {}, `${getal(d.geannuleerd)} geannuleerd`) : null))));
}

export async function toon(paneel, ctx) {
  const mijn = staat.navigatie;
  const s = await staat.api.statistiek(ctx.id);
  if (mijn !== staat.navigatie) return;
  const k = s.kpi;
  const online = Math.max(0, k.boekingen - k.via_beheer);
  const conversie = k.bezoekers ? `${Math.min(100, Math.round((online / k.bezoekers) * 100))}%` : "–";
  const aangeduid = k.geweest + k.no_show;
  const teAanduiden = Math.max(0, k.voorbij - aangeduid);

  const stappen = [
    { label: "Paginaweergaven", waarde: k.weergaven, uitleg: "keer geopend" },
    { label: "Startuur gekozen", waarde: k.slot_gekozen },
    { label: "Afspraak gemaakt", waarde: online },
  ];
  if (aangeduid) stappen.push({ label: "Op bezoek gekomen", waarde: k.geweest });
  if (aangeduid || k.bod) stappen.push({ label: "Bod uitgebracht", waarde: k.bod });

  const geenCijfers = !k.weergaven && !k.boekingen;
  const perDagLeeg = s.per_dag.every((d) => !d.weergaven && !d.boekingen);

  const tegels = el("div", { className: "tegels" },
      tegel({ label: "Paginaweergaven", waarde: getal(k.weergaven), sub: aantal(k.bezoekers, "unieke bezoeker", "unieke bezoekers") }),
      tegel({
        label: "Afspraken", waarde: getal(k.actief),
        sub: [k.geannuleerd ? `${getal(k.geannuleerd)} geannuleerd` : "geen annuleringen",
          k.via_beheer ? `${getal(k.via_beheer)} via beheer` : null].filter(Boolean).join(" · "),
      }),
      tegel({
        label: "Bezetting", waarde: k.capaciteit ? procent(k.actief, k.capaciteit) : "–",
        sub: k.capaciteit ? `${getal(k.actief)} van ${getal(k.capaciteit)} plaatsen` : "nog geen bezoekdagen",
        extra: k.capaciteit ? meter(k.actief, k.capaciteit, { label: `${k.actief} van ${k.capaciteit} plaatsen geboekt` }) : null,
      }),
      tegel({ label: "Conversie", waarde: conversie, sub: "van de unieke bezoekers boekte" }));

  // Nog niets bekeken of geboekt: geen lege grafieken, wel de dagen en de links voor advertenties.
  if (geenCijfers) {
    paneel.replaceChildren(
      checklist(ctx) || "",
      tegels,
      leeg({
        titel: "Nog geen cijfers",
        tekst: "Zodra de pagina bekeken wordt en er geboekt wordt, verschijnen hier de weergaven, de afspraken, de trechter en waar de bezoekers vandaan kwamen.",
      }),
      el("div", { className: "raster-2" },
        sectie({ titel: "Per bezoekdag" }, perBezoekdag(s.per_homerundag)),
        sectie({ titel: "Links voor je advertenties" }, linkMaker(ctx, { los: true }))));
    return;
  }

  paneel.replaceChildren(
    checklist(ctx) || "",
    tegels,

    k.voorbij ? sectie({
      titel: "Na de Homerun", sub: "Duid bij Bezoekers aan wie er geweest is en wie een bod uitbracht.",
      acties: teAanduiden ? el("a", { className: "knop zwart klein", href: `#/p/${ctx.id}/bezoekers?filter=voorbij` },
        `Nog ${getal(teAanduiden)} aan te duiden`) : null,
    }, el("div", { className: "mini-tegels" },
      tegel({ label: "Geweest", waarde: getal(k.geweest) }),
      tegel({ label: "Niet opgedaagd", waarde: getal(k.no_show) }),
      tegel({ label: "Nog aan te duiden", waarde: getal(teAanduiden) }),
      tegel({ label: "Bod uitgebracht", waarde: getal(k.bod), sub: k.geweest ? `${procent(k.bod, k.geweest)} van wie er was` : null }))) : "",

    el("div", { className: "raster-2" },
      sectie({
        titel: stappen.length > 3 ? "Van weergave tot bod" : "Van weergave tot afspraak", sub: "Hoeveel bezoekers elke stap zetten.",
      }, trechter(stappen)),
      sectie({ titel: "Per bezoekdag" }, perBezoekdag(s.per_homerundag))),

    perDagLeeg ? "" : el("div", { className: "raster-2" },
      sectie({ titel: "Weergaven per dag", sub: "Hoe vaak de bezoekerspagina geopend werd." },
        kolommen({
          data: s.per_dag.map((d) => ({ label: kortDag(d.dag), tip: langDag(d.dag), waarde: d.weergaven })),
          kleur: "oranje", eenheid: "weergaven",
        })),
      sectie({ titel: "Nieuwe afspraken per dag", sub: "Op de dag dat er geboekt werd, niet de dag van het bezoek." },
        kolommen({
          data: s.per_dag.map((d) => ({ label: kortDag(d.dag), tip: langDag(d.dag), waarde: d.boekingen })),
          kleur: "inkt", eenheid: "afspraken",
        }))),

    s.per_uur.length ? sectie({ titel: "Bezetting per startuur", sub: "Over alle bezoekdagen samen: welke uren het populairst zijn." },
      capaciteitKolommen({ data: s.per_uur.map((u) => ({ label: u.uur, capaciteit: u.capaciteit, geboekt: u.geboekt })) })) : "",

    el("div", { className: "raster-2" },
      sectie({ titel: "Hoe vonden ze het pand?", sub: "Zoals bezoekers het zelf aanduidden in het formulier." },
        balken({ data: s.bronnen.map((b) => ({ label: b.label, waarde: b.aantal })), leeg: "Nog geen afspraken.", tabelKop: "Bron" })),
      sectie({ titel: "Waar kwamen de bezoekers vandaan?", sub: "De site waarvan ze naar de pagina kwamen, of de bron in de link." },
        balken({
          data: s.kanalen.map((b) => ({ label: KANAAL_LABEL[b.label] || b.label, waarde: b.aantal })),
          kleur: "oranje", leeg: "Nog geen weergaven.", tabelKop: "Kanaal",
        }),
        linkMaker(ctx))),

    el("div", { className: "raster-2" },
      sectie({ titel: "Toestel", sub: "Waarmee de pagina bekeken werd." },
        balken({
          data: s.apparaten.map((b) => ({ label: APPARAAT_LABEL[b.label] || b.label, waarde: b.aantal })),
          kleur: "oranje", leeg: "Nog geen weergaven.", tabelKop: "Toestel",
        })),
      sectie({ titel: "Hoe lang op voorhand geboekt?", sub: "Tijd tussen het boeken en het bezoek." },
        balken({ data: s.doorlooptijd.map((b) => ({ label: b.label, waarde: b.aantal })), leeg: "Nog geen afspraken.", tabelKop: "Op voorhand" }))));
}
