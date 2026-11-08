-- =====================================================================
-- RRHH · paso 1 · tablas, permisos e importación de la liquidación de sueldos
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_00_sector.sql
-- y ANTES de desplegar el HTML de la app de RRHH (orden de deploy: primero SQL, después HTML).
--
-- Qué hace
--   · Prefijo rrhh_ para todas las tablas (acordado con administración).
--   · Permisos a nivel de BASE por sección, con el mismo criterio que adminfin (perfiles_sector.permisos),
--     PERO con una diferencia deliberada: acá, sin lista de permisos guardada, NO se ve nada
--     (solo dirección). Son sueldos: el valor por defecto es negar.
--       liquidacion · cargar informes, ver y editar la liquidación, novedades y F.931
--       costos      · ver costo mensual, valor hora e imputación
--       config      · conceptos, diccionario, empleados
--   · RLS solo para authenticated (nunca anon).
--   · Importación idempotente: rrhh_importar_liquidacion / rrhh_importar_novedades reemplazan el lote
--     completo de (período, empresa) en una transacción, y no dejan tocar un período cerrado.
--   · NO guarda C.U.I.L., teléfonos ni correos (el legajo alcanza como clave).
--
-- Todo es idempotente (se puede volver a correr). No borra datos.
-- No incluye (a propósito): la publicación del valor hora hacia planificacion_valor_hora_hist. Eso toca
-- una tabla de otro sector y hay que verificar sus columnas antes (ver la especificación).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1) Funciones de permisos (mismo patrón que adminfin_puede_ver / adminfin_puede_editar)
-- ---------------------------------------------------------------------
create or replace function public.rrhh_puede_ver(p_sec text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.es_direccion() or exists (
    select 1 from public.perfiles p join public.perfiles_sector ps on ps.perfil_id = p.id
     where p.id = auth.uid() and p.activo and ps.sector = 'rrhh'::public.sector_portal
       and jsonb_typeof(ps.permisos -> 'ver') = 'array' and (ps.permisos -> 'ver') ? p_sec);
end $$;

create or replace function public.rrhh_puede_editar(p_sec text) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.es_direccion() or exists (
    select 1 from public.perfiles p join public.perfiles_sector ps on ps.perfil_id = p.id
     where p.id = auth.uid() and p.activo and ps.sector = 'rrhh'::public.sector_portal
       and lower(coalesce(ps.cargo, '')) not in ('lector', 'lectura')
       and jsonb_typeof(ps.permisos -> 'ver') = 'array' and (ps.permisos -> 'ver') ? p_sec
       and jsonb_typeof(ps.permisos -> 'editar') = 'array' and (ps.permisos -> 'editar') ? p_sec);
end $$;

-- ¿Tiene acceso a alguna sección de RRHH? (para leer catálogos: períodos, empleados, conceptos, diccionario)
create or replace function public.rrhh_tiene_acceso() returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return public.es_direccion() or exists (
    select 1 from public.perfiles p join public.perfiles_sector ps on ps.perfil_id = p.id
     where p.id = auth.uid() and p.activo and ps.sector = 'rrhh'::public.sector_portal
       and jsonb_typeof(ps.permisos -> 'ver') = 'array' and jsonb_array_length(ps.permisos -> 'ver') > 0);
end $$;

revoke all on function public.rrhh_puede_ver(text), public.rrhh_puede_editar(text), public.rrhh_tiene_acceso() from public, anon;
grant execute on function public.rrhh_puede_ver(text), public.rrhh_puede_editar(text), public.rrhh_tiene_acceso() to authenticated;

-- ---------------------------------------------------------------------
-- 2) Catálogos
-- ---------------------------------------------------------------------
create table if not exists public.rrhh_periodos (
  periodo     text primary key check (periodo ~ '^\d{4}-\d{2}$'),
  estado      text not null default 'abierto' check (estado in ('abierto','cargado','controlado','cerrado')),
  cerrado_en  timestamptz,
  cerrado_por uuid,
  creado_en   timestamptz not null default now()
);

-- Completitud del período: los meses viejos se controlaban por fuera (bonos, coparticipación, sábados, feriados);
-- la app tiene que avisar cuando falta esa parte para no mezclar costos que no son comparables.
alter table public.rrhh_periodos add column if not exists oc_completo boolean not null default false;
alter table public.rrhh_periodos add column if not exists novedades_completas boolean not null default false;
alter table public.rrhh_periodos add column if not exists notas text;

create table if not exists public.rrhh_empleados (
  legajo                   integer primary key,
  nombre                   text not null,
  departamento             text,
  categoria                text,
  tipo_pago                text check (tipo_pago in ('jornalizado','mensualizado')),
  sede                     text,
  activo                   boolean not null default true,
  planificacion_persona_id uuid,              -- vínculo con planificacion_personal.id (sin FK: son sectores distintos)
  creado_en                timestamptz not null default now(),
  actualizado_en           timestamptz not null default now()
);

-- Catálogo de conceptos. Clave (nro, empresa): el 99999 Redondeo existe en las dos liquidaciones.
create table if not exists public.rrhh_conceptos (
  nro_concepto text not null,
  empresa      text not null check (empresa in ('4H','4H_OC')),
  descripcion  text not null,
  grupo_sistema text,                         -- Haberes / Retenciones / Contribuciones / No Remunerativo
  agrupador    text,                          -- SUELDO, VACACIONES, SAC, APORTES, CONTRIBUCIONES, COPAR, BONOS, RRHH, ...
  trata        text check (trata in ('costo','excluir','directo_proyecto','cuenta_rrhh','retencion')),
  es_hora      boolean not null default false,
  tipo_hora    text,                          -- trabajada, extra50, vacaciones, feriado, enfermedad, art, justificada, otra
  prorrateo    text check (prorrateo in ('directo','por_horas_pagas','por_pago_tipo','fijo_mensual','cargas')),
  actualizado_en timestamptz not null default now(),
  primary key (nro_concepto, empresa)
);

-- Diccionario de equivalencias (app de planificación → planilla). Acá viven los nombres de proyectos:
-- son datos de negocio y NO van en el código ni en el repo.
create table if not exists public.rrhh_diccionario (
  id               uuid primary key default gen_random_uuid(),
  tipo             text not null check (tipo in ('proyecto','estacion_tarea','ausencia','ubicacion','regla')),
  origen           text not null,             -- como sale de la app (ej.: etiqueta de proyecto, estación)
  condicion        text not null default '',  -- ej.: condición sobre la subtarea
  destino          text,                      -- como figura en la planilla
  posventa_montaje text,
  estado           text not null default 'validar' check (estado in ('confirmado','propuesto','validar')),
  notas            text,
  actualizado_en   timestamptz not null default now(),
  unique (tipo, origen, condicion)
);

-- ---------------------------------------------------------------------
-- 3) Datos importados (se reemplazan por lote)
-- ---------------------------------------------------------------------
create table if not exists public.rrhh_lotes (
  id             uuid primary key default gen_random_uuid(),
  tipo           text not null check (tipo in ('liquidacion','novedades')),
  periodo        text not null references public.rrhh_periodos(periodo),
  empresa        text not null check (empresa in ('4H','4H_OC')),
  archivo_nombre text,
  filas          integer not null default 0,
  cargado_por    uuid,
  cargado_en     timestamptz not null default now(),
  unique (tipo, periodo, empresa)
);

create table if not exists public.rrhh_liquidacion_filas (
  id               bigint generated always as identity primary key,
  lote_id          uuid not null references public.rrhh_lotes(id) on delete cascade,
  periodo          text not null,
  empresa          text not null check (empresa in ('4H','4H_OC')),
  legajo           integer not null,
  tipo_liquidacion text,                      -- Primera Quincena / Segunda Quincena / Mensual / Extraordinaria No Remunerativa
  nro_concepto     text not null,
  descripcion      text,
  grupo            text,
  importe          numeric(14,2) not null default 0,
  cantidad         numeric(12,2) not null default 0,
  valor            numeric(14,2) not null default 0
);
create index if not exists rrhh_liq_filas_per_leg on public.rrhh_liquidacion_filas (periodo, legajo);
create index if not exists rrhh_liq_filas_lote on public.rrhh_liquidacion_filas (lote_id);

create table if not exists public.rrhh_novedades (
  id           bigint generated always as identity primary key,
  lote_id      uuid not null references public.rrhh_lotes(id) on delete cascade,
  periodo      text not null,
  empresa      text not null check (empresa in ('4H','4H_OC')),
  fecha        date not null,
  legajo       integer not null,
  cod_novedad  text not null,
  novedad      text,
  cantidad     numeric(12,2) not null default 0,
  expresion    text,
  valor        numeric(14,2) not null default 0,
  origen       text,
  departamento text
);
create index if not exists rrhh_novedades_per_leg on public.rrhh_novedades (periodo, legajo, fecha);
create index if not exists rrhh_novedades_lote on public.rrhh_novedades (lote_id);

-- Control externo: datos del F.931 de cada mes (carga manual)
create table if not exists public.rrhh_f931 (
  periodo      text primary key references public.rrhh_periodos(periodo),
  rem1         numeric(16,2),
  contrib_ss   numeric(16,2),
  contrib_os   numeric(16,2),
  lrt          numeric(16,2),
  scvo         numeric(16,2),
  aportes_ss   numeric(16,2),
  aportes_os   numeric(16,2),
  empleados    integer,
  cargado_por  uuid,
  cargado_en   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 4) Resultados del cálculo (por legajo y período)
-- ---------------------------------------------------------------------
create table if not exists public.rrhh_costo_mensual (
  periodo         text not null references public.rrhh_periodos(periodo),
  legajo          integer not null,
  criterio_costo  text not null default 'v2' check (criterio_costo in ('v2','excel_original')),
  horas_por_tipo  jsonb not null default '{}'::jsonb,   -- { trabajada, extra50, vacaciones, feriado, enfermedad, art, justificada, otra }
  horas_pagas     numeric(10,2),
  haberes         numeric(14,2),
  no_rem          numeric(14,2),
  contribuciones  numeric(14,2),
  bono_costo      numeric(14,2),
  bono_directo    numeric(14,2),
  cuenta_rrhh     numeric(14,2),
  neto_acreditado numeric(14,2),
  cargas          numeric(14,2),
  costo_4h        numeric(14,2),
  cuesta          numeric(14,2),
  cobra           numeric(14,2),
  calculado_en    timestamptz not null default now(),
  primary key (periodo, legajo, criterio_costo)
);

create table if not exists public.rrhh_valor_hora (
  periodo   text not null references public.rrhh_periodos(periodo),
  legajo    integer not null,
  tipo_hora text not null,                              -- trabajada / vacaciones / feriado / ...
  valor     numeric(14,2) not null,
  calculado_en timestamptz not null default now(),
  primary key (periodo, legajo, tipo_hora)
);

create table if not exists public.rrhh_imputacion_mensual (
  id           bigint generated always as identity primary key,
  periodo      text not null references public.rrhh_periodos(periodo),
  legajo       integer not null,
  destino_tipo text not null check (destino_tipo in ('proyecto','centro_interno','ausencia','sin_asignar','indirecto','bono_directo','cuenta_rrhh')),
  destino_ref  text,
  horas        numeric(10,2) not null default 0,
  importe      numeric(14,2) not null default 0,
  detalle      jsonb,
  creado_en    timestamptz not null default now()
);
create index if not exists rrhh_imputacion_per on public.rrhh_imputacion_mensual (periodo, legajo);

-- ---------------------------------------------------------------------
-- 5) RLS (solo authenticated; nunca anon)
-- ---------------------------------------------------------------------
do $$
declare
  t record;
begin
  -- (tabla, sección que se exige para VER, sección que se exige para EDITAR; null = catálogo: cualquier acceso a RRHH ve)
  for t in select * from (values
    ('rrhh_periodos',            null,          'liquidacion'),
    ('rrhh_empleados',           null,          'config'),
    ('rrhh_conceptos',           null,          'config'),
    ('rrhh_diccionario',         null,          'config'),
    ('rrhh_lotes',               'liquidacion', 'liquidacion'),
    ('rrhh_liquidacion_filas',   'liquidacion', 'liquidacion'),
    ('rrhh_novedades',           'liquidacion', 'liquidacion'),
    ('rrhh_f931',                'liquidacion', 'liquidacion'),
    ('rrhh_costo_mensual',       'costos',      'liquidacion'),
    ('rrhh_valor_hora',          'costos',      'liquidacion'),
    ('rrhh_imputacion_mensual',  'costos',      'liquidacion')
  ) as v(tabla, ver, editar)
  loop
    execute format('alter table public.%I enable row level security', t.tabla);
    execute format('revoke all on public.%I from anon', t.tabla);
    execute format('drop policy if exists %I on public.%I', t.tabla||'_sel', t.tabla);
    execute format('drop policy if exists %I on public.%I', t.tabla||'_ins', t.tabla);
    execute format('drop policy if exists %I on public.%I', t.tabla||'_upd', t.tabla);
    execute format('drop policy if exists %I on public.%I', t.tabla||'_del', t.tabla);
    if t.ver is null then
      execute format('create policy %I on public.%I for select to authenticated using (public.rrhh_tiene_acceso())', t.tabla||'_sel', t.tabla);
    else
      execute format('create policy %I on public.%I for select to authenticated using (public.rrhh_puede_ver(%L))', t.tabla||'_sel', t.tabla, t.ver);
    end if;
    execute format('create policy %I on public.%I for insert to authenticated with check (public.rrhh_puede_editar(%L))', t.tabla||'_ins', t.tabla, t.editar);
    execute format('create policy %I on public.%I for update to authenticated using (public.rrhh_puede_editar(%L)) with check (public.rrhh_puede_editar(%L))', t.tabla||'_upd', t.tabla, t.editar, t.editar);
    execute format('create policy %I on public.%I for delete to authenticated using (public.rrhh_puede_editar(%L))', t.tabla||'_del', t.tabla, t.editar);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t.tabla);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 6) Importación idempotente (reemplaza el lote completo de un período y empresa, en una transacción)
-- ---------------------------------------------------------------------
create or replace function public.rrhh_importar_liquidacion(p_periodo text, p_empresa text, p_archivo text, p_filas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lote uuid := gen_random_uuid();
begin
  if not public.rrhh_puede_editar('liquidacion') then raise exception 'Sin permiso para cargar la liquidación'; end if;
  if p_empresa not in ('4H','4H_OC') then raise exception 'Empresa inválida: %', p_empresa; end if;
  if p_periodo !~ '^\d{4}-\d{2}$' then raise exception 'Período inválido: %', p_periodo; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Las filas tienen que venir como lista'; end if;
  if exists (select 1 from public.rrhh_periodos where periodo = p_periodo and estado = 'cerrado') then
    raise exception 'El período % está cerrado: no se puede reemplazar', p_periodo; end if;
  insert into public.rrhh_periodos (periodo) values (p_periodo) on conflict (periodo) do nothing;
  delete from public.rrhh_lotes where tipo = 'liquidacion' and periodo = p_periodo and empresa = p_empresa;   -- borra sus filas (cascade)
  insert into public.rrhh_lotes (id, tipo, periodo, empresa, archivo_nombre, filas, cargado_por)
    values (v_lote, 'liquidacion', p_periodo, p_empresa, p_archivo, jsonb_array_length(p_filas), auth.uid());
  insert into public.rrhh_liquidacion_filas (lote_id, periodo, empresa, legajo, tipo_liquidacion, nro_concepto, descripcion, grupo, importe, cantidad, valor)
    select v_lote, p_periodo, p_empresa, (x->>'legajo')::integer, x->>'tipo_liquidacion', x->>'nro_concepto', x->>'descripcion', x->>'grupo',
           coalesce((x->>'importe')::numeric, 0), coalesce((x->>'cantidad')::numeric, 0), coalesce((x->>'valor')::numeric, 0)
      from jsonb_array_elements(p_filas) x;
  update public.rrhh_periodos set estado = 'cargado' where periodo = p_periodo and estado = 'abierto';
  return v_lote;
end $$;

create or replace function public.rrhh_importar_novedades(p_periodo text, p_empresa text, p_archivo text, p_filas jsonb)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_lote uuid := gen_random_uuid();
begin
  if not public.rrhh_puede_editar('liquidacion') then raise exception 'Sin permiso para cargar novedades'; end if;
  if p_empresa not in ('4H','4H_OC') then raise exception 'Empresa inválida: %', p_empresa; end if;
  if p_periodo !~ '^\d{4}-\d{2}$' then raise exception 'Período inválido: %', p_periodo; end if;
  if jsonb_typeof(p_filas) <> 'array' then raise exception 'Las filas tienen que venir como lista'; end if;
  if exists (select 1 from public.rrhh_periodos where periodo = p_periodo and estado = 'cerrado') then
    raise exception 'El período % está cerrado: no se puede reemplazar', p_periodo; end if;
  insert into public.rrhh_periodos (periodo) values (p_periodo) on conflict (periodo) do nothing;
  delete from public.rrhh_lotes where tipo = 'novedades' and periodo = p_periodo and empresa = p_empresa;
  insert into public.rrhh_lotes (id, tipo, periodo, empresa, archivo_nombre, filas, cargado_por)
    values (v_lote, 'novedades', p_periodo, p_empresa, p_archivo, jsonb_array_length(p_filas), auth.uid());
  insert into public.rrhh_novedades (lote_id, periodo, empresa, fecha, legajo, cod_novedad, novedad, cantidad, expresion, valor, origen, departamento)
    select v_lote, p_periodo, p_empresa, (x->>'fecha')::date, (x->>'legajo')::integer, x->>'cod_novedad', x->>'novedad',
           coalesce((x->>'cantidad')::numeric, 0), x->>'expresion', coalesce((x->>'valor')::numeric, 0), x->>'origen', x->>'departamento'
      from jsonb_array_elements(p_filas) x;
  return v_lote;
end $$;

revoke all on function public.rrhh_importar_liquidacion(text,text,text,jsonb), public.rrhh_importar_novedades(text,text,text,jsonb) from public, anon;
grant execute on function public.rrhh_importar_liquidacion(text,text,text,jsonb), public.rrhh_importar_novedades(text,text,text,jsonb) to authenticated;

-- ---------------------------------------------------------------------
-- 7) Auditoría (si corriste el 080 del portal): solo catálogos y F.931. NO se audita lo individual
--    (costo, valor hora, imputación, liquidación): así los sueldos no se copian a otra tabla.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  if to_regproc('public.fn_core_auditoria') is not null then
    foreach t in array array['rrhh_periodos','rrhh_empleados','rrhh_conceptos','rrhh_diccionario','rrhh_f931']
    loop
      execute format('drop trigger if exists zz_auditoria on public.%I', t);
      execute format('create trigger zz_auditoria after insert or update or delete on public.%I for each row execute function public.fn_core_auditoria(''rrhh'')', t);
    end loop;
  end if;
end $$;

commit;

-- Verificación: tienen que aparecer las 11 tablas y las 5 funciones
select count(*) as tablas from information_schema.tables where table_schema = 'public' and table_name like 'rrhh\_%';
select proname from pg_proc where proname like 'rrhh\_%' order by 1;
