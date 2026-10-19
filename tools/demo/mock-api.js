// Beheer zonder server: voorbeeldgegevens in het geheugen (demo en tests).
// Zet window.BEHEER_API; main.js gebruikt die in de plaats van Supabase.
// Opties via window.DEMO_OPTIES: { teksten, fotos: { pad: url }, logo, paginaHtml, rapportHtml, basis, ingelogd }
// Zet ook window.DEMO_PUBLIEK: de publieke kant (bezoekerspagina, verkopersrapport) voor de demo.
(function () {
  "use strict";
  const O = window.DEMO_OPTIES || {};
  const TZ = "Europe/Brussels";
  const fmtDag = new Intl.DateTimeFormat("en-CA", { timeZone: TZ });
  const fmtDelen = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  const NU = Date.now();
  const dagVan = (t) => fmtDag.format(new Date(t));
  const VANDAAG = dagVan(NU);
  const plus = (d, n) => {
    const t = new Date(`${d}T00:00:00Z`);
    t.setUTCDate(t.getUTCDate() + n);
    return t.toISOString().slice(0, 10);
  };
  const isoWd = (d) => ((new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const volgende = (vanaf, wd) => { let d = vanaf; while (isoWd(d) !== wd) d = plus(d, 1); return d; };
  const vorige = (vanaf, wd) => { let d = vanaf; while (isoWd(d) !== wd) d = plus(d, -1); return d; };
  const delen = (t) => Object.fromEntries(fmtDelen.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
  function lokaal(dag, hhmm) {
    const [y, m, d] = dag.split("-").map(Number);
    const [h, mi] = hhmm.split(":").map(Number);
    const doel = Date.UTC(y, m - 1, d, h, mi);
    let t = doel;
    for (let i = 0; i < 3; i++) {
      const p = delen(t);
      t += doel - Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    }
    return new Date(t).toISOString();
  }
  const uurVan = (t) => { const p = delen(t); return `${p.hour}:${p.minute}`; };
  const minuten = (u) => { const [h, m] = String(u).split(":").map(Number); return h * 60 + m; };
  const alsUur = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const iso = (ms) => new Date(ms).toISOString();
  const kopie = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  const wacht = (ms = 120) => new Promise((ok) => setTimeout(ok, ms));
  const fout = (code) => Object.assign(new Error(code), { code });

  // Vast zaad: elke keer dezelfde voorbeeldgegevens.
  let zaad = 20261019;
  function rnd() {
    zaad = (zaad + 0x6d2b79f5) | 0;
    let t = Math.imul(zaad ^ (zaad >>> 15), 1 | zaad);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const gewogen = (paren) => {
    const tot = paren.reduce((s, [, g]) => s + g, 0);
    let r = rnd() * tot;
    for (const [w, g] of paren) if ((r -= g) < 0) return w;
    return paren[paren.length - 1][0];
  };
  const uuid = () => "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(rnd() * 16);
    return (c === "x" ? r : (r & 3) | 8).toString(16);
  });

  // -------------------------------------------------------------------------
  // Gegevens
  // -------------------------------------------------------------------------

  const T = O.teksten || {};
  const VELDEN = T.formuliervelden || [
    { key: "voornaam", type: "text", label: "Voornaam", verplicht: true },
    { key: "familienaam", type: "text", label: "Familienaam", verplicht: false },
    { key: "email", type: "email", label: "E-mail", verplicht: true },
    { key: "telefoon", type: "tel", label: "Telefoon", verplicht: true },
    { key: "nieuwsbrief", type: "checkbox", label: "Ja, ik ontvang graag de nieuwsbrief van Henry Houser", verplicht: false },
    { key: "bron", type: "select", label: "Hoe vond je deze aanbieding?", verplicht: true, opties: ["website Henry Houser", "Facebook", "Instagram", "Immoweb", "Zimmo", "bord ter plaatse", "via - via"] },
  ];
  const TEKSTEN = {
    intro: T.intro || "Het startuur dat je kiest, is geen vaste duurtijd van je bezoek: blijf gerust zo lang je wenst.",
    bevestigingsscherm: T.bevestigingsscherm || "Hallo {voornaam}! Jouw afspraak ligt vast voor {start}.",
    mail_onderwerp: T.mail_onderwerp || "bezoek: {adres}",
    mail_bevestiging: T.mail_bevestiging ?? null,
    mail_eigenaar: T.mail_eigenaar ?? null,
    mail_alert: T.mail_alert ?? null,
    mail_reminder_onderwerp: T.mail_reminder_onderwerp || "Herinnering bezoek: {adres}",
    mail_reminder: T.mail_reminder ?? null,
    reminder_uren_vooraf: T.reminder_uren_vooraf ?? 48,
    mail_annulering_onderwerp: T.mail_annulering_onderwerp || "Jouw bezoek aan {adres}",
    mail_annulering: T.mail_annulering ?? null,
    mail_annulering_alert: T.mail_annulering_alert ?? null,
    mail_verplaatst_onderwerp: "Nieuw tijdstip voor je bezoek: {adres}",
    mail_verplaatst: null,
  };

  function nieuwePagina(v) {
    const gemaakt = v.created_at || iso(NU - 864e5);
    return {
      id: v.id, slug: v.slug, actief: true, gearchiveerd: false,
      titel: `Homerun in ${v.adres.replace(", ", " in ")}`, adres: v.adres,
      duur_min: 40, slot_interval_min: 40, max_per_slot: 1, min_minuten_vooraf: 60,
      formuliervelden: kopie(VELDEN),
      afzender: T.afzender || "Henry Houser <backoffice@henryhouser.be>", antwoord_aan: null,
      alert_email: T.alert_email || "backoffice@henryhouser.be", eigenaar_email: null, eigenaar_naam: null,
      foto_pad: null, kickoff_prijs: null, pand_url: null, rapport_token: uuid(),
      created_at: gemaakt, updated_at: gemaakt,
      ...kopie(TEKSTEN), ...v,
    };
  }

  const HR = "2026-10-31" >= plus(VANDAAG, 3) ? "2026-10-31" : volgende(plus(VANDAAG, 7), 6);
  const HR_PROEF = plus(HR, 7);
  const HR_TEST = vorige(plus(VANDAAG, -2), 6);
  const HR_OEFEN = vorige(plus(VANDAAG, -30), 6);

  const paginas = [
    nieuwePagina({
      id: "aalbeek", slug: "aalbeeksesteenweg57", adres: "Aalbeeksesteenweg 57, 8500 Kortrijk",
      kickoff_prijs: 425000, pand_url: "https://www.aalbeeksesteenweg57.be/", foto_pad: "aalbeek/1760890000000.jpg",
      created_at: lokaal(plus(VANDAAG, -12), "10:12"),
    }),
    nieuwePagina({
      id: "demolaan", slug: "demolaan3", adres: "Demolaan 3, 8520 Kuurne", kickoff_prijs: 315000,
      duur_min: 30, slot_interval_min: 30, created_at: lokaal(plus(VANDAAG, -8), "16:40"),
    }),
    nieuwePagina({
      id: "proeflaan", slug: "proeflaan21", adres: "Proeflaan 21, 8530 Harelbeke", kickoff_prijs: 289000,
      duur_min: 30, slot_interval_min: 30, max_per_slot: 2,
      eigenaar_naam: "familie Voorbeeld", eigenaar_email: "verkoper@voorbeeld.be",
      created_at: lokaal(plus(VANDAAG, -4), "09:05"),
    }),
    nieuwePagina({
      id: "voorbeeldstraat", slug: "voorbeeldstraat14", adres: "Voorbeeldstraat 14, 8500 Kortrijk",
      actief: false, created_at: lokaal(plus(VANDAAG, -1), "14:30"),
    }),
    nieuwePagina({
      id: "testdreef", slug: "testdreef7", adres: "Testdreef 7, 8560 Wevelgem", kickoff_prijs: 349000,
      eigenaar_naam: "Mevrouw Voorbeeld", eigenaar_email: "verkoper2@voorbeeld.be",
      created_at: lokaal(plus(HR_TEST, -21), "11:00"),
    }),
    nieuwePagina({
      id: "oefenstraat", slug: "oefenstraat2", adres: "Oefenstraat 2, 8500 Kortrijk", kickoff_prijs: 265000,
      actief: false, gearchiveerd: true, eigenaar_naam: "familie Proef", eigenaar_email: "verkoper3@voorbeeld.be",
      created_at: lokaal(plus(HR_OEFEN, -18), "11:00"),
    }),
  ];

  const beschikbaarheid = [
    { id: "b-aalbeek", pagina_id: "aalbeek", datum_van: HR, datum_tot: HR, van: "09:00:00", tot: "19:00:00", weekdagen: [1, 2, 3, 4, 5, 6, 7] },
    { id: "b-demolaan", pagina_id: "demolaan", datum_van: VANDAAG, datum_tot: plus(VANDAAG, 1), van: "16:00:00", tot: "20:00:00", weekdagen: [1, 2, 3, 4, 5, 6, 7] },
    { id: "b-proeflaan", pagina_id: "proeflaan", datum_van: HR_PROEF, datum_tot: HR_PROEF, van: "10:00:00", tot: "16:00:00", weekdagen: [1, 2, 3, 4, 5, 6, 7] },
    { id: "b-testdreef", pagina_id: "testdreef", datum_van: HR_TEST, datum_tot: HR_TEST, van: "10:00:00", tot: "17:00:00", weekdagen: [1, 2, 3, 4, 5, 6, 7] },
    { id: "b-oefenstraat", pagina_id: "oefenstraat", datum_van: HR_OEFEN, datum_tot: HR_OEFEN, van: "09:00:00", tot: "13:00:00", weekdagen: [1, 2, 3, 4, 5, 6, 7] },
  ];

  const boekingen = [];
  const berichten = [];
  const weergaven = [];
  let bid = 0;

  const vind = (id) => paginas.find((p) => p.id === id);

  function dagenVan(r) {
    const uit = [];
    for (let d = r.datum_van; d <= r.datum_tot && uit.length < 400; d = plus(d, 1)) {
      if ((r.weekdagen || [1, 2, 3, 4, 5, 6, 7]).includes(isoWd(d))) uit.push(d);
    }
    return uit;
  }

  function alleSlots(p) {
    const gezien = new Map();
    for (const r of beschikbaarheid.filter((x) => x.pagina_id === p.id)) {
      for (const d of dagenVan(r)) {
        for (let m = minuten(r.van); m <= minuten(r.tot) - p.duur_min; m += p.slot_interval_min) {
          const start = lokaal(d, alsUur(m));
          gezien.set(start, { start, plaatsen: p.max_per_slot });
        }
      }
    }
    return [...gezien.values()].sort((a, b) => a.start.localeCompare(b.start));
  }

  const MENSEN = [
    ["Sofie", "Vandamme"], ["Pieter", "Declercq"], ["Lien", "Vermeulen"], ["Thomas", "Desmet"], ["Hanne", "Maes"],
    ["Wouter", "Claeys"], ["Elise", "Vandenberghe"], ["Jonas", "Lambrecht"], ["Ine", "Verhaeghe"], ["Bram", "Coussens"],
    ["Charlotte", "Dewulf"], ["Arne", "Vanhoutte"], ["Fien", "Debrabandere"], ["Matthias", "Goethals"], ["Lotte", "Vercruysse"],
    ["Kobe", "Deprez"], ["Margot", "Seynaeve"], ["Niels", "Callewaert"], ["Amber", "Vandewalle"], ["Ruben", "Bossuyt"],
    ["Julie", "Vanneste"], ["Simon", "Delbaere"], ["Emma", "Ghekiere"], ["Lucas", "Vandekerckhove"], ["Nina", "Lefevere"],
    ["Robbe", "Dhondt"], ["Febe", "Verschuere"], ["Jens", "Bouckaert"], ["Laura", "Decock"], ["Tibo", "Vanmarcke"],
    ["Marie", "Deleu"], ["Victor", "Naessens"], ["Lise", "Ameye"], ["Wout", "Pattyn"], ["Zoë", "Vandeputte"],
  ];
  let mensIndex = 0;
  const BRONNEN = [["Immoweb", 34], ["website Henry Houser", 20], ["Facebook", 14], ["bord ter plaatse", 9], ["Zimmo", 8],
    ["Instagram", 6], ["via - via", 5], ["buurmailing", 4]];
  const KANALEN = [["immoweb", 34], [null, 24], ["facebook.com", 14], ["henryhouser.be", 11], ["zimmo", 6],
    ["instagram.com", 5], ["nieuwsbrief", 6]];
  const NOTITIES = ["Komt met architect", "Wil de zolder graag zien", "Woning al verkocht, financiering is rond", "Vraagt naar de EPC-waarde"];

  const zonderAccent = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const telefoon = () => `04${70 + Math.floor(rnd() * 30)} ${String(Math.floor(rnd() * 100)).padStart(2, "0")} ${String(Math.floor(rnd() * 100)).padStart(2, "0")} ${String(Math.floor(rnd() * 100)).padStart(2, "0")}`;

  function bericht(b, soort, ontvanger, { status = "verzonden", op, verzonden } = {}) {
    berichten.push({
      id: `m${berichten.length + 1}`, boeking_id: b.id, soort, ontvanger, status,
      gepland_op: op || b.created_at, verzonden_op: status === "verzonden" ? (verzonden || op || b.created_at) : null,
      fout: null, pogingen: status === "verzonden" ? 1 : 0, extern_id: status === "verzonden" ? `demo-${berichten.length + 1}` : null,
    });
  }

  function berichtenVoor(p, b, { mailBezoeker = true, alert = true } = {}) {
    const na = (s) => iso(Date.parse(b.created_at) + s * 1000);
    if (mailBezoeker) bericht(b, "bevestiging", b.email, { op: b.created_at, verzonden: na(4) });
    if (alert && p.alert_email) bericht(b, "alert", p.alert_email, { op: b.created_at, verzonden: na(5) });
    if (p.eigenaar_email) bericht(b, "eigenaar", p.eigenaar_email, { op: b.created_at, verzonden: na(6) });
    if (p.reminder_uren_vooraf) {
      const moment = Date.parse(b.start) - p.reminder_uren_vooraf * 3600e3;
      if (moment > Date.parse(b.created_at)) {
        if (b.status === "geannuleerd") bericht(b, "reminder", b.email, { status: "geannuleerd", op: iso(moment) });
        else if (moment <= NU) bericht(b, "reminder", b.email, { op: iso(moment), verzonden: iso(moment + 30e3) });
        else bericht(b, "reminder", b.email, { status: "wachtrij", op: iso(moment) });
      }
    }
    if (b.status === "geannuleerd") {
      bericht(b, "annulering", b.email, { op: b.geannuleerd_op });
      if (p.alert_email) bericht(b, "annulering_alert", p.alert_email, { op: b.geannuleerd_op });
    }
  }

  /** Voorbeeldboeking op het startmoment met index i (in de slots van die dag). */
  function boekVoorbeeld(p, dag, hhmm, opties = {}) {
    const [voornaam, familienaam] = MENSEN[mensIndex++ % MENSEN.length];
    const start = lokaal(dag, hhmm);
    const laatst = Math.min(NU - 20 * 60e3, Date.parse(start) - 2 * 3600e3);
    // Geboekt tussen het aanmaken van de pagina en nu, hooguit twee weken voor het bezoek (nooit in de toekomst).
    let vroegst = Math.max(Date.parse(p.created_at) + 3600e3, Date.parse(start) - 14 * 864e5);
    if (vroegst > laatst) vroegst = Math.min(laatst, Date.parse(p.created_at) + 3600e3);
    const gemaakt = opties.gemaakt ? Date.parse(opties.gemaakt) : vroegst + rnd() * Math.max(0, laatst - vroegst);
    const email = `${zonderAccent(voornaam)}.${zonderAccent(familienaam)}@voorbeeld.be`;
    const bron = opties.bron || gewogen(BRONNEN);
    const b = {
      id: `bk${++bid}`, pagina_id: p.id, start, eind: iso(Date.parse(start) + p.duur_min * 60e3),
      status: opties.status || "bevestigd", voornaam, familienaam, email, telefoon: telefoon(),
      nieuwsbrief: rnd() < 0.4, antwoorden: {}, token: uuid(), created_at: iso(gemaakt),
      geannuleerd_op: null, notitie: opties.notitie || null, bod_uitgebracht: !!opties.bod,
      kanaal: opties.kanaal !== undefined ? opties.kanaal : gewogen(KANALEN), apparaat: rnd() < 0.68 ? "mobiel" : "desktop",
      via_beheer: !!opties.viaBeheer, verplaatst_op: null, ics_volgnummer: 0, laad_id: null,
    };
    if (b.via_beheer) b.kanaal = "beheer";
    b.antwoorden = { voornaam, familienaam, email, telefoon: b.telefoon, nieuwsbrief: b.nieuwsbrief, bron };
    if (b.status === "geannuleerd") b.geannuleerd_op = iso(Math.min(NU - 60e3, gemaakt + (0.3 + rnd()) * 864e5));
    boekingen.push(b);
    berichtenVoor(p, b, { mailBezoeker: true, alert: !b.via_beheer });
    return b;
  }

  // Weergaven: meer naarmate de bezoekdag nadert, niets in de toekomst.
  function weergavenVoor(p, van, tot, basis, piek) {
    const pool = [];
    for (let d = van; d <= tot && d <= VANDAAG; d = plus(d, 1)) {
      const afstand = Math.abs((Date.parse(piek) - Date.parse(d)) / 864e5);
      const n = Math.round(basis * (0.45 + 1.3 * Math.exp(-afstand / 5)) * (0.7 + rnd() * 0.6) * (d === van ? 1.6 : 1));
      for (let i = 0; i < n; i++) {
        const t = Date.parse(lokaal(d, alsUur(Math.floor(7 * 60 + rnd() * 16 * 60))));
        if (t > NU) continue;
        const bezoeker = pool.length && rnd() < 0.28 ? pool[Math.floor(rnd() * pool.length)] : `v${p.id}${pool.push(`v${p.id}${pool.length}`) - 1}`;
        const kanaal = gewogen(KANALEN);
        const apparaat = rnd() < 0.66 ? "mobiel" : "desktop";
        weergaven.push({ pagina_id: p.id, gebeurtenis: "bekeken", bezoeker, kanaal, apparaat, created_at: iso(t) });
        if (rnd() < 0.24) weergaven.push({ pagina_id: p.id, gebeurtenis: "slot_gekozen", bezoeker, kanaal, apparaat, created_at: iso(t + 40e3) });
      }
    }
  }

  (function vul() {
    const aalbeek = vind("aalbeek");
    weergavenVoor(aalbeek, plus(VANDAAG, -12), VANDAAG, 9, HR);
    [["09:00", { bron: "Immoweb" }], ["09:40", {}], ["10:20", { notitie: NOTITIES[0] }], ["11:40", {}], ["12:20", {}],
      ["13:40", {}], ["14:20", { viaBeheer: true, bron: "via - via" }], ["15:40", {}], ["17:00", { notitie: NOTITIES[3] }]]
      .forEach(([u, o]) => boekVoorbeeld(aalbeek, HR, u, o));
    boekVoorbeeld(aalbeek, HR, "11:00", { status: "geannuleerd" });

    const demolaan = vind("demolaan");
    weergavenVoor(demolaan, plus(VANDAAG, -8), VANDAAG, 7, VANDAAG);
    ["16:00", "16:30", "17:30", "18:00", "19:00"].forEach((u, i) => boekVoorbeeld(demolaan, VANDAAG, u, i === 2 ? { notitie: NOTITIES[1] } : {}));
    ["16:30", "17:00", "18:30"].forEach((u) => boekVoorbeeld(demolaan, plus(VANDAAG, 1), u));

    const proeflaan = vind("proeflaan");
    weergavenVoor(proeflaan, plus(VANDAAG, -4), VANDAAG, 6, HR_PROEF);
    boekVoorbeeld(proeflaan, HR_PROEF, "10:00");
    boekVoorbeeld(proeflaan, HR_PROEF, "10:00", { bron: "Facebook" });
    boekVoorbeeld(proeflaan, HR_PROEF, "11:30");

    const testdreef = vind("testdreef");
    weergavenVoor(testdreef, plus(HR_TEST, -21), plus(HR_TEST, 1), 8, HR_TEST);
    [["10:00", "geweest", { bod: true }], ["10:40", "geweest"], ["11:20", "no-show"], ["12:00", "geweest", { notitie: NOTITIES[2], bod: true }],
      ["13:20", "geweest"], ["14:00", "bevestigd"], ["14:40", "no-show"], ["15:20", "geweest"], ["16:20", "geannuleerd"]]
      .forEach(([u, status, o = {}]) => boekVoorbeeld(testdreef, HR_TEST, u, { status, ...o }));

    const oefen = vind("oefenstraat");
    weergavenVoor(oefen, plus(HR_OEFEN, -18), HR_OEFEN, 7, HR_OEFEN);
    [["09:00", "geweest"], ["09:40", "geweest", { bod: true }], ["10:20", "geweest"], ["11:00", "no-show"], ["11:40", "geweest"], ["12:20", "geweest"]]
      .forEach(([u, status, o = {}]) => boekVoorbeeld(oefen, HR_OEFEN, u, { status, ...o }));
  })();

  // -------------------------------------------------------------------------
  // Berekeningen (zoals de databasefuncties)
  // -------------------------------------------------------------------------

  const telPer = (lijst, sleutel) => {
    const m = new Map();
    for (const x of lijst) {
      const k = sleutel(x);
      m.set(k, (m.get(k) || 0) + 1);
    }
    return [...m].map(([label, aantal]) => ({ label, aantal }))
      .sort((a, b) => b.aantal - a.aantal || String(a.label).localeCompare(String(b.label)));
  };
  const unieke = (lijst) => new Set(lijst.map((w) => `${w.bezoeker}${dagVan(w.created_at)}`)).size;

  function vrijeSlots(p, { metVooraf = true } = {}) {
    const grens = NU + (metVooraf ? p.min_minuten_vooraf * 60e3 : 0);
    return alleSlots(p).filter((s) => Date.parse(s.start) > grens).map((s) => {
      const bezet = boekingen.filter((b) => b.pagina_id === p.id && b.status === "bevestigd" && b.start === s.start).length;
      return { start: s.start, plaatsen: s.plaatsen, vrij: s.plaatsen - bezet };
    });
  }

  function statistiek(id) {
    const p = vind(id);
    const sl = alleSlots(p);
    const bk = boekingen.filter((b) => b.pagina_id === id);
    const ak = bk.filter((b) => b.status !== "geannuleerd");
    const wg = weergaven.filter((w) => w.pagina_id === id);
    const bekeken = wg.filter((w) => w.gebeurtenis === "bekeken");
    const activiteit = [...wg.map((w) => dagVan(w.created_at)), ...bk.map((b) => dagVan(b.created_at))].sort();
    const toekomst = sl.some((s) => Date.parse(s.start) > NU);
    const eind = toekomst ? VANDAAG : [VANDAAG, activiteit[activiteit.length - 1] || VANDAAG].sort()[0];
    const van = [activiteit[0] || eind, plus(eind, -59)].sort()[1];
    const per_dag = [];
    for (let d = van; d <= eind; d = plus(d, 1)) {
      per_dag.push({
        dag: d,
        weergaven: bekeken.filter((w) => dagVan(w.created_at) === d).length,
        boekingen: bk.filter((b) => dagVan(b.created_at) === d).length,
      });
    }
    const uren = new Map();
    for (const s of sl) {
      const u = uurVan(s.start);
      uren.set(u, (uren.get(u) || 0) + s.plaatsen);
    }
    const dagen = new Map();
    for (const s of sl) {
      const d = dagVan(s.start);
      const x = dagen.get(d) || { dag: d, capaciteit: 0, van: s.start, tot: s.start };
      x.capaciteit += s.plaatsen;
      if (s.start < x.van) x.van = s.start;
      if (s.start > x.tot) x.tot = s.start;
      dagen.set(d, x);
    }
    const doorloop = [["Zelfde dag", -1e9, 1], ["1 dag", 1, 2], ["2 à 3 dagen", 2, 4], ["4 à 7 dagen", 4, 8], ["Meer dan een week", 8, 1e9]];
    return {
      kpi: {
        weergaven: bekeken.length, bezoekers: unieke(bekeken),
        slot_gekozen: wg.filter((w) => w.gebeurtenis === "slot_gekozen").length,
        boekingen: bk.length, actief: ak.length, geannuleerd: bk.length - ak.length,
        geweest: bk.filter((b) => b.status === "geweest").length, no_show: bk.filter((b) => b.status === "no-show").length,
        bod: bk.filter((b) => b.bod_uitgebracht).length, nieuwsbrief: ak.filter((b) => b.nieuwsbrief).length,
        via_beheer: ak.filter((b) => b.via_beheer).length, capaciteit: sl.reduce((s, x) => s + x.plaatsen, 0),
        voorbij: ak.filter((b) => Date.parse(b.start) <= NU).length,
      },
      per_dag,
      per_uur: [...uren].sort(([a], [b]) => a.localeCompare(b)).map(([uur, capaciteit]) => ({
        uur, capaciteit, geboekt: ak.filter((b) => uurVan(b.start) === uur).length,
      })),
      per_homerundag: [...dagen.values()].sort((a, b) => a.dag.localeCompare(b.dag)).map((x) => ({
        ...x,
        geboekt: ak.filter((b) => dagVan(b.start) === x.dag).length,
        geannuleerd: bk.filter((b) => b.status === "geannuleerd" && dagVan(b.start) === x.dag).length,
      })),
      bronnen: telPer(ak, (b) => (b.antwoorden?.bron || "").trim() || "Niet ingevuld"),
      kanalen: telPer(bekeken, (w) => w.kanaal || "direct"),
      apparaten: telPer(bekeken, (w) => w.apparaat || "onbekend"),
      doorlooptijd: doorloop.map(([label, van2, tot2]) => ({
        label,
        aantal: ak.filter((b) => {
          const d = (Date.parse(b.start) - Date.parse(b.created_at)) / 864e5;
          return d >= van2 && d < tot2;
        }).length,
      })),
    };
  }

  function overzicht() {
    const rijen = paginas.map((p) => {
      const sl = alleSlots(p);
      const toekomst = sl.filter((s) => Date.parse(s.start) > NU).map((s) => dagVan(s.start));
      const alle = sl.map((s) => dagVan(s.start));
      const bk = boekingen.filter((b) => b.pagina_id === p.id);
      const komend = bk.filter((b) => b.status === "bevestigd" && Date.parse(b.start) >= NU).sort((a, b) => a.start.localeCompare(b.start));
      const dagen = new Set(toekomst).size;
      return {
        id: p.id, slug: p.slug, titel: p.titel, adres: p.adres, actief: p.actief, gearchiveerd: p.gearchiveerd,
        foto_pad: p.foto_pad, kickoff_prijs: p.kickoff_prijs,
        eerste_dag: toekomst[0] || null, laatste_dag: toekomst[toekomst.length - 1] || null, dagen,
        vrije_slots: p.actief ? vrijeSlots(p).filter((s) => s.vrij > 0).length : 0,
        boekingen: komend.length, volgende_boeking: komend[0]?.start || null,
        eerste_dag_ooit: alle[0] || null, laatste_dag_ooit: alle[alle.length - 1] || null,
        capaciteit: sl.reduce((s, x) => s + x.plaatsen, 0),
        geboekt: bk.filter((b) => b.status !== "geannuleerd").length,
        geannuleerd: bk.filter((b) => b.status === "geannuleerd").length,
        weergaven: weergaven.filter((w) => w.pagina_id === p.id && w.gebeurtenis === "bekeken").length,
        fase: p.gearchiveerd ? "archief" : dagen > 0 ? "komend" : !alle.length ? "nieuw" : "afgelopen",
        _created: p.created_at,
      };
    });
    rijen.sort((a, b) => (a.gearchiveerd - b.gearchiveerd) || ((a.dagen === 0) - (b.dagen === 0))
      || (a.eerste_dag && b.eerste_dag ? a.eerste_dag.localeCompare(b.eerste_dag) : a.eerste_dag ? -1 : b.eerste_dag ? 1 : 0)
      || (!a.laatste_dag_ooit ? -1 : !b.laatste_dag_ooit ? 1 : b.laatste_dag_ooit.localeCompare(a.laatste_dag_ooit))
      || a.adres.localeCompare(b.adres));
    return rijen.map(({ _created, ...r }) => r);
  }

  function dashboard() {
    const actief = paginas.filter((p) => !p.gearchiveerd);
    const in30 = (t) => Date.parse(t) >= NU - 30 * 864e5;
    const in60 = (t) => Date.parse(t) >= NU - 60 * 864e5 && Date.parse(t) < NU - 30 * 864e5;
    const bekeken = weergaven.filter((w) => w.gebeurtenis === "bekeken");
    const morgen = plus(VANDAAG, 1);
    const adres = (id) => vind(id)?.adres;
    const homeruns = [];
    for (const p of actief) {
      const perDag = new Map();
      for (const s of alleSlots(p)) {
        const d = dagVan(s.start);
        if (d < VANDAAG) continue;
        const x = perDag.get(d) || { pagina_id: p.id, slug: p.slug, adres: p.adres, titel: p.titel, foto_pad: p.foto_pad, dag: d, capaciteit: 0, van: s.start, tot: s.start };
        x.capaciteit += s.plaatsen;
        if (s.start < x.van) x.van = s.start;
        if (s.start > x.tot) x.tot = s.start;
        perDag.set(d, x);
      }
      for (const x of perDag.values()) {
        x.geboekt = boekingen.filter((b) => b.pagina_id === p.id && b.status !== "geannuleerd" && dagVan(b.start) === x.dag).length;
        homeruns.push(x);
      }
    }
    homeruns.sort((a, b) => a.dag.localeCompare(b.dag) || a.adres.localeCompare(b.adres));
    const metToekomst = (p) => alleSlots(p).some((s) => Date.parse(s.start) > NU);
    return {
      kpi: {
        bezoeken_vandaag: boekingen.filter((b) => b.status === "bevestigd" && dagVan(b.start) === VANDAAG).length,
        bezoeken_7d: boekingen.filter((b) => b.status === "bevestigd" && Date.parse(b.start) >= NU && Date.parse(b.start) < NU + 7 * 864e5).length,
        boekingen_30d: boekingen.filter((b) => in30(b.created_at)).length,
        boekingen_vorige: boekingen.filter((b) => in60(b.created_at)).length,
        weergaven_30d: bekeken.filter((w) => in30(w.created_at)).length,
        weergaven_vorige: bekeken.filter((w) => in60(w.created_at)).length,
        bezoekers_30d: unieke(bekeken.filter((w) => in30(w.created_at))),
      },
      homeruns: homeruns.slice(0, 8),
      vandaag_morgen: boekingen.filter((b) => b.status === "bevestigd" && [VANDAAG, morgen].includes(dagVan(b.start)))
        .sort((a, b) => a.start.localeCompare(b.start))
        .map((b) => ({ id: b.id, pagina_id: b.pagina_id, adres: adres(b.pagina_id), start: b.start, voornaam: b.voornaam, familienaam: b.familienaam, telefoon: b.telefoon, email: b.email })),
      recent: [...boekingen].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8)
        .map((b) => ({ id: b.id, pagina_id: b.pagina_id, adres: adres(b.pagina_id), voornaam: b.voornaam, familienaam: b.familienaam, start: b.start, created_at: b.created_at, status: b.status, via_beheer: b.via_beheer, bron: b.antwoorden?.bron || null })),
      aandacht: {
        mislukt: berichten.filter((m) => m.status === "mislukt").map((m) => {
          const b = boekingen.find((x) => x.id === m.boeking_id);
          return { boeking_id: m.boeking_id, pagina_id: b.pagina_id, adres: adres(b.pagina_id), soort: m.soort, ontvanger: m.ontvanger, fout: m.fout, gepland_op: m.gepland_op };
        }),
        vastgelopen: 0,
        zonder_data: actief.filter((p) => !beschikbaarheid.some((r) => r.pagina_id === p.id))
          .sort((a, b) => b.created_at.localeCompare(a.created_at)).map((p) => ({ id: p.id, adres: p.adres })),
        zonder_eigenaar: actief.filter((p) => !(p.eigenaar_email || "").trim() && metToekomst(p)).map((p) => ({ id: p.id, adres: p.adres })),
        zonder_foto: actief.filter((p) => !p.foto_pad && metToekomst(p)).map((p) => ({ id: p.id, adres: p.adres })),
      },
    };
  }

  // -------------------------------------------------------------------------
  // Foto's, links en de publieke kant (bezoekerspagina en verkopersrapport)
  // -------------------------------------------------------------------------

  const fotos = { ...(O.fotos || {}) };
  const basis = (O.basis || "https://afspraak.henryhouser.be").replace(/\/$/, "");
  const paginaSjabloon = O.paginaHtml || O.voorbeeldHtml || null;

  // JSON veilig in een <script> zetten
  const js = (x) => JSON.stringify(x).replace(/</g, "\\u003c");

  const datumLangServer = new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  const datumJaarServer = new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const vulIn = (sjabloon, w) => String(sjabloon || "").replace(/\{([a-z_]+)\}/g, (m, k) => (k in w ? String(w[k] ?? "") : m))
    .replace(/ {2,}/g, " ").trim();

  // Zoals pagina_publiek: alleen actieve pagina's
  function publiekePagina(slug) {
    const p = paginas.find((x) => x.slug === slug && x.actief);
    if (!p) return null;
    return {
      slug: p.slug, titel: p.titel, adres: p.adres, intro: p.intro, duur_min: p.duur_min, formuliervelden: p.formuliervelden,
      foto_pad: p.foto_pad, foto_url: fotos[p.foto_pad] || null, kickoff_prijs: p.kickoff_prijs, pand_url: p.pand_url,
      komende_dagen: [...new Set(alleSlots(p).filter((s) => Date.parse(s.start) > Date.now()).map((s) => dagVan(s.start)))],
    };
  }

  // Zoals vrije_slots
  function publiekeSlots(slug) {
    const p = paginas.find((x) => x.slug === slug && x.actief);
    if (!p) return [];
    return vrijeSlots(p).filter((s) => s.vrij > 0)
      .map((s) => ({ start: s.start, eind: iso(Date.parse(s.start) + p.duur_min * 60e3), plaatsen: s.vrij }));
  }

  // Zoals de edge function boek (maar zonder mails: die staan als verzonden in de lijst)
  async function publiekBoek(body) {
    await wacht(450);
    const p = paginas.find((x) => x.slug === body.slug && x.actief);
    if (!p) return { status: 404, data: { fout: "niet_gevonden", melding: "Deze pagina bestaat niet (meer)." } };
    const a = body.antwoorden || {};
    if (!a.voornaam || !a.email) return { status: 400, data: { fout: "ongeldig", melding: "Vul minstens je voornaam en e-mailadres in." } };
    const s = vrijeSlots(p).find((x) => x.start === body.start);
    if (!s || s.vrij < 1) return { status: 409, data: { fout: "slot_niet_vrij", melding: "Dit startuur is niet meer vrij." } };
    const b = {
      id: `bk${++bid}`, pagina_id: p.id, start: s.start, eind: iso(Date.parse(s.start) + p.duur_min * 60e3), status: "bevestigd",
      voornaam: String(a.voornaam), familienaam: a.familienaam || null, email: String(a.email), telefoon: a.telefoon || null,
      nieuwsbrief: !!a.nieuwsbrief, antwoorden: kopie(a), token: uuid(), created_at: iso(Date.now()), geannuleerd_op: null,
      notitie: null, bod_uitgebracht: false, kanaal: body.kanaal || null, apparaat: body.apparaat || null, via_beheer: false,
      verplaatst_op: null, ics_volgnummer: 0, laad_id: body.laad_id || null,
    };
    boekingen.push(b);
    berichtenVoor(p, b);
    const w = {
      voornaam: b.voornaam, familienaam: b.familienaam || "", adres: p.adres, titel: p.titel,
      start: `${datumJaarServer.format(new Date(b.start))} om ${uurVan(b.start)}`, datum: datumLangServer.format(new Date(b.start)),
      start_uur: uurVan(b.start), eigenaar_naam: p.eigenaar_naam || "",
      kickoff_prijs: p.kickoff_prijs ? `${new Intl.NumberFormat("nl-BE").format(p.kickoff_prijs)} euro` : "",
    };
    const stempel = (t) => t.replace(/[-:]/g, "").replace(/\.\d{3}/, "");
    const beschrijving = `Bezoek aan ${p.adres} met Henry Houser.`;
    const google = `https://calendar.google.com/calendar/render?${new URLSearchParams({
      action: "TEMPLATE", text: `Bezoek ${p.adres}`, dates: `${stempel(b.start)}/${stempel(b.eind)}`, location: p.adres, details: beschrijving,
    })}`;
    const office365 = `https://outlook.office.com/calendar/0/deeplink/compose?${new URLSearchParams({
      path: "/calendar/action/compose", rru: "addevent", subject: `Bezoek ${p.adres}`, startdt: b.start, enddt: b.eind,
      location: p.adres, body: beschrijving,
    })}`;
    return {
      status: 200,
      data: { start: b.start, eind: b.eind, scherm: vulIn(p.bevestigingsscherm, w), agenda: { google, office365, ics: "#" } },
    };
  }

  // Zoals log_weergave; in de demo ben jij één bezoeker per dag.
  function publiekLog(a) {
    const p = paginas.find((x) => x.slug === a.p_slug && x.actief);
    if (!p || !a.p_laad_id || !["bekeken", "slot_gekozen"].includes(a.p_gebeurtenis)) return;
    weergaven.push({
      pagina_id: p.id, gebeurtenis: a.p_gebeurtenis, bezoeker: "demo-bezoeker", kanaal: a.p_kanaal || null,
      apparaat: a.p_apparaat || null, created_at: iso(Date.now()),
    });
  }

  // Zoals rapport_publiek
  function publiekRapport(token) {
    const p = paginas.find((x) => x.rapport_token === token);
    if (!p) return null;
    const s = statistiek(p.id);
    const k = s.kpi;
    return {
      adres: p.adres, titel: p.titel, foto_pad: p.foto_pad, foto_url: fotos[p.foto_pad] || null, kickoff_prijs: p.kickoff_prijs,
      eigenaar_naam: p.eigenaar_naam, bijgewerkt: iso(Date.now()),
      kpi: { weergaven: k.weergaven, bezoekers: k.bezoekers, actief: k.actief, geannuleerd: k.geannuleerd, capaciteit: k.capaciteit, geweest: k.geweest, voorbij: k.voorbij },
      per_dag: s.per_dag, per_homerundag: s.per_homerundag, bronnen: s.bronnen,
    };
  }

  // Lijm in de pagina zelf (srcdoc): haalt de gegevens live uit deze demo via parent.
  // Lukt dat niet, dan toont de pagina de gegevens van het moment dat ze geopend werd.
  const KOPPEL = `function hhKoppel(slug, pagina, slots) {
    var P = null;
    try { P = window.parent.DEMO_PUBLIEK || null; } catch (e) { P = null; }
    try { Object.defineProperty(document, "referrer", { value: "" }); } catch (e) { /* niets */ }
    // Links naar andere sites openen in een nieuw tabblad, niet in dit venster.
    document.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a[href^='http']");
      if (a && !a.target) a.target = "_blank";
    }, true);
    var kloon = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };
    if (!P) return {
      pagina: function () { return Promise.resolve(pagina); },
      slots: function () { return Promise.resolve(slots); },
      boek: function () { return Promise.resolve({ status: 503, data: { melding: "Boeken lukt niet in deze weergave van de demo." } }); },
      log: function () {},
    };
    return {
      pagina: function () { return P.pagina(slug).then(kloon); },
      slots: function () { return P.slots(slug).then(kloon); },
      boek: function (body) { return P.boek(kloon(body)).then(kloon); },
      log: function (args) { P.log(kloon(args)); },
    };
  }`;

  /** De bezoekerspagina als HTML voor een iframe (srcdoc), live gekoppeld aan deze demo. */
  function paginaHtml(slug, { voorbeeld = false, utm = null } = {}) {
    const qs = `?slug=${encodeURIComponent(slug)}${voorbeeld ? "&voorbeeld=1" : ""}${utm ? `&utm_source=${encodeURIComponent(utm)}` : ""}`;
    const kop = `<script>${KOPPEL}\nwindow.AFSPRAAK_QS=${js(qs)};window.AFSPRAAK_API=hhKoppel(${js(slug)},${js(publiekePagina(slug))},${js(publiekeSlots(slug))});<\/script>`;
    return paginaSjabloon.replace("<!--DEMO-KOP-->", () => kop);
  }

  /** Het verkopersrapport als HTML voor een iframe (srcdoc). */
  function rapportHtml(token) {
    const kop = `<script>window.AFSPRAAK_QS=${js(`?token=${encodeURIComponent(token)}`)};(function () {
      var P = null; try { P = window.parent.DEMO_PUBLIEK || null; } catch (e) { P = null; }
      var r = ${js(publiekRapport(token))};
      document.addEventListener("click", function (e) {
        var a = e.target.closest && e.target.closest("a[href^='http']");
        if (a && !a.target) a.target = "_blank";
      }, true);
      window.RAPPORT_API = { rapport: function (t) {
        return P ? P.rapport(t).then(function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); }) : Promise.resolve(r);
      } };
    })();<\/script>`;
    return O.rapportHtml.replace("<!--DEMO-KOP-->", () => kop);
  }

  window.DEMO_PUBLIEK = {
    async pagina(slug) { await wacht(150); return kopie(publiekePagina(slug)); },
    async slots(slug) { await wacht(100); return kopie(publiekeSlots(slug)); },
    boek: publiekBoek,
    log: publiekLog,
    async rapport(token) { await wacht(200); return kopie(publiekRapport(token)); },
    paginaHtml: paginaSjabloon ? paginaHtml : null,
    rapportHtml: O.rapportHtml ? rapportHtml : null,
    basis,
  };

  // Het voorbeeld in het beheer (srcdoc) en "Open groot". Zonder sjabloon (testserver) komt
  // de pagina gewoon van de site.
  const voorbeeldHtml = (slug) => paginaHtml(slug, { voorbeeld: true });
  const voorbeeldUrl = (slug) => (paginaSjabloon ? `${basis}/${encodeURIComponent(slug)}?voorbeeld=1` : `/${encodeURIComponent(slug)}?voorbeeld=1`);

  // -------------------------------------------------------------------------
  // De API (zelfde vorm als web/js/beheer/api.js)
  // -------------------------------------------------------------------------

  let ingelogd = O.ingelogd !== false ? "hendrik@henryhouser.be" : null;
  const boeking = (id) => {
    const b = boekingen.find((x) => x.id === id);
    if (!b) throw fout("boeking_niet_gevonden");
    return b;
  };

  window.BEHEER_API = {
    demo: true,
    async sessie() { return ingelogd; },
    async login(email, wachtwoord) {
      await wacht(300);
      if (!email || !wachtwoord) throw new Error("Invalid login credentials");
      ingelogd = email;
      return email;
    },
    async uitloggen() { ingelogd = null; },
    async wachtwoordVergeten() { await wacht(300); },
    async wachtwoordZetten() { await wacht(300); },
    opHerstel() {},

    async dashboard() { await wacht(); return kopie(dashboard()); },
    async overzicht() { await wacht(); return kopie(overzicht()); },
    async statistiek(id) { await wacht(); return kopie(statistiek(id)); },

    async pagina(id) {
      await wacht();
      const p = vind(id);
      if (!p) throw fout("JSON object requested, multiple (or no) rows returned");
      return kopie(p);
    },
    async paginaBewaren(id, velden) {
      await wacht(250);
      const p = vind(id);
      if (velden.slug && paginas.some((x) => x.slug === velden.slug && x.id !== id)) throw fout("duplicate key value violates unique constraint \"paginas_slug_key\"");
      Object.assign(p, kopie(velden), { updated_at: iso(Date.now()) });
      return kopie(p);
    },
    async paginaNieuw(velden, bronId) {
      await wacht(300);
      if (paginas.some((x) => x.slug === velden.slug)) throw fout("duplicate key value violates unique constraint \"paginas_slug_key\"");
      const bron = bronId ? kopie(vind(bronId)) : {};
      for (const k of ["id", "created_at", "updated_at", "slug", "adres", "titel", "foto_pad", "kickoff_prijs", "pand_url",
        "gearchiveerd", "eigenaar_naam", "eigenaar_email", "rapport_token"]) delete bron[k];
      const p = nieuwePagina({ ...bron, ...kopie(velden), id: `nieuw-${Date.now().toString(36)}`, created_at: iso(Date.now()) });
      paginas.push(p);
      return kopie(p);
    },
    async paginaVerwijderen(id) {
      await wacht(250);
      if (boekingen.some((b) => b.pagina_id === id)) throw fout("update or delete on table \"paginas\" violates foreign key constraint \"boekingen_pagina_id_fkey\"");
      paginas.splice(paginas.findIndex((p) => p.id === id), 1);
      for (let i = beschikbaarheid.length - 1; i >= 0; i--) if (beschikbaarheid[i].pagina_id === id) beschikbaarheid.splice(i, 1);
      for (let i = weergaven.length - 1; i >= 0; i--) if (weergaven[i].pagina_id === id) weergaven.splice(i, 1);
    },

    async beschikbaarheid(id) {
      await wacht();
      return kopie(beschikbaarheid.filter((r) => r.pagina_id === id).sort((a, b) => a.datum_van.localeCompare(b.datum_van) || a.van.localeCompare(b.van)));
    },
    async beschikbaarheidNieuw(rij) {
      await wacht(250);
      beschikbaarheid.push({ ...kopie(rij), id: `b-${Date.now().toString(36)}`, van: `${rij.van.slice(0, 5)}:00`, tot: `${rij.tot.slice(0, 5)}:00` });
    },
    async beschikbaarheidWijzigen(id, velden) {
      await wacht(250);
      const r = beschikbaarheid.find((x) => x.id === id);
      Object.assign(r, kopie(velden), { van: `${velden.van.slice(0, 5)}:00`, tot: `${velden.tot.slice(0, 5)}:00` });
    },
    async beschikbaarheidWeg(id) {
      await wacht(200);
      beschikbaarheid.splice(beschikbaarheid.findIndex((r) => r.id === id), 1);
    },
    async slots(id) {
      await wacht();
      return kopie(vrijeSlots(vind(id), { metVooraf: false }));
    },

    async boekingen(id) {
      await wacht();
      return kopie(boekingen.filter((b) => b.pagina_id === id).sort((a, b) => a.start.localeCompare(b.start)));
    },
    async berichten(boekingId) {
      await wacht(150);
      return kopie(berichten.filter((m) => m.boeking_id === boekingId).sort((a, b) => a.gepland_op.localeCompare(b.gepland_op)));
    },
    async boekingWijzigen(id, velden) {
      await wacht(200);
      const b = boeking(id);
      if (b.status === "geannuleerd") throw fout("JSON object requested, multiple (or no) rows returned");
      Object.assign(b, kopie(velden));
      return kopie(b);
    },
    async boekingVerwijderen(id) {
      await wacht(200);
      boekingen.splice(boekingen.findIndex((b) => b.id === id), 1);
      for (let i = berichten.length - 1; i >= 0; i--) if (berichten[i].boeking_id === id) berichten.splice(i, 1);
    },
    async boek(paginaId, start, antwoorden, mail) {
      await wacht(350);
      const p = vind(paginaId);
      const s = vrijeSlots(p, { metVooraf: false }).find((x) => x.start === start);
      if (!s || s.vrij < 1) throw fout("slot_niet_vrij");
      if (!antwoorden.voornaam || !antwoorden.email) throw fout("voornaam_en_email_verplicht");
      const b = {
        id: `bk${++bid}`, pagina_id: p.id, start, eind: iso(Date.parse(start) + p.duur_min * 60e3), status: "bevestigd",
        voornaam: antwoorden.voornaam, familienaam: antwoorden.familienaam || null, email: antwoorden.email,
        telefoon: antwoorden.telefoon || null, nieuwsbrief: !!antwoorden.nieuwsbrief, antwoorden: kopie(antwoorden),
        token: uuid(), created_at: iso(Date.now()), geannuleerd_op: null, notitie: null, bod_uitgebracht: false,
        kanaal: "beheer", apparaat: null, via_beheer: true, verplaatst_op: null, ics_volgnummer: 0, laad_id: null,
      };
      boekingen.push(b);
      berichtenVoor(p, b, { mailBezoeker: mail, alert: false });
      return kopie(b);
    },
    async verplaats(boekingId, start, mail) {
      await wacht(350);
      const b = boeking(boekingId);
      const p = vind(b.pagina_id);
      if (b.status !== "bevestigd") throw fout("niet_bevestigd");
      const s = vrijeSlots(p, { metVooraf: false }).find((x) => x.start === start);
      if (!s || s.vrij < 1) throw fout("slot_niet_vrij");
      Object.assign(b, { start, eind: iso(Date.parse(start) + p.duur_min * 60e3), verplaatst_op: iso(Date.now()), ics_volgnummer: b.ics_volgnummer + 1 });
      for (const m of berichten) if (m.boeking_id === b.id && m.soort === "reminder" && m.status === "wachtrij") m.status = "geannuleerd";
      if (p.reminder_uren_vooraf) {
        const moment = Date.parse(start) - p.reminder_uren_vooraf * 3600e3;
        if (moment > Date.now()) bericht(b, "reminder", b.email, { status: "wachtrij", op: iso(moment) });
      }
      if (mail) bericht(b, "verplaatst", b.email, { op: iso(Date.now()) });
      return kopie(b);
    },
    async annuleer(token) {
      await wacht(350);
      const b = boekingen.find((x) => x.token === token);
      const p = vind(b.pagina_id);
      if (Date.parse(b.start) <= Date.now()) throw fout("bezoek_voorbij");
      b.status = "geannuleerd";
      b.geannuleerd_op = iso(Date.now());
      for (const m of berichten) if (m.boeking_id === b.id && m.status === "wachtrij") m.status = "geannuleerd";
      bericht(b, "annulering", b.email, { op: b.geannuleerd_op });
      if (p.alert_email) bericht(b, "annulering_alert", p.alert_email, { op: b.geannuleerd_op });
      return { ok: true };
    },
    async verstuur() { return { verzonden: 0 }; },

    async fotoOpladen(paginaId, blob, breed) {
      await wacht(500);
      const pad = `${paginaId}/${Date.now()}.jpg`;
      fotos[pad] = URL.createObjectURL(blob);
      if (breed) fotos[pad.replace(/\.jpg$/, "-breed.jpg")] = URL.createObjectURL(breed);
      return pad;
    },
    async fotoVerwijderen(pad) {
      for (const k of [pad, pad.replace(/\.jpg$/, "-breed.jpg")]) {
        if (fotos[k]?.startsWith("blob:")) URL.revokeObjectURL(fotos[k]);
        delete fotos[k];
      }
    },
    fotoUrl: (pad) => (pad ? fotos[pad] || null : null),
    mailFotoPad: (pad) => (!pad ? null : /^[^/]+\/\d+\.jpg$/.test(pad) ? pad.replace(/\.jpg$/, "-breed.jpg") : pad),
    logoUrl: O.logo || "/img/logo-mail.png",
    publiekeUrl: (slug) => `${basis}/${slug}`,
    rapportUrl: (token) => `${basis}/rapport?token=${token}`,
    voorbeeldUrl,
    ...(paginaSjabloon ? { voorbeeldHtml } : {}),
  };
})();
