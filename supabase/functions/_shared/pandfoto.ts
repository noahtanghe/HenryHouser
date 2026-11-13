// Foto van de pandsite: de hoofdfoto (og:image) van de pandsite ophalen en bewaren als foto van
// het adres, zodat de boekingspagina dezelfde foto toont als de site. Zie migratie
// 20261113120000_pandfoto.sql voor de regels (wanneer wel, wanneer niet).
// Pandsites zijn Wix-sites: daar zet Wix de grote foto bovenaan als og:image, en
// static.wixstatic.com levert ze meteen verkleind als JPEG.

import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const UA = "Mozilla/5.0 (compatible; HenryHouserAfspraak/1.0; +https://afspraak.henryhouser.be)";
const MAX_BYTES = 10 * 1024 * 1024; // zelfde limiet als de bucket "fotos"
const PER_KEER = 5; // per run, zodat de Monday-sync niet te lang duurt
const OPNIEUW_NA_UUR = 6;

const attribuut = (tag: string, naam: string) =>
  tag.match(new RegExp(`\\s${naam}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2).find((x) => x != null) ?? null;

const ontsnap = (s: string) =>
  s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

/** Meta-tags (property/name -> content) en de canonical link uit de HTML. */
function leesKop(html: string) {
  const kop = html.slice(0, html.search(/<body[\s>]/i) > 0 ? html.search(/<body[\s>]/i) : 200_000);
  const meta: Record<string, string> = {};
  for (const tag of kop.match(/<meta\s[^>]*>/gi) ?? []) {
    const sleutel = (attribuut(tag, "property") ?? attribuut(tag, "name"))?.toLowerCase();
    const inhoud = attribuut(tag, "content");
    if (sleutel && inhoud && !(sleutel in meta)) meta[sleutel] = ontsnap(inhoud.trim());
  }
  const canonical = (kop.match(/<link\s[^>]*rel\s*=\s*["']canonical["'][^>]*>/i) ?? [])[0];
  return { meta, canonical: canonical ? attribuut(canonical, "href") : null };
}

const host = (u: string | null | undefined) => {
  try {
    return u ? new URL(u).hostname.toLowerCase() : "";
  } catch {
    return "";
  }
};

export type Hoofdfoto = { bron: string; hoofd: string; breed: string | null };

/** Zoekt de hoofdfoto van een pandsite. Gooit een fout met een leesbare reden als er geen is. */
export async function zoekHoofdfoto(pandUrl: string): Promise<Hoofdfoto> {
  const res = await fetch(pandUrl, { headers: { "User-Agent": UA, Accept: "text/html" }, redirect: "follow" });
  if (!res.ok) throw new Error(`De pandsite antwoordt niet (HTTP ${res.status}).`);
  const { meta, canonical } = leesKop(await res.text());

  // Een pandsite die (na de verkoop) doorverwijst naar henryhouser.be heeft geen eigen foto meer.
  const echteHost = [host(res.url), host(canonical), host(meta["og:url"])].find((h) => h.includes("henryhouser"));
  if (echteHost) throw new Error("De pandsite verwijst door naar henryhouser.be.");

  const og = meta["og:image:secure_url"] || meta["og:image"] || meta["og:image:url"] || meta["twitter:image"];
  if (!og) throw new Error("Geen hoofdfoto gevonden op de pandsite.");
  const bron = new URL(og, res.url).href;

  // Wix: het origineel verkleinen tot max. 2000 px (zoals bij opladen in het beheer) en een liggende
  // uitsnede van 1200 × 800 voor bovenaan de mails.
  const wix = bron.match(/^https:\/\/static\.wixstatic\.com\/media\/([^/?#]+)/);
  if (wix) {
    const media = decodeURIComponent(wix[1]);
    const basis = `https://static.wixstatic.com/media/${encodeURIComponent(media)}`;
    return {
      bron: `${basis}`,
      hoofd: `${basis}/v1/fit/w_2000,h_2000,q_85/foto.jpg`,
      breed: `${basis}/v1/fill/w_1200,h_800,al_c,q_85/foto-breed.jpg`,
    };
  }
  return { bron, hoofd: bron, breed: null };
}

async function download(url: string) {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "image/jpeg,image/png,image/webp" } });
  if (!res.ok) throw new Error(`De foto van de pandsite kon niet geladen worden (HTTP ${res.status}).`);
  const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (!["image/jpeg", "image/png", "image/webp"].includes(type)) throw new Error(`De foto van de pandsite is geen jpg, png of webp (${type || "onbekend"}).`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (bytes.byteLength > MAX_BYTES) throw new Error("De foto van de pandsite is groter dan 10 MB.");
  if (bytes.byteLength < 2000) throw new Error("De foto van de pandsite is leeg.");
  return { bytes, type };
}

type Pagina = { id: string; pand_url: string; foto_pad: string | null; foto_bron: string | null };

/**
 * Haalt de foto van de pandsite op voor één adres en bewaart ze. Zonder `vervang` alleen als het
 * adres nog geen foto heeft (een foto uit het beheer gaat altijd voor).
 * Geeft het nieuwe pad terug, of null als er niets veranderde.
 */
export async function haalPandfoto(db: SupabaseClient, p: Pagina, vervang = false): Promise<string | null> {
  await db.from("paginas").update({ foto_auto_op: new Date().toISOString() }).eq("id", p.id);
  try {
    const foto = await zoekHoofdfoto(p.pand_url);
    if (vervang && p.foto_pad && p.foto_bron === foto.bron) {
      await db.from("paginas").update({ foto_auto_fout: null }).eq("id", p.id);
      return null; // staat er al
    }
    const hoofd = await download(foto.hoofd);
    const breed = foto.breed ? await download(foto.breed).catch(() => null) : null;

    // Zelfde paden als bij opladen in het beheer: <id>/<tijd>.jpg (+ -breed.jpg voor de mails).
    const ext = hoofd.type === "image/jpeg" ? "jpg" : hoofd.type.split("/")[1];
    const pad = `${p.id}/${Date.now()}.${ext}`;
    const opties = { cacheControl: "31536000", upsert: false };
    const bestanden = [pad];
    const { error: e1 } = await db.storage.from("fotos").upload(pad, hoofd.bytes, { ...opties, contentType: hoofd.type });
    if (e1) throw new Error(`Opslaan mislukt: ${e1.message}`);
    if (breed && ext === "jpg") {
      const padBreed = pad.replace(/\.jpg$/, "-breed.jpg");
      const { error: e2 } = await db.storage.from("fotos").upload(padBreed, breed.bytes, { ...opties, contentType: breed.type });
      if (!e2) bestanden.push(padBreed);
    }

    let q = db.from("paginas").update({ foto_pad: pad, foto_bron: foto.bron, foto_auto_fout: null }).eq("id", p.id);
    q = vervang ? q : q.is("foto_pad", null); // intussen zelf een foto opgeladen? Dan die houden.
    const { data, error } = await q.select("id");
    if (error || !data?.length) {
      await db.storage.from("fotos").remove(bestanden);
      if (error) throw new Error(error.message);
      return null;
    }
    if (vervang && p.foto_pad) {
      await db.storage.from("fotos").remove([p.foto_pad, p.foto_pad.replace(/\.jpg$/, "-breed.jpg")].filter((x, i, a) => a.indexOf(x) === i));
    }
    return pad;
  } catch (e) {
    const melding = String((e as Error)?.message ?? e);
    await db.from("paginas").update({ foto_auto_fout: melding }).eq("id", p.id);
    throw e;
  }
}

/** Vult de foto aan voor adressen met een pandsite en zonder foto (bij elke Monday-run). */
export async function pandfotosAanvullen(db: SupabaseClient) {
  const grens = new Date(Date.now() - OPNIEUW_NA_UUR * 3600e3).toISOString();
  const { data, error } = await db.from("paginas")
    .select("id, pand_url, foto_pad, foto_bron")
    .is("foto_pad", null)
    .eq("foto_auto_stop", false)
    .eq("gearchiveerd", false)
    .not("pand_url", "is", null)
    .or(`foto_auto_op.is.null,foto_auto_op.lt.${grens}`)
    .order("created_at", { ascending: false })
    .limit(PER_KEER);
  if (error) throw new Error(error.message);
  let fotos = 0;
  let mislukt = 0;
  for (const p of (data ?? []) as Pagina[]) {
    const url = p.pand_url.trim();
    try {
      if (await haalPandfoto(db, { ...p, pand_url: /^https?:\/\//i.test(url) ? url : `https://${url}` })) fotos++;
    } catch (e) {
      mislukt++;
      console.warn(`Foto van ${p.pand_url}:`, (e as Error)?.message ?? e);
    }
  }
  return { fotos, fotos_mislukt: mislukt };
}
