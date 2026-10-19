// Beheerplatform: afspraak.henryhouser.be/beheer
// Toegang via Supabase Auth; wat een beheerder mag, regelt RLS (tabel beheerders).
(() => {
  const cfg = window.AFSPRAAK_CONFIG;
  const TZ = "Europe/Brussels";
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, ...kinderen) => {
    const e = Object.assign(document.createElement(tag), props);
    e.append(...kinderen.filter((k) => k != null));
    return e;
  };

  const fmtDag = new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtDatum = new Intl.DateTimeFormat("nl-BE", { timeZone: "UTC", weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const fmtUur = new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const uur = (iso) => fmtUur.format(new Date(iso)).replace(".", ":");
  const datum = (d) => fmtDatum.format(new Date(`${d}T00:00:00Z`));

  // ---------------------------------------------------------------------------
  // Gegevenslaag. window.BEHEER_API kan vooraf gezet worden (demo met testdata).
  // ---------------------------------------------------------------------------

  function supabaseApi() {
    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const ok = ({ data, error }) => {
      if (error) throw error;
      return data;
    };
    return {
      async sessie() {
        return (await sb.auth.getSession()).data.session?.user?.email ?? null;
      },
      async login(email, wachtwoord) {
        const { data, error } = await sb.auth.signInWithPassword({ email, password: wachtwoord });
        if (error) throw error;
        return data.user.email;
      },
      uitloggen: () => sb.auth.signOut(),
      overzicht: async () => ok(await sb.rpc("beheer_overzicht")),
      pagina: async (id) => ok(await sb.from("paginas").select("*").eq("id", id).single()),
      paginaBewaren: async (id, velden) => ok(await sb.from("paginas").update(velden).eq("id", id).select().single()),
      async paginaNieuw(velden, bronId) {
        const bron = ok(await sb.from("paginas").select("*").eq("id", bronId).single());
        for (const k of ["id", "created_at", "updated_at"]) delete bron[k];
        return ok(await sb.from("paginas").insert({ ...bron, ...velden }).select().single());
      },
      beschikbaarheid: async (paginaId) =>
        ok(await sb.from("beschikbaarheid").select("*").eq("pagina_id", paginaId).order("datum_van")),
      beschikbaarheidNieuw: async (rij) => ok(await sb.from("beschikbaarheid").insert(rij)),
      beschikbaarheidWeg: async (id) => ok(await sb.from("beschikbaarheid").delete().eq("id", id)),
      boekingen: async (paginaId) =>
        ok(await sb.from("boekingen").select("*").eq("pagina_id", paginaId).order("start")),
      async annuleer(token) {
        // Zelfde weg als de annuleerlink in de mail: de bezoeker krijgt de annuleringsmail.
        const res = await fetch(`${cfg.supabaseUrl}/functions/v1/annuleer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey },
          body: JSON.stringify({ token }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.melding || "Annuleren mislukt.");
      },
      voorbeeldUrl: (slug) => `/${encodeURIComponent(slug)}?voorbeeld=1`,
      publiekeUrl: (slug) => `${location.origin}/${slug}`,
    };
  }

  const api = window.BEHEER_API || supabaseApi();

  // ---------------------------------------------------------------------------
  // Algemeen
  // ---------------------------------------------------------------------------

  const secties = ["login", "overzicht", "detail"];
  function toonSectie(id) {
    $("laden").hidden = true;
    for (const s of secties) $(s).hidden = s !== id;
  }

  let toastTimer;
  function toast(tekst, fout = false) {
    const t = $("toast");
    t.textContent = tekst;
    t.classList.toggle("fout", fout);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (t.hidden = true), 3500);
  }

  function foutTekst(err) {
    const m = err?.message || String(err);
    if (/duplicate key.*slug/i.test(m)) return "Deze link is al in gebruik.";
    if (/slug_check|violates check constraint "paginas_slug/i.test(m)) return "De link mag enkel kleine letters, cijfers en - bevatten.";
    if (/geen_beheerder|permission denied|JWT/i.test(m)) return "Je hebt geen toegang tot het beheer.";
    return m;
  }

  // ---------------------------------------------------------------------------
  // Overzicht
  // ---------------------------------------------------------------------------

  let paginas = [];

  function statusVan(p) {
    if (!p.actief) return { tekst: "Staat uit", klasse: "uit" };
    if (p.vrije_slots > 0) return { tekst: "Open", klasse: "open" };
    if (p.dagen > 0) return { tekst: "Volzet", klasse: "vol" };
    return { tekst: "Geen data", klasse: "leeg" };
  }

  function periode(p) {
    if (!p.eerste_dag) return "Geen komende data";
    if (p.eerste_dag === p.laatste_dag) return datum(p.eerste_dag);
    return `${datum(p.eerste_dag)} – ${datum(p.laatste_dag)} (${p.dagen} dagen)`;
  }

  async function toonOverzicht() {
    paginas = await api.overzicht();
    const lijst = $("lijst");
    lijst.replaceChildren();
    if (!paginas.length) lijst.append(el("p", { className: "melding", textContent: "Nog geen adressen." }));

    for (const p of paginas) {
      const st = statusVan(p);
      lijst.append(el("a", { className: "item kaart", href: `#/p/${p.id}` },
        el("div", { className: "item-hoofd" },
          el("strong", { textContent: p.adres }),
          el("span", { className: "klein", textContent: p.titel }),
          el("span", { className: "item-link", textContent: api.publiekeUrl(p.slug).replace(/^https?:\/\//, "") })),
        el("div", { className: "item-cijfers" },
          el("span", { textContent: periode(p) }),
          el("span", { textContent: `${p.vrije_slots} vrije tijdslots` }),
          el("span", {
            textContent: p.boekingen
              ? `${p.boekingen} ${p.boekingen === 1 ? "afspraak" : "afspraken"} · eerste ${fmtDag.format(new Date(p.volgende_boeking))} ${uur(p.volgende_boeking)}`
              : "Nog geen afspraken",
          })),
        el("span", { className: `badge ${st.klasse}`, textContent: st.tekst })));
    }

    $("nieuw-bron").replaceChildren(...paginas.map((p) => new Option(p.adres, p.id)));
    toonSectie("overzicht");
  }

  $("nieuw-knop").onclick = () => {
    $("nieuw-form").hidden = false;
    $("nieuw-adres").focus();
  };
  $("nieuw-annuleer").onclick = () => ($("nieuw-form").hidden = true);
  $("nieuw-adres").oninput = () => {
    // Link voorstellen uit de straat en het huisnummer.
    const straat = $("nieuw-adres").value.split(",")[0];
    $("nieuw-slug").value = straat.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  };
  $("nieuw-form").onsubmit = async (e) => {
    e.preventDefault();
    $("nieuw-fout").hidden = true;
    try {
      const p = await api.paginaNieuw({
        adres: $("nieuw-adres").value.trim(),
        slug: $("nieuw-slug").value.trim(),
        titel: $("nieuw-titel").value.trim(),
      }, $("nieuw-bron").value);
      $("nieuw-form").reset();
      $("nieuw-form").hidden = true;
      location.hash = `#/p/${p.id}/beschikbaarheid`;
    } catch (err) {
      $("nieuw-fout").textContent = foutTekst(err);
      $("nieuw-fout").hidden = false;
    }
  };

  // ---------------------------------------------------------------------------
  // Detail
  // ---------------------------------------------------------------------------

  const INSTELLINGEN = [
    { key: "actief", label: "Pagina staat online", type: "checkbox" },
    { key: "adres", label: "Adres (zoals in de mails)" },
    { key: "titel", label: "Titel" },
    { key: "slug", label: "Link", hulp: "afspraak.henryhouser.be/…  Let op: een oude link werkt niet meer na wijzigen." },
    { key: "intro", label: "Intro boven de tijdslots", type: "textarea" },
    { key: "duur_min", label: "Duur van een bezoek (min)", type: "number", rij: 1 },
    { key: "slot_interval_min", label: "Elke … minuten een startuur", type: "number", rij: 1 },
    { key: "max_per_slot", label: "Bezoekers per tijdslot", type: "number", rij: 2 },
    { key: "min_minuten_vooraf", label: "Minstens … min vooraf boeken", type: "number", rij: 2 },
    { key: "alert_email", label: "Interne melding naar", hulp: "Meerdere adressen scheiden met een komma." },
    { key: "eigenaar_email", label: "Melding naar eigenaar", hulp: "Leeg = geen melding." },
    { key: "reminder_uren_vooraf", label: "Herinnering … uur vooraf", type: "number", hulp: "Leeg = geen herinnering. 48 = twee dagen." },
  ];

  const TEKSTEN = [
    { key: "bevestigingsscherm", label: "Scherm na het boeken", type: "textarea", klein: true },
    { key: "mail_onderwerp", label: "Onderwerp bevestigingsmail" },
    { key: "mail_bevestiging", label: "Bevestigingsmail naar bezoeker", type: "textarea" },
    { key: "mail_alert", label: "Interne melding", type: "textarea" },
    { key: "mail_eigenaar", label: "Melding naar eigenaar", type: "textarea" },
    { key: "mail_reminder_onderwerp", label: "Onderwerp herinnering" },
    { key: "mail_reminder", label: "Herinnering", type: "textarea" },
    { key: "mail_annulering_onderwerp", label: "Onderwerp annulering" },
    { key: "mail_annulering", label: "Annuleringsmail naar bezoeker", type: "textarea" },
    { key: "mail_annulering_alert", label: "Interne melding bij annulering", type: "textarea" },
    { key: "formuliervelden", label: "Formuliervelden (JSON)", type: "json", hulp: "Velden: key, label, type (text, email, tel, textarea, checkbox, select), verplicht, opties." },
  ];

  let huidig = null;   // pagina-rij
  let tab = "beschikbaarheid";

  function bouwForm(form, velden, knopTekst, hulpTekst) {
    form.replaceChildren();
    if (hulpTekst) form.append(el("p", { className: "klein", innerHTML: hulpTekst }));
    let rijBox = null;
    let rijNr = null;
    for (const v of velden) {
      const id = `f-${v.key}`;
      let input;
      if (v.type === "textarea" || v.type === "json") {
        input = el("textarea", { id, name: v.key, rows: v.type === "json" ? 12 : v.klein ? 3 : 8 });
        if (v.type === "json") input.className = "mono";
      } else {
        input = el("input", { id, name: v.key, type: v.type || "text" });
        if (v.type === "number") input.min = 0;
      }
      const veld = v.type === "checkbox"
        ? el("div", { className: "veld check" }, el("label", { htmlFor: id }, input, document.createTextNode(v.label)))
        : el("div", { className: "veld" }, el("label", { htmlFor: id, textContent: v.label }), input,
            v.hulp ? el("p", { className: "klein", textContent: v.hulp }) : null);

      if (v.rij) {
        if (v.rij !== rijNr) {
          rijBox = el("div", { className: "rij" });
          form.append(rijBox);
          rijNr = v.rij;
        }
        rijBox.append(veld);
      } else {
        rijNr = null;
        form.append(veld);
      }
    }
    form.append(el("div", { className: "acties" },
      el("button", { type: "submit", className: "knop", textContent: knopTekst })));
    form.onsubmit = (e) => bewaar(e, form, velden);
  }

  function vulForm(form, velden) {
    for (const v of velden) {
      const input = form.elements[v.key];
      const w = huidig[v.key];
      if (v.type === "checkbox") input.checked = !!w;
      else if (v.type === "json") input.value = JSON.stringify(w, null, 2);
      else input.value = w ?? "";
    }
  }

  async function bewaar(e, form, velden) {
    e.preventDefault();
    const wijziging = {};
    for (const v of velden) {
      const input = form.elements[v.key];
      let w;
      if (v.type === "checkbox") w = input.checked;
      else if (v.type === "number") w = input.value === "" ? null : Number(input.value);
      else if (v.type === "json") {
        try {
          w = JSON.parse(input.value);
        } catch {
          return toast("De formuliervelden zijn geen geldige JSON.", true);
        }
      } else w = input.value.trim() === "" ? null : input.value;
      wijziging[v.key] = w;
    }
    const knop = form.querySelector("button[type=submit]");
    knop.disabled = true;
    try {
      huidig = await api.paginaBewaren(huidig.id, wijziging);
      tekenKop();
      herlaadVoorbeeld();
      toast("Bewaard. Bezoekers zien de aanpassing meteen.");
    } catch (err) {
      toast(foutTekst(err), true);
    } finally {
      knop.disabled = false;
    }
  }

  function tekenKop() {
    const p = huidig;
    $("d-titel").textContent = p.adres;
    $("d-adres").textContent = p.titel;
    const url = api.publiekeUrl(p.slug);
    $("d-link").href = url;
    $("d-link").textContent = url.replace(/^https?:\/\//, "");
    $("d-kopieer").onclick = async () => {
      try {
        await navigator.clipboard.writeText(url);
        toast("Link gekopieerd.");
      } catch {
        toast(url);
      }
    };
    const st = p.actief ? { tekst: "Online", klasse: "open" } : { tekst: "Staat uit", klasse: "uit" };
    $("d-status").textContent = st.tekst;
    $("d-status").className = `badge ${st.klasse}`;
  }

  function herlaadVoorbeeld() {
    $("voorbeeld").src = `${api.voorbeeldUrl(huidig.slug)}&t=${Date.now()}`;
  }

  function kiesTab(naam) {
    tab = naam;
    for (const a of document.querySelectorAll(".tabs a")) {
      a.setAttribute("aria-selected", String(a.dataset.tab === naam));
      a.href = `#/p/${huidig.id}/${a.dataset.tab}`;
    }
    for (const p of document.querySelectorAll("[data-paneel]")) p.hidden = p.dataset.paneel !== naam;
  }

  async function toonDetail(id, gevraagdeTab) {
    if (!huidig || huidig.id !== id) {
      huidig = await api.pagina(id);
      tekenKop();
      bouwForm($("form-instellingen"), INSTELLINGEN, "Bewaren");
      bouwForm($("form-teksten"), TEKSTEN, "Bewaren",
        "Placeholders: {voornaam} {familienaam} {adres} {titel} {start} {datum} {start_uur}. " +
        "Op een eigen regel in mails: {agenda_knoppen} {annuleer_knop} {gegevens}. Lege regel = nieuwe alinea, **vet**.");
      vulForm($("form-instellingen"), INSTELLINGEN);
      vulForm($("form-teksten"), TEKSTEN);
      herlaadVoorbeeld();
      await Promise.all([laadBeschikbaarheid(), laadBoekingen()]);
    }
    kiesTab(gevraagdeTab || tab);
    toonSectie("detail");
  }

  // Beschikbaarheid -----------------------------------------------------------

  const WEEKDAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

  async function laadBeschikbaarheid() {
    const rijen = await api.beschikbaarheid(huidig.id);
    const vandaag = new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
    const body = $("b-rijen");
    body.replaceChildren();
    if (!rijen.length) body.append(el("tr", {}, el("td", { colSpan: 4, className: "melding", textContent: "Nog geen beschikbaarheid." })));
    for (const r of rijen) {
      const voorbij = r.datum_tot < vandaag;
      const dagen = r.weekdagen.length === 7 ? "elke dag" : r.weekdagen.map((d) => WEEKDAGEN[d - 1]).join(", ");
      const weg = el("button", { type: "button", className: "link", textContent: "Verwijderen" });
      weg.onclick = async () => {
        if (!confirm("Deze beschikbaarheid verwijderen? Bestaande afspraken blijven staan.")) return;
        await api.beschikbaarheidWeg(r.id);
        await laadBeschikbaarheid();
        herlaadVoorbeeld();
      };
      body.append(el("tr", { className: voorbij ? "voorbij" : "" },
        el("td", { textContent: r.datum_van === r.datum_tot ? datum(r.datum_van) : `${datum(r.datum_van)} – ${datum(r.datum_tot)}` }),
        el("td", { textContent: `${r.van.slice(0, 5)} – ${r.tot.slice(0, 5)}` }),
        el("td", { textContent: dagen }),
        el("td", {}, weg)));
    }
  }

  $("b-form").onsubmit = async (e) => {
    e.preventDefault();
    $("b-fout").hidden = true;
    const van = $("b-van-d").value;
    const tot = $("b-tot-d").value || van;
    try {
      if (tot < van) throw new Error("De einddatum ligt voor de begindatum.");
      if ($("b-tot").value <= $("b-van").value) throw new Error("Het einduur moet na het beginuur liggen.");
      await api.beschikbaarheidNieuw({ pagina_id: huidig.id, datum_van: van, datum_tot: tot, van: $("b-van").value, tot: $("b-tot").value });
      $("b-van-d").value = "";
      $("b-tot-d").value = "";
      await laadBeschikbaarheid();
      herlaadVoorbeeld();
      toast("Toegevoegd.");
    } catch (err) {
      $("b-fout").textContent = foutTekst(err);
      $("b-fout").hidden = false;
    }
  };

  // Boekingen -----------------------------------------------------------------

  let boekingen = [];

  async function laadBoekingen() {
    boekingen = await api.boekingen(huidig.id);
    tekenBoekingen();
  }

  function tekenBoekingen() {
    const alles = $("k-alles").checked;
    const nu = Date.now();
    const zichtbaar = boekingen.filter((b) => alles || (b.status === "bevestigd" && new Date(b.start) >= nu));
    const body = $("k-rijen");
    body.replaceChildren();
    $("k-leeg").hidden = zichtbaar.length > 0;
    $("k-leeg").textContent = boekingen.length && !alles ? "Geen komende afspraken." : "Nog geen boekingen.";

    for (const b of zichtbaar) {
      const kan = b.status === "bevestigd" && new Date(b.start) > nu;
      const actie = kan ? el("button", { type: "button", className: "link", textContent: "Annuleren" }) : null;
      if (actie) {
        actie.onclick = async () => {
          if (!confirm(`Afspraak van ${b.voornaam} annuleren? ${b.voornaam} krijgt de annuleringsmail.`)) return;
          try {
            await api.annuleer(b.token);
            await laadBoekingen();
            herlaadVoorbeeld();
            toast("Geannuleerd. Het tijdslot is weer vrij.");
          } catch (err) {
            toast(foutTekst(err), true);
          }
        };
      }
      const extra = Object.entries(b.antwoorden || {})
        .filter(([k, w]) => !["voornaam", "familienaam", "email", "telefoon", "nieuwsbrief"].includes(k) && w !== "" && w != null)
        .map(([, w]) => w).join(" · ");
      body.append(el("tr", { className: b.status === "bevestigd" ? "" : "voorbij" },
        el("td", { textContent: `${fmtDag.format(new Date(b.start))} ${uur(b.start)}` }),
        el("td", {}, el("strong", { textContent: [b.voornaam, b.familienaam].filter(Boolean).join(" ") }),
          extra ? el("div", { className: "klein", textContent: extra }) : null),
        el("td", {}, el("a", { href: `mailto:${b.email}`, textContent: b.email }),
          b.telefoon ? el("div", {}, el("a", { href: `tel:${b.telefoon}`, textContent: b.telefoon })) : null),
        el("td", {}, el("span", { className: `badge ${b.status === "bevestigd" ? "open" : "uit"}`, textContent: b.status })),
        el("td", {}, actie)));
    }
  }
  $("k-alles").onchange = tekenBoekingen;

  // Voorbeeld: gsm- of computerbreedte ------------------------------------------

  for (const b of document.querySelectorAll(".toggle button")) {
    b.onclick = () => {
      for (const x of document.querySelectorAll(".toggle button")) x.setAttribute("aria-pressed", String(x === b));
      const w = Number(b.dataset.breedte);
      $("voorbeeld").style.width = w ? `${w}px` : "100%";
    };
  }

  // ---------------------------------------------------------------------------
  // Routering en inloggen
  // ---------------------------------------------------------------------------

  async function route() {
    $("fout").hidden = true;
    try {
      const m = location.hash.match(/^#\/p\/([0-9a-f-]+)(?:\/(\w+))?/);
      if (m) await toonDetail(m[1], m[2]);
      else {
        huidig = null;
        await toonOverzicht();
      }
    } catch (err) {
      console.error(err);
      $("laden").hidden = true;
      $("fout").textContent = foutTekst(err);
      $("fout").hidden = false;
    }
  }

  async function ingelogd(email) {
    $("gebruiker-email").textContent = email;
    $("gebruiker").hidden = false;
    window.addEventListener("hashchange", route);
    await route();
  }

  $("login-form").onsubmit = async (e) => {
    e.preventDefault();
    $("login-fout").hidden = true;
    try {
      await ingelogd(await api.login($("login-email").value.trim(), $("login-wachtwoord").value));
    } catch {
      $("login-fout").textContent = "E-mail of wachtwoord klopt niet.";
      $("login-fout").hidden = false;
    }
  };

  $("uitloggen").onclick = async () => {
    await api.uitloggen();
    location.hash = "";
    location.reload();
  };

  (async () => {
    const email = await api.sessie();
    if (email) await ingelogd(email);
    else toonSectie("login");
  })();
})();
