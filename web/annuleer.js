// Annuleerpagina: afspraak.henryhouser.be/annuleer?token=...
(() => {
  const cfg = window.AFSPRAAK_CONFIG;
  const $ = (id) => document.getElementById(id);
  const token = new URLSearchParams(location.search).get("token");
  const url = `${cfg.supabaseUrl}/functions/v1/annuleer`;

  function fout(tekst) {
    $("laden").hidden = true;
    $("vraag").hidden = true;
    $("fout").textContent = tekst;
    $("fout").hidden = false;
  }

  function toon(d) {
    $("laden").hidden = true;
    $("adres").textContent = d.adres;
    $("opnieuw").href = `/${d.slug}`;
    if (d.status === "geannuleerd") {
      $("vraag").hidden = true;
      $("klaar").hidden = false;
    } else if (d.voorbij || d.status !== "bevestigd") {
      fout("Dit bezoek is al voorbij en kan niet meer geannuleerd worden.");
    } else {
      $("voornaam").textContent = d.voornaam;
      $("start").textContent = d.start_tekst;
      $("vraag").hidden = false;
    }
  }

  async function laad() {
    if (!token) return fout("Deze annuleerlink is ongeldig.");
    try {
      const res = await fetch(`${url}?token=${encodeURIComponent(token)}`);
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return fout(d.melding || "Deze annuleerlink is ongeldig.");
      toon(d);
    } catch {
      fout("De pagina kon niet geladen worden. Probeer het later opnieuw.");
    }
  }

  $("bevestig").addEventListener("click", async () => {
    const knop = $("bevestig");
    knop.disabled = true;
    knop.textContent = "Bezig…";
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) return fout(d.melding || "Er liep iets mis. Probeer het opnieuw.");
      toon(d);
    } catch {
      fout("Er liep iets mis. Probeer het opnieuw.");
    } finally {
      knop.disabled = false;
      knop.textContent = "Ja, annuleer mijn bezoek";
    }
  });

  laad();
})();
