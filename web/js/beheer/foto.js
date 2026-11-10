// Foto van een pand: verkleinen in de browser en opladen. Gedeeld door het tabblad
// Bezoekerspagina en de lijst "Klaar om te publiceren?" op het overzicht.

import { el } from "../tekst.js";
import { staat } from "./staat.js";
import { toast } from "./ui.js";

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

/**
 * Verkleint en bewaart een foto voor het adres van ctx; de vorige foto verdwijnt.
 * opStatus(tekst) toont de voortgang. Gooit een fout als het niet lukt.
 */
export async function fotoOpladen(ctx, bestand, opStatus = () => {}) {
  if (!/^image\//.test(bestand.type)) throw new Error("Kies een afbeelding: jpg, png of webp.");
  opStatus("Foto verkleinen…");
  const { blob, breed } = await verklein(bestand);
  opStatus("Foto opladen…");
  const oud = ctx.pagina.foto_pad;
  const pad = await staat.api.fotoOpladen(ctx.id, blob, breed);
  await ctx.bewaar({ foto_pad: pad });
  if (oud) staat.api.fotoVerwijderen(oud).catch((e) => console.warn("Oude foto niet verwijderd:", e));
  toast("Foto bewaard. Bezoekers zien ze meteen.");
}
