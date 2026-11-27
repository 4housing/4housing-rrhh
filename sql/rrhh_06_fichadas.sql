-- =====================================================================
-- RRHH · paso 6 · fichadas, partes diarios y correcciones (etapa 1)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_01_tablas.sql.
--
-- Qué hace
--   · Guarda las fichadas del .txt de Tango Fichadas, las correcciones de RRHH (fichadas manuales y anuladas, con motivo y usuario)
--     y la revisión de cada día (horas extra aprobadas).
--   · Guarda la configuración de horarios por legajo y los feriados, que usa la app para calcular el parte.
--   · NO guarda sueldos ni importes. NO guarda C.U.I.L., teléfono ni correo.
--
-- Acceso: solo usuarios autenticados, con la compuerta de la sección «liquidacion» de RRHH (rrhh_puede_ver / rrhh_puede_editar).
-- Sin lista guardada = no ve nada; dirección ve todo. anon no tiene acceso a nada.
--
-- Los datos reales (horarios, legajo → horario, feriados) NO van en este archivo: se cargan con un SQL aparte que se entrega por fuera del repo.
-- Reversible: drop table public.rrhh_partes_dia, public.rrhh_fichadas, public.rrhh_legajo_fichadas, public.rrhh_horarios, public.rrhh_feriados;
-- =====================================================================

-- Horarios de Delta: la definición completa (tramos por día, tolerancias, descanso, feriados) va en jsonb.
create table if not exists public.rrhh_horarios (
  codigo         text primary key,
  descripcion    text,
  definicion     jsonb not null,
  actualizado_en timestamptz not null default now()
);

-- Configuración por legajo para Control de personal.
create table if not exists public.rrhh_legajo_fichadas (
  legajo         integer primary key,
  horario        text references public.rrhh_horarios (codigo),
  unidad         integer not null default 30 check (unidad in (1, 30)),   -- unidad de pago de horas extra (minutos)
  habilitado     boolean not null default true,                             -- habilitado para Control de personal
  autoriza_extras boolean not null default true,
  jefe_legajo    integer,
  actualizado_en timestamptz not null default now()
);

create table if not exists public.rrhh_feriados (
  fecha       date primary key,
  descripcion text
);

-- Fichadas: las de Tango (origen 'tango') y las que agrega RRHH (origen 'manual'). Anular no borra: queda el rastro.
create table if not exists public.rrhh_fichadas (
  id           uuid primary key default gen_random_uuid(),
  legajo       integer not null,
  fecha        date not null,
  hora         text not null check (hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  codigo       text not null,                       -- código de fichador (0102 = legajo 102)
  reloj        text not null default 'NEXOF',
  origen       text not null check (origen in ('tango', 'manual')),
  lote         text,                                -- nombre del archivo del que vino
  motivo       text,                                -- obligatorio para las manuales y las anuladas (lo exige la app)
  anulada      boolean not null default false,
  creado_por   uuid default auth.uid(),
  creado_en    timestamptz not null default now(),
  anulada_por  uuid,
  anulada_en   timestamptz,
  unique (legajo, fecha, hora, origen)
);
create index if not exists rrhh_fichadas_fecha_idx on public.rrhh_fichadas (fecha, legajo);

-- Revisión de cada persona y día: horas extra aprobadas (en minutos) y nota.
create table if not exists public.rrhh_partes_dia (
  legajo               integer not null,
  fecha                date not null,
  estado               text not null default 'pendiente' check (estado in ('pendiente', 'revisado')),
  extra50_aprobada_min integer check (extra50_aprobada_min is null or extra50_aprobada_min >= 0),
  extra100_aprobada_min integer check (extra100_aprobada_min is null or extra100_aprobada_min >= 0),
  nota                 text,
  revisado_por         uuid default auth.uid(),
  revisado_en          timestamptz not null default now(),
  primary key (legajo, fecha)
);

-- RLS: authenticated, con la compuerta de sección. Nunca anon.
do $$
declare t text;
begin
  foreach t in array array['rrhh_horarios', 'rrhh_legajo_fichadas', 'rrhh_feriados', 'rrhh_fichadas', 'rrhh_partes_dia'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_sel', t);
    execute format('drop policy if exists %I on public.%I', t || '_ins', t);
    execute format('drop policy if exists %I on public.%I', t || '_upd', t);
    execute format('drop policy if exists %I on public.%I', t || '_del', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.rrhh_puede_ver(%L))', t || '_sel', t, 'liquidacion');
    execute format('create policy %I on public.%I for insert to authenticated with check (public.rrhh_puede_editar(%L))', t || '_ins', t, 'liquidacion');
    execute format('create policy %I on public.%I for update to authenticated using (public.rrhh_puede_editar(%L)) with check (public.rrhh_puede_editar(%L))', t || '_upd', t, 'liquidacion', 'liquidacion');
    execute format('create policy %I on public.%I for delete to authenticated using (public.rrhh_puede_editar(%L))', t || '_del', t, 'liquidacion');
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
