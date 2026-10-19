// POST /functions/v1/verstuur
//  - pg_cron, met CRON_GEHEIM: verstuurt alles wat vervallen is (reminders, herkansingen)
//  - beheerplatform, met het token van een ingelogde beheerder en { boeking_id }:
//    verstuurt meteen de berichten van die boeking (na toevoegen of verplaatsen)

import { verwerkWachtrij } from "../_shared/berichten.ts";
import { adminClient, corsHeaders, env, fout, json } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fout("methode", "Alleen POST.", 405);

  const sleutel = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const db = adminClient();

  try {
    if (sleutel && sleutel === env("CRON_GEHEIM")) {
      return json(await verwerkWachtrij(db));
    }

    const { data } = await db.auth.getUser(sleutel);
    const email = data?.user?.email?.toLowerCase();
    if (!email) return fout("geweigerd", "Geen toegang.", 401);
    const { data: beheerder } = await db.from("beheerders").select("email").eq("email", email).maybeSingle();
    if (!beheerder) return fout("geweigerd", "Geen toegang.", 401);

    const { boeking_id } = await req.json().catch(() => ({}));
    if (typeof boeking_id !== "string" || !UUID.test(boeking_id)) {
      return fout("ongeldig", "Ongeldige aanvraag.");
    }
    return json(await verwerkWachtrij(db, boeking_id));
  } catch (e) {
    console.error(e);
    return fout("server", String((e as Error)?.message ?? e), 500);
  }
});
