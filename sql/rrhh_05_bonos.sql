-- =====================================================================
-- RRHH · Bonos de proyecto (histórico). Corré este archivo ENTERO en el SQL Editor de Supabase, ANTES de publicar el HTML.
--   · Tablas: rrhh_bonos (un renglón por bono: nombre, proyecto, tipo, período, monto) y rrhh_bonos_persona (importe por persona).
--   · Permisos: sección «costos» de RRHH (ver / editar). RLS solo para authenticated, nunca anon.
--   · rrhh_importar_bonos() REEMPLAZA solo el histórico (origen = 'historico') en una transacción; no toca bonos cargados de otra forma.
--   · Es idempotente (se puede volver a correr) y no borra datos al correrlo.
--   · No guarda nombres de personas (el legajo alcanza como clave).
-- =====================================================================
begin;

create table if not exists public.rrhh_bonos (
  num_bono        integer primary key,
  nombre          text not null,                                   -- p. ej. «PL0076-2 COMARCA RESTO - 3»
  proyecto        text not null,                                   -- proyecto base (columna VENTA de la planilla)
  tipo            text not null default 'sin_discriminar' check (tipo in ('montaje','posventa','produccion','sin_discriminar')),
  etiqueta_periodo text,                                           -- tal cual la planilla: 202504/202505
  periodo_desde   text check (periodo_desde ~ '^\d{4}-\d{2}$'),
  periodo_hasta   text check (periodo_hasta ~ '^\d{4}-\d{2}$'),
  monto           numeric(14,2) not null default 0,
  caja            numeric(14,2),
  planilla_cerrada numeric(14,2),
  origen          text not null default 'historico',
  creado_en       timestamptz not null default now()
);

create table if not exists public.rrhh_bonos_persona (
  num_bono  integer not null references public.rrhh_bonos(num_bono) on delete cascade,
  legajo    integer not null,
  importe   numeric(14,2) not null,
  primary key (num_bono, legajo)
);
create index if not exists rrhh_bonos_persona_legajo on public.rrhh_bonos_persona (legajo);

alter table public.rrhh_bonos enable row level security;
alter table public.rrhh_bonos_persona enable row level security;
do $$
declare t text;
begin
  foreach t in array array['rrhh_bonos','rrhh_bonos_persona'] loop
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rrhh_puede_ver(%L))', t||'_sel', t, 'costos');
    execute format('create policy %I on public.%I for insert to authenticated with check (public.rrhh_puede_editar(%L))', t||'_ins', t, 'costos');
    execute format('create policy %I on public.%I for update to authenticated using (public.rrhh_puede_editar(%L)) with check (public.rrhh_puede_editar(%L))', t||'_upd', t, 'costos', 'costos');
    execute format('create policy %I on public.%I for delete to authenticated using (public.rrhh_puede_editar(%L))', t||'_del', t, 'costos');
  end loop;
end $$;
revoke all on public.rrhh_bonos, public.rrhh_bonos_persona from anon;
grant select, insert, update, delete on public.rrhh_bonos, public.rrhh_bonos_persona to authenticated;

-- Reemplaza el histórico completo (bonos y personas) en una sola transacción.
create or replace function public.rrhh_importar_bonos(p_bonos jsonb, p_personas jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.rrhh_puede_editar('costos') then raise exception 'Sin permiso para cargar bonos'; end if;
  if jsonb_typeof(p_bonos) <> 'array' or jsonb_typeof(p_personas) <> 'array' then raise exception 'Los datos tienen que venir como lista'; end if;
  delete from public.rrhh_bonos where origen = 'historico';        -- borra también sus personas (cascade)
  insert into public.rrhh_bonos (num_bono, nombre, proyecto, tipo, etiqueta_periodo, periodo_desde, periodo_hasta, monto, caja, planilla_cerrada, origen)
    select (x->>'num_bono')::integer, x->>'nombre', x->>'proyecto', coalesce(x->>'tipo', 'sin_discriminar'), x->>'etiqueta_periodo',
           nullif(x->>'periodo_desde', ''), nullif(x->>'periodo_hasta', ''), coalesce((x->>'monto')::numeric, 0),
           (x->>'caja')::numeric, (x->>'planilla_cerrada')::numeric, 'historico'
      from jsonb_array_elements(p_bonos) x;
  insert into public.rrhh_bonos_persona (num_bono, legajo, importe)
    select (x->>'num_bono')::integer, (x->>'legajo')::integer, (x->>'importe')::numeric
      from jsonb_array_elements(p_personas) x;
  return jsonb_array_length(p_personas);
end $$;
revoke all on function public.rrhh_importar_bonos(jsonb, jsonb) from public, anon;
grant execute on function public.rrhh_importar_bonos(jsonb, jsonb) to authenticated;

commit;

-- Comprobación (debería devolver 2 tablas y 1 función):
select (select count(*) from information_schema.tables where table_schema = 'public' and table_name in ('rrhh_bonos','rrhh_bonos_persona')) as tablas,
       (select count(*) from pg_proc where proname = 'rrhh_importar_bonos') as funcion;
