// Kleine grafieken in HTML en CSS (geen bibliotheek): kolommen, capaciteit per uur,
// horizontale balken, meters en een trechter. Elke grafiek heeft een tooltip bij
// hover of focus en een tabelweergave, zodat geen enkele waarde alleen via kleur
// of hover te lezen is. Opmaak in huisstijl.css (.gr-*).

import { el, getal } from "./tekst.js";

/** Ronde schaalwaarden: 0, stap, 2×stap ... tot (boven) het maximum. */
function schaal(max, { doel = 3, ruimte = true } = {}) {
  if (max <= 0) return { top: 1, ticks: [0, 1] };
  const ruw = max / doel;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const stap = [1, 2, 5, 10].map((f) => f * macht).find((s) => s >= ruw) * 1;
  const stapGeheel = Math.max(1, Math.round(stap));
  let top = Math.ceil(max / stapGeheel) * stapGeheel;
  if (top === max && ruimte) top += stapGeheel; // ruimte voor het getal boven de hoogste kolom
  const ticks = [];
  for (let t = 0; t <= top; t += stapGeheel) ticks.push(t);
  return { top, ticks };
}

function tabel(koppen, rijen) {
  return el("details", { className: "gr-tabel" },
    el("summary", {}, "Toon als tabel"),
    el("div", { className: "gr-tabel-wrap" },
      el("table", {},
        el("thead", {}, el("tr", {}, koppen.map((k) => el("th", {}, k)))),
        el("tbody", {}, rijen.map((r) => el("tr", {}, r.map((c) => el("td", {}, c))))))));
}

/** Tooltip die een kolom volgt bij hover en focus. */
function metTooltip(plot, items) {
  const tip = el("div", { className: "gr-tip", role: "status" });
  tip.hidden = true;
  plot.append(tip);
  const toon = (item, tekst) => {
    tip.replaceChildren(...tekst.map((t, i) => el(i === 0 ? "strong" : "span", {}, t)));
    tip.hidden = false;
    const p = plot.getBoundingClientRect();
    const r = item.getBoundingClientRect();
    const midden = r.left - p.left + r.width / 2;
    tip.style.left = `${Math.min(Math.max(midden, 70), p.width - 70)}px`;
  };
  for (const { node, tekst } of items) {
    node.addEventListener("pointerenter", () => toon(node, tekst));
    node.addEventListener("focus", () => toon(node, tekst));
    node.addEventListener("pointerleave", () => (tip.hidden = true));
    node.addEventListener("blur", () => (tip.hidden = true));
  }
}

function xLabels(labels) {
  const n = labels.length;
  const elke = Math.max(1, Math.ceil(n / 6));
  return el("div", { className: "gr-x", "aria-hidden": "true", style: { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` } },
    labels.map((l, i) => el("span", {}, i % elke === 0 ? l : "")));
}

function raster(ticks, top) {
  return el("div", { className: "gr-raster", "aria-hidden": "true" },
    ticks.map((t) => el("div", { className: "gr-lijn", style: { bottom: `${(t / top) * 100}%` } }, el("span", {}, getal(t)))));
}

/**
 * Kolommen voor één reeks (bv. boekingen per dag).
 * data: [{ label, waarde, tip }]; kleur: "inkt" | "oranje"; eenheid: "boekingen"
 */
export function kolommen({ data, kleur = "inkt", eenheid = "", hoogte = 150, tabelKop = "Dag" }) {
  const max = Math.max(0, ...data.map((d) => d.waarde));
  const { top, ticks } = schaal(max);
  const piek = data.findIndex((d) => d.waarde === max && max > 0);
  const kolomRij = el("div", { className: "gr-kolommen", style: { gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` } });
  const items = data.map((d, i) => {
    const node = el("button", {
      type: "button", className: `gr-kolom ${kleur}`, "aria-label": `${d.tip || d.label}: ${getal(d.waarde)} ${eenheid}`,
    }, el("i", { style: { height: `${(d.waarde / top) * 100}%` } },
      i === piek ? el("b", { className: "gr-piek" }, getal(d.waarde)) : null));
    kolomRij.append(node);
    return { node, tekst: [`${getal(d.waarde)} ${eenheid}`, d.tip || d.label] };
  });
  const plot = el("div", { className: "gr-plot", style: { height: `${hoogte}px` } }, raster(ticks, top), kolomRij);
  metTooltip(plot, items);
  return el("div", { className: "gr" }, plot, xLabels(data.map((d) => d.label)),
    tabel([tabelKop, eenheid ? eenheid.charAt(0).toUpperCase() + eenheid.slice(1) : "Aantal"],
      data.map((d) => [d.tip || d.label, getal(d.waarde)])));
}

/** Capaciteit per startuur: het spoor is de capaciteit, de vulling de boekingen. */
export function capaciteitKolommen({ data, hoogte = 150 }) {
  const max = Math.max(0, ...data.map((d) => d.capaciteit));
  const { top, ticks } = schaal(max, { ruimte: false });
  const kolomRij = el("div", { className: "gr-kolommen", style: { gridTemplateColumns: `repeat(${data.length}, minmax(0, 1fr))` } });
  const items = data.map((d) => {
    const node = el("button", {
      type: "button", className: "gr-kolom inkt",
      "aria-label": `${d.label}: ${d.geboekt} van ${d.capaciteit} plaatsen geboekt`,
    },
      el("u", { style: { height: `${(d.capaciteit / top) * 100}%` } }),
      el("i", { style: { height: `${(d.geboekt / top) * 100}%` } }));
    kolomRij.append(node);
    return { node, tekst: [`${d.geboekt} van ${d.capaciteit} geboekt`, d.label] };
  });
  const plot = el("div", { className: "gr-plot", style: { height: `${hoogte}px` } }, raster(ticks, top), kolomRij);
  metTooltip(plot, items);
  return el("div", { className: "gr" }, plot, xLabels(data.map((d) => d.label)),
    el("p", { className: "gr-legende" },
      el("span", { className: "gr-sleutel inkt" }), "geboekt", el("span", { className: "gr-sleutel spoor" }), "plaatsen"),
    tabel(["Startuur", "Geboekt", "Plaatsen"], data.map((d) => [d.label, getal(d.geboekt), getal(d.capaciteit)])));
}

/** Horizontale balken, gesorteerd door de aanroeper. data: [{ label, waarde }] */
export function balken({ data, kleur = "inkt", leeg = "Nog geen gegevens.", metAandeel = true, tabelKop = "Bron" }) {
  if (!data.length || data.every((d) => !d.waarde)) return el("p", { className: "gr-leeg" }, leeg);
  const max = Math.max(...data.map((d) => d.waarde));
  const totaal = data.reduce((s, d) => s + d.waarde, 0);
  const rijen = data.map((d) => el("div", { className: "gr-balk", role: "listitem" },
    el("span", { className: "gr-balk-label" }, d.label),
    el("span", { className: "gr-balk-spoor" }, el("i", { className: kleur, style: { width: `${(d.waarde / max) * 100}%` } })),
    el("span", { className: "gr-balk-waarde" }, getal(d.waarde),
      metAandeel ? el("small", {}, ` ${Math.round((d.waarde / totaal) * 100)}%`) : null)));
  return el("div", { className: "gr" }, el("div", { className: "gr-balken", role: "list" }, rijen),
    tabel([tabelKop, "Aantal", "Aandeel"], data.map((d) => [d.label, getal(d.waarde), `${Math.round((d.waarde / totaal) * 100)}%`])));
}

/** Meter: deel van een geheel, bv. 12 van 15 plaatsen. */
export function meter(deel, geheel, { label } = {}) {
  const pct = geheel ? Math.min(100, (deel / geheel) * 100) : 0;
  return el("span", {
    className: `gr-meter${pct >= 100 ? " vol" : ""}`, role: "img",
    "aria-label": label || `${deel} van ${geheel}`,
  }, el("i", { style: { width: `${pct}%` } }));
}

/** Trechter: van paginaweergave tot bod. stappen: [{ label, waarde, uitleg }] */
export function trechter(stappen) {
  const eerste = stappen[0]?.waarde || 0;
  return el("ol", { className: "gr-trechter" }, stappen.map((s, i) => {
    const vorige = i ? stappen[i - 1].waarde : null;
    const breedte = eerste ? Math.max(s.waarde ? 2 : 0, (s.waarde / eerste) * 100) : 0;
    return el("li", {},
      el("div", { className: "gr-trechter-kop" },
        el("span", {}, s.label),
        el("strong", {}, getal(s.waarde)),
        el("small", {}, i && vorige ? `${Math.round((s.waarde / vorige) * 100)}% van vorige stap` : s.uitleg || "")),
      el("span", { className: "gr-trechter-spoor" }, el("i", { className: i ? "inkt" : "oranje", style: { width: `${breedte}%` } })));
  }));
}
