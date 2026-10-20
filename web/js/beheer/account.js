// Account: wachtwoord wijzigen en uitloggen.

import { el } from "../tekst.js";
import { staat } from "./staat.js";
import { foutTekst, paginaKop, sectie, toast, veld } from "./ui.js";

export async function toon(container, { uitloggen }) {
  document.title = "Account · Beheer Henry Houser";
  const w1 = el("input", { type: "password", autocomplete: "new-password" });
  const w2 = el("input", { type: "password", autocomplete: "new-password" });
  const fout = el("p", { className: "form-fout", role: "alert", hidden: true });
  const knop = el("button", { type: "submit", className: "knop zwart klein" }, "Wachtwoord bewaren");
  const form = el("form", { className: "form-smal", noValidate: true },
    el("input", { type: "email", autocomplete: "username", value: staat.email, hidden: true, readOnly: true }),
    veld({ label: "Nieuw wachtwoord", input: w1, hulp: "Minstens 8 tekens. Een zin van een paar woorden is sterk en makkelijk te onthouden." }),
    veld({ label: "Herhaal je nieuwe wachtwoord", input: w2 }), fout,
    el("div", { className: "form-acties" }, knop));

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const melding = w1.value.length < 8 ? "Kies een wachtwoord van minstens 8 tekens."
      : w1.value !== w2.value ? "De twee wachtwoorden zijn niet gelijk." : null;
    fout.textContent = melding || "";
    fout.hidden = !melding;
    if (melding) return;
    knop.disabled = true;
    try {
      await staat.api.wachtwoordZetten(w1.value);
      form.reset();
      toast("Je nieuwe wachtwoord is bewaard.");
    } catch (err) {
      fout.textContent = foutTekst(err);
      fout.hidden = false;
    } finally {
      knop.disabled = false;
    }
  });

  const uit = el("button", { type: "button", className: "knop lijn klein" }, "Uitloggen");
  uit.addEventListener("click", uitloggen);

  container.replaceChildren(
    paginaKop({ oog: "Account", titel: "Je account", sub: el("p", {}, `Ingelogd als ${staat.email}`) }),
    el("div", { className: "kolommen-smal" },
      sectie({ titel: "Wachtwoord wijzigen" }, form),
      sectie({ titel: "Uitloggen", sub: "Op een gedeelde computer log je best uit als je klaar bent." },
        el("div", { className: "form-acties" }, uit))));
}
