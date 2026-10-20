// Beheerplatform van Henry Houser: afspraak.henryhouser.be/beheer
// Inloggen via Supabase Auth; wat een beheerder mag, regelt RLS (tabel beheerders).
// Navigatie via de hash:
//   #/                  overzicht (dashboard)
//   #/adressen/<fase>   alle adressen: komend, nieuw, afgelopen, archief, alle
//   #/nieuw             nieuw adres (?bron=<id> om een adres te kopiëren)
//   #/p/<id>/<tab>      één adres: overzicht, bezoekers, dagen, pagina, mails
//   #/account           wachtwoord wijzigen

import { icoon } from "../iconen.js";
import { LOGO, MONOGRAM } from "../merk.js";
import { el } from "../tekst.js";
import * as account from "./account.js";
import * as adressen from "./adressen.js";
import { supabaseApi } from "./api.js";
import * as dashboard from "./dashboard.js";
import * as nieuw from "./nieuw.js";
import * as pand from "./pand.js";
import { staat } from "./staat.js";
import { bevestig, foutBlok, foutTekst, laadBlok, menuKnop, toast, veld } from "./ui.js";

const cfg = window.AFSPRAAK_CONFIG || {};
staat.api = window.BEHEER_API || supabaseApi(cfg);

const app = document.getElementById("app");
let inhoud = null;   // <main> waarin de pagina's getekend worden
let nav = null;
let huidigeHash = null;
let herstel = false; // via de link uit de mail "wachtwoord vergeten"

// ---------------------------------------------------------------------------
// Inloggen
// ---------------------------------------------------------------------------

function loginKader(titel, tekst, ...inhoud) {
  const logo = el("div", { className: "login-logo" });
  logo.innerHTML = LOGO;
  const boog = el("div", { className: "login-boog" });
  boog.innerHTML = MONOGRAM;
  return el("div", { className: "login" },
    el("div", { className: "login-beeld", "aria-hidden": "true" }, boog, el("p", {}, "Vastgoed, maar beter.")),
    el("main", { className: "login-kaart" }, logo,
      el("h1", {}, titel), tekst ? el("p", { className: "login-tekst" }, tekst) : null, ...inhoud));
}

function formFout(tekst) {
  return el("p", { className: "form-fout", role: "alert", hidden: !tekst }, tekst || "");
}

function toonLogin(melding) {
  document.title = "Inloggen · Beheer Henry Houser";
  removeEventListener("hashchange", route);
  const email = el("input", { type: "email", autocomplete: "username", inputMode: "email", autofocus: true });
  const wachtwoord = el("input", { type: "password", autocomplete: "current-password" });
  const fout = formFout(melding);
  const knop = el("button", { type: "submit", className: "knop zwart vol" }, "Inloggen");
  const vergeten = el("button", { type: "button", className: "link zacht" }, "Wachtwoord vergeten?");
  const form = el("form", { className: "login-form", noValidate: true },
    veld({ label: "E-mailadres", input: email }), veld({ label: "Wachtwoord", input: wachtwoord }), fout, knop);

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!email.value.trim() || !wachtwoord.value) {
      fout.textContent = "Vul je e-mailadres en je wachtwoord in.";
      fout.hidden = false;
      return;
    }
    knop.disabled = true;
    knop.textContent = "Even geduld…";
    try {
      await binnen(await staat.api.login(email.value.trim(), wachtwoord.value));
    } catch (err) {
      fout.textContent = foutTekst(err);
      fout.hidden = false;
      knop.disabled = false;
      knop.textContent = "Inloggen";
    }
  });
  vergeten.addEventListener("click", () => toonVergeten(email.value.trim()));
  app.replaceChildren(loginKader("Beheer", "Log in om de bezoeken en Homeruns van je panden te beheren.",
    form, el("p", { className: "login-onder" }, vergeten)));
}

function toonVergeten(adres = "") {
  const email = el("input", { type: "email", autocomplete: "username", inputMode: "email", value: adres, autofocus: true });
  const fout = formFout();
  const knop = el("button", { type: "submit", className: "knop zwart vol" }, "Stuur me een link");
  const terug = el("button", { type: "button", className: "link zacht" }, "Terug naar inloggen");
  const form = el("form", { className: "login-form", noValidate: true }, veld({ label: "E-mailadres", input: email }), fout, knop);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.value.trim())) {
      fout.textContent = "Vul een geldig e-mailadres in.";
      fout.hidden = false;
      return;
    }
    knop.disabled = true;
    try {
      await staat.api.wachtwoordVergeten(email.value.trim());
      form.replaceChildren(el("p", { className: "login-ok", role: "status" },
        icoon("vink"), "Als dit adres toegang heeft tot het beheer, krijg je zo een mail met een link om een nieuw wachtwoord te kiezen."));
    } catch (err) {
      fout.textContent = foutTekst(err);
      fout.hidden = false;
      knop.disabled = false;
    }
  });
  terug.addEventListener("click", () => toonLogin());
  app.replaceChildren(loginKader("Wachtwoord vergeten", "Geef je e-mailadres. Je krijgt een link om een nieuw wachtwoord te kiezen.",
    form, el("p", { className: "login-onder" }, terug)));
}

function toonNieuwWachtwoord() {
  herstel = true;
  removeEventListener("hashchange", route);
  document.title = "Nieuw wachtwoord · Beheer Henry Houser";
  const w1 = el("input", { type: "password", autocomplete: "new-password", autofocus: true });
  const w2 = el("input", { type: "password", autocomplete: "new-password" });
  const fout = formFout();
  const knop = el("button", { type: "submit", className: "knop zwart vol" }, "Wachtwoord bewaren");
  const form = el("form", { className: "login-form", noValidate: true },
    veld({ label: "Nieuw wachtwoord", input: w1, hulp: "Minstens 8 tekens." }), veld({ label: "Herhaal je nieuwe wachtwoord", input: w2 }), fout, knop);
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const melding = w1.value.length < 8 ? "Kies een wachtwoord van minstens 8 tekens."
      : w1.value !== w2.value ? "De twee wachtwoorden zijn niet gelijk." : null;
    if (melding) {
      fout.textContent = melding;
      fout.hidden = false;
      return;
    }
    knop.disabled = true;
    try {
      await staat.api.wachtwoordZetten(w1.value);
      herstel = false;
      toast("Je nieuwe wachtwoord is bewaard.");
      await binnen(await staat.api.sessie());
    } catch (err) {
      fout.textContent = foutTekst(err);
      fout.hidden = false;
      knop.disabled = false;
    }
  });
  app.replaceChildren(loginKader("Nieuw wachtwoord", "Kies een nieuw wachtwoord voor het beheer.", form));
}

async function uitloggen() {
  if (staat.vuil?.() && !(await verlatenZonderBewaren())) return;
  staat.vuil = null;
  await staat.api.uitloggen().catch(() => {});
  history.replaceState(null, "", location.pathname);
  huidigeHash = null;
  toonLogin();
}

// ---------------------------------------------------------------------------
// Kader: balk bovenaan en de inhoud
// ---------------------------------------------------------------------------

function bouwKader() {
  const logo = el("a", { className: "balk-logo", href: "#/", "aria-label": "Henry Houser, naar het overzicht" });
  logo.innerHTML = LOGO;
  nav = el("nav", { className: "balk-nav", "aria-label": "Hoofdmenu" },
    el("a", { href: "#/", dataset: { sectie: "overzicht" } }, icoon("dashboard"), "Overzicht"),
    el("a", { href: "#/adressen", dataset: { sectie: "adressen" } }, icoon("huis"), "Adressen"));
  const accountMenu = menuKnop({
    inhoud: el("span", { className: "avatar", "aria-hidden": "true" }, (staat.email || "?").charAt(0).toUpperCase()),
    label: `Account van ${staat.email}`,
    klasse: "balk-account",
    items: [
      { kop: staat.email },
      { tekst: "Wachtwoord wijzigen", icoon: "slot", href: "#/account" },
      { lijn: true },
      { tekst: "Uitloggen", icoon: "uitloggen", actie: uitloggen },
    ],
  });
  const naarInhoud = el("button", { type: "button", className: "skiplink" }, "Naar de inhoud");
  inhoud = el("main", { className: "hoofd", id: "inhoud", tabIndex: -1 });
  naarInhoud.addEventListener("click", () => inhoud.focus());
  app.replaceChildren(naarInhoud,
    el("header", { className: "balk" },
      el("div", { className: "balk-binnen" },
        el("div", { className: "balk-merk" }, logo, el("span", { className: "balk-sub" }, "Afspraken")),
        nav,
        el("div", { className: "balk-acties" },
          el("a", { className: "knop zwart klein balk-nieuw", href: "#/nieuw" }, icoon("plus"), el("span", {}, "Nieuw adres")),
          accountMenu))),
    inhoud);
}

async function binnen(email) {
  if (!email) return toonLogin();
  staat.email = email;
  herstel = false;
  bouwKader();
  huidigeHash = null;
  removeEventListener("hashchange", route);
  addEventListener("hashchange", route);
  await route();
}

// ---------------------------------------------------------------------------
// Navigatie
// ---------------------------------------------------------------------------

function verlatenZonderBewaren() {
  return bevestig({
    titel: "Wijzigingen niet bewaard",
    tekst: "Je hebt wijzigingen die nog niet bewaard zijn. Als je verdergaat, gaan ze verloren.",
    ja: "Verdergaan zonder bewaren", nee: "Terug", gevaar: true,
  });
}

function ontleed() {
  const [pad, qs] = location.hash.replace(/^#\/?/, "").split("?");
  return { delen: pad.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(qs || "") };
}

function geenToegang(err) {
  if (!/geen_beheerder|permission denied|row-level security|JWT/i.test(String(err?.message || err))) return null;
  const knop = el("button", { type: "button", className: "knop zwart klein" }, "Uitloggen");
  knop.addEventListener("click", uitloggen);
  return el("div", { className: "fout-pagina", role: "alert" },
    el("h1", { tabIndex: -1 }, "Geen toegang"),
    el("p", {}, `Je bent ingelogd als ${staat.email}, maar dit account heeft geen toegang tot het beheer. Vraag een beheerder om je toe te voegen.`),
    knop);
}

export async function route() {
  if (!inhoud) return;
  const doel = location.hash || "#/";
  if (huidigeHash !== null && doel !== huidigeHash && staat.vuil?.()) {
    history.replaceState(null, "", huidigeHash);
    if (!(await verlatenZonderBewaren())) return;
    history.replaceState(null, "", doel);
  }
  staat.vuil = null;
  huidigeHash = doel;

  const { delen, query } = ontleed();
  const sectie = ["adressen", "p", "nieuw"].includes(delen[0]) ? "adressen" : delen[0] === "account" ? "" : "overzicht";
  for (const a of nav.querySelectorAll("a")) {
    if (a.dataset.sectie === sectie) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  }

  const nr = ++staat.navigatie;
  const zelfdePand = delen[0] === "p" && pand.isOpen(delen[1], inhoud);
  if (!zelfdePand) {
    inhoud.replaceChildren(laadBlok());
    scrollTo(0, 0);
  }
  try {
    if (delen[0] === "p" && delen[1]) await pand.toon(inhoud, delen[1], delen[2] || "overzicht", query);
    else if (delen[0] === "adressen") await adressen.toon(inhoud, delen[1] || "komend");
    else if (delen[0] === "nieuw") await nieuw.toon(inhoud, query);
    else if (delen[0] === "account") await account.toon(inhoud, { uitloggen });
    else await dashboard.toon(inhoud);
    if (nr === staat.navigatie && !zelfdePand) inhoud.querySelector("h1")?.focus({ preventScroll: true });
  } catch (err) {
    console.error(err);
    if (nr !== staat.navigatie) return;
    inhoud.replaceChildren(geenToegang(err) || foutBlok(err, () => {
      huidigeHash = null;
      route();
    }));
    inhoud.querySelector("h1")?.focus({ preventScroll: true });
  }
}

// Ctrl/Cmd+S bewaart als er een bewaarbalk zichtbaar is.
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    const knop = document.querySelector(".bewaarbalk:not([hidden]) .knop.aqua");
    if (knop) {
      e.preventDefault();
      knop.click();
    }
  }
});

addEventListener("beforeunload", (e) => {
  if (staat.vuil?.()) {
    e.preventDefault();
    e.returnValue = "";
  }
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

staat.api.opHerstel?.(toonNieuwWachtwoord);

(async () => {
  let email = null;
  try {
    email = await staat.api.sessie();
  } catch (err) {
    console.warn(err);
  }
  if (herstel) return; // het scherm voor een nieuw wachtwoord staat er al
  if (!email) return toonLogin();
  await binnen(email);
})();
