-- Foto automatisch van de pandsite: heeft een adres een pandsite (pand_url) maar nog geen foto,
-- dan haalt de edge function "monday" (elke 10 minuten) de hoofdfoto van die site op: de
-- og:image die Wix voor de pagina zet, op de pandsites de grote foto bovenaan. Die komt in de
-- bucket "fotos", net als een foto die in het beheer opgeladen wordt.
--  - Een foto die in het beheer opgeladen wordt, heeft altijd voorrang: de server vult alleen
--    een lege foto aan.
--  - Wie in het beheer de foto verwijdert, krijgt ze niet automatisch terug (foto_auto_stop).
--  - Lukt het niet (site nog niet klaar, geen foto), dan opnieuw na 6 uur of na een nieuwe pand_url.

alter table public.paginas
  add column foto_bron       text,                           -- url van de foto op de pandsite (null: zelf opgeladen)
  add column foto_auto_op    timestamptz,                    -- laatste poging om de foto van de pandsite te halen
  add column foto_auto_fout  text,                           -- waarom die poging niet lukte
  add column foto_auto_stop  boolean not null default false; -- foto verwijderd in het beheer: niet opnieuw ophalen

create function public.paginas_foto_auto() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    -- Een kopie van een ander adres begint opnieuw.
    if new.foto_pad is null then
      new.foto_bron := null;
      new.foto_auto_op := null;
      new.foto_auto_fout := null;
      new.foto_auto_stop := false;
    end if;
    return new;
  end if;
  -- Foto gewijzigd zonder nieuwe bron: zelf opgeladen of verwijderd.
  if new.foto_pad is distinct from old.foto_pad and new.foto_bron is not distinct from old.foto_bron then
    new.foto_bron := null;
  end if;
  if old.foto_pad is not null and new.foto_pad is null then
    new.foto_auto_stop := true;
  end if;
  -- Andere pandsite: meteen opnieuw proberen.
  if new.pand_url is distinct from old.pand_url then
    new.foto_auto_op := null;
    new.foto_auto_fout := null;
  end if;
  return new;
end;
$$;

create trigger paginas_foto_auto before insert or update on public.paginas
  for each row execute function public.paginas_foto_auto();
