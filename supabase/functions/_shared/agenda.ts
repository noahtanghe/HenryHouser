// Agenda-links (Google, Office 365) en .ics-bestand voor een boeking.

export interface Afspraak {
  token: string;
  start: string; // ISO
  eind: string; // ISO
  titel: string;
  adres: string;
  beschrijving: string;
  volgnummer?: number; // stijgt bij elke verplaatsing, zodat agenda's de afspraak bijwerken
}

/** 20261011T074000Z */
function utcStempel(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

export function googleLink(a: Afspraak): string {
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: a.titel,
    dates: `${utcStempel(a.start)}/${utcStempel(a.eind)}`,
    location: a.adres,
    details: a.beschrijving,
  });
  return `https://calendar.google.com/calendar/render?${p}`;
}

export function office365Link(a: Afspraak): string {
  const p = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: a.titel,
    startdt: new Date(a.start).toISOString(),
    enddt: new Date(a.eind).toISOString(),
    location: a.adres,
    body: a.beschrijving,
  });
  return `https://outlook.office.com/calendar/0/deeplink/compose?${p}`;
}

function icsEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Vouwt regels op 75 octetten, zoals RFC 5545 vraagt. */
function vouw(regel: string): string {
  const bytes = new TextEncoder().encode(regel);
  if (bytes.length <= 75) return regel;
  const delen: string[] = [];
  let huidig = "";
  let lengte = 0;
  for (const teken of regel) {
    const l = new TextEncoder().encode(teken).length;
    if (lengte + l > (delen.length ? 74 : 75)) {
      delen.push(huidig);
      huidig = "";
      lengte = 0;
    }
    huidig += teken;
    lengte += l;
  }
  delen.push(huidig);
  return delen.join("\r\n ");
}

export function ics(a: Afspraak, geannuleerd = false): string {
  const regels = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Henry Houser//Afspraak//NL",
    "CALSCALE:GREGORIAN",
    `METHOD:${geannuleerd ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VEVENT",
    `UID:${a.token}@afspraak.henryhouser.be`,
    `SEQUENCE:${(a.volgnummer ?? 0) + (geannuleerd ? 1 : 0)}`,
    `DTSTAMP:${utcStempel(new Date().toISOString())}`,
    `DTSTART:${utcStempel(a.start)}`,
    `DTEND:${utcStempel(a.eind)}`,
    `SUMMARY:${icsEscape(a.titel)}`,
    `LOCATION:${icsEscape(a.adres)}`,
    `DESCRIPTION:${icsEscape(a.beschrijving)}`,
    `STATUS:${geannuleerd ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return regels.map(vouw).join("\r\n") + "\r\n";
}
