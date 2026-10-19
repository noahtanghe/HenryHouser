// Overzicht: de dag van vandaag, komende Homeruns, de laatste boekingen en wat aandacht vraagt.

import { icoon } from "../iconen.js";
import { telLink } from "../merk.js";
import { cap, dagKort, dagSleutel, datumLang, el, getal, splitsAdres, uur, vandaagSleutel } from "../tekst.js";
import { meter } from "../grafieken.js";
import { boogFoto } from "../kader.js";
import { staat } from "./staat.js";
import {
  aantal, datumBlad, leeg, naamVan, paginaKop, relatief, sectie, SOORT_LABEL, tegel, verschil, voornaamUitEmail,
} from "./ui.js";

function groet() {
  const h = Number(uur(new Date()).slice(0, 2));
  return h < 12 ? "Goeiemorgen" : h < 18 ? "Goeiemiddag" : "Goeienavond";
}

const straatVan = (adres) => splitsAdres(adres).straat || adres;

function samenvatting(d) {
  const n = d.kpi.bezoeken_vandaag;
  if (n) return `Vandaag ${n === 1 ? "staat er 1 bezoek" : `staan er ${getal(n)} bezoeken`} gepland.`;
  const volgende = d.homeruns.find((h) => h.dag > vandaagSleutel()) || d.homeruns[0];
  if (volgende) return `Vandaag geen bezoeken. De volgende Homerun is ${datumLang(volgende.dag)} in ${straatVan(volgende.adres)}.`;
  return "Er staan geen Homeruns gepland. Voeg een adres toe of plan een bezoekdag in.";
}

// Vandaag en morgen -----------------------------------------------------------------------

function vandaagEnMorgen(lijst) {
  if (!lijst.length) {
    return leeg({ klein: true, tekst: "Vandaag en morgen staan er geen bezoeken gepland." });
  }
  const vandaag = vandaagSleutel();
  const groepen = [["Vandaag", lijst.filter((b) => dagSleutel(b.start) === vandaag)],
    ["Morgen", lijst.filter((b) => dagSleutel(b.start) !== vandaag)]];
  return el("div", { className: "dag-groepen" }, groepen.filter(([, l]) => l.length).map(([titel, l]) =>
    el("div", { className: "dag-groep" },
      el("h3", { className: "label" }, `${titel} · ${aantal(l.length, "bezoek", "bezoeken")}`),
      el("ul", { className: "rij-lijst" }, l.map((b) => el("li", { className: "afspraak-rij" },
        el("span", { className: "tijd" }, uur(b.start)),
        el("div", { className: "afspraak-wie" },
          el("a", { href: `#/p/${b.pagina_id}/bezoekers?b=${b.id}` }, el("strong", {}, naamVan(b))),
          el("span", {}, straatVan(b.adres))),
        b.telefoon
          ? el("a", { className: "knop lijn mini", href: telLink(b.telefoon), "aria-label": `Bel ${naamVan(b)} op ${b.telefoon}` },
            icoon("telefoon"), el("span", { className: "alleen-breed" }, b.telefoon))
          : null))))));
}

// Komende Homeruns -----------------------------------------------------------------------------

function homeruns(lijst) {
  if (!lijst.length) {
    return leeg({
      titel: "Geen Homeruns gepland",
      tekst: "Zodra je bezoekdagen inplant, zie je hier hoe vol ze zitten.",
      acties: el("a", { className: "knop zwart klein", href: "#/adressen" }, "Naar de adressen"),
    });
  }
  return el("ul", { className: "homeruns" }, lijst.map((h) => {
    const { straat, gemeente } = splitsAdres(h.adres);
    const vrij = h.capaciteit - h.geboekt;
    return el("li", {}, el("a", { className: "homerun", href: `#/p/${h.pagina_id}/bezoekers` },
      datumBlad(h.dag),
      boogFoto(staat.api.fotoUrl(h.foto_pad), "", "homerun-foto"),
      el("div", { className: "homerun-tekst" },
        el("strong", {}, straat || h.adres),
        el("span", {}, [cap(datumLang(h.dag)), gemeente.replace(/^\d{4}\s*/, "")].filter(Boolean).join(" · ")),
        el("span", { className: "klein" }, `Startmomenten van ${uur(h.van)} tot ${uur(h.tot)}`)),
      el("div", { className: "homerun-bezetting" },
        el("span", {}, el("strong", {}, getal(h.geboekt)), ` van ${getal(h.capaciteit)} geboekt`),
        meter(h.geboekt, h.capaciteit, { label: `${h.geboekt} van ${h.capaciteit} plaatsen geboekt` }),
        el("span", { className: "klein" }, vrij > 0 ? `${aantal(vrij, "plaats", "plaatsen")} vrij` : "Volzet"))));
  }));
}

// Laatst geboekt ---------------------------------------------------------------------------------

function recent(lijst) {
  if (!lijst.length) return leeg({ klein: true, tekst: "Nog geen boekingen." });
  return el("ul", { className: "rij-lijst" }, lijst.map((b) => {
    const label = b.status === "geannuleerd" ? el("span", { className: "badge slecht" }, "Geannuleerd")
      : b.via_beheer ? el("span", { className: "badge kaal" }, "Via beheer") : null;
    return el("li", { className: "recent-rij" },
      el("div", { className: "recent-kop" },
        el("a", { href: `#/p/${b.pagina_id}/bezoekers?b=${b.id}` }, el("strong", {}, naamVan(b))),
        el("span", { className: "klein" }, relatief(b.created_at))),
      el("span", {}, `${straatVan(b.adres)} · ${dagKort(b.start)} om ${uur(b.start)}`),
      b.bron || label ? el("div", { className: "recent-voet" }, el("span", { className: "klein" }, b.bron ? `Bron: ${b.bron}` : ""), label) : null);
  }));
}

// Vraagt aandacht ---------------------------------------------------------------------------------

function aandacht(a) {
  const items = [];
  for (const m of a.mislukt) {
    items.push({
      href: `#/p/${m.pagina_id}/bezoekers?b=${m.boeking_id}`,
      titel: `Mail aan ${m.ontvanger} niet verstuurd`,
      tekst: `${SOORT_LABEL[m.soort] || m.soort} · ${straatVan(m.adres)}`,
    });
  }
  if (a.vastgelopen) {
    items.push({
      titel: `${aantal(a.vastgelopen, "mail wacht", "mails wachten")} langer dan een kwartier`,
      tekst: "Ze worden automatisch opnieuw geprobeerd.",
    });
  }
  for (const p of a.zonder_data) {
    items.push({ href: `#/p/${p.id}/dagen`, titel: `${straatVan(p.adres)}: nog geen bezoekdagen`, tekst: "Plan een Homerun in." });
  }
  for (const p of a.zonder_foto) {
    items.push({ href: `#/p/${p.id}/pagina`, titel: `${straatVan(p.adres)}: nog geen foto`, tekst: "Bezoekers zien nu een lege boog." });
  }
  for (const p of a.zonder_eigenaar) {
    items.push({ href: `#/p/${p.id}/mails`, titel: `${straatVan(p.adres)}: geen e-mail van de verkoper`, tekst: "De verkoper krijgt geen melding bij nieuwe afspraken." });
  }
  if (!items.length) {
    return el("p", { className: "alles-ok" }, icoon("vink"), "Alles in orde. Geen mislukte mails en elk adres is volledig.");
  }
  return el("ul", { className: "aandacht-lijst" }, items.map((it) => {
    const binnen = [icoon("let"), el("span", {}, el("strong", {}, it.titel), el("small", {}, it.tekst)),
      it.href ? icoon("pijlRechts", "aandacht-pijl") : null];
    return el("li", {}, it.href ? el("a", { href: it.href }, binnen) : el("div", {}, binnen));
  }));
}

// Pagina -----------------------------------------------------------------------------------------------

export async function toon(container) {
  const mijn = staat.navigatie;
  const d = await staat.api.dashboard();
  if (mijn !== staat.navigatie) return;
  document.title = "Overzicht · Beheer Henry Houser";

  const k = d.kpi;
  const morgen = d.vandaag_morgen.filter((b) => dagSleutel(b.start) !== vandaagSleutel()).length;
  const naam = voornaamUitEmail(staat.email);

  container.replaceChildren(
    paginaKop({
      oog: cap(datumLang(vandaagSleutel())),
      titel: `${groet()}${naam ? `, ${naam}` : ""}`,
      sub: el("p", {}, samenvatting(d)),
    }),
    el("div", { className: "tegels" },
      tegel({ label: "Vandaag", waarde: getal(k.bezoeken_vandaag), sub: `${k.bezoeken_vandaag === 1 ? "bezoek" : "bezoeken"} · morgen ${getal(morgen)}` }),
      tegel({ label: "Komende 7 dagen", waarde: getal(k.bezoeken_7d), sub: "ingeplande bezoeken" }),
      tegel({ label: "Nieuwe afspraken", waarde: getal(k.boekingen_30d), sub: "laatste 30 dagen", extra: verschil(k.boekingen_30d, k.boekingen_vorige) }),
      tegel({
        label: "Paginaweergaven", waarde: getal(k.weergaven_30d),
        sub: `${aantal(k.bezoekers_30d, "unieke bezoeker", "unieke bezoekers")} · 30 dagen`,
        extra: verschil(k.weergaven_30d, k.weergaven_vorige),
      })),
    el("div", { className: "raster-dashboard" },
      el("div", { className: "raster-kolom" },
        sectie({ titel: "Vandaag en morgen", id: "vandaag" }, vandaagEnMorgen(d.vandaag_morgen)),
        sectie({
          titel: "Komende Homeruns", id: "homeruns",
          acties: el("a", { className: "link zacht", href: "#/adressen" }, "Alle adressen"),
        }, homeruns(d.homeruns))),
      el("div", { className: "raster-kolom" },
        sectie({ titel: "Vraagt aandacht", id: "aandacht" }, aandacht(d.aandacht)),
        sectie({ titel: "Laatst geboekt", id: "recent" }, recent(d.recent)))));
}
