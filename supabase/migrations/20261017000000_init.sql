-- Boekingstool Henry Houser: datamodel MVP
-- Eén boekingspagina per pand (slug = URL), beschikbaarheid per pagina,
-- boekingen, en een wachtrij voor alle uitgaande berichten.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.paginas (
  id                        uuid primary key default gen_random_uuid(),
  slug                      text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  actief                    boolean not null default true,
  titel                     text not null,
  adres                     text not null,            -- zoals in mails: "Aalbeeksesteenweg 57, 8500 Kortrijk"
  intro                     text,
  duur_min                  int  not null default 40 check (duur_min between 5 and 480),
  slot_interval_min         int  not null default 40 check (slot_interval_min between 5 and 480),
  max_per_slot              int  not null default 1  check (max_per_slot >= 1),
  min_minuten_vooraf        int  not null default 60 check (min_minuten_vooraf >= 0),
  -- Formuliervelden: [{key,label,type,verplicht,opties?}]
  -- type: text | email | tel | textarea | checkbox | select
  -- Vaste keys die in kolommen van boekingen landen: voornaam, familienaam, email, telefoon, nieuwsbrief
  formuliervelden           jsonb not null default '[]'::jsonb check (jsonb_typeof(formuliervelden) = 'array'),

  -- Ontvangers
  afzender                  text not null default 'Henry Houser <backoffice@henryhouser.be>',
  antwoord_aan              text,                      -- reply-to, leeg = afzender
  alert_email               text,                      -- interne melding (komma-gescheiden mag)
  eigenaar_email            text,                      -- eigenaar/verkoper (komma-gescheiden mag)

  -- Teksten. Placeholders: {voornaam} {familienaam} {adres} {titel} {start} {start_uur} {datum}
  -- Op een eigen regel in mails: {agenda_knoppen} {annuleer_knop} {gegevens}
  bevestigingsscherm        text not null default 'Hallo {voornaam}! Jouw afspraak ligt vast voor {start}.',
  mail_onderwerp            text not null default 'bezoek: {adres}',
  mail_bevestiging          text,
  mail_eigenaar             text,
  mail_alert                text,
  mail_reminder_onderwerp   text not null default 'Herinnering bezoek: {adres}',
  mail_reminder             text,
  reminder_uren_vooraf      int,                       -- leeg = geen reminder-mail
  mail_annulering_onderwerp text not null default 'Jouw bezoek aan {adres}',
  mail_annulering           text,
  mail_annulering_alert     text,

  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

-- Beschikbaarheid: per periode de dagelijkse uren. Een Homerun-dag is één rij
-- met datum_van = datum_tot.
create table public.beschikbaarheid (
  id          uuid primary key default gen_random_uuid(),
  pagina_id   uuid not null references public.paginas(id) on delete cascade,
  datum_van   date not null,
  datum_tot   date not null,
  van         time not null,
  tot         time not null,
  weekdagen   int[] not null default '{1,2,3,4,5,6,7}',   -- ISO: 1 = maandag
  check (datum_tot >= datum_van),
  check (tot > van)
);
create index on public.beschikbaarheid (pagina_id);

create table public.boekingen (
  id              uuid primary key default gen_random_uuid(),
  pagina_id       uuid not null references public.paginas(id) on delete restrict,
  start           timestamptz not null,
  eind            timestamptz not null,
  voornaam        text not null,
  familienaam     text,
  email           text not null,
  telefoon        text,
  nieuwsbrief     boolean not null default false,
  antwoorden      jsonb not null default '{}'::jsonb,   -- alle formulierantwoorden
  status          text not null default 'bevestigd'
                  check (status in ('bevestigd', 'geannuleerd', 'geweest', 'no-show')),
  token           uuid not null unique default gen_random_uuid(),  -- in annuleerlink
  geannuleerd_op  timestamptz,
  created_at      timestamptz not null default now()
);
create index on public.boekingen (pagina_id, start) where status = 'bevestigd';

-- Wachtrij en log van alle berichten. Inhoud wordt pas bij verzending
-- opgebouwd uit de pagina-teksten, zodat aanpassingen ook voor reminders gelden.
create table public.berichten (
  id            uuid primary key default gen_random_uuid(),
  boeking_id    uuid not null references public.boekingen(id) on delete cascade,
  kanaal        text not null default 'mail' check (kanaal in ('mail', 'sms')),
  soort         text not null check (soort in
                  ('bevestiging', 'alert', 'eigenaar', 'reminder', 'annulering', 'annulering_alert')),
  ontvanger     text not null,
  gepland_op    timestamptz not null default now(),
  status        text not null default 'wachtrij'
                check (status in ('wachtrij', 'bezig', 'verzonden', 'mislukt', 'geannuleerd')),
  pogingen      int not null default 0,
  fout          text,
  extern_id     text,
  verzonden_op  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index on public.berichten (gepland_op) where status in ('wachtrij', 'bezig');
create index on public.berichten (boeking_id);

create function public.zet_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

create trigger paginas_updated_at before update on public.paginas
  for each row execute function public.zet_updated_at();
create trigger berichten_updated_at before update on public.berichten
  for each row execute function public.zet_updated_at();

-- ---------------------------------------------------------------------------
-- Toegang: RLS aan, geen policies. Publiek leest alleen via de functies
-- hieronder; schrijven gebeurt via edge functions met de service role.
-- ---------------------------------------------------------------------------

alter table public.paginas         enable row level security;
alter table public.beschikbaarheid enable row level security;
alter table public.boekingen       enable row level security;
alter table public.berichten       enable row level security;

-- ---------------------------------------------------------------------------
-- Publieke functies
-- ---------------------------------------------------------------------------

-- Gegevens die de boekingspagina mag zien.
create function public.pagina_publiek(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slug', slug, 'titel', titel, 'adres', adres, 'intro', intro,
    'duur_min', duur_min, 'formuliervelden', formuliervelden
  )
  from paginas where slug = p_slug and actief;
$$;

-- Vrije slots (in de toekomst, binnen 180 dagen, niet vol).
create function public.vrije_slots(p_slug text)
returns table (start timestamptz, eind timestamptz, plaatsen int)
language sql stable security definer set search_path = public as $$
  with p as (
    select * from paginas where slug = p_slug and actief
  ),
  dagen as (
    select b.pagina_id, d::date as datum, b.van, b.tot
    from p
    join beschikbaarheid b on b.pagina_id = p.id
    cross join lateral generate_series(
      greatest(b.datum_van, (now() at time zone 'Europe/Brussels')::date),
      least(b.datum_tot, (now() at time zone 'Europe/Brussels')::date + 180),
      interval '1 day') d
    where extract(isodow from d)::int = any (b.weekdagen)
  ),
  slots as (
    select distinct (s at time zone 'Europe/Brussels') as start, p.duur_min, p.max_per_slot, p.min_minuten_vooraf, p.id as pagina_id
    from dagen
    cross join p
    cross join lateral generate_series(
      dagen.datum + dagen.van,
      dagen.datum + dagen.tot - make_interval(mins => p.duur_min),
      make_interval(mins => p.slot_interval_min)) s
  )
  select s.start,
         s.start + make_interval(mins => s.duur_min) as eind,
         (s.max_per_slot - count(bk.id))::int as plaatsen
  from slots s
  left join boekingen bk
    on bk.pagina_id = s.pagina_id and bk.status = 'bevestigd' and bk.start = s.start
  where s.start >= now() + make_interval(mins => s.min_minuten_vooraf)
  group by s.start, s.duur_min, s.max_per_slot
  having s.max_per_slot - count(bk.id) > 0
  order by s.start;
$$;

-- ---------------------------------------------------------------------------
-- Interne functies (alleen service role, via edge functions)
-- ---------------------------------------------------------------------------

-- Splits "a@x.be, b@y.be" in losse adressen.
create function public.adressen(p text) returns setof text
language sql immutable as $$
  select trim(a) from regexp_split_to_table(coalesce(p, ''), '[,;]') a where trim(a) <> '';
$$;

-- Maakt een boeking atomair aan en zet de berichten klaar.
-- Gooit 'slot_niet_vrij' als het slot niet (meer) beschikbaar is.
create function public.maak_boeking(p_slug text, p_start timestamptz, p_antwoorden jsonb)
returns public.boekingen
language plpgsql security definer set search_path = public as $$
declare
  v_pagina paginas;
  v_boeking boekingen;
  v_adres text;
begin
  -- Pagina vergrendelen: gelijktijdige boekingen op dezelfde pagina wachten op elkaar.
  select * into v_pagina from paginas where slug = p_slug and actief for update;
  if not found then
    raise exception 'pagina_niet_gevonden' using errcode = 'P0002';
  end if;

  if not exists (select 1 from vrije_slots(p_slug) v where v.start = p_start) then
    raise exception 'slot_niet_vrij' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_antwoorden->>'voornaam'), '') = '' or coalesce(trim(p_antwoorden->>'email'), '') = '' then
    raise exception 'voornaam_en_email_verplicht' using errcode = '22023';
  end if;

  insert into boekingen (pagina_id, start, eind, voornaam, familienaam, email, telefoon, nieuwsbrief, antwoorden)
  values (
    v_pagina.id, p_start, p_start + make_interval(mins => v_pagina.duur_min),
    trim(p_antwoorden->>'voornaam'),
    nullif(trim(p_antwoorden->>'familienaam'), ''),
    lower(trim(p_antwoorden->>'email')),
    nullif(trim(p_antwoorden->>'telefoon'), ''),
    coalesce((p_antwoorden->>'nieuwsbrief')::boolean, false),
    p_antwoorden
  )
  returning * into v_boeking;

  insert into berichten (boeking_id, soort, ontvanger)
  values (v_boeking.id, 'bevestiging', v_boeking.email);

  for v_adres in select adressen(v_pagina.alert_email) loop
    insert into berichten (boeking_id, soort, ontvanger) values (v_boeking.id, 'alert', v_adres);
  end loop;

  for v_adres in select adressen(v_pagina.eigenaar_email) loop
    insert into berichten (boeking_id, soort, ontvanger) values (v_boeking.id, 'eigenaar', v_adres);
  end loop;

  if v_pagina.reminder_uren_vooraf is not null
     and v_boeking.start - make_interval(hours => v_pagina.reminder_uren_vooraf) > now() then
    insert into berichten (boeking_id, soort, ontvanger, gepland_op)
    values (v_boeking.id, 'reminder', v_boeking.email,
            v_boeking.start - make_interval(hours => v_pagina.reminder_uren_vooraf));
  end if;

  return v_boeking;
end $$;

-- Annuleert via het token uit de mail. Idempotent: een tweede keer doet niets.
create function public.annuleer_boeking(p_token uuid)
returns public.boekingen
language plpgsql security definer set search_path = public as $$
declare
  v_boeking boekingen;
  v_pagina paginas;
  v_adres text;
begin
  select * into v_boeking from boekingen where token = p_token for update;
  if not found then
    raise exception 'boeking_niet_gevonden' using errcode = 'P0002';
  end if;
  if v_boeking.status <> 'bevestigd' then
    return v_boeking;
  end if;
  if v_boeking.start <= now() then
    raise exception 'bezoek_voorbij' using errcode = 'P0001';
  end if;

  update boekingen set status = 'geannuleerd', geannuleerd_op = now()
  where id = v_boeking.id returning * into v_boeking;

  update berichten set status = 'geannuleerd'
  where boeking_id = v_boeking.id and status = 'wachtrij' and soort = 'reminder';

  select * into v_pagina from paginas where id = v_boeking.pagina_id;

  insert into berichten (boeking_id, soort, ontvanger)
  values (v_boeking.id, 'annulering', v_boeking.email);

  for v_adres in select adressen(v_pagina.alert_email) loop
    insert into berichten (boeking_id, soort, ontvanger) values (v_boeking.id, 'annulering_alert', v_adres);
  end loop;

  return v_boeking;
end $$;

-- Neemt berichten die klaar zijn om te versturen (optioneel van één boeking).
-- Berichten die langer dan 10 minuten 'bezig' staan, worden opnieuw opgepikt.
create function public.claim_berichten(p_limit int default 50, p_boeking_id uuid default null)
returns setof public.berichten
language sql security definer set search_path = public as $$
  update berichten b set status = 'bezig', pogingen = b.pogingen + 1
  where b.id in (
    select id from berichten
    where (status = 'wachtrij' or (status = 'bezig' and updated_at < now() - interval '10 minutes'))
      and gepland_op <= now()
      and pogingen < 5
      and (p_boeking_id is null or boeking_id = p_boeking_id)
    order by gepland_op
    limit p_limit
    for update skip locked
  )
  returning b.*;
$$;

revoke all on function public.maak_boeking(text, timestamptz, jsonb) from public, anon, authenticated;
revoke all on function public.annuleer_boeking(uuid) from public, anon, authenticated;
revoke all on function public.claim_berichten(int, uuid) from public, anon, authenticated;
grant execute on function public.maak_boeking(text, timestamptz, jsonb) to service_role;
grant execute on function public.annuleer_boeking(uuid) to service_role;
grant execute on function public.claim_berichten(int, uuid) to service_role;

revoke all on function public.pagina_publiek(text) from public;
revoke all on function public.vrije_slots(text) from public;
grant execute on function public.pagina_publiek(text) to anon, authenticated, service_role;
grant execute on function public.vrije_slots(text) to anon, authenticated, service_role;
