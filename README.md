# Afspraak · Henry Houser

Interne boekingstool die YouCanBookMe vervangt. Elk pand krijgt een boekingspagina op
`https://afspraak.henryhouser.be/<slug>`; de pandsite verwijst vanaf `/afspraak` met een 301 naar daar.

- **Supabase**: database, edge functions (boeken, annuleren, .ics, wachtrij) en pg_cron
- **Netlify**: statische pagina's in `web/`
- **Resend**: alle e-mail

## Wat zit erin

| Onderdeel | Waar |
|---|---|
| Datamodel: `paginas`, `beschikbaarheid`, `boekingen`, `berichten`, `weergaven`, `beheerders` | `supabase/migrations/` |
| Bezoekerspagina: foto in een boog, startuur kiezen, formulier, bevestiging met agenda-knoppen | `web/index.html`, `web/js/boek.js` |
| Annuleerpagina via de link in de mail | `web/annuleer.html`, `web/js/annuleer.js` |
| Verkopersrapport: live interesse zonder namen van bezoekers | `web/rapport.html`, `web/js/rapport.js` |
| Beheerplatform | `web/beheer.html`, `web/js/beheer/` |
| Huisstijl (crème, oranje, aqua, salie boog, Poppins en Bitter), gedeeld door alle pagina's | `web/huisstijl.css`, `web/publiek.css`, `web/beheer.css`, `web/fonts/`, `web/img/` |
| Boeken: validatie, slot vastleggen zonder overboeking, mails klaarzetten | `supabase/functions/boek` |
| Annuleren | `supabase/functions/annuleer` |
| Agenda-bestand | `supabase/functions/ics` |
| Wachtrij versturen (reminders, herkansingen), elke 5 min via pg_cron | `supabase/functions/verstuur`, `supabase/cron.sql` |

**Bij een boeking** gaan meteen: bevestiging naar de bezoeker (met .ics-bijlage, knoppen Google / Office 365 / .ics
en annuleerknop), alert naar `alert_email` en een melding naar `eigenaar_email` (met de link naar het
verkopersrapport). Een reminder-mail wordt `reminder_uren_vooraf` uur vooraf ingepland (48 = 2 dagen).

**Bij annulering**: annuleringsmail naar de bezoeker, interne melding naar `alert_email`, en de geplande reminder vervalt.

**Bij verplaatsen** (vanuit het beheer): nieuwe tijd in de agenda van de bezoeker (zelfde afspraak in het .ics-bestand)
en een mail met het nieuwe tijdstip, als je dat aanvinkt.

Nog niet: sms, Google Calendar-koppeling.

## Beheerplatform

`https://afspraak.henryhouser.be/beheer`

- **Overzicht**: bezoeken van vandaag en morgen (met belknop), komende Homeruns met bezetting, wat aandacht vraagt
  (geen bezoekdagen, geen foto, geen e-mail van de verkoper, mails die niet vertrokken) en de laatste boekingen.
- **Adressen**: alle panden per fase (komend, nieuw, afgelopen, archief), zoeken, en per adres de link om te kopiëren.
  Een nieuw adres maak je van nul of als kopie van een ander adres (teksten, formulier en mails gaan mee).
- **Per adres**:
  - *Overzicht*: checklist "klaar voor bezoekers", weergaven, unieke bezoekers, afspraken, bezetting, de weg van
    weergave tot afspraak (en tot bod), per bezoekdag, per startuur, bronnen, waar bezoekers vandaan kwamen, toestel,
    hoe lang op voorhand geboekt, en links met `?utm_source=` voor advertenties.
  - *Bezoekers*: komend, voorbij en geannuleerd; aanduiden wie er geweest is, wie niet kwam en wie een bod deed,
    notities, verplaatsen, annuleren, zelf een afspraak toevoegen, de mails per bezoeker, exporteren (CSV) en een
    lijst afdrukken voor de Homerun.
  - *Bezoekdagen*: dagen en uren waarop bezoekers kunnen kiezen.
  - *Bezoekerspagina*: foto (wordt verkleind en bijgesneden voor de mail), adres, titel, kick-off prijs, intro,
    formuliervelden en bevestigingsscherm, met een live voorbeeld op gsm of computer (`?voorbeeld=1`, boekt niet).
  - *Mails*: alle mailteksten met voorbeeld, afzender, en de verkoper die meldingen krijgt.
  - *Verkopersrapport*: een eigen link per adres (`/rapport?token=…`), die je ook kan vervangen.
  - Archiveren of verwijderen (verwijderen kan alleen zonder afspraken).

Inloggen gaat met Supabase Auth (e-mail en wachtwoord, registreren staat uit). Toegang krijgen alleen adressen in
de tabel `beheerders`. Een collega toevoegen: gebruiker aanmaken in Supabase → Authentication → Users, en

```sql
insert into beheerders (email) values ('collega@henryhouser.be');
```

**Analytics zonder cookies**: de bezoekerspagina telt weergaven en gekozen startmomenten. Een bezoeker is een hash
van IP en browser met een zout dat elke dag wisselt, zodat unieke bezoekers per dag te tellen zijn zonder dat
iemand herleidbaar is. De bron komt uit `?utm_source=` of de verwijzende site.

**Demo zonder server**: `tools/demo` bouwt het beheer als één HTML-bestand met verzonnen adressen en bezoekers
(`cd tools/demo && npm install && node bouw.mjs`). De bezoekerspagina en het verkopersrapport openen er in een
venster; boeken werkt in het geheugen en verschijnt meteen in het beheer. `mock-api.js` volgt de vorm van
`web/js/beheer/api.js` en de databasefuncties: pas die mee aan als de API verandert.

## Teksten en formulier

**Formuliervelden**: `{"key", "label", "type", "verplicht", "opties"}` met type `text`, `email`, `tel`, `textarea`,
`checkbox` of `select`. De keys `voornaam` en `email` zijn verplicht aanwezig; `familienaam`, `telefoon` en
`nieuwsbrief` krijgen een eigen kolom, al de rest komt in `boekingen.antwoorden`.

**Teksten** (bevestigingsscherm, onderwerpen, mails):

- Placeholders: `{voornaam}` `{familienaam}` `{adres}` `{titel}` `{start}` (zaterdag 24 oktober 2026 om 09:40) `{datum}`
  `{start_uur}` `{eigenaar_naam}` `{kickoff_prijs}`
- In mails, op een eigen regel: `{agenda_knoppen}`, `{annuleer_knop}`, `{gegevens}` (alle formulierantwoorden),
  `{rapport_knop}` (link naar het verkopersrapport, voor de mail aan de verkoper)
- Lege regel = nieuwe alinea, `**vet**`

## Installatie

1. **Supabase-project** (regio Frankfurt). Daarna lokaal:
   ```sh
   supabase link --project-ref <project-ref>
   supabase db push                      # migratie
   psql "$DB_URL" -f supabase/seed.sql   # of plakken in de SQL-editor
   ```
2. **Secrets en functies**:
   ```sh
   supabase secrets set RESEND_API_KEY=re_... \
     PUBLIEKE_URL=https://afspraak.henryhouser.be \
     CRON_GEHEIM=$(openssl rand -hex 24)
   # Tijdens de testfase alle mail naar één adres:
   supabase secrets set MAIL_OMLEIDEN_NAAR=hendrik@henryhouser.be
   # Zonder RESEND_API_KEY worden mails niet verstuurd maar gelogd (Edge Functions → Logs).
   supabase functions deploy boek annuleer ics verstuur
   ```
3. **Cron**: `supabase/cron.sql` invullen (project-ref en hetzelfde `CRON_GEHEIM`) en uitvoeren in de SQL-editor.
4. **Resend**: domein `henryhouser.be` toevoegen en de DNS-records (SPF/DKIM) zetten, zodat
   `backoffice@henryhouser.be` mag versturen.
5. **Netlify**: site koppelen aan deze repo (publish directory `web`, geen build). In `web/config.js` de
   Supabase-URL en publishable key invullen. Domein `afspraak.henryhouser.be` toevoegen (CNAME naar Netlify) en in
   Supabase → Authentication → URL Configuration `https://afspraak.henryhouser.be/**` toelaten (voor "wachtwoord vergeten").
6. **Wix-pandsite**: SEO → URL Redirect Manager → `/afspraak` naar `https://afspraak.henryhouser.be/<slug>`.

Lokaal openen kan ook met `?slug=`: `http://localhost:8080/?slug=aalbeeksesteenweg57`.

## Veiligheid

RLS staat aan op alle tabellen. Anonieme bezoekers kunnen niets rechtstreeks lezen of schrijven: de
bezoekerspagina gebruikt alleen `pagina_publiek()`, `vrije_slots()` en `log_weergave()`, het verkopersrapport alleen
`rapport_publiek(token)`, en boeken en annuleren lopen via de edge functions met de service role. Ingelogde
gebruikers mogen enkel iets als ze in `beheerders` staan (`is_beheerder()`), ook voor de foto's in de bucket `fotos`. `maak_boeking()` vergrendelt de pagina en controleert het slot opnieuw,
dus twee mensen die tegelijk hetzelfde slot kiezen, kunnen het niet allebei krijgen. Het formulier heeft een
honeypot-veld tegen bots.
