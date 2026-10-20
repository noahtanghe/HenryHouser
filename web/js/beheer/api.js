// Gegevenslaag van het beheer: Supabase Auth + tabellen (via RLS) + beheerfuncties.
// main.js gebruikt window.BEHEER_API als die bestaat (demo met voorbeeldgegevens).

import { fotoUrl } from "../tekst.js";

export function supabaseApi(cfg) {
  const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
    auth: { flowType: "pkce", detectSessionInUrl: true, persistSession: true },
  });
  const ok = ({ data, error }) => {
    if (error) throw error;
    return data;
  };
  const basis = (cfg.publiekeUrl || location.origin).replace(/\/$/, "");

  async function functie(naam, body, metToken = false) {
    const headers = { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey };
    if (metToken) {
      const { data } = await sb.auth.getSession();
      headers.Authorization = `Bearer ${data.session?.access_token}`;
    }
    const res = await fetch(`${cfg.supabaseUrl}/functions/v1/${naam}`, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.melding || `${naam} mislukt (${res.status})`);
    return data;
  }

  const api = {
    // Inloggen ----------------------------------------------------------------
    async sessie() {
      return (await sb.auth.getSession()).data.session?.user?.email ?? null;
    },
    async login(email, wachtwoord) {
      const { data, error } = await sb.auth.signInWithPassword({ email, password: wachtwoord });
      if (error) throw error;
      return data.user.email;
    },
    uitloggen: () => sb.auth.signOut(),
    async wachtwoordVergeten(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/beheer` });
      if (error) throw error;
    },
    async wachtwoordZetten(wachtwoord) {
      const { error } = await sb.auth.updateUser({ password: wachtwoord });
      if (error) throw error;
    },
    opHerstel(cb) {
      sb.auth.onAuthStateChange((gebeurtenis) => {
        if (gebeurtenis === "PASSWORD_RECOVERY") cb();
      });
    },

    // Overzichten ---------------------------------------------------------------
    dashboard: async () => ok(await sb.rpc("beheer_dashboard")),
    overzicht: async () => ok(await sb.rpc("beheer_overzicht")),
    statistiek: async (id) => ok(await sb.rpc("beheer_statistiek", { p_pagina_id: id })),

    // Pagina's ------------------------------------------------------------------
    pagina: async (id) => ok(await sb.from("paginas").select("*").eq("id", id).single()),
    paginaBewaren: async (id, velden) => ok(await sb.from("paginas").update(velden).eq("id", id).select().single()),
    async paginaNieuw(velden, bronId) {
      let basisRij = {};
      if (bronId) {
        basisRij = ok(await sb.from("paginas").select("*").eq("id", bronId).single());
        for (const k of ["id", "created_at", "updated_at", "slug", "adres", "titel", "foto_pad", "kickoff_prijs",
          "pand_url", "gearchiveerd", "eigenaar_naam", "eigenaar_email", "rapport_token"]) delete basisRij[k];
      }
      return ok(await sb.from("paginas").insert({ ...basisRij, ...velden }).select().single());
    },
    paginaVerwijderen: async (id) => ok(await sb.from("paginas").delete().eq("id", id)),

    // Beschikbaarheid -------------------------------------------------------------
    beschikbaarheid: async (id) =>
      ok(await sb.from("beschikbaarheid").select("*").eq("pagina_id", id).order("datum_van").order("van")),
    beschikbaarheidNieuw: async (rij) => ok(await sb.from("beschikbaarheid").insert(rij)),
    beschikbaarheidWijzigen: async (id, velden) => ok(await sb.from("beschikbaarheid").update(velden).eq("id", id)),
    beschikbaarheidWeg: async (id) => ok(await sb.from("beschikbaarheid").delete().eq("id", id)),
    slots: async (id) => ok(await sb.rpc("beheer_slots", { p_pagina_id: id })),

    // Boekingen -------------------------------------------------------------------
    boekingen: async (id) => ok(await sb.from("boekingen").select("*").eq("pagina_id", id).order("start")),
    berichten: async (boekingId) => ok(await sb.from("berichten")
      .select("id, soort, ontvanger, status, gepland_op, verzonden_op, fout, pogingen, extern_id")
      .eq("boeking_id", boekingId).order("gepland_op")),
    boekingWijzigen: async (id, velden) => ok(await sb.from("boekingen").update(velden).eq("id", id).select().single()),
    boekingVerwijderen: async (id) => ok(await sb.from("boekingen").delete().eq("id", id)),
    async boek(paginaId, start, antwoorden, mail) {
      const b = ok(await sb.rpc("beheer_boek", { p_pagina_id: paginaId, p_start: start, p_antwoorden: antwoorden, p_mail: mail }));
      await api.verstuur(b.id).catch((e) => console.warn("Versturen loopt via de wachtrij:", e));
      return b;
    },
    async verplaats(boekingId, start, mail) {
      const b = ok(await sb.rpc("beheer_verplaats", { p_boeking_id: boekingId, p_start: start, p_mail: mail }));
      await api.verstuur(b.id).catch((e) => console.warn("Versturen loopt via de wachtrij:", e));
      return b;
    },
    // Zelfde weg als de link in de mail: de bezoeker krijgt de annuleringsmail.
    annuleer: (token) => functie("annuleer", { token }),
    verstuur: (boekingId) => functie("verstuur", { boeking_id: boekingId }, true),

    // Foto's ----------------------------------------------------------------------
    // Elke foto komt er twee keer in: zoals ze is (pagina) en als liggende uitsnede (mails).
    async fotoOpladen(paginaId, blob, breed) {
      const pad = `${paginaId}/${Date.now()}.jpg`;
      const opties = { contentType: "image/jpeg", cacheControl: "31536000", upsert: false };
      ok(await sb.storage.from("fotos").upload(pad, blob, opties));
      if (breed) ok(await sb.storage.from("fotos").upload(pad.replace(/\.jpg$/, "-breed.jpg"), breed, opties));
      return pad;
    },
    fotoVerwijderen: async (pad) =>
      ok(await sb.storage.from("fotos").remove([pad, pad.replace(/\.jpg$/, "-breed.jpg")].filter((x, i, a) => a.indexOf(x) === i))),

    // Links -----------------------------------------------------------------------
    fotoUrl: (pad) => fotoUrl(cfg, pad),
    // Zelfde regel als mailFotoPad() in supabase/functions/_shared/berichten.ts
    mailFotoPad: (pad) => (!pad ? null : /^[^/]+\/\d+\.jpg$/.test(pad) ? pad.replace(/\.jpg$/, "-breed.jpg") : pad),
    logoUrl: "/img/logo-mail.png",
    publiekeUrl: (slug) => `${basis}/${slug}`,
    rapportUrl: (token) => `${basis}/rapport?token=${token}`,
    voorbeeldUrl: (slug) => `/${encodeURIComponent(slug)}?voorbeeld=1`,
    // voorbeeldHtml(slug) bestaat alleen in de demo: de bezoekerspagina als HTML (srcdoc).
  };
  return api;
}
