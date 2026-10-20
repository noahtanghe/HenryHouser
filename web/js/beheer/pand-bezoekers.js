// Bezoekers van één adres: komend, voorbij en geannuleerd, per dag. Per bezoeker de
// antwoorden, een notitie, de mailhistoriek en de herkomst; na het bezoek aanduiden wie er
// was en wie een bod uitbracht. Afspraken toevoegen (telefonisch), verplaatsen, annuleren,
// exporteren naar Excel en een lijst afdrukken voor de Homerun.

import { icoon } from "../iconen.js";
import { telLink } from "../merk.js";
import { cap, dagKort, dagSleutel, datumKaal, datumLang, el, startTekst, uur, vandaagSleutel } from "../tekst.js";
import { VASTE_VELDEN, VERPLICHTE_VELDEN } from "./standaard.js";
import { staat } from "./staat.js";
import {
  aantal, bevestig, downloadBestand, foutTekst, leeg, menuKnop, naamVan, openDialoog, relatief, segment, SOORT_LABEL,
  toast, veld, vinkje,
} from "./ui.js";

const nu = () => Date.now();
const FILTERS = {
  komend: (b) => b.status === "bevestigd" && new Date(b.start) >= nu(),
  voorbij: (b) => b.status !== "geannuleerd" && new Date(b.start) < nu(),
  geannuleerd: (b) => b.status === "geannuleerd",
  alle: () => true,
};
const FILTER_TEKST = { komend: "Komend", voorbij: "Voorbij", geannuleerd: "Geannuleerd", alle: "Alle" };

function statusTekst(b) {
  if (b.status === "geannuleerd") return { tekst: "Geannuleerd", klasse: "slecht" };
  if (b.status === "geweest") return { tekst: "Geweest", klasse: "goed" };
  if (b.status === "no-show") return { tekst: "Niet opgedaagd", klasse: "oranje" };
  return new Date(b.start) >= nu() ? { tekst: "Ingepland", klasse: "aqua" } : { tekst: "Nog aan te duiden", klasse: "kaal" };
}

const KANAAL = (k) => (!k ? "rechtstreeks" : k === "beheer" ? "ingevoerd in het beheer" : `via ${k}`);

/** Antwoorden als rijen, in de volgorde van het formulier (zoals in de mails). */
function antwoordRijen(velden, b) {
  const rijen = [];
  const gezien = new Set();
  for (const v of velden) {
    gezien.add(v.key);
    const w = b.antwoorden?.[v.key];
    if (v.type === "checkbox") rijen.push([v.label, w ? "ja" : "nee"]);
    else if (w !== undefined && w !== null && w !== "") rijen.push([v.label, String(w)]);
  }
  for (const [k, w] of Object.entries(b.antwoorden || {})) {
    if (!gezien.has(k) && w !== "" && w != null) rijen.push([k, String(w)]);
  }
  return rijen;
}

// Startmoment kiezen (toevoegen en verplaatsen) ---------------------------------------------------------

function slotKiezer(slots, { label = "Kies een startmoment" } = {}) {
  const dagen = [...new Set(slots.map((s) => dagSleutel(s.start)))];
  let dag = dagen[0];
  let gekozen = null;
  const metPlaatsen = slots.some((s) => s.plaatsen > 1);
  const dagRij = el("div", { className: "kies-dagen", role: "group", "aria-label": "Dag" });
  const uren = el("div", { className: "kies-uren", role: "group", "aria-label": "Startuur" });
  const samenvatting = el("p", { className: "kies-gekozen", "aria-live": "polite" }, "Nog geen startmoment gekozen.");

  function teken() {
    dagRij.replaceChildren(...(dagen.length > 1 ? dagen.map((d) => {
      const n = slots.filter((s) => dagSleutel(s.start) === d).length;
      const k = el("button", { type: "button", className: "kies-dag", "aria-pressed": String(d === dag) },
        el("strong", {}, datumKaal(d)), el("span", {}, `${n} vrij`));
      k.addEventListener("click", () => {
        dag = d;
        teken();
        dagRij.querySelector('[aria-pressed="true"]')?.focus();
      });
      return k;
    }) : [el("p", { className: "kies-een-dag" }, cap(datumLang(dag)))]));
    uren.replaceChildren(...slots.filter((s) => dagSleutel(s.start) === dag).map((s) => {
      const k = el("button", {
        type: "button", className: "kies-uur", "aria-pressed": String(gekozen === s.start),
        "aria-label": `${startTekst(s.start)}${metPlaatsen ? `, ${s.vrij} vrij` : ""}`,
      }, uur(s.start), metPlaatsen ? el("small", {}, `${s.vrij} vrij`) : null);
      k.addEventListener("click", () => {
        gekozen = s.start;
        samenvatting.textContent = `Gekozen: ${startTekst(s.start)}`;
        teken();
        uren.querySelector('[aria-pressed="true"]')?.focus();
      });
      return k;
    }));
  }
  teken();
  return {
    blok: el("div", { className: "kies" }, el("p", { className: "veld-label" }, label), dagRij, uren, samenvatting),
    waarde: () => gekozen,
  };
}

// Pagina ---------------------------------------------------------------------------------------------------

let toestand = { pandId: null, filter: null, zoek: "", open: new Set() };

export async function toon(paneel, ctx, query) {
  if (toestand.pandId !== ctx.id) toestand = { pandId: ctx.id, filter: null, zoek: "", open: new Set() };
  const gevraagd = query?.get("b");
  if (FILTERS[query?.get("filter")]) toestand.filter = query.get("filter");
  if (gevraagd) {
    const b = ctx.boekingen.find((x) => x.id === gevraagd);
    if (b) {
      toestand.open.add(b.id);
      toestand.filter = ["komend", "voorbij", "geannuleerd"].find((f) => FILTERS[f](b)) || "alle";
      toestand.zoek = "";
    }
  }
  if (!toestand.filter) {
    toestand.filter = ctx.boekingen.some(FILTERS.komend) ? "komend" : ctx.boekingen.some(FILTERS.voorbij) ? "voorbij" : "alle";
  }

  const velden = ctx.pagina.formuliervelden || [];
  const werkbalk = el("div", { className: "werkbalk" });
  const lijstEl = el("div", { className: "bezoekers", "aria-live": "polite" });
  const rijen = new Map(); // id → <li>

  function zichtbaar() {
    const q = toestand.zoek.trim().toLowerCase();
    return ctx.boekingen.filter(FILTERS[toestand.filter]).filter((b) => !q ||
      [naamVan(b), b.email, b.telefoon, b.antwoorden?.bron, b.notitie].filter(Boolean).join(" ").toLowerCase().includes(q));
  }

  // Werkbalk ------------------------------------------------------------------------------------------

  function tekenWerkbalk() {
    const zoek = el("input", {
      type: "search", className: "invoer", value: toestand.zoek, placeholder: "Zoek op naam, e-mail of telefoon",
      "aria-label": "Zoek een bezoeker", autocomplete: "off",
    });
    zoek.addEventListener("input", () => {
      toestand.zoek = zoek.value;
      tekenLijst();
    });
    const toevoegen = el("button", { type: "button", className: "knop zwart klein" }, icoon("plus"), "Afspraak toevoegen");
    toevoegen.addEventListener("click", nieuweAfspraak);
    werkbalk.replaceChildren(
      segment({
        label: "Welke bezoekers", actief: toestand.filter,
        opties: Object.keys(FILTERS).map((f) => ({ waarde: f, tekst: FILTER_TEKST[f], aantal: ctx.boekingen.filter(FILTERS[f]).length })),
        opKies: (f) => {
          toestand.filter = f;
          tekenWerkbalk();
          tekenLijst();
          werkbalk.querySelector('.segment [aria-pressed="true"]')?.focus();
        },
      }),
      el("label", { className: "zoek" }, icoon("zoek"), zoek),
      el("div", { className: "werkbalk-acties" },
        toevoegen,
        menuKnop({
          inhoud: [icoon("download"), "Exporteren"], klasse: "knop lijn klein",
          items: () => [
            { tekst: "Excel-bestand (CSV) van deze lijst", icoon: "download", actie: () => exporteer(zichtbaar()) },
            { tekst: "Alle bezoekers als CSV", icoon: "download", actie: () => exporteer(ctx.boekingen) },
            { lijn: true },
            { tekst: "Lijst afdrukken voor de Homerun", icoon: "print", actie: () => afdrukken(zichtbaar()) },
          ],
        })));
  }

  // Lijst -----------------------------------------------------------------------------------------------

  function tekenLijst() {
    rijen.clear();
    const lijst = zichtbaar();
    if (!lijst.length) {
      const q = toestand.zoek.trim();
      lijstEl.replaceChildren(q
        ? leeg({ klein: true, titel: `Niemand gevonden voor “${q}”`, tekst: "Zoek op voornaam, familienaam, e-mail of telefoon." })
        : leeg({
          titel: { komend: "Geen komende bezoeken", voorbij: "Nog geen voorbije bezoeken", geannuleerd: "Geen annuleringen", alle: "Nog geen bezoekers" }[toestand.filter],
          tekst: toestand.filter === "komend" || toestand.filter === "alle"
            ? "Deel de link van de pagina, of voeg zelf een afspraak toe voor wie telefonisch boekte." : null,
        }));
      return;
    }
    const groepen = new Map();
    for (const b of lijst) {
      const d = dagSleutel(b.start);
      if (!groepen.has(d)) groepen.set(d, []);
      groepen.get(d).push(b);
    }
    const dagen = [...groepen.keys()].sort();
    if (toestand.filter === "voorbij") dagen.reverse();
    lijstEl.replaceChildren(...dagen.map((d) => {
      const l = groepen.get(d).sort((a, b) => a.start.localeCompare(b.start));
      return el("section", { className: "bezoek-dag", "aria-label": cap(datumLang(d)) },
        el("h3", { className: "bezoek-dag-kop" }, cap(datumLang(d)),
          d === vandaagSleutel() ? el("span", { className: "badge oranje" }, "Vandaag") : null,
          el("span", { className: "bezoek-dag-aantal" }, aantal(l.length, "bezoek", "bezoeken"))),
        el("ul", { className: "bezoek-lijst" }, l.map((b) => {
          const li = rij(b);
          rijen.set(b.id, li);
          return li;
        })));
    }));
  }

  function herteken(b) {
    const oud = rijen.get(b.id);
    if (!oud) return;
    const nieuw = rij(b);
    rijen.set(b.id, nieuw);
    oud.replaceWith(nieuw);
  }

  async function wijzig(b, wijziging) {
    const nieuw = await staat.api.boekingWijzigen(b.id, wijziging);
    Object.assign(b, nieuw);
    return b;
  }

  function aanwezigheid(b) {
    const knoppen = [["geweest", "Geweest"], ["no-show", "Niet gekomen"]].map(([w, t]) => {
      const k = el("button", { type: "button", className: `toggle ${w}`, "aria-pressed": String(b.status === w) }, t);
      k.addEventListener("click", async () => {
        const doel = b.status === w ? "bevestigd" : w;
        k.disabled = true;
        try {
          await wijzig(b, { status: doel });
          herteken(b);
          rijen.get(b.id)?.querySelector(`.toggle.${w}`)?.focus();
          tekenWerkbalk();
        } catch (err) {
          toast(foutTekst(err), { fout: true });
          k.disabled = false;
        }
      });
      return k;
    });
    const bod = vinkje({ label: "Bod", checked: b.bod_uitgebracht });
    bod.input.addEventListener("change", async () => {
      try {
        await wijzig(b, { bod_uitgebracht: bod.input.checked });
        toast(bod.input.checked ? `Bod van ${b.voornaam} genoteerd.` : "Bod weggehaald.");
      } catch (err) {
        bod.input.checked = !bod.input.checked;
        toast(foutTekst(err), { fout: true });
      }
    });
    return el("div", { className: "aanwezig", role: "group", "aria-label": `Opvolging van ${naamVan(b)}` },
      el("div", { className: "toggles" }, knoppen), el("div", { className: "bod-vinkje" }, bod.blok));
  }

  function rij(b) {
    const voorbij = new Date(b.start) < nu();
    const actief = b.status !== "geannuleerd";
    const id = `bezoeker-${b.id}`;
    const open = toestand.open.has(b.id);
    const st = statusTekst(b);
    const toggle = el("button", {
      type: "button", className: "ikoon-knop bezoeker-open", "aria-expanded": String(open), "aria-controls": `${id}-detail`,
      "aria-label": `Details van ${naamVan(b)}`, title: "Details",
    }, icoon("pijlOmlaag"));
    const detail = el("div", { className: "bezoeker-detail", id: `${id}-detail`, hidden: !open });
    const li = el("li", { className: `bezoeker${actief ? "" : " geannuleerd"}${open ? " open" : ""}`, id },
      el("div", { className: "bezoeker-rij" },
        el("span", { className: "tijd" }, uur(b.start)),
        el("div", { className: "bezoeker-wie" },
          el("strong", {}, naamVan(b)),
          el("span", { className: "bezoeker-contact" },
            b.telefoon ? el("a", { href: telLink(b.telefoon) }, b.telefoon) : null,
            b.telefoon && b.email ? el("span", { "aria-hidden": "true" }, " · ") : null,
            b.email ? el("a", { href: `mailto:${b.email}` }, b.email) : null)),
        el("div", { className: "bezoeker-labels" },
          b.antwoorden?.bron ? el("span", { className: "label-tag", title: "Hoe vond je deze aanbieding?" }, b.antwoorden.bron) : null,
          b.via_beheer ? el("span", { className: "label-tag" }, "Via beheer") : null,
          b.verplaatst_op ? el("span", { className: "label-tag" }, "Verplaatst") : null,
          b.notitie ? el("span", { className: "label-tag notitie-tag", title: b.notitie }, icoon("notitie"), "Notitie") : null),
        el("div", { className: "bezoeker-status" },
          voorbij && actief ? aanwezigheid(b) : el("span", { className: `badge ${st.klasse}` }, st.tekst)),
        toggle),
      detail);
    if (open) vulDetail(b, detail);
    toggle.addEventListener("click", () => {
      const nuOpen = detail.hidden;
      detail.hidden = !nuOpen;
      toggle.setAttribute("aria-expanded", String(nuOpen));
      li.classList.toggle("open", nuOpen);
      if (nuOpen) {
        toestand.open.add(b.id);
        vulDetail(b, detail);
      } else toestand.open.delete(b.id);
    });
    return li;
  }

  // Details -------------------------------------------------------------------------------------------------

  function vulDetail(b, detail) {
    const actief = b.status !== "geannuleerd";
    const komend = b.status === "bevestigd" && new Date(b.start) >= nu();

    const antwoorden = el("dl", { className: "antwoorden" }, antwoordRijen(velden, b).map(([k, w]) =>
      el("div", {}, el("dt", {}, k), el("dd", {}, w))));

    const notitie = el("textarea", { className: "invoer", rows: 3, value: b.notitie || "", placeholder: "Bv. komt met architect, wil tweede bezoek", disabled: !actief });
    const notitieStatus = el("span", { className: "klein", "aria-live": "polite" });
    let timer = null;
    let laatste = b.notitie || "";
    const bewaarNotitie = async () => {
      clearTimeout(timer);
      const w = notitie.value.trim();
      if (w === laatste) return;
      notitieStatus.textContent = "Bewaren…";
      try {
        await wijzig(b, { notitie: w || null });
        laatste = w;
        notitieStatus.textContent = "Bewaard";
        const labels = rijen.get(b.id)?.querySelector(".bezoeker-labels");
        if (labels) {
          labels.querySelector(".notitie-tag")?.remove();
          if (w) labels.append(el("span", { className: "label-tag notitie-tag", title: w }, icoon("notitie"), "Notitie"));
        }
      } catch (err) {
        notitieStatus.textContent = foutTekst(err);
      }
    };
    notitie.addEventListener("input", () => {
      notitieStatus.textContent = "";
      clearTimeout(timer);
      timer = setTimeout(bewaarNotitie, 900);
    });
    notitie.addEventListener("blur", bewaarNotitie);

    const mails = el("ul", { className: "mail-historiek" }, el("li", { className: "klein" }, "Laden…"));
    staat.api.berichten(b.id).then((lijst) => {
      mails.replaceChildren(...(lijst.length ? lijst.map(mailRij) : [el("li", { className: "klein" }, "Geen mails.")]));
    }).catch((err) => mails.replaceChildren(el("li", { className: "klein" }, foutTekst(err))));

    const herkomst = [
      `Geboekt ${relatief(b.created_at)} (${dagKort(b.created_at)} ${uur(b.created_at)})`,
      KANAAL(b.kanaal),
      b.apparaat ? (b.apparaat === "mobiel" ? "op een gsm" : "op een computer") : null,
    ].filter(Boolean).join(", ");

    const acties = [];
    if (komend) {
      const verplaats = el("button", { type: "button", className: "knop lijn mini" }, icoon("verplaats"), "Verplaatsen");
      verplaats.addEventListener("click", () => verplaatsen(b));
      const annuleer = el("button", { type: "button", className: "knop lijn mini" }, icoon("kruis"), "Annuleren");
      annuleer.addEventListener("click", () => annuleren(b));
      acties.push(verplaats, annuleer);
    }
    const weg = el("button", { type: "button", className: "knop gevaar lijn mini" }, icoon("prullenbak"), "Verwijderen");
    weg.addEventListener("click", () => verwijderen(b));
    acties.push(weg);

    detail.replaceChildren(
      el("div", { className: "detail-raster" },
        el("div", {},
          el("h4", { className: "label" }, "Antwoorden"), antwoorden,
          el("h4", { className: "label" }, "Herkomst"),
          el("p", { className: "klein" }, cap(herkomst), "."),
          b.verplaatst_op ? el("p", { className: "klein" }, `Verplaatst op ${dagKort(b.verplaatst_op)} om ${uur(b.verplaatst_op)}.`) : null,
          b.geannuleerd_op ? el("p", { className: "klein" }, `Geannuleerd op ${dagKort(b.geannuleerd_op)} om ${uur(b.geannuleerd_op)}.`) : null),
        el("div", {},
          el("h4", { className: "label" }, el("label", { for: `${b.id}-notitie` }, "Notitie")),
          Object.assign(notitie, { id: `${b.id}-notitie` }),
          actief ? notitieStatus : el("p", { className: "klein" }, "Een geannuleerde afspraak kan je niet meer wijzigen."),
          el("h4", { className: "label" }, "Mails"), mails)),
      el("div", { className: "detail-acties" }, acties));
  }

  function mailRij(m) {
    let status;
    const lokaal = m.status === "verzonden" && m.extern_id === "lokaal";
    if (lokaal) status = "Niet echt verstuurd: er is nog geen mailserver gekoppeld";
    else if (m.status === "verzonden") status = `Verstuurd ${relatief(m.verzonden_op)}`;
    else if (m.status === "wachtrij") {
      status = new Date(m.gepland_op) > nu() ? `Gepland voor ${dagKort(m.gepland_op)} om ${uur(m.gepland_op)}` : "Wacht om verstuurd te worden";
    } else if (m.status === "bezig") status = "Wordt verstuurd";
    else if (m.status === "mislukt") status = `Mislukt${m.fout ? `: ${m.fout}` : ""}`;
    else status = "Niet verstuurd (niet meer nodig)";
    return el("li", { className: `mail-${lokaal ? "lokaal" : m.status}` },
      icoon(lokaal || m.status === "mislukt" ? "let" : m.status === "verzonden" ? "verstuurd" : "klok"),
      el("span", {}, el("strong", {}, SOORT_LABEL[m.soort] || m.soort), el("small", {}, m.ontvanger), el("small", {}, status)));
  }

  // Acties --------------------------------------------------------------------------------------------------

  async function verversNa(melding) {
    await ctx.herlaadBoekingen();
    tekenWerkbalk();
    tekenLijst();
    if (melding) toast(melding);
  }

  async function annuleren(b) {
    if (!(await bevestig({
      titel: "Afspraak annuleren?",
      tekst: [`${naamVan(b)} op ${startTekst(b.start)}.`, `${b.voornaam} krijgt een mail dat het bezoek geannuleerd is, en het startmoment komt weer vrij.`],
      ja: "Afspraak annuleren", nee: "Niet annuleren", gevaar: true,
    }))) return;
    try {
      await staat.api.annuleer(b.token);
      toestand.open.delete(b.id);
      await verversNa("Afspraak geannuleerd.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    }
  }

  async function verwijderen(b) {
    const komend = b.status === "bevestigd" && new Date(b.start) >= nu();
    if (!(await bevestig({
      titel: "Afspraak verwijderen?",
      tekst: [`De afspraak van ${naamVan(b)} wordt definitief verwijderd, met de mailhistoriek. Dit kan je niet ongedaan maken.`,
        komend ? "Er gaat geen mail naar de bezoeker. Wil je de bezoeker verwittigen? Annuleer de afspraak dan in de plaats." : null].filter(Boolean),
      ja: "Definitief verwijderen", gevaar: true,
    }))) return;
    try {
      await staat.api.boekingVerwijderen(b.id);
      toestand.open.delete(b.id);
      await verversNa("Afspraak verwijderd.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    }
  }

  async function vrijeSlots(zonder) {
    const slots = await staat.api.slots(ctx.id);
    return slots.filter((s) => s.vrij > 0 && s.start !== zonder);
  }

  function geenSlotsDialoog() {
    const naar = el("a", { className: "knop zwart klein", href: `#/p/${ctx.id}/dagen` }, "Naar bezoekdagen");
    const { sluit } = openDialoog({
      titel: "Geen vrije startmomenten",
      inhoud: [el("p", { className: "dialoog-tekst" }, "Er zijn geen vrije startmomenten in de toekomst. Plan eerst een bezoekdag in, of maak meer plaatsen per startmoment.")],
      voet: [naar],
    });
    naar.addEventListener("click", () => sluit());
  }

  async function nieuweAfspraak() {
    let slots;
    try {
      slots = await vrijeSlots();
    } catch (err) {
      return toast(foutTekst(err), { fout: true });
    }
    if (!slots.length) return geenSlotsDialoog();

    const kiezer = slotKiezer(slots);
    const invoer = {};
    const veldBlokken = velden.map((v) => {
      let input;
      if (v.type === "checkbox") {
        const vk = vinkje({ label: v.label });
        invoer[v.key] = vk.input;
        return el("div", { className: "veld" }, vk.blok);
      }
      if (v.type === "select") {
        input = el("select", {}, el("option", { value: "" }, "Niet ingevuld"), (v.opties || []).map((o) => el("option", { value: o }, o)));
      } else if (v.type === "textarea") input = el("textarea", { rows: 3 });
      else input = el("input", { type: v.type === "email" ? "email" : v.type === "tel" ? "tel" : "text", autocomplete: "off" });
      invoer[v.key] = input;
      return veld({ label: v.label, input, ster: VERPLICHTE_VELDEN.includes(v.key) });
    });
    const mail = vinkje({ label: "Stuur een bevestigingsmail naar de bezoeker", checked: true, hulp: "Met de agendaknoppen en de link om te annuleren." });
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const knop = el("button", { type: "submit", className: "knop zwart klein" }, "Afspraak toevoegen");
    const annuleer = el("button", { type: "button", className: "knop lijn klein" }, "Annuleren");
    const form = el("form", { className: "dialoog-form", noValidate: true },
      kiezer.blok, el("div", { className: "velden twee" }, veldBlokken), mail.blok, fout);
    const { sluit } = openDialoog({ titel: "Afspraak toevoegen", breed: true, inhoud: [form], voet: [annuleer, knop] });
    annuleer.addEventListener("click", () => sluit());
    knop.addEventListener("click", () => form.requestSubmit());
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const start = kiezer.waarde();
      const antwoorden = {};
      for (const v of velden) {
        const i = invoer[v.key];
        antwoorden[v.key] = v.type === "checkbox" ? i.checked : i.value.trim();
      }
      const melding = !start ? "Kies een startmoment."
        : !antwoorden.voornaam ? "Vul minstens de voornaam in."
        : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(antwoorden.email || "") ? "Vul een geldig e-mailadres in. Dat is nodig voor de bevestiging en om te annuleren."
        : null;
      fout.textContent = melding || "";
      fout.hidden = !melding;
      if (melding) return;
      knop.disabled = true;
      try {
        const b = await staat.api.boek(ctx.id, start, antwoorden, mail.input.checked);
        sluit();
        toestand.filter = "komend";
        toestand.zoek = "";
        toestand.open.add(b.id);
        await verversNa(mail.input.checked ? `Afspraak toegevoegd. ${antwoorden.voornaam} krijgt een bevestiging.` : "Afspraak toegevoegd.");
        document.getElementById(`bezoeker-${b.id}`)?.scrollIntoView({ block: "center" });
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
  }

  async function verplaatsen(b) {
    let slots;
    try {
      slots = await vrijeSlots(b.start);
    } catch (err) {
      return toast(foutTekst(err), { fout: true });
    }
    if (!slots.length) return geenSlotsDialoog();
    const kiezer = slotKiezer(slots, { label: "Nieuw startmoment" });
    const mail = vinkje({ label: `Stuur ${b.voornaam} een mail met het nieuwe tijdstip`, checked: true, hulp: "Met een bijgewerkte agenda-afspraak." });
    const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
    const knop = el("button", { type: "button", className: "knop zwart klein" }, "Verplaatsen");
    const annuleer = el("button", { type: "button", className: "knop lijn klein" }, "Annuleren");
    const { sluit } = openDialoog({
      titel: `${naamVan(b)} verplaatsen`, breed: true,
      inhoud: [el("p", { className: "dialoog-tekst" }, `Nu: ${startTekst(b.start)}.`), kiezer.blok, mail.blok, fout],
      voet: [annuleer, knop],
    });
    annuleer.addEventListener("click", () => sluit());
    knop.addEventListener("click", async () => {
      const start = kiezer.waarde();
      if (!start) {
        fout.textContent = "Kies een nieuw startmoment.";
        fout.hidden = false;
        return;
      }
      knop.disabled = true;
      try {
        await staat.api.verplaats(b.id, start, mail.input.checked);
        sluit();
        toestand.open.add(b.id);
        await verversNa(`Verplaatst naar ${startTekst(start)}.`);
      } catch (err) {
        fout.textContent = foutTekst(err);
        fout.hidden = false;
        knop.disabled = false;
      }
    });
  }

  // Exporteren en afdrukken -------------------------------------------------------------------------------

  function exporteer(lijst) {
    if (!lijst.length) return toast("Geen bezoekers om te exporteren.");
    const extra = velden.filter((v) => !VASTE_VELDEN.includes(v.key) || v.key === "nieuwsbrief");
    const kop = ["Datum", "Startuur", "Status", "Voornaam", "Familienaam", "E-mail", "Telefoon",
      ...extra.map((v) => v.label), "Bod", "Notitie", "Geboekt op", "Herkomst"];
    const cel = (w) => {
      let s = String(w ?? "");
      if (/^[=+\-@]/.test(s)) s = `'${s}`; // geen formules in Excel
      return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rijenCsv = [...lijst].sort((a, b) => a.start.localeCompare(b.start)).map((b) => [
      dagSleutel(b.start), uur(b.start), statusTekst(b).tekst, b.voornaam, b.familienaam, b.email, b.telefoon,
      ...extra.map((v) => (v.type === "checkbox" ? (b.antwoorden?.[v.key] ? "ja" : "nee") : b.antwoorden?.[v.key])),
      b.bod_uitgebracht ? "ja" : "", b.notitie, `${dagSleutel(b.created_at)} ${uur(b.created_at)}`, KANAAL(b.kanaal),
    ]);
    const tekst = "﻿" + [kop, ...rijenCsv].map((r) => r.map(cel).join(";")).join("\r\n");
    downloadBestand(`bezoekers-${ctx.pagina.slug}-${vandaagSleutel()}.csv`, tekst, "text/csv;charset=utf-8");
    toast(`${aantal(lijst.length, "bezoeker", "bezoekers")} geëxporteerd.`);
  }

  function afdrukken(lijst) {
    const actief = lijst.filter((b) => b.status !== "geannuleerd");
    if (!actief.length) return toast("Geen bezoekers om af te drukken.");
    const dagen = [...new Set(actief.map((b) => dagSleutel(b.start)))].sort();
    const vel = el("div", { className: "printlijst" },
      el("p", { className: "printlijst-merk" }, "henry houser"),
      el("h1", {}, `Bezoekers ${ctx.pagina.adres}`),
      el("p", {}, `Afgedrukt op ${dagKort(new Date().toISOString())} om ${uur(new Date().toISOString())}`),
      dagen.map((d) => {
        const l = actief.filter((b) => dagSleutel(b.start) === d).sort((a, b) => a.start.localeCompare(b.start));
        return el("section", {},
          el("h2", {}, `${cap(datumLang(d))} · ${aantal(l.length, "bezoek", "bezoeken")}`),
          el("table", {},
            el("thead", {}, el("tr", {}, ["Uur", "Naam", "Telefoon", "E-mail", "Bron", "Aanwezig", "Notities"].map((t) => el("th", {}, t)))),
            el("tbody", {}, l.map((b) => el("tr", {},
              el("td", {}, uur(b.start)), el("td", {}, naamVan(b)), el("td", {}, b.telefoon || ""), el("td", {}, b.email),
              el("td", {}, b.antwoorden?.bron || ""), el("td", { className: "vakje" }, "☐"), el("td", {}, b.notitie || ""))))));
      }));
    document.body.append(vel);
    document.body.classList.add("print-bezoekers");
    const opruimen = () => {
      vel.remove();
      document.body.classList.remove("print-bezoekers");
    };
    addEventListener("afterprint", opruimen, { once: true });
    print();
    setTimeout(() => {
      if (vel.isConnected && !matchMedia("print").matches) opruimen();
    }, 60000);
  }

  // Tekenen -----------------------------------------------------------------------------------------------

  paneel.replaceChildren(werkbalk, lijstEl);
  tekenWerkbalk();
  tekenLijst();
  if (gevraagd) {
    const doel = document.getElementById(`bezoeker-${gevraagd}`);
    doel?.scrollIntoView({ block: "center" });
    doel?.querySelector(".bezoeker-open")?.focus({ preventScroll: true });
  }
}
