// Verkopersrapport: afspraak.henryhouser.be/rapport?token=...
// De verkoper volgt live hoeveel interesse er is, zonder persoonsgegevens van bezoekers.

import { KANTOOR, telLink } from "./merk.js";
import { balken, kolommen, meter } from "./grafieken.js";
import { boogFoto, kop, voet } from "./kader.js";
import { cap, dagSleutel, datumKaal, datumLang, el, fotoUrl, getal, procent, splitsAdres, uur } from "./tekst.js";

const cfg = window.AFSPRAAK_CONFIG || {};
const token = new URLSearchParams(window.AFSPRAAK_QS ?? location.search).get("token");
const app = document.getElementById("app");

const api = window.RAPPORT_API || {
  async rapport(t) {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/rapport_publiek`, {
      method: "POST",
      headers: { apikey: cfg.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ p_token: t }),
    });
    if (!res.ok) throw new Error(`rapport: ${res.status}`);
    return res.json();
  },
};

const tegel = (waarde, label, uitleg) => el("div", { className: "tegel" },
  el("span", { className: "label" }, label), el("span", { className: "waarde" }, waarde), el("span", { className: "uitleg" }, uitleg));

const blok = (titel, uitleg, ...inhoud) => el("section", { className: "blok" },
  el("h2", {}, titel), uitleg ? el("p", { className: "blok-uitleg" }, uitleg) : null, ...inhoud);

function teken(r) {
  const { straat, gemeente } = splitsAdres(r.adres);
  const k = r.kpi;
  document.title = `Verkopersrapport ${straat} · Henry Houser`;
  const vernieuw = el("button", { type: "button", className: "link zacht" }, "Vernieuwen");
  vernieuw.addEventListener("click", laad);

  const kopBlok = el("section", { className: "rapport-kop" },
    // foto_url komt alleen van de demo; anders de foto uit de bucket.
    boogFoto(r.foto_url || fotoUrl(cfg, r.foto_pad), `Foto van ${r.adres}`, "pand-foto"),
    el("div", {},
      el("p", { className: "label" }, "Verkopersrapport"),
      gemeente ? el("p", { className: "oog", style: { marginTop: "14px" } }, gemeente.replace(/^\d{4}\s*/, "")) : null,
      el("h1", {}, straat),
      el("p", { className: "tekst" }, r.eigenaar_naam
        ? `Hallo ${r.eigenaar_naam}, hier volg je live hoeveel interesse er is voor je woning.`
        : "Hier volg je live hoeveel interesse er is voor je woning."),
      el("p", { className: "klein", style: { marginTop: "10px" } },
        `Bijgewerkt op ${datumLang(dagSleutel(r.bijgewerkt))} om ${uur(r.bijgewerkt)}. `, vernieuw,
        el("br"), "Namen en contactgegevens van bezoekers tonen we hier bewust niet.")));

  const bezetting = k.capaciteit ? procent(k.actief, k.capaciteit) : "–";
  const tegels = el("div", { className: "tegels" },
    tegel(getal(k.bezoekers), "Bezoekers", "unieke bezoekers op de afsprakenpagina"),
    tegel(getal(k.actief), "Ingeplande bezoeken", k.voorbij ? `waarvan ${getal(k.voorbij)} al voorbij` : "kandidaat-kopers met een afspraak"),
    tegel(bezetting, "Bezetting", k.capaciteit ? `${getal(k.actief)} van ${getal(k.capaciteit)} startmomenten geboekt` : "nog geen bezoekmomenten"),
    tegel(getal(k.weergaven), "Paginaweergaven", "keer dat de afsprakenpagina geopend werd"));

  const dagen = (r.per_homerundag || []).map((d) => el("div", { className: "dagrij" },
    el("strong", {}, cap(datumLang(d.dag))),
    el("span", { className: "aantal" }, getal(d.geboekt), el("small", {}, ` van ${getal(d.capaciteit)} geboekt`)),
    meter(d.geboekt, d.capaciteit, { label: `${d.geboekt} van ${d.capaciteit} startmomenten geboekt` }),
    d.geannuleerd ? el("span", { className: "klein", style: { gridColumn: "1 / -1" } },
      `${d.geannuleerd} ${d.geannuleerd === 1 ? "afspraak" : "afspraken"} geannuleerd en weer vrijgegeven`) : null));

  const perDag = r.per_dag || [];
  const metData = perDag.some((d) => d.weergaven || d.boekingen);
  const dagLabel = (d) => datumKaal(d.dag, { day: "numeric", month: "short" });
  const grafiekWeergaven = metData ? kolommen({
    data: perDag.map((d) => ({ label: dagLabel(d), waarde: d.weergaven, tip: cap(datumLang(d.dag)) })),
    kleur: "oranje", eenheid: "weergaven", tabelKop: "Dag",
  }) : el("p", { className: "gr-leeg" }, "Nog geen gegevens.");
  const grafiekBoekingen = metData ? kolommen({
    data: perDag.map((d) => ({ label: dagLabel(d), waarde: d.boekingen, tip: cap(datumLang(d.dag)) })),
    kleur: "inkt", eenheid: "afspraken", tabelKop: "Dag",
  }) : el("p", { className: "gr-leeg" }, "Nog geen gegevens.");

  app.replaceChildren(kop(), el("main", { className: "rapport" },
    kopBlok, tegels,
    dagen.length ? blok("Per bezoekdag", "Hoeveel startmomenten er per dag geboekt zijn.", ...dagen) : null,
    el("div", { className: "blokken twee" },
      blok("Bezoekers op de pagina", "Paginaweergaven per dag.", grafiekWeergaven),
      blok("Nieuwe afspraken", "Afspraken per dag waarop ze gemaakt werden.", grafiekBoekingen)),
    blok("Hoe vonden kandidaat-kopers je woning?", "Zoals bezoekers het zelf aangaven bij het maken van hun afspraak.",
      balken({ data: (r.bronnen || []).map((b) => ({ label: b.label, waarde: b.aantal })), tabelKop: "Bron" })),
    el("p", { className: "klein", style: { marginTop: "28px" } },
      "Vragen over je verkoop? Bel ons op ", el("a", { href: telLink(KANTOOR.telefoon) }, KANTOOR.telefoon),
      " of mail naar ", el("a", { href: `mailto:${KANTOOR.email}` }, KANTOOR.email), ".")), voet());
}

function fout(titel, tekst) {
  app.replaceChildren(kop(), el("main", { className: "smal" }, el("div", { className: "smal-kaart" },
    el("h1", {}, titel), el("p", { className: "tekst" }, tekst),
    el("p", { className: "klein" }, "Vragen? Bel ons op ", el("a", { href: telLink(KANTOOR.telefoon) }, KANTOOR.telefoon), "."))), voet());
}

async function laad() {
  if (!token) return fout("Deze link is ongeldig", "Gebruik de knop in de mail die je van ons kreeg.");
  try {
    const r = await api.rapport(token);
    if (!r) return fout("Deze link werkt niet meer", "Misschien kreeg je intussen een nieuwe link. Neem gerust contact met ons op.");
    teken(r);
  } catch (err) {
    console.error(err);
    fout("Even geduld…", "Het rapport kon niet geladen worden. Probeer het straks opnieuw.");
  }
}

laad();
