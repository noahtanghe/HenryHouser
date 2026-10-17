// Versturen via Resend. Zonder RESEND_API_KEY wordt de mail alleen gelogd
// (handig lokaal). MAIL_OMLEIDEN_NAAR stuurt alle mail naar één testadres.

export interface Mail {
  van: string;
  naar: string;
  antwoordAan?: string | null;
  onderwerp: string;
  html: string;
  tekst: string;
  bijlagen?: { bestandsnaam: string; inhoud: string; type: string }[];
}

export async function verstuurMail(m: Mail): Promise<{ id: string }> {
  const sleutel = Deno.env.get("RESEND_API_KEY");
  const omleiden = Deno.env.get("MAIL_OMLEIDEN_NAAR");
  const naar = omleiden || m.naar;
  const onderwerp = omleiden ? `[test voor ${m.naar}] ${m.onderwerp}` : m.onderwerp;

  if (!sleutel) {
    console.log(`[mail niet verstuurd, geen RESEND_API_KEY] aan=${naar} onderwerp=${onderwerp}\n${m.tekst}`);
    return { id: "lokaal" };
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${sleutel}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: m.van,
      to: [naar],
      reply_to: m.antwoordAan || undefined,
      subject: onderwerp,
      html: m.html,
      text: m.tekst,
      attachments: m.bijlagen?.map((b) => ({
        filename: b.bestandsnaam,
        content: btoa(String.fromCharCode(...new TextEncoder().encode(b.inhoud))),
        content_type: b.type,
      })),
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Resend ${res.status}: ${body?.message ?? JSON.stringify(body)}`);
  }
  return { id: body.id };
}
