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

export function knoppen(links: { label: string; url: string }[]): Blok {
  const html = `<p style="margin:0 0 16px">${
    links.map((l) =>
      `<a href="${escapeHtml(l.url)}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 16px;border-radius:6px;background:#1f2a37;color:#ffffff;text-decoration:none;font-weight:600">${
        escapeHtml(l.label)
      }</a>`
    ).join("")
  }</p>`;
  const tekst = links.map((l) => `${l.label}: ${l.url}`).join("\n");
  return { html, tekst };
}

export function gegevensTabel(rijen: [string, string][]): Blok {
  const html = `<table style="border-collapse:collapse;margin:0 0 16px">${
    rijen.map(([k, v]) =>
      `<tr><td style="padding:4px 16px 4px 0;color:#6b7280;vertical-align:top">${escapeHtml(k)}</td><td style="padding:4px 0">${
        escapeHtml(v)
      }</td></tr>`
    ).join("")
  }</table>`;
  const tekst = rijen.map(([k, v]) => `${k}: ${v}`).join("\n");
  return { html, tekst };
}

export function mailHtml(inhoud: string): string {
  return `<!doctype html><html lang="nl"><body style="margin:0;padding:0;background:#f5f5f4">
<div style="max-width:600px;margin:0 auto;padding:24px 16px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#1f2937">
<div style="background:#ffffff;border-radius:8px;padding:24px">
${inhoud}
</div></div></body></html>`;
}
