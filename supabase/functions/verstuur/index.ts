// POST /functions/v1/verstuur  (aangeroepen door pg_cron, met de service role key)
// Verstuurt alle berichten die vervallen zijn: reminders en mislukte pogingen.

import { verwerkWachtrij } from "../_shared/berichten.ts";
import { adminClient, env, fout, json } from "../_shared/http.ts";

Deno.serve(async (req) => {
  const sleutel = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (sleutel !== env("CRON_GEHEIM")) return fout("geweigerd", "Geen toegang.", 401);

  try {
    return json(await verwerkWachtrij(adminClient()));
  } catch (e) {
    console.error(e);
    return fout("server", String((e as Error)?.message ?? e), 500);
  }
});
