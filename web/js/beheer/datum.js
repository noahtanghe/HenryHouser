// Rekenen met kale datums ("2026-10-31") en uren ("09:40"), los van tijdzones.
// Zelfde regels als alle_slots() in de database: een startmoment ligt tussen het beginuur
// en het einduur min de duur van een bezoek, om de zoveel minuten.

import { vandaagSleutel } from "../tekst.js";

export function plusDagen(d, n) {
  const t = new Date(`${d}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

/** ISO-weekdag: 1 = maandag … 7 = zondag */
export const isoWeekdag = (d) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;

/** Alle datums van een rij uit beschikbaarheid (rekening houdend met de weekdagen). */
export function dagenVan(rij) {
  const uit = [];
  for (let d = rij.datum_van; d <= rij.datum_tot && uit.length < 1000; d = plusDagen(d, 1)) {
    if ((rij.weekdagen || [1, 2, 3, 4, 5, 6, 7]).includes(isoWeekdag(d))) uit.push(d);
  }
  return uit;
}

export const alleDagen = (rijen) => [...new Set(rijen.flatMap(dagenVan))].sort();
export const komendeDagen = (rijen, vanaf = vandaagSleutel()) => alleDagen(rijen).filter((d) => d >= vanaf);
export const laatsteDag = (rijen) => alleDagen(rijen).at(-1) || null;

export const minuten = (u) => {
  const [h, m] = String(u).split(":").map(Number);
  return h * 60 + m;
};
export const alsUur = (min) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
export const kortUur = (u) => String(u).slice(0, 5);

export function startmomenten(van, tot, duur, interval) {
  const uit = [];
  if (!van || !tot || !(duur > 0) || !(interval > 0)) return uit;
  for (let m = minuten(van); m <= minuten(tot) - duur && uit.length < 500; m += interval) uit.push(alsUur(m));
  return uit;
}
