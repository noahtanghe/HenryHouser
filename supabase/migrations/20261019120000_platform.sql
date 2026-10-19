-- Platform: foto's, historiek, analytics, verkopersrapport en beheeracties
-- (afspraak toevoegen, verplaatsen, opvolging per bezoeker).

-- ---------------------------------------------------------------------------
-- Pagina's: extra gegevens van het pand
-- ---------------------------------------------------------------------------

alter table public.paginas
  add column foto_pad                  text,           -- pad in storage-bucket "fotos"
  add column kickoff_prijs             integer check (kickoff_prijs is null or kickoff_prijs > 0),
  add column pand_url                  text,           -- het pand op henryhouser.be
  add column gearchiveerd              boolean not null default false,
  add column eigenaar_naam             text,
  add column rapport_token             uuid not null default gen_random_uuid() unique,  -- verkopersrapport
  add column mail_verplaatst_onderwerp text not null default 'Nieuw tijdstip voor je bezoek: {adres}',
  add column mail_verplaatst           text;

-- ---------------------------------------------------------------------------
-- Boekingen: opvolging en herkomst
-- ---------------------------------------------------------------------------

alter table public.boekingen
  add column notitie          text,
  add column bod_uitgebracht  boolean not null default false,
  add column kanaal           text,                    -- utm_source of verwijzende site
  add column apparaat         text check (apparaat in ('mobiel', 'desktop')),
  add column laad_id          uuid,                    -- koppeling met weergaven
  add column via_beheer       boolean not null default false,
  add column verplaatst_op    timestamptz,
  add column ics_volgnummer   int not null default 0;  -- SEQUENCE in het .ics-bestand

alter table public.berichten drop constraint berichten_soort_check;
alter table public.berichten add constraint berichten_soort_check check (soort in
  ('bevestiging', 'alert', 'eigenaar', 'reminder', 'annulering', 'annulering_alert', 'verplaatst'));

-- Beheerders volgen bezoekers op (aanwezig, no-show, bod, notitie) en mogen
-- een boeking verwijderen. Annuleren loopt via de edge function (mails).
create policy beheer_boekingen_wijzigen on public.boekingen
  for update to authenticated
  using (is_beheerder() and status <> 'geannuleerd')
  with check (is_beheerder() and status <> 'geannuleerd');
create policy beheer_boekingen_verwijderen on public.boekingen
  for delete to authenticated using (is_beheerder());
revoke update on public.boekingen from authenticated;
grant update (notitie, bod_uitgebracht, status) on public.boekingen to authenticated;

-- ---------------------------------------------------------------------------
-- Analytics: weergaven van de boekingspagina, zonder cookies of IP-adressen.
-- Een bezoeker is een hash van IP + browser + een zout dat elke dag wisselt
-- (en daarna verdwijnt), zodat unieke bezoekers per dag te tellen zijn maar
-- niemand herleidbaar is.
-- ---------------------------------------------------------------------------

create table public.weergaven (
  id          bigint generated always as identity primary key,
  pagina_id   uuid not null references public.paginas(id) on delete cascade,
  laad_id     uuid not null,                 -- één paginalading
  gebeurtenis text not null check (gebeurtenis in ('bekeken', 'slot_gekozen')),
  bezoeker    text not null,
  kanaal      text,
  apparaat    text,
  created_at  timestamptz not null default now(),
  unique (laad_id, gebeurtenis)
);
create index on public.weergaven (pagina_id, created_at);
alter table public.weergaven enable row level security;
create policy beheer_weergaven_lezen on public.weergaven
  for select to authenticated using (is_beheerder());

create table public.analytics_zout (
  datum date primary key,
  zout  text not null default encode(extensions.gen_random_bytes(16), 'hex')
);
alter table public.analytics_zout enable row level security;
revoke all on public.analytics_zout from anon, authenticated;

create function public.log_weergave(
  p_slug text, p_gebeurtenis text, p_laad_id uuid,
  p_kanaal text default null, p_apparaat text default null
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_pagina  uuid;
  v_headers json := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::json;
  v_vandaag date := (now() at time zone 'Europe/Brussels')::date;
  v_ip      text;
  v_zout    text;
begin
  if p_laad_id is null or p_gebeurtenis not in ('bekeken', 'slot_gekozen') then
    return;
  end if;
  select id into v_pagina from paginas where slug = p_slug and actief;
  if not found then
    return;
  end if;

  v_ip := coalesce(v_headers ->> 'cf-connecting-ip',
                   nullif(split_part(v_headers ->> 'x-forwarded-for', ',', 1), ''),
                   v_headers ->> 'x-real-ip', '');

  insert into analytics_zout (datum) values (v_vandaag) on conflict do nothing;
  delete from analytics_zout where datum < v_vandaag;
  select zout into v_zout from analytics_zout where datum = v_vandaag;

  insert into weergaven (pagina_id, laad_id, gebeurtenis, bezoeker, kanaal, apparaat)
  values (
    v_pagina, p_laad_id, p_gebeurtenis,
    left(encode(extensions.digest(v_zout || trim(v_ip) || coalesce(v_headers ->> 'user-agent', ''), 'sha256'), 'hex'), 16),
    left(nullif(lower(trim(p_kanaal)), ''), 60),
    case when p_apparaat in ('mobiel', 'desktop') then p_apparaat end
  )
  on conflict (laad_id, gebeurtenis) do nothing;
end $$;

revoke all on function public.log_weergave(text, text, uuid, text, text) from public;
grant execute on function public.log_weergave(text, text, uuid, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Alle tijdslots van een pagina (verleden en toekomst), met capaciteit.
-- ---------------------------------------------------------------------------

create function public.alle_slots(p_pagina_id uuid)
returns table (start timestamptz, plaatsen int)
language sql stable security definer set search_path = public as $$
  select distinct (s at time zone 'Europe/Brussels') as start, p.max_per_slot
  from paginas p
  join beschikbaarheid b on b.pagina_id = p.id
  cross join lateral generate_series(b.datum_van, b.datum_tot, interval '1 day') d
  cross join lateral generate_series(
    d::date + b.van,
    d::date + b.tot - make_interval(mins => p.duur_min),
    make_interval(mins => p.slot_interval_min)) s
  where p.id = p_pagina_id
    and extract(isodow from d)::int = any (b.weekdagen);
$$;
revoke all on function public.alle_slots(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Publieke gegevens van de boekingspagina (nu met foto, prijs en data)
-- ---------------------------------------------------------------------------

create or replace function public.pagina_publiek(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select json_build_object(
    'slug', p.slug, 'titel', p.titel, 'adres', p.adres, 'intro', p.intro,
    'duur_min', p.duur_min, 'formuliervelden', p.formuliervelden,
    'foto_pad', p.foto_pad, 'kickoff_prijs', p.kickoff_prijs, 'pand_url', p.pand_url,
    'komende_dagen', coalesce((
      select json_agg(d.dag order by d.dag)
      from (select distinct (a.start at time zone 'Europe/Brussels')::date as dag
            from alle_slots(p.id) a where a.start > now()) d
    ), '[]'::json)
  )
  from paginas p where p.slug = p_slug and p.actief;
$$;

-- ---------------------------------------------------------------------------
-- Boeking maken: nu met herkomst (kanaal, apparaat, laad_id) en een
-- variant voor het beheer (ook kort op voorhand, zonder interne alert).
-- ---------------------------------------------------------------------------

drop function public.maak_boeking(text, timestamptz, jsonb);

create function public.maak_boeking(
  p_slug text, p_start timestamptz, p_antwoorden jsonb, p_meta jsonb default '{}'::jsonb
) returns public.boekingen
language plpgsql security definer set search_path = public as $$
declare
  v_pagina     paginas;
  v_boeking    boekingen;
  v_adres      text;
  v_beheer     boolean := coalesce((p_meta ->> 'via_beheer')::boolean, false);
  v_mail       boolean := coalesce((p_meta ->> 'mail_bezoeker')::boolean, true);
begin
  -- Pagina vergrendelen: gelijktijdige boekingen op dezelfde pagina wachten op elkaar.
  select * into v_pagina from paginas where slug = p_slug and actief for update;
  if not found then
    raise exception 'pagina_niet_gevonden' using errcode = 'P0002';
  end if;

  if v_beheer then
    -- Beheer mag elk toekomstig slot met plaats gebruiken, ook kort op voorhand.
    if p_start <= now() or not exists (
      select 1 from alle_slots(v_pagina.id) a
      where a.start = p_start
        and a.plaatsen > (select count(*) from boekingen x
                          where x.pagina_id = v_pagina.id and x.status = 'bevestigd' and x.start = p_start)
    ) then
      raise exception 'slot_niet_vrij' using errcode = 'P0001';
    end if;
  elsif not exists (select 1 from vrije_slots(p_slug) v where v.start = p_start) then
    raise exception 'slot_niet_vrij' using errcode = 'P0001';
  end if;

  if coalesce(trim(p_antwoorden->>'voornaam'), '') = '' or coalesce(trim(p_antwoorden->>'email'), '') = '' then
    raise exception 'voornaam_en_email_verplicht' using errcode = '22023';
  end if;

  insert into boekingen (pagina_id, start, eind, voornaam, familienaam, email, telefoon, nieuwsbrief,
                         antwoorden, kanaal, apparaat, laad_id, via_beheer)
  values (
    v_pagina.id, p_start, p_start + make_interval(mins => v_pagina.duur_min),
    trim(p_antwoorden->>'voornaam'),
    nullif(trim(p_antwoorden->>'familienaam'), ''),
    lower(trim(p_antwoorden->>'email')),
    nullif(trim(p_antwoorden->>'telefoon'), ''),
    coalesce((p_antwoorden->>'nieuwsbrief')::boolean, false),
    p_antwoorden,
    left(nullif(lower(trim(p_meta->>'kanaal')), ''), 60),
    case when p_meta->>'apparaat' in ('mobiel', 'desktop') then p_meta->>'apparaat' end,
    case when p_meta->>'laad_id' ~* '^[0-9a-f-]{36}$' then (p_meta->>'laad_id')::uuid end,
    v_beheer
  )
  returning * into v_boeking;

  if v_mail then
    insert into berichten (boeking_id, soort, ontvanger)
    values (v_boeking.id, 'bevestiging', v_boeking.email);
  end if;

  if not v_beheer then
    for v_adres in select adressen(v_pagina.alert_email) loop
      insert into berichten (boeking_id, soort, ontvanger) values (v_boeking.id, 'alert', v_adres);
    end loop;
  end if;

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

revoke all on function public.maak_boeking(text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.maak_boeking(text, timestamptz, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Statistieken van één pagina. Intern (zonder toegangscontrole); bereikbaar
-- via beheer_statistiek (beheerders) en rapport_publiek (verkoper, via token).
-- ---------------------------------------------------------------------------

create function public.statistiek(p_pagina_id uuid) returns json
language sql stable security definer set search_path = public as $$
  with
  slots as (select * from alle_slots(p_pagina_id)),
  bk as (select * from boekingen where pagina_id = p_pagina_id),
  ak as (select * from bk where status <> 'geannuleerd'),
  wg as (select * from weergaven where pagina_id = p_pagina_id),
  vandaag as (select (now() at time zone 'Europe/Brussels')::date as d),
  activiteit as (
    select (created_at at time zone 'Europe/Brussels')::date as d from wg
    union all
    select (created_at at time zone 'Europe/Brussels')::date from bk
  ),
  bereik as (
    select greatest(
             coalesce((select min(d) from activiteit), e.eind),
             e.eind - 59) as van,
           e.eind as tot
    from (
      select case
               when exists (select 1 from slots where start > now()) then (select d from vandaag)
               else least((select d from vandaag), coalesce((select max(d) from activiteit), (select d from vandaag)))
             end as eind
    ) e
  ),
  dagen as (
    select g::date as dag
    from bereik, generate_series(bereik.van, bereik.tot, interval '1 day') g
  )
  select json_build_object(
    'kpi', json_build_object(
      'weergaven',    (select count(*) from wg where gebeurtenis = 'bekeken'),
      'bezoekers',    (select count(distinct bezoeker || (created_at at time zone 'Europe/Brussels')::date)
                         from wg where gebeurtenis = 'bekeken'),
      'slot_gekozen', (select count(*) from wg where gebeurtenis = 'slot_gekozen'),
      'boekingen',    (select count(*) from bk),
      'actief',       (select count(*) from ak),
      'geannuleerd',  (select count(*) from bk where status = 'geannuleerd'),
      'geweest',      (select count(*) from bk where status = 'geweest'),
      'no_show',      (select count(*) from bk where status = 'no-show'),
      'bod',          (select count(*) from bk where bod_uitgebracht),
      'nieuwsbrief',  (select count(*) from ak where nieuwsbrief),
      'via_beheer',   (select count(*) from ak where via_beheer),
      'capaciteit',   (select coalesce(sum(plaatsen), 0) from slots),
      'voorbij',      (select count(*) from ak where start <= now())
    ),
    'per_dag', (
      select coalesce(json_agg(json_build_object(
        'dag', dagen.dag,
        'weergaven', (select count(*) from wg where gebeurtenis = 'bekeken'
                        and (created_at at time zone 'Europe/Brussels')::date = dagen.dag),
        'boekingen', (select count(*) from bk where (created_at at time zone 'Europe/Brussels')::date = dagen.dag)
      ) order by dagen.dag), '[]'::json)
      from dagen
    ),
    'per_uur', (
      select coalesce(json_agg(json_build_object('uur', u.uur, 'capaciteit', u.capaciteit, 'geboekt', u.geboekt)
                               order by u.uur), '[]'::json)
      from (
        select x.uur, sum(x.plaatsen)::int as capaciteit,
               (select count(*) from ak
                 where to_char(ak.start at time zone 'Europe/Brussels', 'HH24:MI') = x.uur)::int as geboekt
        from (select to_char(s.start at time zone 'Europe/Brussels', 'HH24:MI') as uur, s.plaatsen from slots s) x
        group by x.uur
      ) u
    ),
    'per_homerundag', (
      select coalesce(json_agg(json_build_object(
        'dag', h.dag, 'capaciteit', h.capaciteit, 'geboekt', h.geboekt, 'geannuleerd', h.geannuleerd,
        'van', h.van, 'tot', h.tot) order by h.dag), '[]'::json)
      from (
        select x.dag, sum(x.plaatsen)::int as capaciteit, min(x.start) as van, max(x.start) as tot,
               (select count(*) from ak where (ak.start at time zone 'Europe/Brussels')::date = x.dag)::int as geboekt,
               (select count(*) from bk where bk.status = 'geannuleerd'
                  and (bk.start at time zone 'Europe/Brussels')::date = x.dag)::int as geannuleerd
        from (select (s.start at time zone 'Europe/Brussels')::date as dag, s.start, s.plaatsen from slots s) x
        group by x.dag
      ) h
    ),
    'bronnen', (
      select coalesce(json_agg(json_build_object('label', b.label, 'aantal', b.aantal) order by b.aantal desc, b.label), '[]'::json)
      from (select coalesce(nullif(trim(antwoorden->>'bron'), ''), 'Niet ingevuld') as label, count(*)::int as aantal
            from ak group by 1) b
    ),
    'kanalen', (
      select coalesce(json_agg(json_build_object('label', k.label, 'aantal', k.aantal) order by k.aantal desc, k.label), '[]'::json)
      from (select coalesce(kanaal, 'direct') as label, count(*)::int as aantal
            from wg where gebeurtenis = 'bekeken' group by 1) k
    ),
    'apparaten', (
      select coalesce(json_agg(json_build_object('label', a.label, 'aantal', a.aantal) order by a.aantal desc), '[]'::json)
      from (select coalesce(apparaat, 'onbekend') as label, count(*)::int as aantal
            from wg where gebeurtenis = 'bekeken' group by 1) a
    ),
    'doorlooptijd', (
      select coalesce(json_agg(json_build_object('label', t.label, 'aantal', t.aantal) order by t.volgorde), '[]'::json)
      from (
        select v.volgorde, v.label,
               (select count(*) from ak
                 where extract(epoch from (ak.start - ak.created_at)) / 86400 >= v.van
                   and extract(epoch from (ak.start - ak.created_at)) / 86400 <  v.tot)::int as aantal
        from (values (1, 'Zelfde dag', -1e9, 1), (2, '1 dag', 1, 2), (3, '2 à 3 dagen', 2, 4),
                     (4, '4 à 7 dagen', 4, 8), (5, 'Meer dan een week', 8, 1e9)) v(volgorde, label, van, tot)
      ) t
    )
  );
$$;
revoke all on function public.statistiek(uuid) from public, anon, authenticated;

create function public.beheer_statistiek(p_pagina_id uuid) returns json
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;
  return statistiek(p_pagina_id);
end $$;
revoke all on function public.beheer_statistiek(uuid) from public, anon;
grant execute on function public.beheer_statistiek(uuid) to authenticated, service_role;

-- Verkopersrapport: cijfers zonder persoonsgegevens, via de geheime link.
create function public.rapport_publiek(p_token uuid) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_pagina paginas;
  v_stat   json;
begin
  select * into v_pagina from paginas where rapport_token = p_token;
  if not found then
    return null;
  end if;
  v_stat := statistiek(v_pagina.id);
  return json_build_object(
    'adres', v_pagina.adres, 'titel', v_pagina.titel, 'foto_pad', v_pagina.foto_pad,
    'kickoff_prijs', v_pagina.kickoff_prijs, 'eigenaar_naam', v_pagina.eigenaar_naam,
    'bijgewerkt', now(),
    'kpi', json_build_object(
      'weergaven',   v_stat -> 'kpi' -> 'weergaven',
      'bezoekers',   v_stat -> 'kpi' -> 'bezoekers',
      'actief',      v_stat -> 'kpi' -> 'actief',
      'geannuleerd', v_stat -> 'kpi' -> 'geannuleerd',
      'capaciteit',  v_stat -> 'kpi' -> 'capaciteit',
      'geweest',     v_stat -> 'kpi' -> 'geweest',
      'voorbij',     v_stat -> 'kpi' -> 'voorbij'
    ),
    'per_dag', v_stat -> 'per_dag',
    'per_homerundag', v_stat -> 'per_homerundag',
    'bronnen', v_stat -> 'bronnen'
  );
end $$;
revoke all on function public.rapport_publiek(uuid) from public;
grant execute on function public.rapport_publiek(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Overzicht van alle pagina's (vervangt de versie uit 20261019000000_beheer)
-- ---------------------------------------------------------------------------

drop function public.beheer_overzicht();

create function public.beheer_overzicht()
returns table (
  id uuid, slug text, titel text, adres text, actief boolean, gearchiveerd boolean,
  foto_pad text, kickoff_prijs int,
  eerste_dag date, laatste_dag date, dagen int,                    -- komende dagen
  vrije_slots int, boekingen int, volgende_boeking timestamptz,      -- komende boekingen
  eerste_dag_ooit date, laatste_dag_ooit date,
  capaciteit int, geboekt int, geannuleerd int, weergaven int,
  fase text                                                        -- komend | nieuw | afgelopen | archief
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;

  return query
  select p.id, p.slug, p.titel, p.adres, p.actief, p.gearchiveerd, p.foto_pad, p.kickoff_prijs,
         s.eerste, s.laatste, s.aantal,
         (case when p.actief then (select count(*) from vrije_slots(p.slug)) else 0 end)::int,
         (select count(*) from boekingen bk
           where bk.pagina_id = p.id and bk.status = 'bevestigd' and bk.start >= now())::int,
         (select min(bk.start) from boekingen bk
           where bk.pagina_id = p.id and bk.status = 'bevestigd' and bk.start >= now()),
         s.eerste_ooit, s.laatste_ooit, s.capaciteit,
         (select count(*) from boekingen bk where bk.pagina_id = p.id and bk.status <> 'geannuleerd')::int,
         (select count(*) from boekingen bk where bk.pagina_id = p.id and bk.status = 'geannuleerd')::int,
         (select count(*) from weergaven w where w.pagina_id = p.id and w.gebeurtenis = 'bekeken')::int,
         case
           when p.gearchiveerd then 'archief'
           when s.aantal > 0 then 'komend'
           when s.eerste_ooit is null then 'nieuw'
           else 'afgelopen'
         end
  from paginas p
  cross join lateral (
    select min(d) filter (where toekomst) as eerste,
           max(d) filter (where toekomst) as laatste,
           (count(distinct d) filter (where toekomst))::int as aantal,
           min(d) as eerste_ooit, max(d) as laatste_ooit,
           coalesce(sum(plaatsen), 0)::int as capaciteit
    from (select (a.start at time zone 'Europe/Brussels')::date as d, a.start > now() as toekomst, a.plaatsen
          from alle_slots(p.id) a) x
  ) s
  order by (p.gearchiveerd), (s.aantal = 0), s.eerste, s.laatste_ooit desc nulls first, p.adres;
end $$;

revoke all on function public.beheer_overzicht() from public, anon;
grant execute on function public.beheer_overzicht() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Dashboard: de dag van vandaag, komende Homeruns en wat aandacht vraagt
-- ---------------------------------------------------------------------------

create function public.beheer_dashboard() returns json
language plpgsql stable security definer set search_path = public as $$
declare
  v_vandaag date := (now() at time zone 'Europe/Brussels')::date;
  v json;
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;

  with slots as (
    select p.id as pagina_id, a.start, a.plaatsen
    from paginas p cross join lateral alle_slots(p.id) a
    where not p.gearchiveerd
  )
  select json_build_object(
    'kpi', json_build_object(
      'bezoeken_vandaag', (select count(*) from boekingen where status = 'bevestigd'
                             and (start at time zone 'Europe/Brussels')::date = v_vandaag),
      'bezoeken_7d',      (select count(*) from boekingen where status = 'bevestigd'
                             and start >= now() and start < now() + interval '7 days'),
      'boekingen_30d',    (select count(*) from boekingen where created_at >= now() - interval '30 days'),
      'boekingen_vorige', (select count(*) from boekingen where created_at >= now() - interval '60 days'
                             and created_at < now() - interval '30 days'),
      'weergaven_30d',    (select count(*) from weergaven where gebeurtenis = 'bekeken'
                             and created_at >= now() - interval '30 days'),
      'weergaven_vorige', (select count(*) from weergaven where gebeurtenis = 'bekeken'
                             and created_at >= now() - interval '60 days' and created_at < now() - interval '30 days'),
      'bezoekers_30d',    (select count(distinct bezoeker || (created_at at time zone 'Europe/Brussels')::date)
                             from weergaven where gebeurtenis = 'bekeken' and created_at >= now() - interval '30 days')
    ),
    'homeruns', (
      select coalesce(json_agg(h order by h.dag, h.adres), '[]'::json) from (
        select p.id as pagina_id, p.slug, p.adres, p.titel, p.foto_pad, d.dag, d.capaciteit, d.van, d.tot,
               (select count(*) from boekingen bk where bk.pagina_id = p.id and bk.status <> 'geannuleerd'
                  and (bk.start at time zone 'Europe/Brussels')::date = d.dag)::int as geboekt
        from (
          select pagina_id, (start at time zone 'Europe/Brussels')::date as dag,
                 sum(plaatsen)::int as capaciteit, min(start) as van, max(start) as tot
          from slots
          where (start at time zone 'Europe/Brussels')::date >= v_vandaag
          group by 1, 2
        ) d
        join paginas p on p.id = d.pagina_id
        order by d.dag, p.adres
        limit 8
      ) h
    ),
    'vandaag_morgen', (
      select coalesce(json_agg(json_build_object(
        'id', bk.id, 'pagina_id', bk.pagina_id, 'adres', p.adres, 'start', bk.start,
        'voornaam', bk.voornaam, 'familienaam', bk.familienaam, 'telefoon', bk.telefoon, 'email', bk.email
      ) order by bk.start), '[]'::json)
      from boekingen bk join paginas p on p.id = bk.pagina_id
      where bk.status = 'bevestigd'
        and (bk.start at time zone 'Europe/Brussels')::date in (v_vandaag, v_vandaag + 1)
    ),
    'recent', (
      select coalesce(json_agg(r order by r.created_at desc), '[]'::json) from (
        select bk.id, bk.pagina_id, p.adres, bk.voornaam, bk.familienaam, bk.start, bk.created_at,
               bk.status, bk.via_beheer, bk.antwoorden ->> 'bron' as bron
        from boekingen bk join paginas p on p.id = bk.pagina_id
        order by bk.created_at desc
        limit 8
      ) r
    ),
    'aandacht', json_build_object(
      'mislukt', (
        select coalesce(json_agg(json_build_object(
          'boeking_id', m.boeking_id, 'pagina_id', bk.pagina_id, 'adres', p.adres, 'soort', m.soort,
          'ontvanger', m.ontvanger, 'fout', m.fout, 'gepland_op', m.gepland_op) order by m.gepland_op desc), '[]'::json)
        from berichten m join boekingen bk on bk.id = m.boeking_id join paginas p on p.id = bk.pagina_id
        where m.status = 'mislukt' and m.gepland_op > now() - interval '30 days'
      ),
      'vastgelopen', (select count(*) from berichten
                        where status in ('wachtrij', 'bezig') and pogingen < 5 and gepland_op < now() - interval '15 minutes'),
      'zonder_data', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres) order by p.created_at desc), '[]'::json)
        from paginas p
        where not p.gearchiveerd and not exists (select 1 from beschikbaarheid b where b.pagina_id = p.id)
      ),
      'zonder_eigenaar', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres)), '[]'::json)
        from paginas p
        where not p.gearchiveerd and coalesce(trim(p.eigenaar_email), '') = ''
          and exists (select 1 from slots s where s.pagina_id = p.id and s.start > now())
      ),
      'zonder_foto', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres)), '[]'::json)
        from paginas p
        where not p.gearchiveerd and p.foto_pad is null
          and exists (select 1 from slots s where s.pagina_id = p.id and s.start > now())
      )
    )
  ) into v;
  return v;
end $$;

revoke all on function public.beheer_dashboard() from public, anon;
grant execute on function public.beheer_dashboard() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Beheeracties: afspraak toevoegen en verplaatsen
-- ---------------------------------------------------------------------------

create function public.beheer_boek(
  p_pagina_id uuid, p_start timestamptz, p_antwoorden jsonb, p_mail boolean default true
) returns public.boekingen
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;
  select slug into v_slug from paginas where id = p_pagina_id;
  return maak_boeking(v_slug, p_start, p_antwoorden,
    jsonb_build_object('via_beheer', true, 'mail_bezoeker', p_mail, 'kanaal', 'beheer'));
end $$;
revoke all on function public.beheer_boek(uuid, timestamptz, jsonb, boolean) from public, anon;
grant execute on function public.beheer_boek(uuid, timestamptz, jsonb, boolean) to authenticated, service_role;

create function public.beheer_verplaats(
  p_boeking_id uuid, p_start timestamptz, p_mail boolean default true
) returns public.boekingen
language plpgsql security definer set search_path = public as $$
declare
  v_boeking boekingen;
  v_pagina  paginas;
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;

  select * into v_boeking from boekingen where id = p_boeking_id for update;
  if not found then
    raise exception 'boeking_niet_gevonden' using errcode = 'P0002';
  end if;
  if v_boeking.status <> 'bevestigd' then
    raise exception 'niet_bevestigd' using errcode = 'P0001';
  end if;
  if v_boeking.start = p_start then
    return v_boeking;
  end if;

  select * into v_pagina from paginas where id = v_boeking.pagina_id for update;
  if p_start <= now() or not exists (
    select 1 from alle_slots(v_pagina.id) a
    where a.start = p_start
      and a.plaatsen > (select count(*) from boekingen x
                        where x.pagina_id = v_pagina.id and x.status = 'bevestigd' and x.start = p_start)
  ) then
    raise exception 'slot_niet_vrij' using errcode = 'P0001';
  end if;

  update boekingen
     set start = p_start,
         eind = p_start + make_interval(mins => v_pagina.duur_min),
         verplaatst_op = now(),
         ics_volgnummer = ics_volgnummer + 1
   where id = v_boeking.id
  returning * into v_boeking;

  update berichten set status = 'geannuleerd'
   where boeking_id = v_boeking.id and soort = 'reminder' and status = 'wachtrij';

  if v_pagina.reminder_uren_vooraf is not null
     and v_boeking.start - make_interval(hours => v_pagina.reminder_uren_vooraf) > now() then
    insert into berichten (boeking_id, soort, ontvanger, gepland_op)
    values (v_boeking.id, 'reminder', v_boeking.email,
            v_boeking.start - make_interval(hours => v_pagina.reminder_uren_vooraf));
  end if;

  if p_mail then
    insert into berichten (boeking_id, soort, ontvanger) values (v_boeking.id, 'verplaatst', v_boeking.email);
  end if;

  return v_boeking;
end $$;
revoke all on function public.beheer_verplaats(uuid, timestamptz, boolean) from public, anon;
grant execute on function public.beheer_verplaats(uuid, timestamptz, boolean) to authenticated, service_role;

-- Vrije slots voor het beheer: elk toekomstig slot met plaats, ook kort op voorhand.
create function public.beheer_slots(p_pagina_id uuid)
returns table (start timestamptz, plaatsen int, vrij int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;
  return query
  select a.start, a.plaatsen,
         (a.plaatsen - (select count(*) from boekingen x
                        where x.pagina_id = p_pagina_id and x.status = 'bevestigd' and x.start = a.start))::int
  from alle_slots(p_pagina_id) a
  where a.start > now()
  order by a.start;
end $$;
revoke all on function public.beheer_slots(uuid) from public, anon;
grant execute on function public.beheer_slots(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Foto's: publieke bucket, alleen beheerders laden op of verwijderen.
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy fotos_beheer_lezen on storage.objects
  for select to authenticated using (bucket_id = 'fotos' and public.is_beheerder());
create policy fotos_beheer_opladen on storage.objects
  for insert to authenticated with check (bucket_id = 'fotos' and public.is_beheerder());
create policy fotos_beheer_wijzigen on storage.objects
  for update to authenticated using (bucket_id = 'fotos' and public.is_beheerder());
create policy fotos_beheer_verwijderen on storage.objects
  for delete to authenticated using (bucket_id = 'fotos' and public.is_beheerder());
