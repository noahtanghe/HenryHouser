// Gedeelde tekst- en opmaakhulpjes voor de boekingspagina, het beheer en het rapport.
// render() volgt supabase/functions/_shared/tekst.ts, zodat het voorbeeld van een mail
// in het beheer overeenkomt met wat de bezoeker krijgt.

export const TZ = "Europe/Brussels";

export function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const fmt = (opties) => new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, ...opties });
const fmtUur = fmt({ hour: "2-digit", minute: "2-digit" });
const fmtDagLang = fmt({ weekday: "long", day: "numeric", month: "long" });
const fmtDagJaar = fmt({ weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtDagKort = fmt({ weekday: "short", day: "numeric", month: "short" });
const fmtDatumKort = fmt({ day: "numeric", month: "short" });
const fmtDagSleutel = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
const fmtDatumUtc = (opties) => new Intl.DateTimeFormat("nl-BE", { timeZone: "UTC", ...opties });

export const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
export const uur = (iso) => fmtUur.format(new Date(iso)).replace(".", ":");
/** "zaterdag 31 oktober" */
export const dagLang = (iso) => fmtDagLang.format(new Date(iso));
/** "zaterdag 31 oktober 2026 om 09:40", zoals in de mails */
export const startTekst = (iso) => `${fmtDagJaar.format(new Date(iso))} om ${uur(iso)}`;
/** "za 31 okt" */
export const dagKort = (iso) => fmtDagKort.format(new Date(iso)).replace(/\./g, "");
export const datumKort = (iso) => fmtDatumKort.format(new Date(iso)).replace(/\./g, "");
/** "2026-10-31" in Brusselse tijd */
export const dagSleutel = (iso) => fmtDagSleutel.format(new Date(iso));
/** Voor een kale datum ("2026-10-31"): "zaterdag 31 oktober" */
export const datumLang = (d) => fmtDatumUtc({ weekday: "long", day: "numeric", month: "long" }).format(new Date(`${d}T00:00:00Z`));
export const datumKaal = (d, opties = { weekday: "short", day: "numeric", month: "short" }) =>
  fmtDatumUtc(opties).format(new Date(`${d}T00:00:00Z`)).replace(/\./g, "");
export const vandaagSleutel = () => fmtDagSleutel.format(new Date());

const euroFmt = new Intl.NumberFormat("nl-BE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
export const euro = (n) => (n == null || n === "" ? "" : euroFmt.format(n));
const getalFmt = new Intl.NumberFormat("nl-BE");
export const getal = (n) => getalFmt.format(n ?? 0);
export const procent = (deel, geheel) => (geheel ? `${Math.round((deel / geheel) * 100)}%` : "–");

/** "Aalbeeksesteenweg 57, 8500 Kortrijk" → { straat, gemeente } */
export function splitsAdres(adres) {
  const i = (adres || "").indexOf(",");
  if (i < 0) return { straat: adres || "", gemeente: "" };
  return { straat: adres.slice(0, i).trim(), gemeente: adres.slice(i + 1).trim() };
}

export function fotoUrl(cfg, pad) {
  if (!pad) return null;
  return `${cfg.supabaseUrl}/storage/v1/object/public/fotos/${pad.split("/").map(encodeURIComponent).join("/")}`;
}

/** Vult {placeholders} in, zonder opmaak. */
export function vulIn(sjabloon, waarden) {
  return String(sjabloon ?? "").replace(/\{([a-z_]+)\}/g, (m, key) =>
    key in waarden ? String(waarden[key] ?? "") : m
  ).replace(/ {2,}/g, " ").trim();
}

function vulInMetEscape(sjabloon, waarden) {
  return escapeHtml(sjabloon).replace(/\{([a-z_]+)\}/g, (m, key) =>
    key in waarden ? escapeHtml(waarden[key] ?? "") : m
  ).replace(/ {2,}/g, " ");
}

/** Zet een sjabloon om naar HTML: lege regel = alinea, **vet**, blokken op een eigen regel. */
export function render(sjabloon, waarden = {}, blokken = {}) {
  const html = [];
  for (const alinea of String(sjabloon ?? "").replace(/\r\n/g, "\n").split(/\n\s*\n/)) {
    const t = alinea.trim();
    const blok = t.match(/^\{([a-z_]+)\}$/);
    if (blok && blokken[blok[1]] != null) {
      html.push(blokken[blok[1]]);
      continue;
    }
    if (!t) continue;
    html.push(`<p>${vulInMetEscape(t, waarden).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`);
  }
  return html.join("\n");
}

/** Kleine DOM-helper: el("p", { className: "x" }, "tekst", kind) */
export function el(tag, props = {}, ...kinderen) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === "dataset") Object.assign(e.dataset, v);
    else if (k === "style" && typeof v === "object") Object.assign(e.style, v);
    else if (k.startsWith("aria-") || k === "role" || k === "for") e.setAttribute(k, v === true ? "" : v);
    else if (k in e) e[k] = v;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const k of kinderen.flat()) {
    if (k == null || k === false) continue;
    e.append(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return e;
}
