// Annuleerpagina: afspraak.henryhouser.be/annuleer?token=...  (link uit de mails)

import { KANTOOR, telLink } from "./merk.js";
import { icoon } from "./iconen.js";
import { boogFoto, kop, voet } from "./kader.js";
import { cap, dagSleutel, datumLang, el, fotoUrl, uur } from "./tekst.js";

const cfg = window.AFSPRAAK_CONFIG || {};
const token = new URLSearchParams(location.search).get("token");
const url = `${cfg.supabaseUrl}/functions/v1/annuleer`;
const app = document.getElementById("app");
const kaart = el("div", { className: "smal-kaart" });
app.replaceChildren(kop(), el("main", { className: "smal" }, kaart), voet());

function bezoek(d) {
  return el("div", { className: "bezoek-mini" },
    boogFoto(fotoUrl(cfg, d.foto_pad), ""),
    el("div", {},
      el("strong", {}, d.adres),
      el("span", {}, `${cap(datumLang(dagSleutel(d.start)))} om ${uur(d.start)}`)));
}

function contact() {
  return el("p", { className: "klein" }, "Vragen? Bel ons op ",
    el("a", { href: telLink(KANTOOR.telefoon) }, KANTOOR.telefoon), " of mail naar ",
    el("a", { href: `mailto:${KANTOOR.email}` }, KANTOOR.email), ".");
}

function fout(tekst) {
  kaart.replaceChildren(el("h1", { tabIndex: -1 }, "Oeps"), el("p", { className: "tekst" }, tekst), contact());
}

function toon(d) {
  document.title = `Bezoek ${d.adres} · Henry Houser`;
  if (d.status === "geannuleerd") {
    kaart.replaceChildren(
      el("div", { className: "vink-rond" }, icoon("vink")),
      el("h1", { tabIndex: -1 }, "Je bezoek is geannuleerd"),
      bezoek(d),
      el("p", { className: "tekst" }, "Bedankt om het te laten weten: zo kan iemand anders je startuur gebruiken. Je krijgt nog een bevestiging per mail. Alvast veel succes met de verdere zoektocht!"),
      el("div", { className: "smal-acties" },
        el("a", { className: "knop", href: `/${encodeURIComponent(d.slug)}` }, "Toch een ander moment kiezen")),
      contact());
  } else if (d.voorbij || d.status !== "bevestigd") {
    kaart.replaceChildren(
      el("h1", { tabIndex: -1 }, "Dit bezoek is al voorbij"),
      bezoek(d),
      el("p", { className: "tekst" }, "Een bezoek dat al voorbij is, kan je niet meer annuleren."),
      contact());
  } else {
    const ja = el("button", { type: "button", className: "knop zwart" }, "Ja, annuleer mijn bezoek");
    const nee = el("button", { type: "button", className: "link" }, "Nee, ik kom toch");
    ja.addEventListener("click", () => annuleer(ja));
    nee.addEventListener("click", () => {
      kaart.replaceChildren(
        el("div", { className: "vink-rond" }, icoon("vink")),
        el("h1", { tabIndex: -1 }, "Fijn, tot dan!"),
        bezoek(d),
        el("p", { className: "tekst" }, `Je afspraak blijft gewoon staan, je hoeft niets meer te doen. We zien je graag op ${datumLang(dagSleutel(d.start))}.`),
        contact());
      kaart.querySelector("h1").focus();
    });
    kaart.replaceChildren(
      el("h1", { tabIndex: -1 }, `Hallo ${d.voornaam}, wil je je bezoek annuleren?`),
      bezoek(d),
      el("p", { className: "tekst" }, "Kan je toch niet komen? Geen probleem. Annuleer hieronder, dan geven we het startuur vrij voor iemand anders."),
      el("div", { className: "smal-acties" }, ja, nee));
  }
  kaart.querySelector("h1")?.focus({ preventScroll: true });
}

async function annuleer(knop) {
  knop.disabled = true;
  knop.textContent = "Even geduld…";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: cfg.supabaseAnonKey },
      body: JSON.stringify({ token }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return fout(d.melding || "Er liep iets mis. Probeer het opnieuw.");
    toon(d);
  } catch {
    fout("Er liep iets mis. Probeer het opnieuw.");
  }
}

(async () => {
  if (!token) return fout("Deze annuleerlink is ongeldig. Gebruik de knop in je bevestigingsmail.");
  try {
    const res = await fetch(`${url}?token=${encodeURIComponent(token)}`, { headers: { apikey: cfg.supabaseAnonKey } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) return fout(d.melding || "Deze annuleerlink is ongeldig.");
    toon(d);
  } catch {
    fout("De pagina kon niet geladen worden. Probeer het straks opnieuw.");
  }
})();
