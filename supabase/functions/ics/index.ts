// GET /functions/v1/ics?token=...  → .ics-bestand van de afspraak

import { afspraakVoor } from "../_shared/berichten.ts";
import { ics } from "../_shared/agenda.ts";
import { adminClient, corsHeaders } from "../_shared/http.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const token = new URL(req.url).searchParams.get("token");
  if (!token || !UUID.test(token)) return new Response("Niet gevonden", { status: 404 });

  const { data: b } = await adminClient().from("boekingen").select("*, paginas(*)")
    .eq("token", token).maybeSingle();
  if (!b) return new Response("Niet gevonden", { status: 404 });

  return new Response(ics(afspraakVoor(b.paginas, b), b.status === "geannuleerd"), {
    headers: {
      ...corsHeaders,
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="afspraak.ics"',
    },
  });
});
