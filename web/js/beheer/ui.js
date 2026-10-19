// Bouwstenen van het beheer: meldingen, dialogen, menu's, segmenten, tegels, lege
// toestanden en foutteksten. Opmaak in beheer.css.

import { icoon } from "../iconen.js";
import { MONOGRAM } from "../merk.js";
import { cap, dagKort, dagSleutel, datumKaal, el, getal, uur, vandaagSleutel } from "../tekst.js";

let teller = 0;
const nieuwId = (voor) => `${voor}-${++teller}`;

export const aantal = (n, enkel, meer) => `${getal(n)} ${n === 1 ? enkel : meer}`;

export const SOORT_LABEL = {
  bevestiging: "Bevestiging",
  reminder: "Herinnering",
  verplaatst: "Nieuw tijdstip",
  annulering: "Annulering",
  eigenaar: "Melding aan verkoper",
  alert: "Interne melding",
  annulering_alert: "Interne melding annulering",
};

export const naamVan = (b) => [b.voornaam, b.familienaam].filter(Boolean).join(" ");

/** Datum als kalenderblaadje: "ZA" / "31" / "OKT". d = "2026-10-31" */
export function datumBlad(d) {
  const [dag, nr, maand] = datumKaal(d, { weekday: "short", day: "numeric", month: "short" }).split(" ");
  return el("span", { className: "datum-blad", "aria-hidden": "true" },
    el("span", {}, dag), el("strong", {}, nr), el("span", {}, maand));
}

// Melding onderaan ------------------------------------------------------------------

let toastTimer;
export function toast(tekst, { fout = false } = {}) {
  let t = document.getElementById("toast");
  if (!t) {
    t = el("div", { id: "toast", className: "toast", role: "status", "aria-live": "polite" });
    document.body.append(t);
  }
  // Staat er een dialoog open, dan komt de melding daarin; anders valt ze achter de grijze achtergrond.
  const dialoog = [...document.querySelectorAll("dialog[open]")].pop() || document.body;
  if (t.parentElement !== dialoog) dialoog.append(t);
  t.textContent = tekst;
  t.classList.toggle("fout", fout);
  t.hidden = false;
  t.style.animation = "none";
  void t.offsetHeight; // animatie opnieuw starten
  t.style.animation = "";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), fout ? 7000 : 3500);
}

// Foutteksten -------------------------------------------------------------------------

export function foutTekst(err) {
  const m = String(err?.message || err || "");
  if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return "Geen verbinding met de server. Controleer je internet en probeer opnieuw.";
  if (/Invalid login credentials/i.test(m)) return "Dit e-mailadres of wachtwoord klopt niet.";
  if (/Email not confirmed/i.test(m)) return "Dit e-mailadres is nog niet bevestigd.";
  if (/geen_beheerder|permission denied|row-level security|JWT|not authorized/i.test(m)) return "Je hebt met dit account geen toegang tot het beheer.";
  if (/paginas_slug_key|duplicate key.*slug/i.test(m)) return "Deze link is al in gebruik bij een ander adres. Kies een andere.";
  if (/paginas_slug_check/i.test(m)) return "De link mag alleen kleine letters, cijfers en streepjes bevatten.";
  if (/slot_niet_vrij/i.test(m)) return "Dit startmoment is niet (meer) vrij. Kies een ander moment.";
  if (/voornaam_en_email_verplicht/i.test(m)) return "Vul minstens een voornaam en een e-mailadres in.";
  if (/boekingen_pagina_id_fkey|foreign key/i.test(m)) return "Dit adres heeft afspraken en kan niet verwijderd worden. Archiveer het in de plaats.";
  if (/niet_bevestigd/i.test(m)) return "Deze afspraak is niet meer actief.";
  if (/bezoek_voorbij|al voorbij/i.test(m)) return "Dit bezoek is al voorbij.";
  if (/weak_password|at least \d+ characters/i.test(m)) return "Kies een langer wachtwoord, minstens 8 tekens.";
  if (/same_password|different from the old/i.test(m)) return "Kies een ander wachtwoord dan je huidige.";
  if (/rate limit|too many requests|429/i.test(m)) return "Even te veel pogingen na elkaar. Wacht een paar minuten en probeer opnieuw.";
  if (/too large|maximum allowed size|413/i.test(m)) return "Deze foto is te groot.";
  if (/check constraint/i.test(m)) return "Een van de waarden is niet geldig.";
  return m || "Er liep iets mis. Probeer het opnieuw.";
}

// Dialogen ----------------------------------------------------------------------------

/** Opent een modale dialoog. Geeft { dialoog, inhoud, voet, sluit(waarde) }. */
export function openDialoog({ titel, inhoud = [], voet = [], breed = false, opSluiten } = {}) {
  const id = nieuwId("dialoog");
  const terug = document.activeElement;
  const sluitKnop = el("button", { type: "button", className: "ikoon-knop dialoog-sluit", "aria-label": "Sluiten" }, icoon("kruis"));
  const kern = el("div", { className: "dialoog-inhoud" }, inhoud);
  const voetEl = el("div", { className: "dialoog-voet" }, voet);
  const d = el("dialog", { className: `dialoog${breed ? " breed" : ""}`, "aria-labelledby": id },
    el("div", { className: "dialoog-kop" }, el("h2", { id }, titel), sluitKnop),
    kern, voet.length ? voetEl : null);
  document.body.append(d);

  let gesloten = false;
  const sluit = (waarde) => {
    if (gesloten) return;
    gesloten = true;
    d.close();
    d.remove();
    if (terug?.isConnected) terug.focus({ preventScroll: true });
    opSluiten?.(waarde);
  };
  sluitKnop.addEventListener("click", () => sluit());
  d.addEventListener("cancel", (e) => {
    e.preventDefault();
    sluit();
  });
  // Klik op de achtergrond (het dialog-element zelf heeft geen opvulling).
  d.addEventListener("pointerdown", (e) => {
    if (e.target === d) sluit();
  });
  d.showModal();
  return { dialoog: d, inhoud: kern, voet: voetEl, sluit };
}

/** Vraagt een bevestiging. Geeft een Promise<boolean>. */
export function bevestig({ titel, tekst, ja = "Ja", nee = "Annuleren", gevaar = false }) {
  return new Promise((resolve) => {
    const jaKnop = el("button", { type: "button", className: `knop klein ${gevaar ? "gevaar" : "zwart"}` }, ja);
    const neeKnop = el("button", { type: "button", className: "knop klein lijn", autofocus: true }, nee);
    const { sluit } = openDialoog({
      titel,
      inhoud: [].concat(tekst).map((t) => (t instanceof Node ? t : el("p", { className: "dialoog-tekst" }, t))),
      voet: [neeKnop, jaKnop],
      opSluiten: (w) => resolve(w === true),
    });
    jaKnop.addEventListener("click", () => sluit(true));
    neeKnop.addEventListener("click", () => sluit(false));
  });
}

// Uitklapmenu ---------------------------------------------------------------------------

/**
 * Knop met een menu. items: [{ tekst, icoon, actie, href, nieuw, gevaar, uit, hint } | { kop } | { lijn: true }]
 * of een functie die zo'n lijst geeft (bij elke keer openen opnieuw opgebouwd).
 */
export function menuKnop({ inhoud, label, items, klasse = "knop lijn klein", rechts = true }) {
  const id = nieuwId("menu");
  const knop = el("button", {
    type: "button", className: klasse, "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": id,
    "aria-label": label || null,
  }, inhoud);
  const lijst = el("div", { className: `menu${rechts ? " rechts" : ""}`, role: "menu", id, hidden: true });
  const wrap = el("div", { className: "menu-wrap" }, knop, lijst);

  const buiten = (e) => {
    if (!wrap.contains(e.target)) sluit(false);
  };
  function sluit(focus) {
    lijst.hidden = true;
    knop.setAttribute("aria-expanded", "false");
    document.removeEventListener("pointerdown", buiten);
    if (focus) knop.focus();
  }
  function open() {
    const its = (typeof items === "function" ? items() : items).filter(Boolean);
    lijst.replaceChildren(...its.map((it) => {
      if (it.kop) return el("div", { className: "menu-kop", role: "presentation" }, it.kop);
      if (it.lijn) return el("div", { className: "menu-lijn", role: "separator" });
      const attrs = {
        className: `menu-item${it.gevaar ? " gevaar" : ""}`, role: "menuitem", tabIndex: -1,
        "aria-disabled": it.uit ? "true" : null,
      };
      const kinderen = [it.icoon ? icoon(it.icoon) : null,
        el("span", {}, it.tekst, it.hint ? el("small", {}, it.hint) : null)];
      const node = it.href && !it.uit
        ? el("a", { ...attrs, href: it.href, target: it.nieuw ? "_blank" : null, rel: it.nieuw ? "noopener" : null }, kinderen)
        : el("button", { ...attrs, type: "button" }, kinderen);
      node.addEventListener("click", (e) => {
        if (it.uit) return e.preventDefault();
        sluit(!it.href);
        it.actie?.();
      });
      return node;
    }));
    lijst.hidden = false;
    knop.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", buiten);
    lijst.querySelector("[role=menuitem]:not([aria-disabled=true])")?.focus();
  }

  knop.addEventListener("click", () => (lijst.hidden ? open() : sluit(false)));
  knop.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" && lijst.hidden) {
      e.preventDefault();
      open();
    }
  });
  lijst.addEventListener("keydown", (e) => {
    const alle = [...lijst.querySelectorAll("[role=menuitem]")];
    const i = alle.indexOf(document.activeElement);
    const ga = (j) => alle[(j + alle.length) % alle.length]?.focus();
    if (e.key === "ArrowDown") ga(i + 1);
    else if (e.key === "ArrowUp") ga(i - 1);
    else if (e.key === "Home") ga(0);
    else if (e.key === "End") ga(alle.length - 1);
    else if (e.key === "Escape") sluit(true);
    else if (e.key === "Tab") return sluit(false);
    else return;
    e.preventDefault();
  });
  return wrap;
}

// Kleine bouwstenen ---------------------------------------------------------------------------

export function ikoonKnop(naam, label, klasse = "") {
  return el("button", { type: "button", className: `ikoon-knop ${klasse}`.trim(), "aria-label": label, title: label }, icoon(naam));
}

/** Segmentknoppen (filter). opties: [{ waarde, tekst, aantal, href }] */
export function segment({ opties, actief, label, opKies }) {
  const rij = el("div", { className: "segment", role: "group", "aria-label": label });
  for (const o of opties) {
    const inhoud = [o.tekst, o.aantal != null ? el("span", { className: "segment-aantal" }, getal(o.aantal)) : null];
    const aan = o.waarde === actief;
    const knop = o.href
      ? el("a", { className: "segment-knop", href: o.href, "aria-current": aan ? "true" : null }, inhoud)
      : el("button", { type: "button", className: "segment-knop", "aria-pressed": String(aan) }, inhoud);
    if (!o.href) knop.addEventListener("click", () => opKies(o.waarde));
    rij.append(knop);
    if (aan) actiefInBeeld(rij, knop);
  }
  return rij;
}

/** Een rij die op een gsm horizontaal schuift: zet het actieve item in beeld. */
export function actiefInBeeld(rij, item) {
  requestAnimationFrame(() => {
    if (!item || rij.scrollWidth <= rij.clientWidth) return;
    const r = item.getBoundingClientRect(), b = rij.getBoundingClientRect();
    rij.scrollLeft += r.left - b.left - (b.width - r.width) / 2;
  });
}

/** Cijfertegel. */
export function tegel({ label, waarde, sub, extra, klasse = "" }) {
  return el("div", { className: `tegel ${klasse}`.trim() },
    el("span", { className: "label" }, label),
    el("strong", { className: "tegel-waarde" }, waarde),
    sub ? el("span", { className: "tegel-sub" }, sub) : null,
    extra || null);
}

/** Verschil met de vorige periode, als tekst (nooit kleur alleen). */
export function verschil(nu, vorige, periode = "vorige 30 dagen") {
  if (!nu && !vorige) return null;
  if (!vorige) return el("span", { className: "verschil op" }, icoon("pijlOp"), `nieuw t.o.v. ${periode}`);
  const pct = Math.round(((nu - vorige) / vorige) * 100);
  if (pct === 0) return el("span", { className: "verschil" }, `zelfde als ${periode}`);
  return el("span", { className: `verschil ${pct > 0 ? "op" : "neer"}` },
    icoon(pct > 0 ? "pijlOp" : "pijlNeer"), `${pct > 0 ? "+" : ""}${pct}% t.o.v. ${periode}`);
}

/** Witte kaart met een kop. */
export function sectie({ titel, sub, acties, klasse = "", id, kopNiveau = "h2" }, ...inhoud) {
  const kop = titel || acties
    ? el("header", { className: "sectie-kop" },
      el("div", {}, titel ? el(kopNiveau, { id: id ? `${id}-kop` : null }, titel) : null, sub ? el("p", { className: "sectie-sub" }, sub) : null),
      acties ? el("div", { className: "sectie-acties" }, acties) : null)
    : null;
  return el("section", { className: `sectie ${klasse}`.trim(), id: id || null, "aria-labelledby": id && titel ? `${id}-kop` : null },
    kop, inhoud);
}

/** Lege toestand met de salie boog. */
export function leeg({ titel, tekst, acties, klein = false }) {
  const boog = el("div", { className: "leeg-boog", "aria-hidden": "true" });
  boog.innerHTML = MONOGRAM;
  return el("div", { className: `leeg${klein ? " klein" : ""}` }, klein ? null : boog,
    titel ? el("h3", {}, titel) : null, tekst ? el("p", {}, tekst) : null,
    acties ? el("div", { className: "leeg-acties" }, acties) : null);
}

export function laadBlok(tekst = "Laden…") {
  return el("div", { className: "laad-blok", role: "status" }, el("div", { className: "laad-balk" }), el("span", { className: "sr" }, tekst));
}

export function foutBlok(err, opnieuw) {
  const knop = opnieuw ? el("button", { type: "button", className: "knop zwart klein" }, "Opnieuw proberen") : null;
  knop?.addEventListener("click", opnieuw);
  return el("div", { className: "fout-pagina", role: "alert" },
    el("h1", {}, "Dat lukte niet"), el("p", {}, foutTekst(err)), knop);
}

/** Kop van een pagina in het beheer. De h1 krijgt de focus na navigatie. */
export function paginaKop({ terug, oog, titel, sub, acties, voor }) {
  return el("header", { className: "pagina-kop" },
    terug ? el("a", { className: "terug", href: terug.href }, icoon("terug"), terug.tekst) : null,
    el("div", { className: "pagina-kop-rij" },
      voor || null,
      el("div", { className: "pagina-kop-tekst" },
        oog ? el("p", { className: "oog" }, oog) : null,
        el("h1", { tabIndex: -1 }, titel),
        sub ? el("div", { className: "pagina-kop-sub" }, sub) : null),
      acties ? el("div", { className: "pagina-kop-acties" }, acties) : null));
}

// Velden -----------------------------------------------------------------------------------

/** Label + invoer + hulptekst. */
export function veld({ label, input, hulp, ster = false, klasse = "", voor = null }) {
  if (!input.id) input.id = nieuwId("veld");
  const hulpEl = hulp ? el("p", { className: "hulp", id: `${input.id}-hulp` }, hulp) : null;
  if (hulpEl) input.setAttribute("aria-describedby", hulpEl.id);
  return el("div", { className: `veld ${klasse}`.trim() },
    el("label", { for: input.id }, label, ster ? el("span", { className: "ster", "aria-hidden": "true" }, " *") : null),
    voor ? el("div", { className: "voorvoegsel" }, el("span", { "aria-hidden": "true" }, voor), input) : input,
    hulpEl);
}

/** Vinkje met label (en optioneel een uitleg eronder). Geeft { blok, input }. */
export function vinkje({ label, checked = false, hulp, naam }) {
  const input = el("input", { type: "checkbox", id: nieuwId("vink"), name: naam || null });
  input.checked = !!checked;
  return {
    input,
    blok: el("label", { className: "vinkje", for: input.id }, input,
      el("span", {}, label, hulp ? el("small", { className: "vinkje-hulp" }, hulp) : null)),
  };
}

/** Balk onderaan zolang er niet-bewaarde wijzigingen zijn. */
export function bewaarBalk({ opBewaar, opHerstel }) {
  const bewaar = el("button", { type: "button", className: "knop klein aqua" }, "Bewaren");
  const herstel = el("button", { type: "button", className: "knop klein lijn" }, "Ongedaan maken");
  const balk = el("div", { className: "bewaarbalk", role: "region", "aria-label": "Wijzigingen bewaren", hidden: true },
    el("span", { className: "bewaarbalk-tekst" }, "Je hebt wijzigingen die nog niet bewaard zijn."),
    el("div", { className: "bewaarbalk-knoppen" }, herstel, bewaar));
  bewaar.addEventListener("click", opBewaar);
  herstel.addEventListener("click", opHerstel);
  return {
    balk,
    toon(aan) {
      balk.hidden = !aan;
    },
    bezig(aan) {
      bewaar.disabled = aan;
      bewaar.textContent = aan ? "Bewaren…" : "Bewaren";
    },
  };
}

// Allerlei -------------------------------------------------------------------------------------

export async function kopieer(tekst, melding = "Gekopieerd.") {
  try {
    await navigator.clipboard.writeText(tekst);
    toast(melding);
  } catch {
    const t = el("textarea", { value: tekst, readOnly: true, style: { position: "fixed", opacity: "0" } });
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    toast(ok ? melding : tekst);
  }
}

export function downloadBestand(naam, inhoud, type = "text/plain;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([inhoud], { type }));
  const a = el("a", { href: url, download: naam });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** "zonet", "12 min geleden", "vandaag om 09:12", "gisteren om 18:40", "3 dagen geleden", "za 31 okt" */
export function relatief(iso) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "zonet";
  if (s < 3600) return `${Math.floor(s / 60)} min geleden`;
  if (s < 6 * 3600) return `${Math.floor(s / 3600)} uur geleden`;
  const dag = dagSleutel(iso);
  if (dag === vandaagSleutel()) return `vandaag om ${uur(iso)}`;
  if (dag === dagSleutel(Date.now() - 864e5)) return `gisteren om ${uur(iso)}`;
  if (s < 7 * 86400) return `${Math.max(2, Math.round(s / 86400))} dagen geleden`;
  return dagKort(iso);
}

/** Status van een adres in het overzicht (rij uit beheer_overzicht). */
export function statusAdres(p) {
  if (p.gearchiveerd) return { tekst: "Archief", klasse: "kaal" };
  if (p.fase === "nieuw") return { tekst: p.actief ? "Nog in te plannen" : "Offline", klasse: p.actief ? "aqua" : "slecht" };
  if (p.fase === "afgelopen") return { tekst: "Afgelopen", klasse: "salie" };
  if (!p.actief) return { tekst: "Offline", klasse: "slecht" };
  return p.vrije_slots > 0 ? { tekst: "Online", klasse: "goed" } : { tekst: "Volzet", klasse: "oranje" };
}

export const badge = ({ tekst, klasse }) => el("span", { className: `badge ${klasse}` }, tekst);

/** "Hendrik" uit "hendrik@henryhouser.be" (alleen als het op een voornaam lijkt). */
export function voornaamUitEmail(email) {
  const deel = String(email || "").split("@")[0].split(/[._-]/)[0];
  return /^[a-z]{2,20}$/i.test(deel) ? cap(deel.toLowerCase()) : "";
}

export function slugVan(tekst) {
  return String(tekst || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}
