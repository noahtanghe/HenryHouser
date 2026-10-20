// Kleine lijniconen (24×24, 1.8px lijn). icoon("kalender") geeft een <svg>-element.

const PADEN = {
  telefoon: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="1"/><path d="m3 7 9 6 9-6"/>',
  kalender: '<rect x="3.5" y="5" width="17" height="15" rx="1"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  klok: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  vink: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
  pijl: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  terug: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  locatie: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  extern: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  kopie: '<rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  kruis: '<path d="M6 6l12 12M18 6 6 18"/>',
  zoek: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>',
  potlood: '<path d="M4 20h4L19 9l-4-4L4 16v4zM13.5 6.5l4 4"/>',
  prullenbak: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  foto: '<rect x="3" y="5" width="18" height="14" rx="1"/><circle cx="9" cy="10" r="2"/><path d="m3 17 5-4 4 3 3-2 6 4"/>',
  oog: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  grafiek: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3"/>',
  huis: '<path d="M4 11 12 4l8 7v9H4z"/><path d="M10 20v-5h4v5"/>',
  mensen: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
  instellingen: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  print: '<path d="M7 9V4h10v5M7 17H5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>',
  pijlRechts: '<path d="m9 6 6 6-6 6"/>',
  pijlOmlaag: '<path d="m6 9 6 6 6-6"/>',
  meer: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  let: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>',
  archief: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10h14V9M10 13h4"/>',
  uitloggen: '<path d="M10 4H5v16h5M15 8l4 4-4 4M19 12H9"/>',
  slot: '<rect x="5" y="10.5" width="14" height="10" rx="1"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
  dashboard: '<rect x="3.5" y="3.5" width="7" height="9" rx="1"/><rect x="13.5" y="3.5" width="7" height="5" rx="1"/><rect x="13.5" y="11.5" width="7" height="9" rx="1"/><rect x="3.5" y="15.5" width="7" height="5" rx="1"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  verplaats: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>',
  bod: '<path d="M14 4 20 10M11 7l6 6M4 20l7-7M9.5 5.5l9 9-3 3-9-9z"/>',
  pijlOp: '<path d="M7 17 17 7M9 7h8v8"/>',
  pijlNeer: '<path d="M7 7l10 10M17 9v8H9"/>',
  omhoog: '<path d="m6 15 6-6 6 6"/>',
  upload: '<path d="M12 16V5M7 10l5-5 5 5M5 20h14"/>',
  notitie: '<path d="M5 4h14v11l-5 5H5z"/><path d="M14 20v-5h5M8.5 9h7M8.5 12.5h4"/>',
  verstuurd: '<path d="M21 3 10 14M21 3l-7 18-4-7-7-4z"/>',
  sleep: '<circle cx="9" cy="6" r="1.2"/><circle cx="15" cy="6" r="1.2"/><circle cx="9" cy="12" r="1.2"/><circle cx="15" cy="12" r="1.2"/><circle cx="9" cy="18" r="1.2"/><circle cx="15" cy="18" r="1.2"/>',
  gsm: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M11 18h2"/>',
  computer: '<rect x="3" y="4" width="18" height="12" rx="1"/><path d="M8 20h8M12 16v4"/>',
};

export function icoon(naam, klasse = "") {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  if (klasse) svg.setAttribute("class", klasse);
  svg.innerHTML = PADEN[naam] || "";
  return svg;
}
