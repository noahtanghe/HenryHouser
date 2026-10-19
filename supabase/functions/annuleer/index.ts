// GET  /functions/v1/annuleer?token=...  → gegevens van de afspraak
// POST /functions/v1/annuleer { token }  → annuleert en verstuurt de mails

import { verwerkWachtrij } from "../_shared/berichten.ts";
import { adminClient, corsHeaders, fout, json } from "../_shared/http.ts";
import { formatStart } from "../_shared/tekst.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let token: string | null = null;
  if (req.method === "GET") token = new URL(req.url).searchParams.get("token");
  else if (req.method === "POST") token = (await req.json().catch(() => ({})))?.token ?? null;
  else return fout("methode", "Alleen GET of POST.", 405);

  if (!token || !UUID.test(token)) return fout("niet_gevonden", "Deze annuleerlink is ongeldig.", 404);

  const db = adminClient();

  if (req.method === "POST") {
    const { data, error } = await db.rpc("annuleer_boeking", { p_token: token });
    if (error) {
      if (error.message?.includes("boeking_niet_gevonden")) {
        return fout("niet_gevonden", "Deze annuleerlink is ongeldig.", 404);
      }
      if (error.message?.includes("bezoek_voorbij")) {
        return fout("voorbij", "Dit bezoek is al voorbij en kan niet meer geannuleerd worden.", 409);
      }
      console.error(error);
      return fout("server", "Er liep iets mis. Probeer het opnieuw.", 500);
    }
    const verzend = verwerkWachtrij(db, data.id).catch((e) => console.error(e));
    // deno-lint-ignore no-explicit-any
    const runtime = (globalThis as any).EdgeRuntime;
    if (runtime?.waitUntil) runtime.waitUntil(verzend);
    else await verzend;
  }

  const { data: b, error } = await db.from("boekingen")
    .select("voornaam, start, status, paginas(titel, adres, slug, foto_pad)")
    .eq("token", token).maybeSingle();
  if (error) return fout("server", "Er liep iets mis. Probeer het opnieuw.", 500);
  if (!b) return fout("niet_gevonden", "Deze annuleerlink is ongeldig.", 404);

  // deno-lint-ignore no-explicit-any
  const p = b.paginas as any;
  return json({
    voornaam: b.voornaam,
    start: b.start,
    start_tekst: formatStart(b.start),
    status: b.status,
    voorbij: new Date(b.start) <= new Date(),
    adres: p.adres,
    titel: p.titel,
    slug: p.slug,
    foto_pad: p.foto_pad,
  });
});
