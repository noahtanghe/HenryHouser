# Afspraak · Henry Houser

Interne boekingstool die YouCanBookMe vervangt. Elk pand krijgt een boekingspagina op
`https://afspraak.henryhouser.be/<slug>`; de pandsite verwijst vanaf `/afspraak` met een 301 naar daar.

- **Supabase**: database, edge functions (boeken, annuleren, .ics, wachtrij) en pg_cron
- **Netlify**: statische pagina's in `web/`
- **Resend**: alle e-mail

## Wat zit erin (MVP)

| Onderdeel | Waar |
|---|---|
| Datamodel: `paginas`, `beschikbaarheid`, `boekingen`, `berichten` | `supabase/migrations/` |
| Eerste pagina `aalbeeksesteenweg57` | `supabase/seed.sql` |
| Boekingspagina: slots, formulier, bevestigingsscherm met agenda-knoppen | `web/index.html`, `web/app.js` |
| Annuleerpagina via link in de mail | `web/annuleer.html`, `web/annuleer.js` |
| Boeken: validatie, slot vastleggen zonder overboeking, mails klaarzetten | `supabase/functions/boek` |
| Annuleren | `supabase/functions/annuleer` |
| Agenda-bestand | `supabase/functions/ics` |
| Wachtrij versturen (reminders, herkansingen), elke 5 min via pg_cron | `supabase/functions/verstuur`, `supabase/cron.sql` |

**Bij een boeking** gaan meteen: bevestiging naar de bezoeker (met .ics-bijlage, knoppen Google / Office 365 / .ics
en annuleerknop), alert naar `alert_email` en een melding naar `eigenaar_email`. Een reminder-mail wordt
`reminder_uren_vooraf` uur vooraf ingepland (48 = 2 dagen).

**Bij annulering**: annuleringsmail naar de bezoeker, interne melding naar `alert_email`, en de geplande reminder vervalt.

Nog niet in de MVP: sms, verplaatsen, intern overzicht, Google Calendar-koppeling.

## Een pagina instellen

Alles staat in de tabel `paginas` (Supabase → Table editor). Een nieuw pand = een rij kopiëren,
`slug`, `titel`, `adres` en teksten aanpassen, en een rij in `beschikbaarheid` toevoegen:

```sql
insert into beschikbaarheid (pagina_id, datum_van, datum_tot, van, tot)
select id, '2026-11-08', '2026-11-08', '09:00', '19:00' from paginas where slug = 'leuzestraat98';
```

**Formuliervelden** (`formuliervelden`, JSON): `{"key", "label", "type", "verplicht", "opties"}` met type
`text`, `email`, `tel`, `textarea`, `checkbox` of `select`. De keys `voornaam` en `email` zijn verplicht aanwezig;
`familienaam`, `telefoon` en `nieuwsbrief` krijgen een eigen kolom, al de rest komt in `boekingen.antwoorden`.

**Teksten** (bevestigingsscherm, onderwerpen, mails):

- Placeholders: `{voornaam}` `{familienaam}` `{adres}` `{titel}` `{start}` (zaterdag 24 oktober 2026 om 09:40) `{datum}` `{start_uur}`
- In mails, op een eigen regel: `{agenda_knoppen}`, `{annuleer_knop}`, `{gegevens}` (alle formulierantwoorden)
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
   Supabase-URL en anon key invullen. Domein `afspraak.henryhouser.be` toevoegen (CNAME naar Netlify).
6. **Wix-pandsite**: SEO → URL Redirect Manager → `/afspraak` naar `https://afspraak.henryhouser.be/<slug>`.

Lokaal openen kan ook met `?slug=`: `http://localhost:8080/?slug=aalbeeksesteenweg57`.

## Veiligheid

RLS staat aan op alle tabellen zonder policies: de browser kan niets rechtstreeks lezen of schrijven.
De boekingspagina gebruikt alleen `pagina_publiek()` en `vrije_slots()`; boeken en annuleren lopen via de
edge functions met de service role. `maak_boeking()` vergrendelt de pagina en controleert het slot opnieuw,
dus twee mensen die tegelijk hetzelfde slot kiezen, kunnen het niet allebei krijgen. Het formulier heeft een
honeypot-veld tegen bots.
