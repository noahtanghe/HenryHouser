-- Eerste voorbeeldpagina, overgenomen van aalbeeksesteenweg57.youcanbook.me
-- Teksten over bodprocedure en krediet: nakijken tegen de echte YCBM-mail.

insert into public.paginas (
  slug, titel, adres, intro,
  duur_min, slot_interval_min, max_per_slot, min_minuten_vooraf,
  formuliervelden,
  afzender, alert_email, eigenaar_email,
  bevestigingsscherm, mail_onderwerp,
  mail_bevestiging, mail_eigenaar, mail_alert,
  reminder_uren_vooraf, mail_reminder_onderwerp, mail_reminder,
  mail_annulering_onderwerp, mail_annulering, mail_annulering_alert
) values (
  'aalbeeksesteenweg57',
  'Homerun in Aalbeeksesteenweg 57 in 8500 Kortrijk',
  'Aalbeeksesteenweg 57, 8500 Kortrijk',
  'Hallo, het tijdslot dat je hieronder kiest, is het startuur maar geen vaste duurtijd van jouw bezoek. Krijg je graag advies van ouders, architect, aankoopmakelaar, enz... Dat kan! Iedereen is welkom, en blijf gerust zo lang je wenst!',
  40, 40, 1, 60,
  $json$[
    {"key": "voornaam",    "label": "Voornaam",    "type": "text",  "verplicht": true},
    {"key": "familienaam", "label": "Familienaam", "type": "text",  "verplicht": false},
    {"key": "email",       "label": "E-mail",      "type": "email", "verplicht": true},
    {"key": "telefoon",    "label": "Telefoon",    "type": "tel",   "verplicht": true},
    {"key": "nieuwsbrief", "label": "Ja, ik ontvang graag de nieuwsbrief van Henry Houser", "type": "checkbox", "verplicht": false},
    {"key": "bron", "label": "Hoe vond je deze aanbieding?", "type": "select", "verplicht": true,
     "opties": ["website Henry Houser", "Facebook", "Instagram", "Immoweb", "Zimmo", "Realo", "Spotto",
                "Immoscoop", "Immomaps", "Luxevastgoed.be", "bord ter plaatse", "buurmailing", "via - via",
                "Ik weet het niet meer ;-)"]}
  ]$json$::jsonb,
  'Henry Houser <backoffice@henryhouser.be>',
  'backoffice@henryhouser.be',
  null,   -- e-mailadres eigenaar nog invullen
  'Hallo {voornaam}! Jouw afspraak ligt vast voor {start}.',
  'bezoek: {adres}',

  -- Bevestiging naar de bezoeker
  $txt$Hallo {voornaam},

Bedankt voor je inschrijving. Jouw bezoek aan {adres} ligt vast op **{start}**. Het tijdslot is je startuur, geen vaste duurtijd: blijf gerust zo lang je wenst, en neem gerust ouders, architect of aankoopmakelaar mee.

{agenda_knoppen}

**Hoe verloopt de verkoop?**
Na de Homerun kan je een schriftelijk bod uitbrengen. Op dinsdag 13 oktober zullen de verkopers beslissen welk bod ze aanvaarden. Je hoort van ons, wat de uitkomst ook is.

**Eerst naar de bank**
Een bod gebeurt zonder opschortende voorwaarde voor het verkrijgen van een krediet. We raden je daarom aan om vóór je bod langs te gaan bij je bank, zodat je zeker bent van je financiering.

Kan je toch niet komen? Laat het ons weten via de knop hieronder, zo geven we het tijdslot vrij voor iemand anders.

{annuleer_knop}

Tot dan!

Hendrik Tanghe
Henry Houser
0495 56 90 87$txt$,

  -- Melding naar de eigenaar
  $txt$Hallo,

Er is een nieuw bezoek ingepland voor {adres}:

**{start}**: {voornaam} {familienaam}

Met vriendelijke groeten,
Henry Houser$txt$,

  -- Interne alert
  $txt$Nieuwe boeking voor {adres}.

**{start}**

{gegevens}$txt$,

  -- Reminder 2 dagen vooraf
  48,
  'Herinnering bezoek: {adres}',
  $txt$Hallo {voornaam},

Even ter herinnering: je bezoek aan {adres} staat gepland op **{start}**.

{agenda_knoppen}

Kan je toch niet komen? Annuleer dan via de knop hieronder.

{annuleer_knop}

Tot dan!

Hendrik Tanghe
Henry Houser
0495 56 90 87$txt$,

  -- Annulering
  'Jouw bezoek aan {adres}',
  $txt$Hallo {voornaam},

Jouw bezoek aan {adres} op {start} werd geannuleerd. Alvast succes met de verdere zoektocht!

Hendrik Tanghe
Henry Houser
0495 56 90 87$txt$,

  -- Interne melding bij annulering
  $txt$Geannuleerd: bezoek aan {adres} op **{start}**.

{gegevens}$txt$
);

insert into public.beschikbaarheid (pagina_id, datum_van, datum_tot, van, tot)
select id, date '2026-10-11', date '2026-10-11', time '09:00', time '19:00'
from public.paginas where slug = 'aalbeeksesteenweg57';
