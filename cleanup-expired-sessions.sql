-- ============================================================
-- Suppression automatique des sessions de plus de 15h
-- ============================================================

-- 1. S'assurer que la colonne created_at existe sur "sessions"
alter table public.sessions
  add column if not exists created_at timestamptz not null default now();

-- 2. Activer l'extension pg_cron sur ce projet.
create extension if not exists pg_cron;

-- 3. Fonction qui supprime les votes puis les sessions expirées
create or replace function public.cleanup_expired_sessions()
returns void
language plpgsql
security definer
as $$
begin
  delete from public.votes
  where session_id in (
    select id from public.sessions where created_at < now() - interval '15 hours'
  );

  delete from public.sessions
  where created_at < now() - interval '15 hours';
end;
$$;

-- 4. Planifie l'exécution de cette fonction toutes les 15 minutes.
select cron.schedule(
  'cleanup-expired-sessions',
  '*/15 * * * *',
  $$ select public.cleanup_expired_sessions(); $$
);