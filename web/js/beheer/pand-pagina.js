// De bezoekerspagina van één adres: foto, gegevens van het pand, de link, de teksten en het
// formulier, met ernaast een live voorbeeld (gsm of computer, per stap). De foto en
// online/offline worden meteen bewaard; de rest via de bewaarbalk.

import { icoon } from "../iconen.js";
import { boogFoto } from "../kader.js";
import { dagSleutel, el, getal } from "../tekst.js";
import { VASTE_VELDEN, VERPLICHTE_VELDEN } from "./standaard.js";
import { staat } from "./staat.js";
import { bevestig, bewaarBalk, foutTekst, ikoonKnop, sectie, segment, toast, veld, vinkje } from "./ui.js";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const TEKSTVELDEN = ["adres", "titel", "slug", "kickoff_prijs", "pand_url", "intro", "bevestigingsscherm", "formuliervelden"];
const TYPES = [
  ["text", "Korte tekst"], ["textarea", "Lange tekst"], ["email", "E-mail"], ["tel", "Telefoon"],
  ["select", "Keuzelijst"], ["checkbox", "Vinkje"],
];
const VAST_TYPE = { voornaam: "text", familienaam: "text", email: "email", telefoon: "tel", nieuwsbrief: "checkbox" };
const STANDAARD_LABEL = {
  familienaam: "Familienaam", telefoon: "Telefoon", nieuwsbrief: "Ja, ik ontvang graag de nieuwsbrief van Henry Houser",
};
const PLAATSHOUDERS_SCHERM = [
  ["{voornaam}", "Voornaam van de bezoeker"], ["{start}", "zaterdag 31 oktober 2026 om 09:40"],
  ["{datum}", "zaterdag 31 oktober"], ["{start_uur}", "09:40"], ["{adres}", "Het adres"],
];

const kopie = (o) => JSON.parse(JSON.stringify(o));

// Foto verkleinen in de browser: max. 2000 px aan de lange kant, JPEG. Daarnaast een liggende
// uitsnede van 1200 × 800 voor bovenaan de mails.
async function verklein(bestand, max = 2000, kwaliteit = 0.85) {
  let bron = await createImageBitmap(bestand, { imageOrientation: "from-image" }).catch(() => null);
  if (!bron) {
    const url = URL.createObjectURL(bestand);
    bron = await new Promise((ok, nok) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => nok(new Error("Deze afbeelding kan niet gelezen worden. Probeer een jpg of png."));
      i.src = url;
    });
  }
  const w = bron.width;
  const h = bron.height;
  const schaal = Math.min(1, max / Math.max(w, h));
  const canvas = el("canvas", { width: Math.round(w * schaal), height: Math.round(h * schaal) });
  canvas.getContext("2d").drawImage(bron, 0, 0, canvas.width, canvas.height);

  const BW = 1200;
  const BH = 800;
  const bronBreed = Math.min(w, (h * BW) / BH);
  const bronHoog = Math.min(h, (w * BH) / BW);
  const k = Math.min(1, BW / bronBreed); // nooit groter dan het origineel
  const uitsnede = el("canvas", { width: Math.round(bronBreed * k), height: Math.round(bronHoog * k) });
  uitsnede.getContext("2d").drawImage(bron, (w - bronBreed) / 2, (h - bronHoog) / 2, bronBreed, bronHoog,
    0, 0, uitsnede.width, uitsnede.height);

  const alsJpeg = (c) => new Promise((ok) => c.toBlob(ok, "image/jpeg", kwaliteit));
  const [blob, breed] = await Promise.all([alsJpeg(canvas), alsJpeg(uitsnede)]);
  if (!blob || !breed) throw new Error("De foto kon niet verwerkt worden.");
  return { blob, breed };
}

function voegIn(t, tekst) {
  const s = t.selectionStart ?? t.value.length;
  const e = t.selectionEnd ?? s;
  t.setRangeText(tekst, s, e, "end");
  t.focus();
  t.dispatchEvent(new Event("input", { bubbles: true }));
}

export function plaatshouders(textarea, lijst) {
  return el("div", { className: "chips", role: "group", "aria-label": "Gegevens invoegen" },
    el("span", { className: "klein" }, "Invoegen:"),
    lijst.map(([code, uitleg]) => {
      const k = el("button", { type: "button", className: "chip", title: uitleg }, code);
      k.addEventListener("click", () => voegIn(textarea, code));
      return k;
    }));
}

let berichtLuisteraar = null; // van het voorbeeld dat nu open staat

export async function toon(paneel, ctx) {
  const mijn = staat.navigatie;
  const api = staat.api;
  const alleSlots = await api.slots(ctx.id).catch(() => []);
  if (mijn !== staat.navigatie) return;

  let concept = Object.fromEntries(TEKSTVELDEN.map((k) => [k, kopie(ctx.pagina[k] ?? null)]));
  concept.formuliervelden ||= [];
  let origineel = JSON.stringify(concept);
  const vuil = () => JSON.stringify(concept) !== origineel;
  staat.vuil = vuil;

  const links = el("div", { className: "raster-kolom pagina-form" });
  const rechts = el("div", { className: "raster-kolom voorbeeld-kolom" });
  const balk = bewaarBalk({ opBewaar: bewaar, opHerstel: herstel });

  const gewijzigd = () => {
    balk.toon(vuil());
    stuurLater();
  };

  // Foto -------------------------------------------------------------------------------------------

  const fotoSectie = el("div");
  function tekenFoto(status) {
    const pad = ctx.pagina.foto_pad;
    const kies = el("input", { type: "file", accept: "image/jpeg,image/png,image/webp,image/*", className: "sr", id: "foto-kies" });
    const kiesLabel = el("label", { className: "knop zwart klein", for: "foto-kies" }, icoon("upload"), pad ? "Andere foto kiezen" : "Foto kiezen");
    const weg = pad ? el("button", { type: "button", className: "knop lijn klein" }, icoon("prullenbak"), "Verwijderen") : null;
    const zone = el("div", { className: `foto-zone${status ? " bezig" : ""}` },
      boogFoto(api.fotoUrl(pad), "Foto van het pand", "foto-boog"),
      el("div", { className: "foto-tekst" },
        el("p", {}, pad ? "Deze foto zien bezoekers bovenaan de pagina, in een boog zoals op henryhouser.be." : "Nog geen foto. Bezoekers zien nu een lege boog met het monogram."),
        el("p", { className: "klein" }, "Sleep een foto hierheen of kies er een. Een staande foto past het mooist. Grote foto's verkleinen we automatisch."),
        status ? el("p", { className: "foto-status", role: "status" }, el("span", { className: "laad-balk" }), status) : null,
        el("div", { className: "foto-knoppen" }, kies, kiesLabel, weg)));
    kies.addEventListener("change", () => kies.files[0] && laadOp(kies.files[0]));
    weg?.addEventListener("click", verwijderFoto);
    zone.addEventListener("dragover", (e) => {
      e.preventDefault();
      zone.classList.add("sleep");
    });
    zone.addEventListener("dragleave", () => zone.classList.remove("sleep"));
    zone.addEventListener("drop", (e) => {
      e.preventDefault();
      zone.classList.remove("sleep");
      const f = e.dataTransfer?.files?.[0];
      if (f) laadOp(f);
    });
    fotoSectie.replaceChildren(sectie({ titel: "Foto" }, zone));
  }

  let bezigMetFoto = false;
  async function laadOp(bestand) {
    if (bezigMetFoto) return;
    if (!/^image\//.test(bestand.type)) return toast("Kies een afbeelding: jpg, png of webp.", { fout: true });
    bezigMetFoto = true;
    try {
      tekenFoto("Foto verkleinen…");
      const { blob, breed } = await verklein(bestand);
      tekenFoto("Foto opladen…");
      const oud = ctx.pagina.foto_pad;
      const pad = await api.fotoOpladen(ctx.id, blob, breed);
      await ctx.bewaar({ foto_pad: pad });
      if (oud) api.fotoVerwijderen(oud).catch((e) => console.warn("Oude foto niet verwijderd:", e));
      toast("Foto bewaard. Bezoekers zien ze meteen.");
    } catch (err) {
      console.error(err);
      toast(foutTekst(err), { fout: true });
    } finally {
      bezigMetFoto = false;
      tekenFoto();
      stuur();
    }
  }

  async function verwijderFoto() {
    if (!(await bevestig({ titel: "Foto verwijderen?", tekst: "Bezoekers zien dan een lege boog met het monogram.", ja: "Verwijderen", gevaar: true }))) return;
    const oud = ctx.pagina.foto_pad;
    try {
      await ctx.bewaar({ foto_pad: null });
      api.fotoVerwijderen(oud).catch((e) => console.warn(e));
      toast("Foto verwijderd.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    }
    tekenFoto();
    stuur();
  }

  // Online / offline (meteen bewaard) ------------------------------------------------------------------

  const zichtbaarSectie = el("div");
  function tekenZichtbaar() {
    const aan = ctx.pagina.actief;
    const knop = el("button", { type: "button", className: `knop klein ${aan ? "lijn" : "zwart"}` }, aan ? "Offline zetten" : "Online zetten");
    knop.addEventListener("click", async () => {
      knop.disabled = true;
      try {
        await ctx.bewaar(aan ? { actief: false } : { actief: true, gearchiveerd: false });
        toast(aan ? "De pagina staat offline." : "De pagina staat online.");
      } catch (err) {
        toast(foutTekst(err), { fout: true });
      }
      tekenZichtbaar();
    });
    zichtbaarSectie.replaceChildren(sectie({ titel: "Zichtbaarheid" },
      el("div", { className: "zichtbaar" },
        el("span", { className: `badge ${aan ? "goed" : "slecht"}` }, aan ? "Online" : "Offline"),
        el("p", {}, aan ? "Iedereen met de link kan een bezoek boeken." : "Bezoekers zien een melding dat de pagina niet (meer) bestaat en kunnen niet boeken."),
        knop)));
  }

  // Gegevens, link en teksten --------------------------------------------------------------------------

  function tekstInvoer(sleutel, opties = {}) {
    const i = opties.lang ? el("textarea", { rows: opties.rijen || 5 }) : el("input", { type: opties.type || "text", autocomplete: "off" });
    i.value = concept[sleutel] ?? "";
    i.addEventListener("input", () => {
      concept[sleutel] = opties.lees ? opties.lees(i.value) : i.value.trim() === "" ? (opties.leegIsNull === false ? "" : null) : i.value;
      opties.na?.();
      gewijzigd();
    });
    return i;
  }

  const gegevensSectie = el("div");
  function tekenGegevens() {
    const prijsHulp = el("span", {});
    const toonPrijs = () => (prijsHulp.textContent = concept.kickoff_prijs ? `Bezoekers zien: ${getal(concept.kickoff_prijs)} euro` : "Leeg = geen prijs op de pagina.");
    const prijs = tekstInvoer("kickoff_prijs", { lees: (w) => Number(w.replace(/[^0-9]/g, "")) || null, na: toonPrijs });
    prijs.inputMode = "numeric";
    if (concept.kickoff_prijs) prijs.value = getal(concept.kickoff_prijs);
    toonPrijs();

    const slug = tekstInvoer("slug", { lees: (w) => w.trim().toLowerCase(), na: () => toonSlug() });
    slug.spellcheck = false;
    slug.autocapitalize = "off";
    const slugHulp = el("span", {});
    const basis = api.publiekeUrl("").replace(/^https?:\/\//, "");
    const toonSlug = () => {
      const s = concept.slug || "";
      slugHulp.replaceChildren(!SLUG.test(s) ? el("strong", { className: "fout-kleur" }, "Alleen kleine letters, cijfers en streepjes.")
        : s !== ctx.pagina.slug ? el("strong", { className: "fout-kleur" }, `Let op: de oude link (…/${ctx.pagina.slug}) werkt na het bewaren niet meer. Pas ook de links op de site en in advertenties aan.`)
        : `De volledige link: ${basis}${s}`);
    };
    toonSlug();

    gegevensSectie.replaceChildren(
      sectie({ titel: "Het pand", sub: "Zo staat het bovenaan de pagina en in de mails." },
        el("div", { className: "velden" },
          veld({ label: "Adres", input: tekstInvoer("adres"), ster: true, hulp: "Straat en nummer, dan een komma, dan postcode en gemeente." }),
          veld({ label: "Titel", input: tekstInvoer("titel"), ster: true, hulp: "Voor de mails en de agenda-afspraak." }),
          el("div", { className: "rij2" },
            veld({ label: "Kick-off prijs (euro)", input: prijs, hulp: prijsHulp }),
            veld({ label: "Link naar het pand op henryhouser.be", input: tekstInvoer("pand_url", { type: "url" }), hulp: "Leeg = geen knop “Meer info over het pand”." })))),
      sectie({ titel: "Link van de pagina" },
        el("div", { className: "velden" },
          veld({ label: "Link", input: slug, ster: true, hulp: slugHulp, voor: basis }))),
      sectie({ titel: "Teksten", sub: "Lege regel = nieuwe alinea. Zet woorden tussen **twee sterretjes** voor vetjes." },
        el("div", { className: "velden" },
          veld({ label: "Tekst boven de startmomenten", input: tekstInvoer("intro", { lang: true, rijen: 5 }) }),
          (() => {
            const t = tekstInvoer("bevestigingsscherm", { lang: true, rijen: 3, leegIsNull: false });
            return el("div", {}, veld({ label: "Tekst na het boeken", input: t, hulp: "Bezoekers krijgen ook een bevestigingsmail (zie Mails)." }),
              plaatshouders(t, PLAATSHOUDERS_SCHERM));
          })())));
  }

  // Formulier -------------------------------------------------------------------------------------------

  const formulierSectie = el("div");
  function nieuweSleutel() {
    let n = 1;
    while (concept.formuliervelden.some((v) => v.key === `vraag_${n}`)) n++;
    return `vraag_${n}`;
  }

  function tekenFormulier(focusSleutel) {
    const velden = concept.formuliervelden;
    const lijst = el("ol", { className: "veld-editor" }, velden.map((v, i) => {
      const vast = VASTE_VELDEN.includes(v.key);
      const nodig = VERPLICHTE_VELDEN.includes(v.key);
      const label = el("input", { className: "invoer", value: v.label, "aria-label": `Vraag ${i + 1}` });
      label.addEventListener("input", () => {
        v.label = label.value;
        gewijzigd();
      });
      const type = el("select", { className: "invoer", "aria-label": `Soort antwoord bij vraag ${i + 1}`, disabled: vast },
        TYPES.map(([w, t]) => el("option", { value: w }, t)));
      type.value = v.type;
      type.addEventListener("change", () => {
        v.type = type.value;
        if (v.type === "select" && !v.opties?.length) v.opties = ["Keuze 1", "Keuze 2"];
        if (v.type !== "select") delete v.opties;
        gewijzigd();
        tekenFormulier(v.key);
      });
      const verplicht = vinkje({ label: "Verplicht", checked: nodig || v.verplicht });
      verplicht.input.disabled = nodig;
      verplicht.input.addEventListener("change", () => {
        v.verplicht = verplicht.input.checked;
        gewijzigd();
      });
      const op = ikoonKnop("omhoog", "Hoger zetten");
      const neer = ikoonKnop("pijlOmlaag", "Lager zetten");
      const weg = ikoonKnop("prullenbak", "Vraag verwijderen", "gevaar");
      op.disabled = i === 0;
      neer.disabled = i === velden.length - 1;
      weg.disabled = nodig;
      const verplaats = (d) => {
        velden.splice(i + d, 0, velden.splice(i, 1)[0]);
        gewijzigd();
        tekenFormulier(v.key);
        formulierSectie.querySelector(`[data-sleutel="${v.key}"] .ikoon-knop[aria-label="${d < 0 ? "Hoger zetten" : "Lager zetten"}"]`)?.focus();
      };
      op.addEventListener("click", () => verplaats(-1));
      neer.addEventListener("click", () => verplaats(1));
      weg.addEventListener("click", () => {
        velden.splice(i, 1);
        gewijzigd();
        tekenFormulier();
      });
      let opties = null;
      if (v.type === "select") {
        opties = el("textarea", { className: "invoer", rows: Math.min(8, Math.max(3, (v.opties || []).length)), "aria-label": `Keuzes bij vraag ${i + 1}, één per regel` });
        opties.value = (v.opties || []).join("\n");
        opties.addEventListener("input", () => {
          v.opties = opties.value.split("\n").map((s) => s.trim()).filter(Boolean);
          gewijzigd();
        });
      }
      return el("li", { className: "veld-kaart", dataset: { sleutel: v.key } },
        el("div", { className: "veld-kaart-rij" },
          el("span", { className: "veld-nr", "aria-hidden": "true" }, String(i + 1)),
          label, type,
          el("div", { className: "veld-kaart-knoppen" }, verplicht.blok, op, neer, weg)),
        opties ? el("div", { className: "veld-opties" }, el("span", { className: "klein" }, "Keuzes, één per regel"), opties) : null,
        vast ? el("p", { className: "klein" }, nodig ? "Nodig voor de bevestigingsmail en om te annuleren." : "Komt in een vaste kolom van de bezoekerslijst.") : null);
    }));

    const ontbrekend = ["familienaam", "telefoon", "nieuwsbrief"].filter((k) => !velden.some((v) => v.key === k));
    const toevoegen = el("div", { className: "veld-toevoegen" },
      ...[["text", "Vraag"], ["select", "Keuzelijst"], ["checkbox", "Vinkje"]].map(([t, tekst]) => {
        const k = el("button", { type: "button", className: "knop lijn mini" }, icoon("plus"), tekst);
        k.addEventListener("click", () => {
          const sleutel = nieuweSleutel();
          velden.push({ key: sleutel, label: t === "checkbox" ? "Ja, …" : "Nieuwe vraag", type: t, verplicht: false, ...(t === "select" ? { opties: ["Keuze 1", "Keuze 2"] } : {}) });
          gewijzigd();
          tekenFormulier(sleutel);
        });
        return k;
      }),
      ...ontbrekend.map((sleutel) => {
        const k = el("button", { type: "button", className: "knop lijn mini" }, icoon("plus"), STANDAARD_LABEL[sleutel].split(",")[0]);
        k.addEventListener("click", () => {
          velden.push({ key: sleutel, label: STANDAARD_LABEL[sleutel], type: VAST_TYPE[sleutel], verplicht: sleutel === "telefoon" });
          gewijzigd();
          tekenFormulier(sleutel);
        });
        return k;
      }));

    formulierSectie.replaceChildren(sectie({
      titel: "Formulier", sub: "Wat bezoekers invullen na het kiezen van een startmoment. Voornaam en e-mail zijn altijd nodig.",
    }, lijst, toevoegen));
    if (focusSleutel) formulierSectie.querySelector(`[data-sleutel="${focusSleutel}"] input.invoer`)?.focus();
  }

  // Voorbeeld --------------------------------------------------------------------------------------------

  let toestel = "gsm";
  let stap = 1;
  let klaar = false;
  const frame = el("iframe", { title: "Voorbeeld van de bezoekerspagina" });
  const openGroot = el("a", { className: "link zacht", target: "_blank", rel: "noopener" }, "Open groot", icoon("extern"));
  // De demo zonder server geeft de pagina zelf mee (srcdoc); anders komt ze van de site.
  function laadVoorbeeld() {
    klaar = false;
    if (api.voorbeeldHtml) frame.srcdoc = api.voorbeeldHtml(ctx.pagina.slug);
    else frame.src = api.voorbeeldUrl(ctx.pagina.slug);
    openGroot.href = api.voorbeeldUrl(ctx.pagina.slug);
  }
  laadVoorbeeld();
  const scherm = el("div", { className: "voorbeeld-scherm gsm" }, frame);
  const bediening = el("div", { className: "voorbeeld-bediening" });

  const komendeDagen = [...new Set(alleSlots.map((s) => dagSleutel(s.start)))];
  const vrij = () => {
    const grens = Date.now() + (ctx.pagina.min_minuten_vooraf || 0) * 60000;
    return alleSlots.filter((s) => s.vrij > 0 && new Date(s.start).getTime() >= grens)
      .map((s) => ({ start: s.start, eind: new Date(new Date(s.start).getTime() + ctx.pagina.duur_min * 60000).toISOString(), plaatsen: s.vrij }));
  };
  const voorbeeldPagina = () => ({
    slug: concept.slug, titel: concept.titel, adres: concept.adres || "", intro: concept.intro,
    duur_min: ctx.pagina.duur_min, formuliervelden: concept.formuliervelden,
    foto_pad: ctx.pagina.foto_pad, foto_url: api.fotoUrl(ctx.pagina.foto_pad),
    kickoff_prijs: concept.kickoff_prijs, pand_url: concept.pand_url, komende_dagen: komendeDagen,
  });

  function stuur() {
    if (!klaar || !frame.contentWindow) return;
    frame.contentWindow.postMessage({
      type: "hh-voorbeeld", pagina: voorbeeldPagina(), slots: vrij(), bevestigingsscherm: concept.bevestigingsscherm, stap,
    }, "*");
  }
  let timer = null;
  function stuurLater() {
    clearTimeout(timer);
    timer = setTimeout(stuur, 150);
  }

  if (berichtLuisteraar) removeEventListener("message", berichtLuisteraar);
  berichtLuisteraar = (e) => {
    if (!frame.isConnected) {
      removeEventListener("message", berichtLuisteraar);
      berichtLuisteraar = null;
      return;
    }
    if (e.source === frame.contentWindow && e.data?.type === "hh-klaar") {
      klaar = true;
      stuur();
    }
  };
  addEventListener("message", berichtLuisteraar);

  // Het voorbeeld schaalt mee met de kolom. Op een breed scherm blijft het staan terwijl je
  // scrolt (sticky), dus dan moet de gsm ook in de hoogte passen, samen met de knoppen erboven.
  function schaal() {
    if (!frame.isConnected) return;
    const gsm = toestel === "gsm";
    const breed = gsm ? 390 : 1280;
    const hoog = gsm ? 800 : 860;
    const plakker = scherm.parentElement;
    const ruimte = plakker.clientWidth - (gsm ? 20 : 2);
    let maxHoog = Infinity;
    if (gsm && matchMedia("(min-width: 1180px)").matches) {
      const balk = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--balk")) || 64;
      const overig = plakker.offsetHeight - scherm.clientHeight; // kop, knoppen, uitleg, rand van de gsm
      maxHoog = Math.max(420, innerHeight - balk - 40 - overig);
    }
    const k = Math.min(1, ruimte / breed, maxHoog / hoog);
    frame.style.width = `${breed}px`;
    frame.style.height = `${hoog}px`;
    frame.style.transform = `scale(${k})`;
    scherm.style.width = gsm ? `${Math.floor(breed * k)}px` : "";
    scherm.style.height = `${Math.round(hoog * k)}px`;
  }
  const opResize = () => (frame.isConnected ? schaal() : removeEventListener("resize", opResize));
  addEventListener("resize", opResize);
  new ResizeObserver(schaal).observe(rechts);

  function tekenBediening() {
    bediening.replaceChildren(
      segment({
        label: "Toestel", actief: toestel,
        opties: [{ waarde: "gsm", tekst: "Gsm" }, { waarde: "computer", tekst: "Computer" }],
        opKies: (w) => {
          toestel = w;
          scherm.className = `voorbeeld-scherm ${w}`;
          schaal();
          tekenBediening();
        },
      }),
      segment({
        label: "Stap", actief: stap,
        opties: [{ waarde: 1, tekst: "1 Startuur" }, { waarde: 2, tekst: "2 Gegevens" }, { waarde: 3, tekst: "3 Bevestigd" }],
        opKies: (w) => {
          stap = w;
          tekenBediening();
          stuur();
        },
      }));
  }
  tekenBediening();

  rechts.append(el("div", { className: "voorbeeld-plakker" },
    el("div", { className: "voorbeeld-kop" },
      el("h2", {}, "Zo zien bezoekers het"), openGroot),
    bediening, scherm,
    el("p", { className: "klein" }, "Het voorbeeld toont je wijzigingen meteen, ook voor je bewaart. Hier wordt niet echt geboekt.")));

  // Bewaren ------------------------------------------------------------------------------------------------

  function controle() {
    if (!concept.adres?.trim()) return "Vul het adres in.";
    if (!concept.titel?.trim()) return "Vul een titel in.";
    if (!SLUG.test(concept.slug || "")) return "De link mag alleen kleine letters, cijfers en streepjes bevatten.";
    if (concept.pand_url && !/^https?:\/\/\S+\.\S+/.test(concept.pand_url.trim())) return "De link naar het pand moet beginnen met https://";
    const velden = concept.formuliervelden;
    for (const k of VERPLICHTE_VELDEN) if (!velden.some((v) => v.key === k)) return `Het formulier heeft een veld ${k} nodig.`;
    if (velden.some((v) => !v.label.trim())) return "Elke vraag in het formulier heeft een tekst nodig.";
    if (velden.some((v) => v.type === "select" && !(v.opties || []).length)) return "Een keuzelijst heeft minstens één keuze nodig.";
    return null;
  }

  async function bewaar() {
    const melding = controle();
    if (melding) return toast(melding, { fout: true });
    const wijziging = {};
    for (const k of TEKSTVELDEN) {
      if (JSON.stringify(concept[k] ?? null) !== JSON.stringify(ctx.pagina[k] ?? null)) wijziging[k] = concept[k];
    }
    if (wijziging.formuliervelden) {
      wijziging.formuliervelden = wijziging.formuliervelden.map((v) => ({
        key: v.key, label: v.label.trim(), type: v.type,
        verplicht: VERPLICHTE_VELDEN.includes(v.key) || !!v.verplicht,
        ...(v.type === "select" ? { opties: v.opties } : {}),
      }));
    }
    if (wijziging.bevestigingsscherm === null) wijziging.bevestigingsscherm = "";
    balk.bezig(true);
    const andereSlug = wijziging.slug !== undefined;
    try {
      await ctx.bewaar(wijziging);
      concept = Object.fromEntries(TEKSTVELDEN.map((k) => [k, kopie(ctx.pagina[k] ?? null)]));
      concept.formuliervelden ||= [];
      origineel = JSON.stringify(concept);
      balk.toon(false);
      tekenGegevens();
      tekenFormulier();
      if (andereSlug) laadVoorbeeld();
      else stuur();
      toast(ctx.pagina.actief ? "Bewaard. Bezoekers zien de aanpassing meteen." : "Bewaard.");
    } catch (err) {
      toast(foutTekst(err), { fout: true });
    } finally {
      balk.bezig(false);
    }
  }

  function herstel() {
    concept = JSON.parse(origineel);
    balk.toon(false);
    tekenGegevens();
    tekenFormulier();
    stuur();
  }

  // Tekenen ------------------------------------------------------------------------------------------------

  tekenFoto();
  tekenGegevens();
  tekenFormulier();
  tekenZichtbaar();
  links.append(fotoSectie, gegevensSectie, formulierSectie, zichtbaarSectie);
  paneel.replaceChildren(el("div", { className: "raster-pagina" }, links, rechts), balk.balk);
  schaal();
}
