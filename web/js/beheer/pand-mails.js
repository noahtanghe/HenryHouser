// Mails van één adres: wie krijgt welke mail (kantoor, verkoper, herinnering) en de tekst van
// elke mail, met ernaast een voorbeeld zoals de ontvanger het ziet.

import { icoon } from "../iconen.js";
import { el } from "../tekst.js";
import { bouwVoorbeeld, NAAR_BEZOEKER, STANDAARD } from "./mailvoorbeeld.js";
import { plaatshouders } from "./pand-pagina.js";
import { staat } from "./staat.js";
import { bewaarBalk, foutTekst, sectie, toast, veld } from "./ui.js";

const MAILS = [
  { soort: "bevestiging", titel: "Bevestiging", aan: "Bezoeker", wanneer: "Meteen na het boeken.", onderwerp: "mail_onderwerp", tekst: "mail_bevestiging" },
  { soort: "reminder", titel: "Herinnering", aan: "Bezoeker", wanneer: "Voor het bezoek, zoveel uur op voorhand als je bij Ontvangers kiest.", onderwerp: "mail_reminder_onderwerp", tekst: "mail_reminder" },
  { soort: "verplaatst", titel: "Nieuw tijdstip", aan: "Bezoeker", wanneer: "Als je een afspraak verplaatst in het beheer.", onderwerp: "mail_verplaatst_onderwerp", tekst: "mail_verplaatst" },
  { soort: "annulering", titel: "Annulering", aan: "Bezoeker", wanneer: "Als de bezoeker annuleert, of jij in het beheer.", onderwerp: "mail_annulering_onderwerp", tekst: "mail_annulering" },
  { soort: "eigenaar", titel: "Melding aan de verkoper", aan: "Verkoper", wanneer: "Bij elke nieuwe afspraak, als het e-mailadres van de verkoper ingevuld is.", tekst: "mail_eigenaar" },
  { soort: "alert", titel: "Interne melding", aan: "Kantoor", wanneer: "Bij elke nieuwe boeking via de pagina.", tekst: "mail_alert" },
  { soort: "annulering_alert", titel: "Interne melding bij annulering", aan: "Kantoor", wanneer: "Als een bezoek geannuleerd wordt.", tekst: "mail_annulering_alert" },
];
const ONTVANGERS = ["alert_email", "eigenaar_naam", "eigenaar_email", "antwoord_aan", "reminder_uren_vooraf"];
const VELDEN = [...ONTVANGERS, ...new Set(MAILS.flatMap((m) => [m.onderwerp, m.tekst].filter(Boolean)))];

const PLAATSHOUDERS = [
  ["{voornaam}", "Voornaam van de bezoeker"], ["{familienaam}", "Familienaam van de bezoeker"],
  ["{start}", "zaterdag 31 oktober 2026 om 09:40"], ["{datum}", "zaterdag 31 oktober"], ["{start_uur}", "09:40"],
  ["{adres}", "Het adres"], ["{titel}", "De titel"], ["{kickoff_prijs}", "375.000 euro"], ["{eigenaar_naam}", "Naam van de verkoper"],
];
const BLOKKEN = {
  bezoeker: [["{agenda_knoppen}", "Knoppen om het bezoek in de agenda te zetten"], ["{annuleer_knop}", "Knop om te annuleren"]],
  eigenaar: [["{rapport_knop}", "Knop naar het verkopersrapport"]],
  intern: [["{gegevens}", "Alle antwoorden uit het formulier"]],
};

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const geldigeLijst = (w) => !w || w.split(/[,;]/).map((x) => x.trim()).filter(Boolean).every((x) => EMAIL.test(x));

export async function toon(paneel, ctx) {
  const mijn = staat.navigatie;
  const api = staat.api;
  const slots = await api.slots(ctx.id).catch(() => []);
  if (mijn !== staat.navigatie) return;

  let concept = Object.fromEntries(VELDEN.map((k) => [k, ctx.pagina[k] ?? null]));
  let origineel = JSON.stringify(concept);
  staat.vuil = () => JSON.stringify(concept) !== origineel;
  let gekozen = MAILS[0].soort;

  const balk = bewaarBalk({ opBewaar: bewaar, opHerstel: herstel });
  const gewijzigd = () => {
    balk.toon(staat.vuil());
    tekenVoorbeeldLater();
  };

  // Voorbeeldbezoeker: de eerste komende afspraak, of Sofie op het eerste vrije startmoment.
  const echt = ctx.boekingen.find((b) => b.status === "bevestigd" && new Date(b.start) >= Date.now());
  const start = echt?.start || slots[0]?.start || new Date(Date.now() + 3 * 864e5).toISOString();
  const voorbeeldBoeking = {
    voornaam: "Sofie", familienaam: "Vandamme", email: "sofie.vandamme@voorbeeld.be", telefoon: "0478 12 34 56", start,
    antwoorden: { voornaam: "Sofie", familienaam: "Vandamme", email: "sofie.vandamme@voorbeeld.be", telefoon: "0478 12 34 56", nieuwsbrief: true, bron: "Immoweb" },
  };

  // Ontvangers ---------------------------------------------------------------------------------------

  const ontvangersSectie = el("div");
  function invoer(sleutel, opties = {}) {
    const i = el("input", { type: opties.type || "text", autocomplete: "off", placeholder: opties.placeholder || "" });
    i.value = concept[sleutel] ?? "";
    i.addEventListener("input", () => {
      concept[sleutel] = i.value.trim() === "" ? null : i.value.trim();
      gewijzigd();
    });
    return i;
  }

  function tekenOntvangers() {
    const keuze = el("select", {},
      el("option", { value: "" }, "Geen herinnering"),
      [24, 48, 72].map((u) => el("option", { value: String(u) }, `${u} uur op voorhand${u === 48 ? " (aangeraden)" : ""}`)),
      el("option", { value: "ander" }, "Ander aantal uur"));
    const uren = el("input", { type: "number", min: 1, max: 720, step: 1, inputMode: "numeric", "aria-label": "Aantal uur op voorhand" });
    const r = concept.reminder_uren_vooraf;
    keuze.value = r == null ? "" : [24, 48, 72].includes(r) ? String(r) : "ander";
    uren.value = r ?? "";
    uren.hidden = keuze.value !== "ander";
    keuze.addEventListener("change", () => {
      uren.hidden = keuze.value !== "ander";
      concept.reminder_uren_vooraf = keuze.value === "" ? null : keuze.value === "ander" ? (Number(uren.value) || 24) : Number(keuze.value);
      if (keuze.value === "ander") {
        uren.value = concept.reminder_uren_vooraf;
        uren.focus();
      }
      gewijzigd();
    });
    uren.addEventListener("input", () => {
      concept.reminder_uren_vooraf = Number(uren.value) || null;
      gewijzigd();
    });

    ontvangersSectie.replaceChildren(sectie({ titel: "Ontvangers", sub: `Afzender: ${ctx.pagina.afzender || "Henry Houser <backoffice@henryhouser.be>"}` },
      el("div", { className: "velden" },
        veld({ label: "Interne melding naar", input: invoer("alert_email", { placeholder: "backoffice@henryhouser.be" }), hulp: "Bij elke nieuwe boeking en elke annulering. Meerdere adressen scheiden met een komma." }),
        el("div", { className: "rij2" },
          veld({ label: "Naam van de verkoper", input: invoer("eigenaar_naam", { placeholder: "bv. familie Declercq" }), hulp: "Voor de aanspreking in het verkopersrapport." }),
          veld({ label: "E-mail van de verkoper", input: invoer("eigenaar_email", { type: "email" }), hulp: "Krijgt een melding bij elke nieuwe afspraak, met de link naar het verkopersrapport. Leeg = geen melding." })),
        veld({ label: "Antwoorden van bezoekers gaan naar", input: invoer("antwoord_aan", { type: "email" }), hulp: "Leeg = naar de afzender." }),
        el("div", { className: "veld" },
          el("label", { for: "herinnering" }, "Herinnering naar de bezoeker"),
          el("div", { className: "rij-herinnering" }, Object.assign(keuze, { id: "herinnering" }), uren)))));
  }

  // Teksten -------------------------------------------------------------------------------------------

  const tekstenSectie = el("div");
  function tekenTeksten(focusKiezer) {
    const m = MAILS.find((x) => x.soort === gekozen);
    const kiezer = el("div", { className: "mail-kiezer", role: "group", "aria-label": "Welke mail" }, MAILS.map((x) => {
      const eigen = concept[x.tekst] != null;
      const k = el("button", { type: "button", className: "mail-keuze", "aria-pressed": String(x.soort === gekozen) },
        el("strong", {}, x.titel), el("small", {}, `Aan: ${x.aan}${eigen ? " · eigen tekst" : ""}`));
      k.addEventListener("click", () => {
        gekozen = x.soort;
        tekenTeksten(true);
        tekenVoorbeeld();
      });
      return k;
    }));

    const tekst = el("textarea", { rows: 12, className: "mono-zacht" });
    tekst.value = concept[m.tekst] ?? STANDAARD[m.soort];
    const isStandaard = concept[m.tekst] == null;
    const standaardKnop = el("button", { type: "button", className: "link zacht" }, "Terug naar de standaardtekst");
    standaardKnop.hidden = isStandaard;
    standaardKnop.addEventListener("click", () => {
      concept[m.tekst] = null;
      gewijzigd();
      tekenTeksten();
      tekenVoorbeeld();
    });
    tekst.addEventListener("input", () => {
      concept[m.tekst] = tekst.value;
      standaardKnop.hidden = false;
      badge.hidden = true;
      gewijzigd();
    });
    const badge = el("span", { className: "badge kaal" }, "Standaardtekst");
    badge.hidden = !isStandaard;

    let onderwerp = null;
    if (m.onderwerp) {
      onderwerp = el("input", { autocomplete: "off" });
      onderwerp.value = concept[m.onderwerp] ?? "";
      onderwerp.addEventListener("input", () => {
        concept[m.onderwerp] = onderwerp.value;
        gewijzigd();
      });
    }
    const blokken = NAAR_BEZOEKER.includes(m.soort) ? BLOKKEN.bezoeker : m.soort === "eigenaar" ? BLOKKEN.eigenaar : BLOKKEN.intern;

    tekstenSectie.replaceChildren(sectie({
      titel: "Teksten", sub: "Lege regel = nieuwe alinea, **tussen sterretjes** = vet. Een blok zoals {agenda_knoppen} zet je op een eigen regel.",
    },
    el("div", { className: "mail-editor" },
      kiezer,
      el("div", { className: "mail-velden" },
        el("div", { className: "mail-uitleg" }, el("h3", {}, m.titel), badge, el("p", { className: "klein" }, m.wanneer)),
        onderwerp
          ? veld({ label: "Onderwerp", input: onderwerp })
          : el("p", { className: "klein" }, icoon("let"), m.soort === "annulering_alert"
            ? " Onderwerp: “Geannuleerd: ” + het onderwerp van de bevestiging."
            : " Onderwerp: hetzelfde als de bevestiging."),
        el("div", { className: "veld" }, el("label", { for: `mail-${m.soort}` }, "Tekst"), Object.assign(tekst, { id: `mail-${m.soort}` })),
        plaatshouders(tekst, [...PLAATSHOUDERS, ...blokken]),
        standaardKnop))));
    if (focusKiezer) tekstenSectie.querySelector('.mail-keuze[aria-pressed="true"]')?.focus();
  }

  // Voorbeeld -----------------------------------------------------------------------------------------

  const aanRegel = el("p", {});
  const onderwerpRegel = el("p", {});
  const frame = el("iframe", { title: "Voorbeeld van de mail", sandbox: "allow-same-origin" });
  frame.addEventListener("load", () => {
    const d = frame.contentDocument;
    if (d) frame.style.height = `${d.documentElement.scrollHeight}px`;
  });

  function tekenVoorbeeld() {
    const m = MAILS.find((x) => x.soort === gekozen);
    const p = { ...ctx.pagina, ...concept };
    const v = bouwVoorbeeld(m.soort, concept[m.tekst], p, voorbeeldBoeking, {
      fotoUrl: api.fotoUrl(api.mailFotoPad(ctx.pagina.foto_pad)),
      logo: api.logoUrl,
    });
    const aan = m.aan === "Bezoeker" ? `${voorbeeldBoeking.voornaam} ${voorbeeldBoeking.familienaam} (voorbeeld)`
      : m.aan === "Verkoper" ? (p.eigenaar_email || "Nog geen e-mailadres van de verkoper")
      : (p.alert_email || "Nog geen adres ingevuld");
    aanRegel.replaceChildren(el("span", { className: "label" }, "Aan"), aan);
    onderwerpRegel.replaceChildren(el("span", { className: "label" }, "Onderwerp"), v.onderwerp);
    frame.srcdoc = v.html;
  }
  let timer = null;
  function tekenVoorbeeldLater() {
    clearTimeout(timer);
    timer = setTimeout(tekenVoorbeeld, 200);
  }

  // Bewaren -------------------------------------------------------------------------------------------

  async function bewaar() {
    if (!geldigeLijst(concept.alert_email)) return toast("Een van de adressen bij Interne melding klopt niet.", { fout: true });
    if (!geldigeLijst(concept.eigenaar_email)) return toast("Het e-mailadres van de verkoper klopt niet.", { fout: true });
    if (concept.antwoord_aan && !EMAIL.test(concept.antwoord_aan)) return toast("Het adres bij Antwoorden klopt niet.", { fout: true });
    if (concept.reminder_uren_vooraf != null && !(concept.reminder_uren_vooraf >= 1)) return toast("Kies minstens 1 uur voor de herinnering.", { fout: true });
    for (const m of MAILS) {
      if (m.onderwerp && !String(concept[m.onderwerp] ?? "").trim()) {
        gekozen = m.soort;
        tekenTeksten();
        return toast(`Vul een onderwerp in voor de mail “${m.titel}”.`, { fout: true });
      }
    }
    const wijziging = {};
    for (const k of VELDEN) if ((concept[k] ?? null) !== (ctx.pagina[k] ?? null)) wijziging[k] = concept[k];
    balk.bezig(true);
    try {
      await ctx.bewaar(wijziging);
      concept = Object.fromEntries(VELDEN.map((k) => [k, ctx.pagina[k] ?? null]));
      origineel = JSON.stringify(concept);
      balk.toon(false);
      tekenOntvangers();
      tekenTeksten();
      tekenVoorbeeld();
      toast("Bewaard. Nieuwe mails gebruiken meteen deze teksten.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    } finally {
      balk.bezig(false);
    }
  }

  function herstel() {
    concept = JSON.parse(origineel);
    balk.toon(false);
    tekenOntvangers();
    tekenTeksten();
    tekenVoorbeeld();
  }

  tekenOntvangers();
  tekenTeksten();
  paneel.replaceChildren(el("div", { className: "raster-mails" },
    el("div", { className: "raster-kolom" }, ontvangersSectie, tekstenSectie),
    el("div", { className: "raster-kolom voorbeeld-kolom" },
      el("div", { className: "voorbeeld-plakker" },
        el("div", { className: "voorbeeld-kop" }, el("h2", {}, "Zo ziet de mail eruit")),
        el("div", { className: "mail-kop" }, aanRegel, onderwerpRegel),
        el("div", { className: "mail-scherm" }, frame),
        el("p", { className: "klein" }, "Met een voorbeeldbezoeker. Knoppen werken niet in dit voorbeeld.")))),
  balk.balk);
  tekenVoorbeeld();
}
