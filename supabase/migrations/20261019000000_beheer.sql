-- Beheerplatform: ingelogde beheerders (Supabase Auth) lezen en wijzigen
-- pagina's, beschikbaarheid en boekingen rechtstreeks, via RLS.

create table public.beheerders (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.beheerders enable row level security;

insert into public.beheerders (email) values ('hendrik@henryhouser.be');

create function public.is_beheerder() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from beheerders where email = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_beheerder() from public, anon;
grant execute on function public.is_beheerder() to authenticated, service_role;

create policy beheer_paginas on public.paginas
  for all to authenticated using (is_beheerder()) with check (is_beheerder());
create policy beheer_beschikbaarheid on public.beschikbaarheid
  for all to authenticated using (is_beheerder()) with check (is_beheerder());
create policy beheer_boekingen_lezen on public.boekingen
  for select to authenticated using (is_beheerder());
create policy beheer_berichten_lezen on public.berichten
  for select to authenticated using (is_beheerder());

-- Overzicht van alle pagina's met hun komende beschikbaarheid en boekingen.
create function public.beheer_overzicht()
returns table (
  id uuid, slug text, titel text, adres text, actief boolean,
  eerste_dag date, laatste_dag date, dagen int, vrije_slots int,
  boekingen int, volgende_boeking timestamptz
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_vandaag date := (now() at time zone 'Europe/Brussels')::date;
begin
  if not is_beheerder() then
    raise exception 'geen_beheerder' using errcode = '42501';
  end if;

  return query
  select p.id, p.slug, p.titel, p.adres, p.actief,
         d.eerste, d.laatste, coalesce(d.aantal, 0)::int,
         (select count(*) from vrije_slots(p.slug))::int,
         (select count(*) from boekingen bk
           where bk.pagina_id = p.id and bk.status = 'bevestigd' and bk.start >= now())::int,
         (select min(bk.start) from boekingen bk
           where bk.pagina_id = p.id and bk.status = 'bevestigd' and bk.start >= now())
  from paginas p
  left join lateral (
    select min(g)::date as eerste, max(g)::date as laatste, count(distinct g) as aantal
    from beschikbaarheid b
    cross join lateral generate_series(greatest(b.datum_van, v_vandaag), b.datum_tot, interval '1 day') g
    where b.pagina_id = p.id and extract(isodow from g)::int = any (b.weekdagen)
  ) d on true
  order by d.eerste nulls last, p.titel;
end $$;

revoke all on function public.beheer_overzicht() from public, anon;
grant execute on function public.beheer_overzicht() to authenticated, service_role;
