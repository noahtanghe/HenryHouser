import { createClient, SupabaseClient } from "jsr:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

export function fout(code: string, melding: string, status = 400): Response {
  return json({ fout: code, melding }, status);
}

export function env(naam: string, standaard?: string): string {
  const waarde = Deno.env.get(naam) ?? standaard;
  if (waarde === undefined) throw new Error(`Omgevingsvariabele ${naam} ontbreekt`);
  return waarde;
}

export function adminClient(): SupabaseClient {
  // SUPABASE_SERVICE_ROLE_KEY zet Supabase zelf; SUPABASE_SECRET_KEY (sb_secret_...) kan als secret
  // gezet worden als de legacy-sleutels in het project uitgeschakeld zijn.
  const sleutel = Deno.env.get("SUPABASE_SECRET_KEY") || env("SUPABASE_SERVICE_ROLE_KEY");
  return createClient(env("SUPABASE_URL"), sleutel, {
    auth: { persistSession: false },
  });
}

/** Publieke basis-URL van de boekingssite, zonder slash op het einde. */
export function publiekeUrl(): string {
  return env("PUBLIEKE_URL", "https://afspraak.henryhouser.be").replace(/\/$/, "");
}

export function functiesUrl(): string {
  return `${env("SUPABASE_URL").replace(/\/$/, "")}/functions/v1`;
}

/** Publieke URL van een foto in de storage-bucket "fotos". */
export function fotoUrl(pad: string | null | undefined): string | null {
  if (!pad) return null;
  return `${env("SUPABASE_URL").replace(/\/$/, "")}/storage/v1/object/public/fotos/${pad.split("/").map(encodeURIComponent).join("/")}`;
}
