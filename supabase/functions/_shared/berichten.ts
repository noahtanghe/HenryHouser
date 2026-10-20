import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { Afspraak, googleLink, ics, office365Link } from "./agenda.ts";
import { fotoUrl, functiesUrl, publiekeUrl } from "./http.ts";
import { verstuurMail } from "./mail.ts";
import {
  Blok,
  formatDatum,
  formatStart,
  formatUur,
  gegevensTabel,
  knoppen,
  mailHtml,
  render,
  vulIn,
  Waarden,
} from "./tekst.ts";

// deno-lint-ignore no-explicit-any
export type Pagina = Record<string, any>;
// deno-lint-ignore no-explicit-any
export type Boeking = Record<string, any>;

export interface Bericht {
  id: string;
  boeking_id: string;
  soort: "bevestiging" | "alert" | "eigenaar" | "reminder" | "annulering" | "annulering_alert" | "verplaatst";
  ontvanger: string;
  pogingen: number;
}

const MAX_POGINGEN = 5;

export function annuleerUrl(b: Boeking): string {
  return `${publiekeUrl()}/annuleer?token=${b.token}`;
}

export function icsUrl(b: Boeking): string {
  return `${functiesUrl()}/ics?token=${b.token}`;
}

/** Verkopersrapport: cijfers over de interesse, zonder persoonsgegevens. */
export function rapportUrl(p: Pagina): string {
  return `${publiekeUrl()}/rapport?token=${p.rapport_token}`;
}

const getal = new Intl.NumberFormat("nl-BE");

/** De foto in de mails: de liggende uitsnede die het beheer naast elke foto oplaadt. */
export function mailFotoPad(pad: string | null | undefined): string | null {
  if (!pad) return null;
  return /^[^/]+\/\d+\.jpg$/.test(pad) ? pad.replace(/\.jpg$/, "-breed.jpg") : pad;
}

export function afspraakVoor(p: Pagina, b: Boeking): Afspraak {
  return {
    token: b.token,
    start: b.start,
    eind: b.eind,
    titel: `Bezoek ${p.adres}`,
    adres: p.adres,
    beschrijving: `Bezoek aan ${p.adres} met Henry Houser.\nKan je niet komen? Annuleer via ${annuleerUrl(b)}`,
    volgnummer: b.ics_volgnummer ?? 0,
  };
}

export function agendaLinks(p: Pagina, b: Boeking) {
  const a = afspraakVoor(p, b);
  return { google: googleLink(a), office365: office365Link(a), ics: icsUrl(b) };
}

export function waarden(p: Pagina, b: Boeking): Waarden {
  return {
    voornaam: b.voornaam,
    familienaam: b.familienaam ?? "",
    adres: p.adres,
    titel: p.titel,
    start: formatStart(b.start),
    datum: formatDatum(b.start),
    start_uur: formatUur(b.start),
    eigenaar_naam: p.eigenaar_naam ?? "",
    kickoff_prijs: p.kickoff_prijs ? `${getal.format(p.kickoff_prijs)} euro` : "",
  };
}

/** Alle formulierantwoorden als rijen, in de volgorde van het formulier. */
function gegevensRijen(p: Pagina, b: Boeking): [string, string][] {
  const velden: { key: string; label: string; type: string }[] = p.formuliervelden ?? [];
  const rijen: [string, string][] = [];
  const gezien = new Set<string>();
  for (const v of velden) {
    gezien.add(v.key);
    const w = b.antwoorden?.[v.key];
    if (v.type === "checkbox") rijen.push([v.label, w ? "ja" : "nee"]);
    else if (w !== undefined && w !== null && w !== "") rijen.push([v.label, String(w)]);
  }
  for (const [k, w] of Object.entries(b.antwoorden ?? {})) {
    if (!gezien.has(k) && w !== "" && w !== null) rijen.push([k, String(w)]);
  }
  return rijen;
}

const STANDAARD: Record<Bericht["soort"], string> = {
  bevestiging: "Hallo {voornaam},\n\nJouw bezoek aan {adres} ligt vast op **{start}**.\n\n{agenda_knoppen}\n\n{annuleer_knop}",
  reminder: "Hallo {voornaam},\n\nEven ter herinnering: je bezoek aan {adres} staat gepland op **{start}**.\n\n{agenda_knoppen}\n\n{annuleer_knop}",
  eigenaar: "Er is een nieuw bezoek ingepland voor {adres} op **{start}**.\n\n{rapport_knop}",
  alert: "Nieuwe boeking voor {adres}.\n\n**{start}**\n\n{gegevens}",
  annulering: "Hallo {voornaam},\n\nJouw bezoek aan {adres} op {start} werd geannuleerd.",
  annulering_alert: "Geannuleerd: bezoek aan {adres} op **{start}**.\n\n{gegevens}",
  verplaatst:
    "Hallo {voornaam},\n\nJe bezoek aan {adres} is verplaatst naar **{start}**.\n\n{agenda_knoppen}\n\nKan je op dit nieuwe tijdstip niet komen? Laat het ons weten of annuleer via de knop hieronder.\n\n{annuleer_knop}",
};

/** Bouwt de mail voor één bericht op uit de pagina-teksten. */
export function bouwMail(soort: Bericht["soort"], p: Pagina, b: Boeking) {
  const w = waarden(p, b);
  const links = agendaLinks(p, b);
  const blokken: Record<string, Blok> = {
    agenda_knoppen: knoppen([
      { label: "Google Agenda", url: links.google },
      { label: "Outlook", url: links.office365 },
      { label: "Apple of andere (.ics)", url: links.ics },
    ]),
    annuleer_knop: knoppen([{ label: "Afspraak annuleren", url: annuleerUrl(b) }], "lijn"),
    rapport_knop: knoppen([{ label: "Bekijk de interesse in je woning", url: rapportUrl(p) }], "zwart"),
    gegevens: gegevensTabel(gegevensRijen(p, b)),
  };

  const sjabloon: string = {
    bevestiging: p.mail_bevestiging,
    reminder: p.mail_reminder,
    eigenaar: p.mail_eigenaar,
    alert: p.mail_alert,
    annulering: p.mail_annulering,
    annulering_alert: p.mail_annulering_alert,
    verplaatst: p.mail_verplaatst,
  }[soort] || STANDAARD[soort];

  const onderwerpSjabloon: string = {
    bevestiging: p.mail_onderwerp,
    reminder: p.mail_reminder_onderwerp,
    eigenaar: p.mail_onderwerp,
    alert: p.mail_onderwerp,
    annulering: p.mail_annulering_onderwerp,
    annulering_alert: `Geannuleerd: ${p.mail_onderwerp}`,
    verplaatst: p.mail_verplaatst_onderwerp || "Nieuw tijdstip voor je bezoek: {adres}",
  }[soort];

  const inhoud = render(sjabloon, w, blokken);
  const naarBezoeker = ["bevestiging", "reminder", "annulering", "verplaatst"].includes(soort);
  const metIcs = soort === "bevestiging" || soort === "annulering" || soort === "verplaatst";
  // De foto van het pand bovenaan, behalve in de interne meldingen.
  const metFoto = naarBezoeker || soort === "eigenaar";

  return {
    onderwerp: vulIn(onderwerpSjabloon, w),
    html: mailHtml(inhoud.html, {
      foto: metFoto ? fotoUrl(mailFotoPad(p.foto_pad)) : null,
      adres: p.adres,
      kop: metFoto,
      logo: `${publiekeUrl()}/img/logo-mail.png`,
    }),
    tekst: inhoud.tekst,
    // Interne mails: antwoorden gaat rechtstreeks naar de bezoeker.
    antwoordAan: naarBezoeker ? p.antwoord_aan : b.email,
    bijlagen: metIcs
      ? [{
        bestandsnaam: "afspraak.ics",
        inhoud: ics(afspraakVoor(p, b), soort === "annulering"),
        type: "text/calendar",
      }]
      : undefined,
  };
}

/**
 * Verstuurt berichten die klaarstaan. Met boekingId alleen die van één boeking
 * (meteen na boeken of annuleren); zonder: alles wat vervallen is (cron).
 */
export async function verwerkWachtrij(
  db: SupabaseClient,
  boekingId?: string,
): Promise<{ verzonden: number; mislukt: number }> {
  const { data: berichten, error } = await db.rpc("claim_berichten", {
    p_limit: 50,
    p_boeking_id: boekingId ?? null,
  });
  if (error) throw error;

  let verzonden = 0;
  let mislukt = 0;
  const cache = new Map<string, { p: Pagina; b: Boeking }>();

  for (const bericht of (berichten ?? []) as Bericht[]) {
    try {
      let ctx = cache.get(bericht.boeking_id);
      if (!ctx) {
        const { data: b, error: e1 } = await db.from("boekingen").select("*, paginas(*)")
          .eq("id", bericht.boeking_id).single();
        if (e1) throw e1;
        ctx = { p: b.paginas, b };
        cache.set(bericht.boeking_id, ctx);
      }
      const { p, b } = ctx;

      // Reminder voor een intussen geannuleerde boeking: niet sturen.
      if (bericht.soort === "reminder" && b.status !== "bevestigd") {
        await db.from("berichten").update({ status: "geannuleerd" }).eq("id", bericht.id);
        continue;
      }

      const m = bouwMail(bericht.soort, p, b);
      const { id } = await verstuurMail({ van: p.afzender, naar: bericht.ontvanger, ...m });
      await db.from("berichten").update({
        status: "verzonden",
        verzonden_op: new Date().toISOString(),
        extern_id: id,
        fout: null,
      }).eq("id", bericht.id);
      verzonden++;
    } catch (e) {
      mislukt++;
      console.error(`Bericht ${bericht.id} mislukt:`, e);
      await db.from("berichten").update({
        status: bericht.pogingen >= MAX_POGINGEN ? "mislukt" : "wachtrij",
        fout: String((e as Error)?.message ?? e).slice(0, 1000),
      }).eq("id", bericht.id);
    }
  }

  return { verzonden, mislukt };
}
