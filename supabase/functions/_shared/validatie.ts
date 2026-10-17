// Controle van formulierantwoorden tegen de formuliervelden van een pagina.

export interface Veld {
  key: string;
  label: string;
  type: "text" | "email" | "tel" | "textarea" | "checkbox" | "select";
  verplicht?: boolean;
  opties?: string[];
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Controleert de antwoorden tegen de formuliervelden; geeft genormaliseerde antwoorden of een foutmelding. */
export function valideer(
  velden: Veld[],
  invoer: Record<string, unknown>,
): { antwoorden: Record<string, string | boolean> } | { melding: string } {
  const antwoorden: Record<string, string | boolean> = {};
  for (const v of velden) {
    const naam = v.label.replace(/[\s?:.!]+$/, "");
    const ruw = invoer?.[v.key];
    if (v.type === "checkbox") {
      const aan = ruw === true || ruw === "true" || ruw === "on";
      if (v.verplicht && !aan) return { melding: `${naam} is verplicht.` };
      antwoorden[v.key] = aan;
      continue;
    }
    const waarde = typeof ruw === "string" ? ruw.trim() : "";
    if (!waarde) {
      if (v.verplicht) return { melding: `${naam} is verplicht.` };
      continue;
    }
    if (waarde.length > (v.type === "textarea" ? 2000 : 200)) {
      return { melding: `${naam} is te lang.` };
    }
    if (v.type === "email" && !EMAIL.test(waarde)) {
      return { melding: `${naam} is geen geldig e-mailadres.` };
    }
    if (v.type === "tel" && !/^[+\d][\d\s./()-]{5,}$/.test(waarde)) {
      return { melding: `${naam} is geen geldig telefoonnummer.` };
    }
    if (v.type === "select" && !(v.opties ?? []).includes(waarde)) {
      return { melding: `Kies een geldige optie bij ${naam}.` };
    }
    antwoorden[v.key] = waarde;
  }
  if (!antwoorden.voornaam || !antwoorden.email) {
    return { melding: "Voornaam en e-mail zijn verplicht." };
  }
  return { antwoorden };
}
