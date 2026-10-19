// Publieke boekingspagina: afspraak.henryhouser.be/<slug>
(() => {
  const cfg = window.AFSPRAAK_CONFIG;
  const TZ = "Europe/Brussels";
  const $ = (id) => document.getElementById(id);

  // Slug uit het pad, of ?slug= voor lokaal testen.
  const params = new URLSearchParams(location.search);
  const slug = params.get("slug") ||
    decodeURIComponent(location.pathname.split("/").filter(Boolean)[0] || "");
  // ?voorbeeld=1: weergave in het beheerplatform, zonder echt te boeken.
  const voorbeeld = params.has("voorbeeld");

  let pagina = null;
  let slots = [];
  let gekozen = null;
  let actieveDag = null;

  const fmtDag = new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  const fmtUur = new Intl.DateTimeFormat("nl-BE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  const dagSleutel = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
  const uur = (iso) => fmtUur.format(new Date(iso)).replace(".", ":");

  async function rpc(naam, args) {
    const res = await fetch(`${cfg.supabaseUrl}/rest/v1/rpc/${naam}`, {
      method: "POST",
      headers: {
        // Nieuwe publishable keys gaan alleen in de apikey-header, niet als Bearer-token.
        apikey: cfg.supabaseAnonKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`${naam}: ${res.status}`);
    return res.json();
  }

  function toon(stap) {
    for (const id of ["stap-slot", "stap-form", "stap-klaar"]) $(id).hidden = id !== stap;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function algemeneFout(tekst) {
    $("laden").hidden = true;
    $("fout-algemeen").textContent = tekst;
    $("fout-algemeen").hidden = false;
  }

  async function laadSlots() {
    slots = await rpc("vrije_slots", { p_slug: slug });
    const dagen = [...new Set(slots.map((s) => dagSleutel(s.start)))];
    if (!dagen.includes(actieveDag)) actieveDag = dagen[0] ?? null;
    tekenDagen(dagen);
    tekenSlots();
  }

  function tekenDagen(dagen) {
    const box = $("dagen");
    box.replaceChildren();
    // Eén dag (Homerun): geen tabs, wel de datum als kop.
    if (dagen.length <= 1) {
      if (dagen.length === 1) {
        const s = slots[0];
        const p = document.createElement("p");
        p.className = "melding";
        p.textContent = cap(fmtDag.format(new Date(s.start)));
        box.append(p);
      }
      return;
    }
    for (const d of dagen) {
      const s = slots.find((x) => dagSleutel(x.start) === d);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dag";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(d === actieveDag));
      b.textContent = cap(fmtDag.format(new Date(s.start)));
      b.onclick = () => {
        actieveDag = d;
        tekenDagen(dagen);
        tekenSlots();
      };
      box.append(b);
    }
  }

  function tekenSlots() {
    const box = $("slots");
    box.replaceChildren();
    const vandaag = slots.filter((s) => dagSleutel(s.start) === actieveDag);
    $("geen-slots").hidden = slots.length > 0;
    for (const s of vandaag) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "slot";
      b.textContent = uur(s.start);
      b.onclick = () => kies(s);
      box.append(b);
    }
  }

  function kies(s) {
    gekozen = s;
    $("gekozen-tekst").textContent = `${fmtDag.format(new Date(s.start))} om ${uur(s.start)}`;
    $("fout-form").hidden = true;
    toon("stap-form");
    const eerste = $("velden").querySelector("input, select, textarea");
    if (eerste) eerste.focus({ preventScroll: true });
  }

  function tekenVelden() {
    const box = $("velden");
    for (const v of pagina.formuliervelden) {
      const wrap = document.createElement("div");
      wrap.className = "veld" + (v.type === "checkbox" ? " check" : "");
      const id = `veld-${v.key}`;
      let input;

      if (v.type === "select") {
        input = document.createElement("select");
        const leeg = new Option("Maak een keuze", "");
        leeg.disabled = true;
        leeg.selected = true;
        input.append(leeg, ...v.opties.map((o) => new Option(o, o)));
      } else if (v.type === "textarea") {
        input = document.createElement("textarea");
      } else {
        input = document.createElement("input");
        input.type = v.type === "checkbox" ? "checkbox" : v.type;
        const auto = { voornaam: "given-name", familienaam: "family-name", email: "email", telefoon: "tel" }[v.key];
        if (auto) input.autocomplete = auto;
      }
      input.id = id;
      input.name = v.key;
      input.addEventListener(v.type === "select" || v.type === "checkbox" ? "change" : "input", () => {
        input.removeAttribute("aria-invalid");
      });
      if (v.verplicht) input.required = true;

      const label = document.createElement("label");
      label.htmlFor = id;
      if (v.type === "checkbox") {
        label.append(input, document.createTextNode(v.label));
        wrap.append(label);
      } else {
        label.textContent = v.label;
        if (v.verplicht) {
          const ster = document.createElement("span");
          ster.className = "ster";
          ster.textContent = " *";
          label.append(ster);
        }
        wrap.append(label, input);
      }
      box.append(wrap);
    }
  }

  function leesForm() {
    const antwoorden = {};
    for (const v of pagina.formuliervelden) {
      const el = $(`veld-${v.key}`);
      antwoorden[v.key] = v.type === "checkbox" ? el.checked : el.value.trim();
    }
    return antwoorden;
  }

  function controleer() {
    let eersteFout = null;
    for (const v of pagina.formuliervelden) {
      const el = $(`veld-${v.key}`);
      const ok = el.checkValidity() && (!v.verplicht || v.type === "checkbox" || el.value.trim() !== "");
      el.setAttribute("aria-invalid", String(!ok));
      if (!ok && !eersteFout) eersteFout = { el, v };
    }
    if (eersteFout) {
      eersteFout.el.focus();
      const leeg = eersteFout.el.value.trim() === "";
      return leeg ? `${eersteFout.v.label} is verplicht.` : `Controleer ${eersteFout.v.label.toLowerCase()}.`;
    }
    return null;
  }

  async function verstuur(e) {
    e.preventDefault();
    const fout = controleer();
    if (fout) {
      $("fout-form").textContent = fout;
      $("fout-form").hidden = false;
      return;
    }
    if (voorbeeld) {
      $("fout-form").textContent = "Voorbeeld: hier wordt niet echt geboekt.";
      $("fout-form").hidden = false;
      return;
    }
    const knop = $("verstuur");
    knop.disabled = true;
    knop.textContent = "Bezig…";
    $("fout-form").hidden = true;

    try {
      const res = await fetch(`${cfg.supabaseUrl}/functions/v1/boek`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey },
        body: JSON.stringify({
          slug,
          start: gekozen.start,
          antwoorden: leesForm(),
          website: $("form").elements.website.value,
        }),
      });
      const data = await res.json().catch(() => ({}));

      if (res.status === 409) {
        await laadSlots();
        toon("stap-slot");
        algemeneMelding(data.melding || "Dit tijdslot is net volzet. Kies een ander tijdslot.");
        return;
      }
      if (!res.ok) throw new Error(data.melding || "Er liep iets mis. Probeer het opnieuw.");

      $("scherm").textContent = data.scherm;
      $("ag-google").href = data.agenda.google;
      $("ag-office").href = data.agenda.office365;
      $("ag-ics").href = data.agenda.ics;
      toon("stap-klaar");
    } catch (err) {
      $("fout-form").textContent = err.message;
      $("fout-form").hidden = false;
    } finally {
      knop.disabled = false;
      knop.textContent = "Bevestig afspraak";
    }
  }

  function algemeneMelding(tekst) {
    $("fout-algemeen").textContent = tekst;
    $("fout-algemeen").hidden = false;
  }

  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  async function start() {
    if (!slug) return algemeneFout("Deze boekingspagina bestaat niet.");
    try {
      pagina = await rpc("pagina_publiek", { p_slug: slug });
      if (!pagina) return algemeneFout("Deze boekingspagina bestaat niet (meer).");

      document.title = `${pagina.titel} · Henry Houser`;
      $("titel").textContent = pagina.titel;
      $("adres").textContent = pagina.adres;
      $("intro").textContent = pagina.intro || "";
      $("intro").hidden = !pagina.intro;
      tekenVelden();
      await laadSlots();

      $("laden").hidden = true;
      toon("stap-slot");
    } catch (err) {
      console.error(err);
      algemeneFout("De boekingspagina kon niet geladen worden. Probeer het later opnieuw.");
    }
  }

  $("form").addEventListener("submit", verstuur);
  $("wijzig").addEventListener("click", () => {
    $("fout-algemeen").hidden = true;
    toon("stap-slot");
  });
  start();
})();
