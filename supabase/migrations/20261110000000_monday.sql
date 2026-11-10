-- Koppeling met Monday: elk dossier op het bord "Henry Houser alle dossiers" met een
-- ingevulde "url website" krijgt automatisch een boekingspagina als concept. Bezoekers
-- zien die pas na het publiceren in het beheer (bezoekduur, foto, bezoekdagen nagekeken).
-- De edge function "monday" leest het bord (pg_cron, elke 10 minuten) en geeft de
-- dossiers door aan monday_verwerk(); alle regels staan hier.

alter table public.paginas
  add column concept           boolean not null default false,  -- aangemaakt uit Monday, nog niet gepubliceerd
  add column bezoek_ingesteld  boolean not null default true,   -- duur en interval nagekeken (false bij een concept)
  add column monday_item_id    bigint unique,
  add column monday_status     text,                            -- kolom "status dossier"
  add column monday_groep      text,
  add column monday_gegevens   jsonb,                           -- alle kolommen: {titel: tekst}
  add column monday_gezien_op  timestamptz,                     -- laatste keer gezien op het bord
  add column monday_bezoekdag  date,                            -- kolom "Bezoekdag": voorstel bij het inplannen
  add column makelaar          text;

-- Eén rij: hoe liep de laatste keer bijwerken uit Monday?
create table public.monday_sync (
  id            int primary key default 1 check (id = 1),
  geprobeerd_op timestamptz,
  gelukt_op     timestamptz,
  fout          text,
  dossiers      int,
  nieuw         int
);
insert into public.monday_sync (id) values (1);
alter table public.monday_sync enable row level security;
create policy beheer_monday_sync_lezen on public.monday_sync
  for select to authenticated using (is_beheerder());

-- ---------------------------------------------------------------------------
-- Hulpfuncties: link en adres uit een dossier
-- ---------------------------------------------------------------------------

-- "Burgemeester Pyckestraat 29 in 8500 Kortrijk" -> "Burgemeester Pyckestraat 29, 8500 Kortrijk"
create function public.monday_adres(p_naam text) returns text
language sql immutable as $$
  select case
    when m is null then btrim(p_naam)
    else btrim(m[1]) || ', ' || btrim(m[2])
  end
  from (select regexp_match(btrim(p_naam), '^(.*\S)\s+in\s+(\S.*)$', 'i') as m) x;
$$;

-- Zonder accenten, kleine letters, alleen a-z, 0-9 en streepjes.
create function public.monday_slug_tekst(p text) returns text
language sql immutable as $$
  select btrim(regexp_replace(lower(translate(coalesce(p, ''),
    'áàâäãåçéèêëíìîïñóòôöõúùûüýÿÁÀÂÄÃÅÇÉÈÊËÍÌÎÏÑÓÒÔÖÕÚÙÛÜÝ',
    'aaaaaaceeeeiiiinooooouuuuyyAAAAAACEEEEIIIINOOOOOUUUUY')), '[^a-z0-9]+', '-', 'g'), '-');
$$;

-- Link van de pagina: de domeinnaam van de pandsite (www.pyckestraat29.be -> pyckestraat29),
-- anders de straat zonder streepjes (zoals bij een nieuw adres in het beheer).
create function public.monday_slug(p_url text, p_adres text) returns text
language sql immutable as $$
  select coalesce(
    case when host is not null and host !~ 'henryhouser' and host ~ '\.'
      then nullif(monday_slug_tekst(regexp_replace(host, '\.[a-z]+$', '')), '') end,
    nullif(replace(monday_slug_tekst(split_part(p_adres, ',', 1)), '-', ''), ''),
    'pand')
  from (select lower(nullif(substring(btrim(coalesce(p_url, ''))
          from '^(?:[a-z]+://)?(?:www\.)?([^/:?#\s]+)'), '')) as host) x;
$$;

-- ---------------------------------------------------------------------------
-- Dossiers verwerken. p_items: [{id, naam, groep, status, url, klant, makelaar, email,
-- bezoekdag, kickoff, gegevens}]. Een nieuwe pagina komt er voor een dossier met een url
-- dat in voorbereiding is, of te koop staat met een bezoekdag die nog moet komen (zo
-- krijgen oude dossiers die nog op te koop staan geen pagina).
-- ---------------------------------------------------------------------------

-- "425.000", "€ 425 000" -> 425000; "305 + 25" of "op aanvraag" -> null
create function public.monday_prijs(p text) returns int
language sql immutable as $$
  select case when x ~ '^\d{5,9}$' then x::int end
  from (select regexp_replace(coalesce(p, ''), '[\s.€]|,-|eur(o)?', '', 'gi') as x) y;
$$;

create function public.monday_verwerk(p_items jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item     jsonb;
  v_id       bigint;
  v_url      text;
  v_adres    text;
  v_slug     text;
  v_basis    text;
  v_n        int;
  v_pagina   uuid;
  v_sjabloon jsonb;
  v_nieuw    int := 0;
  v_gekoppeld int := 0;
  v_bijgewerkt int := 0;
  v_status   text;
  v_dag      date;
  v_vandaag  date := (now() at time zone 'Europe/Brussels')::date;
begin
  -- Instellingen (formulier, teksten, mails) komen van het laatst aangemaakte gepubliceerde adres.
  select to_jsonb(p) into v_sjabloon from paginas p
  where not p.concept
  order by p.created_at desc limit 1;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_id := (v_item ->> 'id')::bigint;
    v_url := nullif(btrim(v_item ->> 'url'), '');
    if v_url !~ '^\S+\.[a-z]{2,}(/\S*)?$' then
      v_url := null;  -- geen webadres, bv. "in te plannen"
    end if;
    if v_url is not null and v_url !~* '^https?://' then
      v_url := 'https://' || v_url;
    end if;
    v_status := lower(coalesce(v_item ->> 'status', ''));
    v_dag := case when v_item ->> 'bezoekdag' ~ '^\d{4}-\d{2}-\d{2}' then left(v_item ->> 'bezoekdag', 10)::date end;

    update paginas set
      monday_status    = nullif(btrim(v_item ->> 'status'), ''),
      monday_groep     = nullif(btrim(v_item ->> 'groep'), ''),
      monday_gegevens  = v_item -> 'gegevens',
      monday_gezien_op = now(),
      monday_bezoekdag = v_dag,
      makelaar         = nullif(btrim(v_item ->> 'makelaar'), ''),
      -- Wat in het beheer al ingevuld is, blijft staan.
      kickoff_prijs  = coalesce(kickoff_prijs, monday_prijs(v_item ->> 'kickoff')),
      pand_url       = coalesce(nullif(btrim(pand_url), ''), v_url),
      eigenaar_naam  = coalesce(nullif(btrim(eigenaar_naam), ''), nullif(btrim(v_item ->> 'klant'), '')),
      eigenaar_email = coalesce(nullif(btrim(eigenaar_email), ''), nullif(btrim(v_item ->> 'email'), ''))
    where monday_item_id = v_id;
    if found then
      v_bijgewerkt := v_bijgewerkt + 1;
      continue;
    end if;

    -- Nog geen pagina: pas aanmaken zodra er een url is en het dossier loopt.
    if v_url is null or not (
      v_status like '%voorbereiding%' or (v_status like '%te koop%' and coalesce(v_dag >= v_vandaag, false))
    ) then
      continue;
    end if;

    v_adres := monday_adres(v_item ->> 'naam');
    v_basis := monday_slug(v_url, v_adres);

    -- Bestaat er al een gewone pagina voor dit pand (zelfde link of pandsite)? Dan koppelen.
    select id into v_pagina from paginas
    where monday_item_id is null
      and (slug = v_basis or monday_slug(pand_url, '') = v_basis)
    order by gearchiveerd, created_at desc limit 1;
    if found then
      update paginas set
        monday_item_id = v_id,
        monday_status = nullif(btrim(v_item ->> 'status'), ''),
        monday_groep = nullif(btrim(v_item ->> 'groep'), ''),
        monday_gegevens = v_item -> 'gegevens',
        monday_gezien_op = now(),
        monday_bezoekdag = v_dag,
        makelaar = nullif(btrim(v_item ->> 'makelaar'), ''),
        kickoff_prijs = coalesce(kickoff_prijs, monday_prijs(v_item ->> 'kickoff')),
        pand_url = coalesce(nullif(btrim(pand_url), ''), v_url),
        eigenaar_naam = coalesce(nullif(btrim(eigenaar_naam), ''), nullif(btrim(v_item ->> 'klant'), '')),
        eigenaar_email = coalesce(nullif(btrim(eigenaar_email), ''), nullif(btrim(v_item ->> 'email'), ''))
      where id = v_pagina;
      v_gekoppeld := v_gekoppeld + 1;
      continue;
    end if;

    v_slug := v_basis;
    v_n := 1;
    while exists (select 1 from paginas where slug = v_slug) loop
      v_n := v_n + 1;
      v_slug := v_basis || '-' || v_n;
    end loop;

    insert into paginas
    select (jsonb_populate_record(null::paginas,
      coalesce(v_sjabloon, '{}'::jsonb)
      - 'foto_pad' - 'kickoff_prijs' - 'eigenaar_email' - 'eigenaar_naam' - 'pand_url'
      || jsonb_build_object(
        'id', gen_random_uuid(), 'rapport_token', gen_random_uuid(),
        'created_at', now(), 'updated_at', now(),
        'slug', v_slug, 'adres', v_adres, 'titel', 'Homerun in ' || btrim(v_item ->> 'naam'),
        'actief', false, 'concept', true, 'bezoek_ingesteld', false, 'gearchiveerd', false,
        'pand_url', v_url,
        'kickoff_prijs', monday_prijs(v_item ->> 'kickoff'),
        'monday_bezoekdag', v_dag,
        'eigenaar_naam', nullif(btrim(v_item ->> 'klant'), ''),
        'eigenaar_email', nullif(btrim(v_item ->> 'email'), ''),
        'monday_item_id', v_id,
        'monday_status', nullif(btrim(v_item ->> 'status'), ''),
        'monday_groep', nullif(btrim(v_item ->> 'groep'), ''),
        'monday_gegevens', v_item -> 'gegevens',
        'monday_gezien_op', now(),
        'makelaar', nullif(btrim(v_item ->> 'makelaar'), '')
      ))).*;
    v_nieuw := v_nieuw + 1;
  end loop;

  update monday_sync set
    geprobeerd_op = now(), gelukt_op = now(), fout = null,
    dossiers = jsonb_array_length(coalesce(p_items, '[]'::jsonb)), nieuw = v_nieuw
  where id = 1;

  return json_build_object('nieuw', v_nieuw, 'gekoppeld', v_gekoppeld, 'bijgewerkt', v_bijgewerkt);
end $$;

create function public.monday_fout(p_fout text) returns void
language sql security definer set search_path = public as $$
  update monday_sync set geprobeerd_op = now(), fout = left(p_fout, 500) where id = 1;
$$;

revoke all on function public.monday_adres(text) from public, anon;
revoke all on function public.monday_prijs(text) from public, anon;
revoke all on function public.monday_verwerk(jsonb) from public, anon, authenticated;
revoke all on function public.monday_fout(text) from public, anon, authenticated;
grant execute on function public.monday_verwerk(jsonb) to service_role;
grant execute on function public.monday_fout(text) to service_role;

-- ---------------------------------------------------------------------------
-- Bezoekerspagina: een concept toont "binnenkort", zonder startmomenten.
-- ---------------------------------------------------------------------------

create or replace function public.pagina_publiek(p_slug text) returns json
language sql stable security definer set search_path = public as $$
  select case when p.actief then json_build_object(
    'slug', p.slug, 'titel', p.titel, 'adres', p.adres, 'intro', p.intro,
    'duur_min', p.duur_min, 'formuliervelden', p.formuliervelden,
    'foto_pad', p.foto_pad, 'kickoff_prijs', p.kickoff_prijs, 'pand_url', p.pand_url,
    'komende_dagen', coalesce((
      select json_agg(d.dag order by d.dag)
      from (select distinct (a.start at time zone 'Europe/Brussels')::date as dag
            from alle_slots(p.id) a where a.start > now()) d
    ), '[]'::json)
  ) else json_build_object(
    'slug', p.slug, 'titel', p.titel, 'adres', p.adres, 'foto_pad', p.foto_pad,
    'pand_url', p.pand_url, 'concept', true
  ) end
  from paginas p where p.slug = p_slug and (p.actief or (p.concept and not p.gearchiveerd));
$$;

-- ---------------------------------------------------------------------------
-- Overzicht: nieuwe fase "concept" en de status in Monday
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
  fase text,                                                       -- concept | komend | nieuw | afgelopen | archief
  concept boolean, monday_status text, monday_groep text, monday_bezoekdag date, makelaar text, created_at timestamptz
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
           when p.concept then 'concept'
           when s.aantal > 0 then 'komend'
           when s.eerste_ooit is null then 'nieuw'
           else 'afgelopen'
         end,
         p.concept, p.monday_status, p.monday_groep, p.monday_bezoekdag, p.makelaar, p.created_at
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
-- Elke 10 minuten bijwerken uit Monday (zelfde geheim als de mailwachtrij).
-- De URL staat in de vault als monday_url.
-- ---------------------------------------------------------------------------

select cron.schedule('monday-bijwerken', '*/10 * * * *', $cron$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'monday_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_geheim')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000);
$cron$);

-- ---------------------------------------------------------------------------
-- Dashboard: concepten uit Monday en fouten bij het bijwerken vragen aandacht
-- ---------------------------------------------------------------------------

create or replace function public.beheer_dashboard()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      'concepten', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres, 'monday_status', p.monday_status,
                 'te_koop', coalesce(p.monday_status, '') ilike '%te koop%') order by p.created_at desc), '[]'::json)
        from paginas p
        where p.concept and not p.gearchiveerd
      ),
      'monday_fout', (select fout from monday_sync where id = 1),
      'zonder_data', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres) order by p.created_at desc), '[]'::json)
        from paginas p
        where not p.gearchiveerd and not p.concept and not exists (select 1 from beschikbaarheid b where b.pagina_id = p.id)
      ),
      'zonder_eigenaar', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres)), '[]'::json)
        from paginas p
        where not p.gearchiveerd and not p.concept and coalesce(trim(p.eigenaar_email), '') = ''
          and exists (select 1 from slots s where s.pagina_id = p.id and s.start > now())
      ),
      'zonder_foto', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres)), '[]'::json)
        from paginas p
        where not p.gearchiveerd and not p.concept and p.foto_pad is null
          and exists (select 1 from slots s where s.pagina_id = p.id and s.start > now())
      )
    )
  ) into v;
  return v;
end $function$;
