// Nieuw adres: straat, postcode en gemeente; link en titel worden voorgesteld. Formulier,
// teksten, uren en mailontvangers komen van een bestaand adres (of de standaard).
// Optioneel meteen de eerste bezoekdag.

import { icoon } from "../iconen.js";
import { el, getal, vandaagSleutel } from "../tekst.js";
import { STANDAARD_PAGINA } from "./standaard.js";
import { staat } from "./staat.js";
import { foutTekst, paginaKop, sectie, slugVan, toast, veld } from "./ui.js";

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

function markeer(input, tekst) {
  const v = input.closest(".veld");
  let fout = v.querySelector(".fout-tekst");
  if (!fout) {
    fout = el("p", { className: "fout-tekst", id: `${input.id}-fout` });
    v.append(fout);
    input.setAttribute("aria-errormessage", fout.id);
  }
  fout.textContent = tekst || "";
  fout.hidden = !tekst;
  input.setAttribute("aria-invalid", String(!!tekst));
  return !tekst;
}

export async function toon(container, query) {
  const mijn = staat.navigatie;
  const lijst = await staat.api.overzicht();
  if (mijn !== staat.navigatie) return;
  document.title = "Nieuw adres · Beheer Henry Houser";

  const straat = el("input", { autocomplete: "off", autofocus: true, placeholder: "Aalbeeksesteenweg 57" });
  const postcode = el("input", { inputMode: "numeric", maxLength: 4, autocomplete: "off", placeholder: "8500" });
  const gemeente = el("input", { autocomplete: "off", placeholder: "Kortrijk" });
  const slug = el("input", { autocomplete: "off", autocapitalize: "off" });
  slug.spellcheck = false;
  const titel = el("input", { autocomplete: "off" });
  const prijs = el("input", { inputMode: "numeric", autocomplete: "off", placeholder: "375.000" });
  const pandUrl = el("input", { type: "url", autocomplete: "off", placeholder: "https://www.henryhouser.be/…" });
  const dag = el("input", { type: "date", min: vandaagSleutel() });
  const van = el("input", { type: "time", value: "09:00", step: 300 });
  const tot = el("input", { type: "time", value: "19:00", step: 300 });

  const gekozenBron = query.get("bron");
  const bronnen = lijst.filter((p) => !p.gearchiveerd || p.id === gekozenBron);
  const bron = el("select", {}, el("option", { value: "" }, "Standaardinstellingen"),
    bronnen.map((p) => el("option", { value: p.id }, p.adres)));
  bron.value = (gekozenBron && bronnen.some((p) => p.id === gekozenBron) ? gekozenBron
    : bronnen.find((p) => p.fase === "komend")?.id || bronnen[0]?.id || "");

  const prijsVoorbeeld = el("span", {});
  let slugAangepast = false;
  let titelAangepast = false;

  const volledig = () => [straat.value.trim(), [postcode.value.trim(), gemeente.value.trim()].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");
  const voorstel = () => {
    if (!slugAangepast) slug.value = slugVan(straat.value).replace(/-/g, "");
    if (!titelAangepast) titel.value = straat.value.trim() ? `Homerun in ${volledig().replace(", ", " in ")}` : "";
  };
  for (const i of [straat, postcode, gemeente]) i.addEventListener("input", voorstel);
  slug.addEventListener("input", () => {
    slugAangepast = true;
    if (slug.getAttribute("aria-invalid") === "true") controleerSlug();
  });
  titel.addEventListener("input", () => (titelAangepast = true));
  prijs.addEventListener("input", () => {
    const n = Number(prijs.value.replace(/[^0-9]/g, ""));
    prijsVoorbeeld.textContent = n ? `${getal(n)} euro` : "";
  });

  const controleerSlug = () => {
    const s = slug.value.trim();
    const dubbel = lijst.find((p) => p.slug === s);
    return markeer(slug, !s ? "Kies een link."
      : !SLUG.test(s) ? "Alleen kleine letters, cijfers en streepjes, zonder spaties."
      : dubbel ? `Deze link is al in gebruik bij ${dubbel.adres}.` : null);
  };

  const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
  const knop = el("button", { type: "submit", className: "knop zwart" }, "Adres aanmaken");

  const form = el("form", { className: "nieuw-form", noValidate: true },
    sectie({ titel: "Adres", sub: "Zo verschijnt het op de pagina en in de mails." },
      el("div", { className: "velden" },
        veld({ label: "Straat en huisnummer", input: straat, ster: true }),
        el("div", { className: "rij-postcode" },
          veld({ label: "Postcode", input: postcode, ster: true }),
          veld({ label: "Gemeente", input: gemeente, ster: true })))),
    sectie({ titel: "Pagina" },
      el("div", { className: "velden" },
        veld({
          label: "Link", input: slug, ster: true, voor: staat.api.publiekeUrl("").replace(/^https?:\/\//, ""),
          hulp: "Wordt voorgesteld op basis van de straat. Kleine letters en cijfers, zonder spaties.",
        }),
        veld({ label: "Titel", input: titel, hulp: "Gebruikt in de mails en de agenda. Bezoekers zien vooral de straat." }),
        el("div", { className: "rij2" },
          veld({ label: "Kick-off prijs (euro)", input: prijs, hulp: prijsVoorbeeld }),
          veld({ label: "Link naar het pand op henryhouser.be", input: pandUrl })))),
    sectie({ titel: "Eerste bezoekdag", sub: "Mag je ook later inplannen, bij Bezoekdagen." },
      el("div", { className: "rij3" },
        veld({ label: "Datum", input: dag }),
        veld({ label: "Van", input: van }),
        veld({ label: "Tot", input: tot }))),
    sectie({ titel: "Instellingen overnemen" },
      el("div", { className: "velden" },
        veld({
          label: "Neem het formulier, de teksten en de mailinstellingen over van",
          input: bron,
          hulp: "Foto, prijs, verkoper en verkopersrapport worden niet overgenomen. Kijk de teksten na: ze kunnen nog over het andere pand gaan.",
        }))),
    fout,
    el("div", { className: "form-acties" }, knop, el("a", { className: "knop lijn", href: "#/adressen" }, "Annuleren")));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    fout.hidden = true;
    const ok = [
      markeer(straat, straat.value.trim() ? null : "Vul de straat en het huisnummer in."),
      markeer(postcode, /^\d{4}$/.test(postcode.value.trim()) ? null : "Een Belgische postcode heeft 4 cijfers."),
      markeer(gemeente, gemeente.value.trim() ? null : "Vul de gemeente in."),
      controleerSlug(),
      markeer(pandUrl, !pandUrl.value.trim() || /^https?:\/\/\S+\.\S+/.test(pandUrl.value.trim()) ? null : "Begin de link met https://"),
      markeer(tot, !dag.value || tot.value > van.value ? null : "Het einduur moet na het beginuur liggen."),
    ].every(Boolean);
    if (!ok) {
      form.querySelector('[aria-invalid="true"]')?.focus();
      return;
    }

    const n = Number(prijs.value.replace(/[^0-9]/g, ""));
    const velden = {
      adres: volledig(),
      titel: titel.value.trim() || `Homerun in ${volledig()}`,
      slug: slug.value.trim(),
      kickoff_prijs: n || null,
      pand_url: pandUrl.value.trim() || null,
      actief: true,
      gearchiveerd: false,
      ...(bron.value ? {} : STANDAARD_PAGINA),
    };
    knop.disabled = true;
    knop.textContent = "Even geduld…";
    try {
      const p = await staat.api.paginaNieuw(velden, bron.value || null);
      if (dag.value) {
        await staat.api.beschikbaarheidNieuw({
          pagina_id: p.id, datum_van: dag.value, datum_tot: dag.value, van: van.value, tot: tot.value, weekdagen: [1, 2, 3, 4, 5, 6, 7],
        });
      }
      toast("Adres aangemaakt. Voeg nog een foto toe en kijk de teksten na.");
      location.hash = `#/p/${p.id}/overzicht`;
    } catch (err) {
      fout.textContent = foutTekst(err);
      fout.hidden = false;
      knop.disabled = false;
      knop.textContent = "Adres aanmaken";
    }
  });

  container.replaceChildren(
    paginaKop({ terug: { href: "#/adressen", tekst: "Adressen" }, titel: "Nieuw adres" }),
    el("div", { className: "raster-nieuw" },
      form,
      el("aside", { className: "nieuw-uitleg", "aria-label": "Hoe het werkt" },
        el("h2", {}, "Zo zet je een pand online"),
        el("ol", {},
          el("li", {}, el("strong", {}, "Adres aanmaken"), el("span", {}, "Met link, titel en prijs. Het formulier en de teksten komen van het adres dat je kiest.")),
          el("li", {}, el("strong", {}, "Foto toevoegen"), el("span", {}, "Bij Bezoekerspagina. Een staande foto past het mooist in de boog.")),
          el("li", {}, el("strong", {}, "Bezoekdagen inplannen"), el("span", {}, "Eén Homerun of meerdere dagen, met de uren.")),
          el("li", {}, el("strong", {}, "Link delen"), el("span", {}, "Zet de link op de site van het pand, in de advertentie of in een mailing."))),
        el("p", { className: "klein" }, icoon("let"), " De pagina staat meteen online, maar niemand vindt ze zolang je de link niet deelt."))));
}
