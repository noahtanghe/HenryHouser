// POST /functions/v1/monday
// Leest het bord "Henry Houser alle dossiers" in Monday en geeft elk dossier door aan
// monday_verwerk() (zie migratie 20261110000000_monday.sql): een dossier met een url
// krijgt een boekingspagina als concept.
//  - pg_cron, met CRON_GEHEIM: elke 10 minuten
//  - beheerplatform, met het token van een ingelogde beheerder: knop "Nu bijwerken"
// Kolommen worden op hun titel herkend (url website, status dossier, Makelaar, Bezoekdag,
// Homerun, Kick-Off prijs); de andere kolommen gaan mee als gegevens voor het beheer, behalve
// persoonsgegevens (naam klant, notaris, e-mail, telefoon): die verlaten Monday niet.
// Secrets: MONDAY_TOKEN (persoonlijk API-token), MONDAY_BORD_ID (standaard 65323001).

import { adminClient, corsHeaders, env, fout, json } from "../_shared/http.ts";

type Kolom = { id: string; type: string; text: string | null; value: string | null; column: { title: string } };
type Item = { id: string; name: string; group: { title: string } | null; column_values: Kolom[] };

const VELDEN = `id name group { title } column_values { id type text value column { title } }`;

async function monday(query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://api.monday.com/v2", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: env("MONDAY_TOKEN") },
    body: JSON.stringify({ query, variables }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.errors || data.error_message) {
    const melding = data.errors?.[0]?.message || data.error_message || `HTTP ${res.status}`;
    throw new Error(`Monday: ${melding}`);
  }
  return data.data;
}

async function alleItems(bord: string): Promise<Item[]> {
  const eerste = await monday(
    `query ($bord: [ID!]) { boards(ids: $bord) { items_page(limit: 200) { cursor items { ${VELDEN} } } } }`,
    { bord: [bord] },
  );
  const pagina = eerste.boards?.[0]?.items_page;
  if (!pagina) throw new Error(`Monday: bord ${bord} niet gevonden`);
  const items: Item[] = [...pagina.items];
  let cursor: string | null = pagina.cursor;
  while (cursor) {
    const volgende = await monday(
      `query ($cursor: String!) { next_items_page(limit: 200, cursor: $cursor) { cursor items { ${VELDEN} } } }`,
      { cursor },
    );
    items.push(...volgende.next_items_page.items);
    cursor = volgende.next_items_page.cursor;
  }
  return items;
}

const leesJson = (s: string | null) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

/** Tekst van een kolom; bij een link de url, bij een e-mailkolom het adres. */
function waarde(k: Kolom): string {
  const v = leesJson(k.value);
  if (k.type === "link") return (v?.url || k.text?.split(" - ").pop() || "").trim();
  if (k.type === "email") return (v?.email || k.text || "").trim();
  if (k.type === "date") return (v?.date || k.text || "").trim();
  return (k.text || "").trim();
}

const titel = (k: Kolom) => k.column.title.trim().toLowerCase();

// Zelfde regel als monday_veilig() in de databank.
const PERSOONLIJK = /klant|verkoper|eigenaar|notaris|mail|telefoon|gsm|rekening|iban|rijksregister/i;
const persoonlijk = (k: Kolom) => ["email", "phone"].includes(k.type) || PERSOONLIJK.test(k.column.title);

function zetOm(item: Item) {
  const kolommen = item.column_values;
  const zoek = (test: (k: Kolom) => boolean) => {
    const k = kolommen.find((k) => test(k) && waarde(k));
    return k ? waarde(k) : null;
  };
  const gegevens: Record<string, string> = {};
  for (const k of kolommen) {
    if (persoonlijk(k)) continue;
    const w = waarde(k);
    if (w) gegevens[k.column.title.trim()] = w;
  }
  return {
    id: item.id,
    naam: item.name,
    groep: item.group?.title ?? null,
    status: zoek((k) => titel(k) === "status dossier") ?? zoek((k) => k.type === "status" && titel(k).includes("status")),
    url: zoek((k) => titel(k) === "url website"),
    makelaar: zoek((k) => titel(k).startsWith("mak")),
    bezoekdag: zoek((k) => k.type === "date" && titel(k) === "bezoekdag"),
    homerun: zoek((k) => titel(k) === "homerun"),
    kickoff: zoek((k) => titel(k).replace(/[^a-z]/g, "") === "kickoffprijs"),
    gegevens,
  };
}

async function bijwerken() {
  const db = adminClient();
  try {
    const items = (await alleItems(env("MONDAY_BORD_ID", "65323001"))).map(zetOm);
    const { data, error } = await db.rpc("monday_verwerk", { p_items: items });
    if (error) throw new Error(error.message);
    return { dossiers: items.length, ...data };
  } catch (e) {
    const melding = String((e as Error)?.message ?? e);
    await db.rpc("monday_fout", { p_fout: melding });
    throw e;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fout("methode", "Alleen POST.", 405);

  const sleutel = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  try {
    if (!sleutel || sleutel !== env("CRON_GEHEIM")) {
      const db = adminClient();
      const { data } = await db.auth.getUser(sleutel);
      const email = data?.user?.email?.toLowerCase();
      const { data: beheerder } = email
        ? await db.from("beheerders").select("email").eq("email", email).maybeSingle()
        : { data: null };
      if (!beheerder) return fout("geweigerd", "Geen toegang.", 401);
    }
    if (!Deno.env.get("MONDAY_TOKEN")) {
      await adminClient().rpc("monday_fout", { p_fout: "MONDAY_TOKEN ontbreekt in de secrets van Supabase" });
      return fout("geen_token", "Het Monday-token ontbreekt nog.", 503);
    }
    return json(await bijwerken());
  } catch (e) {
    console.error(e);
    return fout("server", String((e as Error)?.message ?? e), 500);
  }
});
