// Standaardinstellingen voor een nieuw adres dat niets overneemt van een ander adres.
// Zelfde formulier als aalbeeksesteenweg57 (overgenomen van YouCanBookMe).

export const BRON_OPTIES = [
  "website Henry Houser", "Facebook", "Instagram", "Immoweb", "Zimmo", "Realo", "Spotto",
  "Immoscoop", "Immomaps", "Luxevastgoed.be", "bord ter plaatse", "buurmailing", "via - via",
  "Ik weet het niet meer ;-)",
];

export const STANDAARD_VELDEN = [
  { key: "voornaam", label: "Voornaam", type: "text", verplicht: true },
  { key: "familienaam", label: "Familienaam", type: "text", verplicht: false },
  { key: "email", label: "E-mail", type: "email", verplicht: true },
  { key: "telefoon", label: "Telefoon", type: "tel", verplicht: true },
  { key: "nieuwsbrief", label: "Ja, ik ontvang graag de nieuwsbrief van Henry Houser", type: "checkbox", verplicht: false },
  { key: "bron", label: "Hoe vond je deze aanbieding?", type: "select", verplicht: true, opties: BRON_OPTIES },
];

export const STANDAARD_PAGINA = {
  intro: "Het startuur dat je kiest, is geen vaste duurtijd van je bezoek: blijf gerust zo lang je wenst. Krijg je graag advies van ouders, architect of aankoopmakelaar? Iedereen is welkom.",
  formuliervelden: STANDAARD_VELDEN,
  duur_min: 40,
  slot_interval_min: 40,
  max_per_slot: 1,
  min_minuten_vooraf: 60,
  reminder_uren_vooraf: 48,
  alert_email: "backoffice@henryhouser.be",
};

// Velden die in vaste kolommen van een boeking landen. voornaam en email zijn altijd nodig.
export const VASTE_VELDEN = ["voornaam", "familienaam", "email", "telefoon", "nieuwsbrief"];
export const VERPLICHTE_VELDEN = ["voornaam", "email"];
