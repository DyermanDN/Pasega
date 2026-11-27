-- ============================================================================
-- PASEGA · Módulo de Facturación Electrónica SUNAT (Nubefact / Modo Demo)
-- Ejecuta este script en Supabase -> SQL Editor -> New query -> Run
-- Es idempotente: se puede volver a ejecutar sin borrar datos existentes.
-- ============================================================================

-- 1. Configuración fiscal del emisor (PASEGA · 1 sola fila id = 1)
create table if not exists public.sunat_config (
  id integer primary key default 1 check (id = 1),
  ruc text not null default '',
  razon_social text not null default 'PASEGA IMPORTACIONES S.A.C.',
  nombre_comercial text not null default 'PASEGA',
  direccion text not null default '',
  ubigeo text not null default '150101',
  igv_pct numeric(5,2) not null default 18.00,
  modo text not null default 'demo' check (modo in ('demo', 'produccion')),
  updated_at timestamptz not null default now()
);

insert into public.sunat_config (id) values (1) on conflict (id) do nothing;

-- 2. Series y correlativos atómicos (por defecto F002/B002/FC02/BC02/T002 para no chocar con series antiguas)
create table if not exists public.sunat_series (
  tipo text not null check (tipo in ('01', '03', '07', '09')),
  serie text not null,
  descripcion text not null default '',
  ultimo_numero integer not null default 0 check (ultimo_numero >= 0),
  activa boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (tipo, serie)
);

insert into public.sunat_series (tipo, serie, descripcion, ultimo_numero, activa) values
  ('01', 'F002', 'Facturas electrónicas', 0, true),
  ('03', 'B002', 'Boletas de venta electrónicas', 0, true),
  ('07', 'FC02', 'Notas de crédito (Facturas)', 0, true),
  ('07', 'BC02', 'Notas de crédito (Boletas)', 0, true),
  ('09', 'T002', 'Guías de remisión remitente (GRE)', 0, true)
on conflict (tipo, serie) do nothing;

-- 3. Directorio y caché de clientes (RUC / DNI)
create table if not exists public.sunat_clientes (
  tipo_doc text not null check (tipo_doc in ('6', '1', '4', '7', '0')),
  numero_doc text not null,
  razon_social text not null,
  direccion text not null default '',
  ubigeo text not null default '',
  telefono text not null default '',
  email text not null default '',
  estado_sunat text not null default '',
  condicion_sunat text not null default '',
  updated_at timestamptz not null default now(),
  primary key (tipo_doc, numero_doc)
);

-- 4. Comprobantes emitidos (Facturas 01, Boletas 03, Notas de Crédito 07, Guías 09)
create table if not exists public.sunat_comprobantes (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('01', '03', '07', '09')),
  serie text not null,
  numero integer not null,
  doc_codigo text not null unique,
  modo text not null default 'demo' check (modo in ('demo', 'produccion')),
  estado text not null default 'demo' check (estado in ('pendiente', 'aceptado', 'rechazado', 'anulado', 'demo')),
  fecha_emision date not null default current_date,
  fecha_vcto date,
  cliente_tipo_doc text not null default '6',
  cliente_doc text not null default '',
  cliente_nombre text not null default '',
  cliente_direccion text not null default '',
  cliente_telefono text not null default '',
  cliente_email text not null default '',
  vendedor text not null default '',
  moneda text not null default 'USD' check (moneda in ('USD', 'PEN')),
  tipo_cambio numeric(10,4) not null default 3.7000,
  precio_incluye_igv boolean not null default false,
  forma_pago text not null default 'CONTADO' check (forma_pago in ('CONTADO', 'CREDITO')),
  cuotas jsonb not null default '[]'::jsonb,
  subtotal numeric(14,2) not null default 0,
  igv numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  items jsonb not null default '[]'::jsonb,
  ref_doc text not null default '',
  ref_tipo text not null default '',
  motivo_nc text not null default '',
  gre_datos jsonb,
  observaciones text not null default '',
  pdf_url text not null default '',
  xml_url text not null default '',
  cdr_url text not null default '',
  hash text not null default '',
  cadena_qr text not null default '',
  sunat_mensaje text not null default '',
  sunat_respuesta jsonb not null default '{}'::jsonb,
  sincronizado boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tipo, serie, numero)
);

create index if not exists idx_sunat_comprobantes_fecha on public.sunat_comprobantes (fecha_emision desc, created_at desc);
create index if not exists idx_sunat_comprobantes_cliente on public.sunat_comprobantes (cliente_doc);

-- 5. Función atómica para obtener el siguiente correlativo sin colisiones
create or replace function public.sunat_next_correlativo(p_tipo text, p_serie text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_next integer;
begin
  if not public.pasega_can_write() then
    raise exception 'No tienes permisos para emitir comprobantes.';
  end if;

  update public.sunat_series
  set ultimo_numero = ultimo_numero + 1,
      updated_at = now()
  where tipo = p_tipo
    and serie = upper(trim(p_serie))
    and activa = true
  returning ultimo_numero into v_next;

  if v_next is null then
    raise exception 'Serie % no encontrada o inactiva para tipo %.', p_serie, p_tipo;
  end if;

  return v_next;
end;
$$;

-- 6. Permisos y Row Level Security (RLS)
grant select, insert, update, delete on public.sunat_config to authenticated;
grant select, insert, update, delete on public.sunat_series to authenticated;
grant select, insert, update, delete on public.sunat_clientes to authenticated;
grant select, insert, update, delete on public.sunat_comprobantes to authenticated;
grant execute on function public.sunat_next_correlativo(text, text) to authenticated;

revoke all on public.sunat_config from anon;
revoke all on public.sunat_series from anon;
revoke all on public.sunat_clientes from anon;
revoke all on public.sunat_comprobantes from anon;
revoke execute on function public.sunat_next_correlativo(text, text) from anon;

alter table public.sunat_config enable row level security;
alter table public.sunat_series enable row level security;
alter table public.sunat_clientes enable row level security;
alter table public.sunat_comprobantes enable row level security;

-- Políticas para sunat_config
drop policy if exists "sunat_config_select" on public.sunat_config;
create policy "sunat_config_select" on public.sunat_config for select to authenticated using (public.pasega_can_read());
drop policy if exists "sunat_config_write" on public.sunat_config;
create policy "sunat_config_write" on public.sunat_config for all to authenticated using (public.pasega_can_write()) with check (public.pasega_can_write());

-- Políticas para sunat_series
drop policy if exists "sunat_series_select" on public.sunat_series;
create policy "sunat_series_select" on public.sunat_series for select to authenticated using (public.pasega_can_read());
drop policy if exists "sunat_series_write" on public.sunat_series;
create policy "sunat_series_write" on public.sunat_series for all to authenticated using (public.pasega_can_write()) with check (public.pasega_can_write());

-- Políticas para sunat_clientes
drop policy if exists "sunat_clientes_select" on public.sunat_clientes;
create policy "sunat_clientes_select" on public.sunat_clientes for select to authenticated using (public.pasega_can_read());
drop policy if exists "sunat_clientes_write" on public.sunat_clientes;
create policy "sunat_clientes_write" on public.sunat_clientes for all to authenticated using (public.pasega_can_write()) with check (public.pasega_can_write());

-- Políticas para sunat_comprobantes
drop policy if exists "sunat_comprobantes_select" on public.sunat_comprobantes;
create policy "sunat_comprobantes_select" on public.sunat_comprobantes for select to authenticated using (public.pasega_can_read());
drop policy if exists "sunat_comprobantes_write" on public.sunat_comprobantes;
create policy "sunat_comprobantes_write" on public.sunat_comprobantes for all to authenticated using (public.pasega_can_write()) with check (public.pasega_can_write());

-- 7. Habilitar Realtime en sunat_comprobantes
alter table public.sunat_comprobantes replica identity full;
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'sunat_comprobantes'
  ) then
    alter publication supabase_realtime add table public.sunat_comprobantes;
  end if;
end $$;
