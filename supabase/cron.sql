-- Eenmalig uitvoeren in de SQL-editor van Supabase, na de migratie.
-- Vervang <project-ref> en <CRON_GEHEIM> (zelfde waarde als het secret van de edge functions).
-- Elke 5 minuten: verstuur vervallen berichten (reminders en herkansingen).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/verstuur', 'verstuur_url');
select vault.create_secret('<CRON_GEHEIM>', 'cron_geheim');

select cron.schedule('verstuur-berichten', '*/5 * * * *', $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'verstuur_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_geheim')),
    body    := '{}'::jsonb)
  where exists (
    select 1 from public.berichten
    where status in ('wachtrij', 'bezig') and gepland_op <= now() and pogingen < 5);
$$);
