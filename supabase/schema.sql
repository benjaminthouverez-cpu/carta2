-- ============================================================================
-- Carta 2.0 — Schéma relationnel + sécurité (RLS)
-- À exécuter UNE FOIS dans le projet Supabase DÉDIÉ à la 2.0
-- (Dashboard Supabase → SQL Editor → coller → Run).
--
-- Hiérarchie : board → group → column → card.  Liens entre cartes.
-- Partage : board_members (rôles owner / editor / viewer).
-- RLS : on ne voit/modifie que les tableaux dont on est membre.
-- ============================================================================

create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------------------------------------------------------------------------
-- 1. Profils (miroir public de auth.users, pour afficher noms/emails)
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text,
  created_at timestamptz not null default now()
);

-- Crée automatiquement un profil à l'inscription (Google ou e-mail).
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name')
  )
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- 2. Tableaux
-- ---------------------------------------------------------------------------
create table if not exists boards (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'Mon tableau',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 3. Membres + rôles
-- ---------------------------------------------------------------------------
create table if not exists board_members (
  board_id   uuid not null references boards(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null default 'editor' check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (board_id, user_id)
);

-- Le créateur devient automatiquement « owner » membre de son tableau.
create or replace function add_owner_membership()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into board_members(board_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end; $$;

drop trigger if exists on_board_created on boards;
create trigger on_board_created
  after insert on boards
  for each row execute function add_owner_membership();

-- ---------------------------------------------------------------------------
-- 4. Groupes → 5. Colonnes → 6. Cartes → 7. Liens
-- ---------------------------------------------------------------------------
create table if not exists groups (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null references boards(id) on delete cascade,
  title     text not null default 'Nouveau groupe',
  position  double precision not null default 0,
  collapsed boolean not null default false
);

create table if not exists columns (
  id       uuid primary key default gen_random_uuid(),
  board_id uuid not null references boards(id) on delete cascade,
  group_id uuid not null references groups(id) on delete cascade,
  title    text not null default 'Nouveau thème',
  position double precision not null default 0
);

create table if not exists cards (
  id         uuid primary key default gen_random_uuid(),
  board_id   uuid not null references boards(id) on delete cascade,
  column_id  uuid not null references columns(id) on delete cascade,
  title      text not null default 'Nouvelle action',
  note       text not null default '',
  due        date,
  position   double precision not null default 0,
  mind_x     double precision, -- position dans la carte mentale
  mind_y     double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists links (
  id        uuid primary key default gen_random_uuid(),
  board_id  uuid not null references boards(id) on delete cascade,
  from_card uuid not null references cards(id) on delete cascade,
  to_card   uuid not null references cards(id) on delete cascade,
  type      text not null default 'lié' check (type in ('lié','dépend','suite'))
);

create index if not exists idx_groups_board  on groups(board_id);
create index if not exists idx_columns_board on columns(board_id);
create index if not exists idx_cards_board   on cards(board_id);
create index if not exists idx_cards_column  on cards(column_id);
create index if not exists idx_links_board   on links(board_id);
create index if not exists idx_members_user  on board_members(user_id);

-- ---------------------------------------------------------------------------
-- 8. Helpers de sécurité (SECURITY DEFINER pour éviter la récursion RLS)
-- ---------------------------------------------------------------------------
create or replace function is_board_member(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from board_members m
    where m.board_id = b and m.user_id = auth.uid()
  );
$$;

create or replace function can_edit_board(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from board_members m
    where m.board_id = b and m.user_id = auth.uid()
      and m.role in ('owner','editor')
  );
$$;

create or replace function is_board_owner(b uuid)
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from boards bo where bo.id = b and bo.owner_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- 9. Row Level Security
--    Lecture = membre du tableau (viewer compris) ; écriture = owner/editor.
-- ---------------------------------------------------------------------------
alter table profiles      enable row level security;
alter table boards        enable row level security;
alter table board_members enable row level security;
alter table groups        enable row level security;
alter table columns       enable row level security;
alter table cards         enable row level security;
alter table links         enable row level security;

-- Profils : tout le monde (connecté) peut lire (pour afficher les noms),
-- chacun ne modifie que le sien.
create policy profiles_read        on profiles for select using (true);
create policy profiles_update_self on profiles for update using (id = auth.uid());

-- Tableaux
create policy boards_select on boards for select using (is_board_member(id));
create policy boards_insert on boards for insert with check (owner_id = auth.uid());
create policy boards_update on boards for update using (can_edit_board(id));
create policy boards_delete on boards for delete using (owner_id = auth.uid());

-- Membres (seul l'owner gère les membres ; les membres voient la liste)
create policy members_select on board_members for select using (is_board_member(board_id));
create policy members_insert on board_members for insert with check (is_board_owner(board_id));
create policy members_update on board_members for update using (is_board_owner(board_id));
create policy members_delete on board_members for delete using (is_board_owner(board_id));

-- Patron commun groups / columns / cards / links
create policy groups_select on groups for select using (is_board_member(board_id));
create policy groups_insert on groups for insert with check (can_edit_board(board_id));
create policy groups_update on groups for update using (can_edit_board(board_id));
create policy groups_delete on groups for delete using (can_edit_board(board_id));

create policy columns_select on columns for select using (is_board_member(board_id));
create policy columns_insert on columns for insert with check (can_edit_board(board_id));
create policy columns_update on columns for update using (can_edit_board(board_id));
create policy columns_delete on columns for delete using (can_edit_board(board_id));

create policy cards_select on cards for select using (is_board_member(board_id));
create policy cards_insert on cards for insert with check (can_edit_board(board_id));
create policy cards_update on cards for update using (can_edit_board(board_id));
create policy cards_delete on cards for delete using (can_edit_board(board_id));

create policy links_select on links for select using (is_board_member(board_id));
create policy links_insert on links for insert with check (can_edit_board(board_id));
create policy links_update on links for update using (can_edit_board(board_id));
create policy links_delete on links for delete using (can_edit_board(board_id));

-- ---------------------------------------------------------------------------
-- 10. Temps réel (pour la collaboration live)
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table boards;
alter publication supabase_realtime add table groups;
alter publication supabase_realtime add table columns;
alter publication supabase_realtime add table cards;
alter publication supabase_realtime add table links;
alter publication supabase_realtime add table board_members;

-- ============================================================================
-- ROADMAP (tables ajoutées dans les jalons suivants, hors de ce socle) :
--   comments(id, card_id, board_id, author_id, body, created_at)
--   labels(id, board_id, name, color) + card_labels(card_id, label_id)
--   checklist_items(id, card_id, text, done, position)
--   activity(id, board_id, actor_id, entity, entity_id, action, detail, at)
--   attachments(id, card_id, board_id, path, name) + bucket Storage
-- ============================================================================
