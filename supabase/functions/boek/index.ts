// POST /functions/v1/boek
// Body: { slug, start, antwoorden: { voornaam, email, ... }, website? }
// "website" is een honeypot-veld: bots vullen het in, mensen zien het niet.

import { agendaLinks, verwerkWachtrij, waarden } from "../_shared/berichten.ts";
import { adminClient, corsHeaders, fout, json } from "../_shared/http.ts";
import { vulIn } from "../_shared/tekst.ts";
import { valideer } from "../_shared/validatie.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fout("methode", "Alleen POST.", 405);

  let body: { slug?: string; start?: string; antwoorden?: Record<string, unknown>; website?: string };
  try {
    body = await req.json();
  } catch {
    return fout("ongeldig", "Ongeldige aanvraag.");
  }

  const { slug, start, antwoorden = {}, website } = body;
  if (website) return fout("ongeldig", "Ongeldige aanvraag.");
  if (!slug || !start || Number.isNaN(Date.parse(start))) {
    return fout("ongeldig", "Kies eerst een tijdslot.");
  }

  const db = adminClient();
  const { data: pagina, error: e1 } = await db.from("paginas").select("*")
    .eq("slug", slug).eq("actief", true).maybeSingle();
  if (e1) return fout("server", "Er liep iets mis. Probeer het opnieuw.", 500);
  if (!pagina) return fout("niet_gevonden", "Deze boekingspagina bestaat niet (meer).", 404);

  const v = valideer(pagina.formuliervelden ?? [], antwoorden);
  if ("melding" in v) return fout("validatie", v.melding);

  const { data: boeking, error: e2 } = await db.rpc("maak_boeking", {
    p_slug: slug,
    p_start: new Date(start).toISOString(),
    p_antwoorden: v.antwoorden,
  });
  if (e2) {
    if (e2.message?.includes("slot_niet_vrij")) {
      return fout("slot_niet_vrij", "Dit tijdslot is net volzet. Kies een ander tijdslot.", 409);
    }
    console.error(e2);
    return fout("server", "Er liep iets mis. Probeer het opnieuw.", 500);
  }

  // Mails meteen versturen; wat mislukt, pikt de cron later op.
  const verzend = verwerkWachtrij(db, boeking.id).catch((e) => console.error(e));
  // deno-lint-ignore no-explicit-any
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime?.waitUntil) runtime.waitUntil(verzend);
  else await verzend;

  return json({
    start: boeking.start,
    eind: boeking.eind,
    scherm: vulIn(pagina.bevestigingsscherm, waarden(pagina, boeking)),
    agenda: agendaLinks(pagina, boeking),
  });
});
