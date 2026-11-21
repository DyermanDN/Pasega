-- ============================================================================
-- PASEGA · Finanzas y Cobranzas — Esquema de base de datos para Supabase
-- Ejecuta este script completo en: Supabase -> SQL Editor -> New query -> Run
-- ============================================================================

-- 1. Tabla principal de documentos (ventas, compras, reporte, catálogo, stock,
--    ajustes, confirmados, cobranza, cobGestiones y cobHistorial).
create table if not exists public.pasega_docs (
  collection text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  primary key (collection, doc_id)
);

-- Asegura que los eventos DELETE en Realtime incluyan collection y doc_id
alter table public.pasega_docs replica identity full;

-- Actualiza updated_at automáticamente en cada cambio
create or replace function public.pasega_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_pasega_docs_updated_at on public.pasega_docs;
create trigger trg_pasega_docs_updated_at
  before insert or update on public.pasega_docs
  for each row
  execute function public.pasega_set_updated_at();

-- 2. Tabla opcional de roles por usuario (owner, editor, viewer, blocked).
--    Si un usuario autenticado NO figura aquí, tiene permiso 'editor' por defecto.
--    Para dar solo lectura a un vendedor, insértalo con role = 'viewer'.
create table if not exists public.pasega_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer', 'blocked')),
  created_at timestamptz not null default now()
);

-- 3. Funciones auxiliares de autorización (RLS)
create or replace function public.pasega_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when auth.uid() is null then 'anon'
    else coalesce(
      (select u.role from public.pasega_users u where u.user_id = auth.uid()),
      'editor'
    )
  end;
$$;

create or replace function public.pasega_can_read()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.pasega_user_role() in ('owner', 'editor', 'viewer');
$$;

create or replace function public.pasega_can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.pasega_user_role() in ('owner', 'editor');
$$;

-- 4. Seguridad a nivel de fila (Row Level Security)
alter table public.pasega_docs enable row level security;
alter table public.pasega_users enable row level security;

drop policy if exists "pasega_docs_select" on public.pasega_docs;
create policy "pasega_docs_select"
  on public.pasega_docs
  for select
  to authenticated
  using (public.pasega_can_read());

drop policy if exists "pasega_docs_insert" on public.pasega_docs;
create policy "pasega_docs_insert"
  on public.pasega_docs
  for insert
  to authenticated
  with check (public.pasega_can_write());

drop policy if exists "pasega_docs_update" on public.pasega_docs;
create policy "pasega_docs_update"
  on public.pasega_docs
  for update
  to authenticated
  using (public.pasega_can_write())
  with check (public.pasega_can_write());

drop policy if exists "pasega_docs_delete" on public.pasega_docs;
create policy "pasega_docs_delete"
  on public.pasega_docs
  for delete
  to authenticated
  using (public.pasega_can_write());

drop policy if exists "pasega_users_select_own" on public.pasega_users;
create policy "pasega_users_select_own"
  on public.pasega_users
  for select
  to authenticated
  using (auth.uid() = user_id or public.pasega_user_role() = 'owner');

drop policy if exists "pasega_users_manage_owner" on public.pasega_users;
create policy "pasega_users_manage_owner"
  on public.pasega_users
  for all
  to authenticated
  using (public.pasega_user_role() = 'owner')
  with check (public.pasega_user_role() = 'owner');

-- 5. Habilitar Supabase Realtime para sincronización en vivo entre equipos
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pasega_docs'
  ) then
    alter publication supabase_realtime add table public.pasega_docs;
  end if;
end $$;
