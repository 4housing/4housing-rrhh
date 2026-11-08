-- ============================================================================
-- RRHH · Etapa 1 · Esquema (aditivo, solo CREATE; no toca tablas de otros módulos)
-- Prefijo confirmado: rrhh_
-- Este archivo NO contiene datos. Datos de sueldos: nunca al repo.
-- Ejecutar a mano en el SQL Editor de Supabase, en orden: 01, 02, 03.
--
-- NO incluidas todavía (dependen de decisiones [A DEFINIR] del handoff §12):
--   rrhh_costo_mensual, rrhh_imputacion_mensual.
-- No se guarda C.U.I.L., teléfono ni correo.
-- ============================================================================

create table if not exists public.rrhh_periodos (
  periodo     text primary key check (periodo ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  estado      text not null default 'abierto'
              check (estado in ('abierto','cargado','controlado','cerrado')),
  cerrado_en  timestamptz
);

create table if not exists public.rrhh_empleados (
  legajo        integer primary key,
  nombre        text not null,
  departamento  text,
  categoria     text,
  tipo_pago     text check (tipo_pago in ('jornalizado','mensualizado')),
  sede          text,
  activo        boolean not null default true,
  -- uuid: es el tipo de planificacion_valor_hora_hist.persona_id (verificado en Supabase).
  -- Sin FK: no conozco el nombre de la tabla de personas de planificación.
  planificacion_persona_id uuid
);

create table if not exists public.rrhh_conceptos (
  nro_concepto   integer not null,
  empresa        text    not null check (empresa in ('4H','4H_OC')),
  descripcion    text,
  grupo_sistema  text check (grupo_sistema in
                   ('Haberes','Retenciones','Contribuciones','No Remunerativo')),
  agrupador      text check (agrupador in
                   ('SUELDO','VACACIONES','SAC','APORTES','CONTRIBUCIONES',
                    'SEGURO SINDICAL','COPAR','BONOS','RRHH','INDEMNIZACION')),
  -- NULL = pendiente de definir. La app debe bloquear el cierre si un concepto
  -- liquidado tiene trata NULL o no está en esta tabla.
  trata          text check (trata in
                   ('costo','excluir','directo_proyecto','cuenta_rrhh','retencion')),
  es_hora        boolean not null default false,
  hora_productiva boolean,   -- solo si es_hora
  tipo_hora      text,       -- p.ej. jornalizada, extra_50, vacaciones... (texto libre por ahora)
  -- Handoff §9.1: cómo reparte el motor de cierre cada concepto entre tipos de hora.
  -- NULL = sin definir. Los fijos mensuales dependen de la decisión 7b (i vs ii).
  prorrateo      text check (prorrateo in
                   ('directo','por_horas_pagas','por_pago_tipo','fijo_mensual','cargas')),
  primary key (nro_concepto, empresa)
);

-- Un lote = un informe importado (período, empresa, tipo). Reimportar =
-- borrar el lote y cargar el nuevo en una misma transacción (idempotente).
create table if not exists public.rrhh_lotes (
  id          bigint generated always as identity primary key,
  periodo     text not null references public.rrhh_periodos(periodo),
  empresa     text not null check (empresa in ('4H','4H_OC')),
  tipo        text not null check (tipo in ('resumen','novedades')),
  cargado_por uuid default auth.uid(),
  cargado_en  timestamptz not null default now(),
  unique (periodo, empresa, tipo)
);

-- Sin FK a rrhh_empleados a propósito: un legajo liquidado que falta en el
-- padrón debe cargarse y aparecer como alerta (control §7.3), no rechazarse.
create table if not exists public.rrhh_liquidacion_filas (
  id               bigint generated always as identity primary key,
  lote_id          bigint not null references public.rrhh_lotes(id) on delete cascade,
  periodo          text not null,
  empresa          text not null check (empresa in ('4H','4H_OC')),
  legajo           integer not null,
  tipo_liquidacion text not null,   -- forma parte de la clave de la fila (§3.1)
  nro_concepto     integer not null,
  importe          numeric(14,2) not null default 0,
  cantidad         numeric(12,2),
  valor            numeric(14,2)
);
create index if not exists rrhh_liq_filas_idx
  on public.rrhh_liquidacion_filas (periodo, empresa, legajo, nro_concepto);

create table if not exists public.rrhh_novedades (
  id          bigint generated always as identity primary key,
  lote_id     bigint not null references public.rrhh_lotes(id) on delete cascade,
  periodo     text not null,
  empresa     text not null check (empresa in ('4H','4H_OC')),
  fecha       date not null,
  legajo      integer not null,
  cod_novedad text not null,
  novedad     text,
  cantidad    numeric(12,2),
  expresion   text,
  valor       numeric(14,2),
  origen      text
);
create index if not exists rrhh_nov_idx
  on public.rrhh_novedades (periodo, empresa, legajo, fecha);

create table if not exists public.rrhh_f931 (
  periodo          text primary key references public.rrhh_periodos(periodo),
  remuneracion_1   numeric(14,2),
  contrib_ss       numeric(14,2),
  contrib_os       numeric(14,2),
  lrt              numeric(14,2),
  scvo             numeric(14,2),
  aportes_ss       numeric(14,2),
  aportes_os       numeric(14,2),
  empleados        integer
);

-- Si rrhh_conceptos ya se había creado con la versión anterior de este archivo:
alter table public.rrhh_conceptos
  add column if not exists prorrateo text
  check (prorrateo in ('directo','por_horas_pagas','por_pago_tipo','fijo_mensual','cargas'));
