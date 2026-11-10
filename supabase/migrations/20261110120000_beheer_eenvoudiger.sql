-- Beheer eenvoudiger:
--  1. De Homerun-dag komt uit Monday: elke pagina met een bezoekdag in Monday krijgt die dag
--     automatisch ingepland (09:00 tot 19:00). Verschuift de dag in Monday en heeft nog niemand
--     geboekt, dan schuift de dag mee. Met de hand aanpassen kan altijd; dat blijft staan.
--  2. Standaard bezoeken van 40 minuten, om de 40 minuten: niets meer te "bevestigen".
--  3. Zo weinig mogelijk persoonsgegevens: geen naam of e-mailadres van de verkoper meer (en dus
--     ook geen melding aan de verkoper), en uit Monday alleen kolommen zonder persoonsgegevens.
--     Het verkopersrapport blijft: de link bezorg je de verkoper zelf.

-- ---------------------------------------------------------------------------
-- Kolommen
-- ---------------------------------------------------------------------------

alter table public.beschikbaarheid
  add column uit_monday boolean not null default false;   -- automatisch ingepland uit Monday

alter table public.paginas
  add column monday_dag_ingepland date;                    -- de Monday-bezoekdag die laatst ingepland werd

-- ---------------------------------------------------------------------------
-- Hulpfuncties
-- ---------------------------------------------------------------------------

-- Kolommen uit Monday zonder persoonsgegevens (naam klant, notaris, e-mail, telefoon...).
create function public.monday_veilig(p jsonb) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(key, value), '{}'::jsonb)
  from jsonb_each(case when jsonb_typeof(p) = 'object' then p else '{}'::jsonb end)
  where key !~* '(klant|verkoper|eigenaar|notaris|mail|telefoon|gsm|rekening|iban|rijksregister)';
$$;

-- "zaterdag 14/11" -> 2026-11-14 (het eerstvolgende jaar waarin die dag nog niet lang voorbij is).
-- Alleen als terugval wanneer de datumkolom "Bezoekdag" leeg is; "op afspraak" -> null.
create function public.monday_homerun_dag(p text, p_vandaag date) returns date
language plpgsql immutable as $$
declare
  m text[] := regexp_match(coalesce(p, ''), '(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?');
  v_jaar int;
  v_dag date;
begin
  if m is null then
    return null;
  end if;
  v_jaar := case when m[3] is null then extract(year from p_vandaag)::int
                 when length(m[3]) = 2 then 2000 + m[3]::int else m[3]::int end;
  v_dag := make_date(v_jaar, m[2]::int, m[1]::int);
  if m[3] is null and v_dag < p_vandaag - 60 then
    v_dag := v_dag + interval '1 year';
  end if;
  return v_dag;
exception when others then
  return null;
end $$;

-- De bezoekdag uit Monday inplannen (zie 1. bovenaan). Doet alleen iets als de dag in Monday
-- veranderde sinds de vorige keer, zodat een dag die je met de hand verwijdert of aanpast, zo blijft.
create function public.monday_plan_bezoekdag(p_pagina uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_p       paginas;
  v_rij     beschikbaarheid;
  v_vandaag date := (now() at time zone 'Europe/Brussels')::date;
begin
  select * into v_p from paginas where id = p_pagina;
  if not found or v_p.gearchiveerd or v_p.monday_bezoekdag is null or v_p.monday_bezoekdag < v_vandaag
     or v_p.monday_bezoekdag is not distinct from v_p.monday_dag_ingepland then
    return;
  end if;

  -- Een eerdere bezoekdag uit Monday die nog moet komen en waarop niemand geboekt heeft, schuift mee.
  select b.* into v_rij from beschikbaarheid b
  where b.pagina_id = p_pagina and b.uit_monday and b.datum_tot >= v_vandaag
    and not exists (select 1 from boekingen bk
                    where bk.pagina_id = p_pagina and bk.status <> 'geannuleerd'
                      and (bk.start at time zone 'Europe/Brussels')::date between b.datum_van and b.datum_tot)
  order by b.datum_van
  limit 1;

  if exists (select 1 from beschikbaarheid b
             where b.pagina_id = p_pagina
               and v_p.monday_bezoekdag between b.datum_van and b.datum_tot
               and extract(isodow from v_p.monday_bezoekdag)::int = any (b.weekdagen)) then
    -- Al ingepland. Een oude Monday-dag zonder afspraken is dan overbodig.
    if v_rij.id is not null and not (v_p.monday_bezoekdag between v_rij.datum_van and v_rij.datum_tot) then
      delete from beschikbaarheid where id = v_rij.id;
    end if;
  elsif v_rij.id is not null then
    update beschikbaarheid set datum_van = v_p.monday_bezoekdag, datum_tot = v_p.monday_bezoekdag
    where id = v_rij.id;
  else
    insert into beschikbaarheid (pagina_id, datum_van, datum_tot, van, tot, uit_monday)
    values (p_pagina, v_p.monday_bezoekdag, v_p.monday_bezoekdag, '09:00', '19:00', true);
  end if;

  update paginas set monday_dag_ingepland = v_p.monday_bezoekdag where id = p_pagina;
end $$;

revoke all on function public.monday_veilig(jsonb) from public, anon;
revoke all on function public.monday_homerun_dag(text, date) from public, anon;
revoke all on function public.monday_plan_bezoekdag(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Dossiers verwerken (vervangt de versie uit 20261110000000_monday.sql)
-- p_items: [{id, naam, groep, status, url, makelaar, bezoekdag, homerun, kickoff, gegevens}]
-- ---------------------------------------------------------------------------

create or replace function public.monday_verwerk(p_items jsonb) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_item       jsonb;
  v_id         bigint;
  v_url        text;
  v_adres      text;
  v_slug       text;
  v_basis      text;
  v_n          int;
  v_pagina     uuid;
  v_sjabloon   jsonb;
  v_gegevens   jsonb;
  v_nieuw      int := 0;
  v_gekoppeld  int := 0;
  v_bijgewerkt int := 0;
  v_status     text;
  v_dag        date;
  v_vandaag    date := (now() at time zone 'Europe/Brussels')::date;
begin
  -- Teksten, formulier en mails komen van het laatst aangemaakte gepubliceerde adres.
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
    v_dag := coalesce(
      case when v_item ->> 'bezoekdag' ~ '^\d{4}-\d{2}-\d{2}' then left(v_item ->> 'bezoekdag', 10)::date end,
      monday_homerun_dag(coalesce(v_item ->> 'homerun', v_item -> 'gegevens' ->> 'Homerun'), v_vandaag));
    v_gegevens := monday_veilig(v_item -> 'gegevens');

    update paginas set
      monday_status    = nullif(btrim(v_item ->> 'status'), ''),
      monday_groep     = nullif(btrim(v_item ->> 'groep'), ''),
      monday_gegevens  = v_gegevens,
      monday_gezien_op = now(),
      monday_bezoekdag = v_dag,
      makelaar         = nullif(btrim(v_item ->> 'makelaar'), ''),
      -- Wat in het beheer al ingevuld is, blijft staan.
      kickoff_prijs    = coalesce(kickoff_prijs, monday_prijs(v_item ->> 'kickoff')),
      pand_url         = coalesce(nullif(btrim(pand_url), ''), v_url)
    where monday_item_id = v_id
    returning id into v_pagina;
    if found then
      perform monday_plan_bezoekdag(v_pagina);
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
        monday_item_id   = v_id,
        monday_status    = nullif(btrim(v_item ->> 'status'), ''),
        monday_groep     = nullif(btrim(v_item ->> 'groep'), ''),
        monday_gegevens  = v_gegevens,
        monday_gezien_op = now(),
        monday_bezoekdag = v_dag,
        makelaar         = nullif(btrim(v_item ->> 'makelaar'), ''),
        kickoff_prijs    = coalesce(kickoff_prijs, monday_prijs(v_item ->> 'kickoff')),
        pand_url         = coalesce(nullif(btrim(pand_url), ''), v_url)
      where id = v_pagina;
      perform monday_plan_bezoekdag(v_pagina);
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
      - 'foto_pad' - 'kickoff_prijs' - 'pand_url' - 'monday_dag_ingepland'
      || jsonb_build_object(
        'id', gen_random_uuid(), 'rapport_token', gen_random_uuid(),
        'created_at', now(), 'updated_at', now(),
        'slug', v_slug, 'adres', v_adres, 'titel', 'Homerun in ' || btrim(v_item ->> 'naam'),
        'actief', false, 'concept', true, 'gearchiveerd', false,
        -- Standaard: bezoeken van 40 minuten, om de 40 minuten, één bezoeker per startmoment.
        'duur_min', 40, 'slot_interval_min', 40, 'max_per_slot', 1,
        'pand_url', v_url,
        'kickoff_prijs', monday_prijs(v_item ->> 'kickoff'),
        'monday_item_id', v_id,
        'monday_status', nullif(btrim(v_item ->> 'status'), ''),
        'monday_groep', nullif(btrim(v_item ->> 'groep'), ''),
        'monday_gegevens', v_gegevens,
        'monday_gezien_op', now(),
        'monday_bezoekdag', v_dag,
        'makelaar', nullif(btrim(v_item ->> 'makelaar'), '')
      ))).*
    returning id into v_pagina;
    perform monday_plan_bezoekdag(v_pagina);
    v_nieuw := v_nieuw + 1;
  end loop;

  update monday_sync set
    geprobeerd_op = now(), gelukt_op = now(), fout = null,
    dossiers = jsonb_array_length(coalesce(p_items, '[]'::jsonb)), nieuw = v_nieuw
  where id = 1;

  return json_build_object('nieuw', v_nieuw, 'gekoppeld', v_gekoppeld, 'bijgewerkt', v_bijgewerkt);
end $$;

-- ---------------------------------------------------------------------------
-- Boeken: geen melding meer aan de verkoper (vervangt de versie uit 20261019120000_platform.sql)
-- ---------------------------------------------------------------------------

create or replace function public.maak_boeking(p_slug text, p_start timestamptz, p_antwoorden jsonb, p_meta jsonb default '{}'::jsonb)
returns boekingen
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

  if v_pagina.reminder_uren_vooraf is not null
     and v_boeking.start - make_interval(hours => v_pagina.reminder_uren_vooraf) > now() then
    insert into berichten (boeking_id, soort, ontvanger, gepland_op)
    values (v_boeking.id, 'reminder', v_boeking.email,
            v_boeking.start - make_interval(hours => v_pagina.reminder_uren_vooraf));
  end if;

  return v_boeking;
end $$;

-- ---------------------------------------------------------------------------
-- Verkopersrapport zonder naam van de verkoper
-- ---------------------------------------------------------------------------

create or replace function public.rapport_publiek(p_token uuid) returns json
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
    'kickoff_prijs', v_pagina.kickoff_prijs,
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

-- ---------------------------------------------------------------------------
-- Dashboard: wat er per concept nog ontbreekt, en een bezoekdag uit Monday die niet
-- (meer) ingepland is. Geen melding meer over het e-mailadres van de verkoper.
-- ---------------------------------------------------------------------------

create or replace function public.beheer_dashboard() returns json
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
        select p.id as pagina_id, p.slug, p.adres, p.titel, p.foto_pad, p.actief, p.concept, d.dag, d.capaciteit, d.van, d.tot,
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
        select coalesce(json_agg(json_build_object(
                 'id', p.id, 'adres', p.adres, 'monday_status', p.monday_status,
                 'te_koop', coalesce(p.monday_status, '') ilike '%te koop%',
                 'ontbreekt', array_remove(array[
                   case when p.foto_pad is null then 'foto' end,
                   case when not exists (select 1 from slots s where s.pagina_id = p.id and s.start > now()) then 'bezoekdag' end
                 ], null)
               ) order by p.created_at desc), '[]'::json)
        from paginas p
        where p.concept and not p.gearchiveerd
      ),
      'monday_fout', (select fout from monday_sync where id = 1),
      'bezoekdag_monday', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres, 'dag', p.monday_bezoekdag)
                 order by p.monday_bezoekdag), '[]'::json)
        from paginas p
        where not p.gearchiveerd and p.monday_bezoekdag >= v_vandaag
          and not exists (select 1 from beschikbaarheid b
                          where b.pagina_id = p.id and p.monday_bezoekdag between b.datum_van and b.datum_tot
                            and extract(isodow from p.monday_bezoekdag)::int = any (b.weekdagen))
      ),
      'zonder_data', (
        select coalesce(json_agg(json_build_object('id', p.id, 'adres', p.adres) order by p.created_at desc), '[]'::json)
        from paginas p
        where not p.gearchiveerd and not p.concept and not exists (select 1 from beschikbaarheid b where b.pagina_id = p.id)
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
end $$;

-- ---------------------------------------------------------------------------
-- Opruimen
-- ---------------------------------------------------------------------------

-- Persoonsgegevens van de verkoper en de melding aan de verkoper.
alter table public.paginas
  drop column eigenaar_naam,
  drop column eigenaar_email,
  drop column mail_eigenaar;

-- "Bezoekduur bevestigen" bestaat niet meer: 40 minuten is de standaard.
alter table public.paginas drop column bezoek_ingesteld;

-- Wat al uit Monday gelezen werd, zonder persoonsgegevens.
update public.paginas set monday_gegevens = monday_veilig(monday_gegevens) where monday_gegevens is not null;

-- De bezoekdagen uit Monday meteen inplannen voor de bestaande pagina's.
select monday_plan_bezoekdag(id) from public.paginas where monday_item_id is not null;
