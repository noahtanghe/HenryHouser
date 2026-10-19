// Teksten uit de database invullen en omzetten naar HTML en platte tekst.
//
// Opmaak in de teksten:
//   - lege regel = nieuwe alinea, enkele regel = regelovergang
//   - **vet**
//   - {placeholder} wordt ingevuld (waarden worden ge-escaped)
//   - {agenda_knoppen}, {annuleer_knop} en {gegevens} op een eigen regel
//     worden blokken (knoppen of een tabel met de formulierantwoorden)

export const TIJDZONE = "Europe/Brussels";

export function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** "zondag 11 oktober 2026 om 09:40" */
export function formatStart(iso: string): string {
  const d = new Date(iso);
  const datum = new Intl.DateTimeFormat("nl-BE", {
    timeZone: TIJDZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
  return `${datum} om ${formatUur(iso)}`;
}

export function formatDatum(iso: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: TIJDZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(iso));
}

export function formatUur(iso: string): string {
  return new Intl.DateTimeFormat("nl-BE", {
    timeZone: TIJDZONE,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso)).replace(".", ":");
}

export type Waarden = Record<string, string | null | undefined>;

/** Vult {placeholders} in, zonder opmaak (voor onderwerpregels en schermteksten). */
export function vulIn(sjabloon: string, waarden: Waarden): string {
  return sjabloon.replace(/\{([a-z_]+)\}/g, (m, key) =>
    key in waarden ? (waarden[key] ?? "").toString() : m
  ).replace(/ {2,}/g, " ").trim();
}

export interface Blok {
  html: string;
  tekst: string;
}

/** Zet een sjabloon om naar HTML en platte tekst. */
export function render(
  sjabloon: string,
  waarden: Waarden,
  blokken: Record<string, Blok>,
): Blok {
  const alineas = sjabloon.replace(/\r\n/g, "\n").split(/\n\s*\n/);
  const html: string[] = [];
  const tekst: string[] = [];

  for (const alinea of alineas) {
    const trimmed = alinea.trim();
    const blokMatch = trimmed.match(/^\{([a-z_]+)\}$/);
    if (blokMatch && blokken[blokMatch[1]]) {
      html.push(blokken[blokMatch[1]].html);
      tekst.push(blokken[blokMatch[1]].tekst);
      continue;
    }
    if (!trimmed) continue;

    const ingevuld = vulInMetEscape(trimmed, waarden);
    html.push(
      `<p style="margin:0 0 16px">${
        ingevuld.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")
      }</p>`,
    );
    tekst.push(vulIn(trimmed, waarden).replace(/\*\*(.+?)\*\*/g, "$1"));
  }

  return { html: html.join("\n"), tekst: tekst.join("\n\n") };
}

function vulInMetEscape(sjabloon: string, waarden: Waarden): string {
  // Eerst escapen, dan invullen met ge-escapete waarden.
  return escapeHtml(sjabloon).replace(/\{([a-z_]+)\}/g, (m, key) =>
    key in waarden ? escapeHtml((waarden[key] ?? "").toString()) : m
  ).replace(/ {2,}/g, " ");
}

// Huisstijl van de mails, zoals henryhouser.be: crème achtergrond, wit vlak, zwart logo,
// aqua en zwarte knoppen, de gemeente in oranje kapitalen boven de straat.
// Het voorbeeld in het beheer (web/js/beheer/mailvoorbeeld.js) volgt deze code: hou ze gelijk.
const INKT = "#0a0a0a";
const TEKST = "#1f1d1a";
const CREME = "#f4eedd";
const LIJN = "#e2d8bf";
const ZACHT = "#57524a";
const OOG = "#b3400f";
const AQUA = "#c0dfdd";
const FONT = "Poppins, 'Helvetica Neue', Helvetica, Arial, sans-serif";

export const KANTOOR = {
  naam: "Henry Houser",
  slogan: "Vastgoed, maar beter.",
  adres: "Doorniksewijk 32, 8500 Kortrijk",
  telefoon: "056 98 01 18",
  email: "hallo@henryhouser.be",
  website: "https://www.henryhouser.be",
  biv: "Vastgoedmakelaar-bemiddelaar BIV 500914",
};

export type KnopStijl = "aqua" | "lijn" | "zwart";

const KNOP: Record<KnopStijl, string> = {
  aqua: `background:${AQUA};color:${INKT};border:2px solid ${AQUA}`,
  lijn: `background:#ffffff;color:${INKT};border:2px solid ${INKT}`,
  zwart: `background:${INKT};color:#ffffff;border:2px solid ${INKT}`,
};

export function knoppen(links: { label: string; url: string }[], stijl: KnopStijl = "aqua"): Blok {
  const html = `<p style="margin:0 0 18px">${
    links.map((l) =>
      `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:12px 18px;${
        KNOP[stijl]
      };text-decoration:none;font-family:${FONT};font-weight:600;font-size:14px;line-height:1.2">${escapeHtml(l.label)}</a>`
    ).join("")
  }</p>`;
  const tekst = links.map((l) => `${l.label}: ${l.url}`).join("\n");
  return { html, tekst };
}

export function gegevensTabel(rijen: [string, string][]): Blok {
  const html = `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;margin:0 0 18px;font-size:14px">${
    rijen.map(([k, v]) =>
      `<tr><td style="padding:7px 16px 7px 0;border-bottom:1px solid ${LIJN};color:${ZACHT};vertical-align:top;width:40%">${
        escapeHtml(k)
      }</td><td style="padding:7px 0;border-bottom:1px solid ${LIJN};color:${INKT};vertical-align:top">${escapeHtml(v)}</td></tr>`
    ).join("")
  }</table>`;
  const tekst = rijen.map(([k, v]) => `${k}: ${v}`).join("\n");
  return { html, tekst };
}

export interface MailOpties {
  /** URL van de foto van het pand (bovenaan, volle breedte) */
  foto?: string | null;
  /** Adres: de gemeente en de straat komen als kop boven de tekst (met kop: true) */
  adres?: string;
  kop?: boolean;
  /** URL van het logo (PNG) */
  logo?: string;
}

/** Omhulsel van elke mail: logo, optioneel de foto en de straat als kop, de inhoud en het kantoor. */
export function mailHtml(inhoud: string, opties: MailOpties = {}): string {
  const adres = opties.adres ?? "";
  const komma = adres.indexOf(",");
  const straat = komma < 0 ? adres : adres.slice(0, komma).trim();
  const plaats = komma < 0 ? "" : adres.slice(komma + 1).trim().replace(/^\d{4}\s*/, "");
  const logo = opties.logo
    ? `<img src="${escapeHtml(opties.logo)}" width="120" height="45" alt="henry houser" style="display:block;border:0;width:120px;height:45px;font-family:${FONT};font-size:22px;font-weight:600;color:${INKT}">`
    : `<span style="font-family:${FONT};font-size:22px;font-weight:600;letter-spacing:-0.02em;color:${INKT}">henry houser</span>`;
  const foto = opties.foto
    ? `<tr><td style="padding:0;line-height:0;font-size:0"><img src="${escapeHtml(opties.foto)}" width="600" alt="${
      escapeHtml(adres)
    }" style="display:block;width:100%;max-width:600px;height:auto;border:0"></td></tr>`
    : "";
  const kop = opties.kop && straat
    ? `${plaats ? `<p style="margin:0 0 6px;font-size:12px;line-height:1.4;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:${OOG}">${escapeHtml(plaats)}</p>` : ""}<h1 style="margin:0 0 22px;font-family:${FONT};font-size:26px;line-height:1.2;font-weight:600;letter-spacing:-0.01em;color:${INKT}">${escapeHtml(straat)}</h1>`
    : "";
  const tel = KANTOOR.telefoon.replace(/[^0-9+]/g, "");
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light">
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&amp;display=swap" rel="stylesheet"></head>
<body style="margin:0;padding:0;background:${CREME}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${CREME}"><tr><td align="center" style="padding:28px 12px 32px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px">
<tr><td style="padding:0 4px 20px"><a href="${KANTOOR.website}" style="text-decoration:none">${logo}</a></td></tr>
<tr><td style="background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">
${foto}
<tr><td style="padding:32px 32px 14px;font-family:${FONT};font-size:16px;line-height:1.6;color:${TEKST}">
${kop}${inhoud}
</td></tr>
</table>
</td></tr>
<tr><td style="padding:22px 4px 0;font-family:${FONT};font-size:12px;line-height:1.75;color:${ZACHT}">
<strong style="color:${INKT}">${KANTOOR.naam}</strong> &middot; ${KANTOOR.slogan}<br>
${KANTOOR.adres} &middot; <a href="tel:${tel}" style="color:${ZACHT}">${KANTOOR.telefoon}</a> &middot; <a href="mailto:${KANTOOR.email}" style="color:${ZACHT}">${KANTOOR.email}</a><br>
<a href="${KANTOOR.website}" style="color:${INKT}">henryhouser.be</a> &middot; ${KANTOOR.biv}
</td></tr>
</table></td></tr></table></body></html>`;
}
