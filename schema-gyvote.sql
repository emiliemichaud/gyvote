-- ==========================================================
-- Schéma de la bdd pour l'application de vote en direct
-- ==========================================================

create extension if not exists "pgcrypto";

-- Une "session" 
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  code        text unique not null,        -- code court affiché / dans l'URL du QR
  host_secret uuid not null default gen_random_uuid(), -- connu uniquement de l'animateur
  status      text not null default 'idle' check (status in ('idle','voting','stopped','results')),
  title       text,
  created_at  timestamptz not null default now()
);

-- Un vote individuel
create table if not exists votes (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  voter_id   text not null,                -- identifiant anonyme généré dans le navigateur du votant
  choice     text not null check (choice in ('pour','contre','abstention')),
  created_at timestamptz not null default now(),
  unique (session_id, voter_id)            -- un seul vote par personne et par session
);

create index if not exists votes_session_idx on votes (session_id);

alter table sessions enable row level security;
alter table votes    enable row level security;

-- GRANT, rôle "anon" (utilisé par la clé publique côté navigateur)
grant usage on schema public to anon, authenticated;
grant select, insert, update on sessions to anon, authenticated;
grant select, insert            on votes    to anon, authenticated;

-- Tout le monde peut lire les sessions (nécessaire pour rejoindre via le code)
drop policy if exists "sessions: lecture publique" on sessions;
create policy "sessions: lecture publique"
  on sessions for select
  using (true);

-- Tout le monde peut créer une session (démarrage depuis la page hôte)
drop policy if exists "sessions: creation publique" on sessions;
create policy "sessions: creation publique"
  on sessions for insert
  with check (true);

-- Tout le monde peut modifier le statut d'une session (page hôte, protégée par le lien secret côté appli)
drop policy if exists "sessions: mise a jour publique" on sessions;
create policy "sessions: mise a jour publique"
  on sessions for update
  using (true);

-- Tout le monde peut lire les votes (pour calculer/afficher les résultats)
drop policy if exists "votes: lecture publique" on votes;
create policy "votes: lecture publique"
  on votes for select
  using (true);

-- On ne peut voter que si la session correspondante est bien en statut 'voting'
drop policy if exists "votes: uniquement si vote ouvert" on votes;
create policy "votes: uniquement si vote ouvert"
  on votes for insert
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_id and s.status = 'voting'
    )
  );
