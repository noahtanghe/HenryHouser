// Voorbeeld van de mails in het beheer. Volgt supabase/functions/_shared/tekst.ts (mailHtml,
// knoppen, gegevensTabel, render) en berichten.ts (standaardteksten, onderwerpen): pas je
// daar iets aan, doe het dan ook hier.

import { KANTOOR, telLink } from "../merk.js";
import { dagSleutel, datumLang, escapeHtml, getal, splitsAdres, startTekst, uur, vulIn } from "../tekst.js";

export const STANDAARD = {
  bevestiging: "Hallo {voornaam},\n\nJouw bezoek aan {adres} ligt vast op **{start}**.\n\n{agenda_knoppen}\n\n{annuleer_knop}",
  reminder: "Hallo {voornaam},\n\nEven ter herinnering: je bezoek aan {adres} staat gepland op **{start}**.\n\n{agenda_knoppen}\n\n{annuleer_knop}",
  eigenaar: "Er is een nieuw bezoek ingepland voor {adres} op **{start}**.\n\n{rapport_knop}",
  alert: "Nieuwe boeking voor {adres}.\n\n**{start}**\n\n{gegevens}",
  annulering: "Hallo {voornaam},\n\nJouw bezoek aan {adres} op {start} werd geannuleerd.",
  annulering_alert: "Geannuleerd: bezoek aan {adres} op **{start}**.\n\n{gegevens}",
  verplaatst:
    "Hallo {voornaam},\n\nJe bezoek aan {adres} is verplaatst naar **{start}**.\n\n{agenda_knoppen}\n\nKan je op dit nieuwe tijdstip niet komen? Laat het ons weten of annuleer via de knop hieronder.\n\n{annuleer_knop}",
};

export const NAAR_BEZOEKER = ["bevestiging", "reminder", "annulering", "verplaatst"];

const INKT = "#0a0a0a";
const TEKST = "#1f1d1a";
const CREME = "#f4eedd";
const LIJN = "#e2d8bf";
const ZACHT = "#57524a";
const OOG = "#b3400f";
const AQUA = "#c0dfdd";
const FONT = "Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const KNOP = {
  aqua: `background:${AQUA};color:${INKT};border:2px solid ${AQUA}`,
  lijn: `background:#ffffff;color:${INKT};border:2px solid ${INKT}`,
  zwart: `background:${INKT};color:#ffffff;border:2px solid ${INKT}`,
};

function knoppen(links, stijl = "aqua") {
  return `<p style="margin:0 0 18px">${links.map((l) =>
    `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;${KNOP[stijl]};text-decoration:none;font-family:${FONT};font-weight:600;font-size:14px;line-height:1.2">${escapeHtml(l.label)}</a>`).join("")}</p>`;
}

function gegevensTabel(rijen) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14px">${rijen.map(([k, v]) =>
    `<tr><td style="padding:7px 16px 7px 0;border-bottom:1px solid ${LIJN};color:${ZACHT};vertical-align:top;width:40%">${escapeHtml(k)}</td><td style="padding:7px 0;border-bottom:1px solid ${LIJN};color:${INKT};vertical-align:top">${escapeHtml(v)}</td></tr>`).join("")}</table>`;
}

function vulInMetEscape(sjabloon, waarden) {
  return escapeHtml(sjabloon).replace(/\{([a-z_]+)\}/g, (m, key) => (key in waarden ? escapeHtml(waarden[key] ?? "") : m)).replace(/ {2,}/g, " ");
}

function render(sjabloon, waarden, blokken) {
  const html = [];
  for (const alinea of String(sjabloon ?? "").replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const t = alinea.trim();
    const blok = t.match(/^\{([a-z_]+)\}$/);
    if (blok && blokken[blok[1]]) {
      html.push(blokken[blok[1]]);
      continue;
    }
    if (!t) continue;
    html.push(`<p style="margin:0 0 16px">${vulInMetEscape(t, waarden).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`);
  }
  return html.join("\n");
}

function mailHtml(inhoud, { foto, adres = "", kop, logo } = {}) {
  const { straat, gemeente } = splitsAdres(adres);
  const plaats = gemeente.replace(/^\d{4}\s*/, "");
  const logoHtml = logo
    ? `<img src="${escapeHtml(logo)}" width="120" height="45" alt="henry houser" style="display:block;border:0;width:120px;height:45px;font-family:${FONT};font-size:22px;font-weight:600;color:${INKT}">`
    : `<span style="font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${INKT}">henry houser</span>`;
  const fotoHtml = foto
    ? `<tr><td style="padding:0;line-height:0;font-size:0"><img src="${escapeHtml(foto)}" width="600" alt="${escapeHtml(adres)}" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : "";
  const kopHtml = kop && straat
    ? `${plaats ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${OOG}">${escapeHtml(plaats)}</p>` : ""}<h1 style="margin:0 0 22px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${INKT}">${escapeHtml(straat)}</h1>`
    : "";
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${CREME}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME}"><tr><td align="center" style="padding:28px 12px 32px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 20px"><a href="${KANTOOR.website}" style="text-decoration:none">${logoHtml}</a></td></tr>
<tr><td style="background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${fotoHtml}
<tr><td style="padding:32px 32px 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${TEKST}">
${kopHtml}${inhoud}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 4px 0;font-family:${FONT};font-size:12px;line-height:1.75;color:${ZACHT}">
<strong style="color:${INKT}">${KANTOOR.naam}</strong> &middot; ${KANTOOR.slogan}<br>
${KANTOOR.straat}, ${KANTOOR.gemeente} &middot; <a href="${telLink(KANTOOR.telefoon)}" style="color:${ZACHT}">${KANTOOR.telefoon}</a> &middot; <a href="mailto:${KANTOOR.email}" style="color:${ZACHT}">${KANTOOR.email}</a><br>
<a href="${KANTOOR.website}" style="color:${INKT}">henryhouser.be</a> &middot; ${KANTOOR.biv}
</td></tr>
</table></td></tr></table></body></html>`;
}

function gegevensRijen(velden, b) {
  const rijen = [];
  for (const v of velden || []) {
    const w = b.antwoorden?.[v.key];
    if (v.type === "checkbox") rijen.push([v.label, w ? "ja" : "nee"]);
    else if (w !== undefined && w !== null && w !== "") rijen.push([v.label, String(w)]);
  }
  return rijen;
}

export function onderwerpSjabloon(soort, p) {
  return {
    bevestiging: p.mail_onderwerp,
    reminder: p.mail_reminder_onderwerp,
    eigenaar: p.mail_onderwerp,
    alert: p.mail_onderwerp,
    annulering: p.mail_annulering_onderwerp,
    annulering_alert: `Geannuleerd: ${p.mail_onderwerp}`,
    verplaatst: p.mail_verplaatst_onderwerp || "Nieuw tijdstip voor je bezoek: {adres}",
  }[soort] || "";
}

/**
 * Bouwt een voorbeeldmail. p = (concept van) de pagina, b = een voorbeeldbezoeker,
 * opties: { fotoUrl, logo, publiekeUrl } (fotoUrl van de liggende uitsnede).
 */
export function bouwVoorbeeld(soort, sjabloon, p, b, opties = {}) {
  const waarden = {
    voornaam: b.voornaam, familienaam: b.familienaam ?? "", adres: p.adres, titel: p.titel,
    start: startTekst(b.start), datum: datumLang(dagSleutel(b.start)), start_uur: uur(b.start),
    eigenaar_naam: p.eigenaar_naam ?? "", kickoff_prijs: p.kickoff_prijs ? `${getal(p.kickoff_prijs)} euro` : "",
  };
  const blokken = {
    agenda_knoppen: knoppen([{ label: "Google Agenda", url: "#" }, { label: "Outlook", url: "#" }, { label: "Apple of andere (.ics)", url: "#" }]),
    annuleer_knop: knoppen([{ label: "Afspraak annuleren", url: "#" }], "lijn"),
    rapport_knop: knoppen([{ label: "Bekijk de interesse in je woning", url: "#" }], "zwart"),
    gegevens: gegevensTabel(gegevensRijen(p.formuliervelden, b)),
  };
  const metFoto = NAAR_BEZOEKER.includes(soort) || soort === "eigenaar";
  return {
    onderwerp: vulIn(onderwerpSjabloon(soort, p), waarden),
    html: mailHtml(render(sjabloon || STANDAARD[soort], waarden, blokken), {
      foto: metFoto ? opties.fotoUrl : null, adres: p.adres, kop: metFoto, logo: opties.logo,
    }),
  };
}
