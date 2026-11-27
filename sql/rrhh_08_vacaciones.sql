-- =====================================================================
-- RRHH · paso 8 · vacaciones (etapa 3a: saldos y pedidos cargados por RRHH)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_07_novedades.sql.
--
-- Qué hace
--   · rrhh_vac_saldos: días de vacaciones que le corresponden a cada legajo en cada año (los escribe RRHH; la app no calcula nada).
--   · rrhh_vac_pedidos: pedidos de vacaciones con su estado (pedido → aprobado por el jefe → aprobado por RRHH, o rechazado / cancelado).
--     Los días de cada pedido los escribe RRHH. Al aprobar, RRHH genera las novedades VACJOR / VACM en rrhh_novedades_carga.
--   · Agrega a rrhh_novedades_carga el origen 'vacaciones' y la referencia al pedido (para el control de integridad).
--   · NO guarda sueldos, C.U.I.L., teléfono ni correo.
--
-- Acceso: solo usuarios autenticados, con la compuerta de la sección «liquidacion» de RRHH. anon no tiene acceso.
-- Reversible: alter table public.rrhh_novedades_carga drop column vac_pedido; drop table public.rrhh_vac_pedidos, public.rrhh_vac_saldos;
--             (y volver a crear el check de origen sin 'vacaciones')
-- =====================================================================
create table if not exists public.rrhh_vac_saldos (
  empresa        text not null check (empresa in ('4H', '4H_OC')),
  legajo         integer not null check (legajo > 0),
  anio           integer not null check (anio between 2000 and 2100),
  dias           numeric not null check (dias >= 0 and dias <= 366),
  nota           text check (nota is null or length(nota) <= 200),
  actualizado_por uuid default auth.uid(),
  actualizado_en timestamptz not null default now(),
  primary key (empresa, legajo, anio)
);

create table if not exists public.rrhh_vac_pedidos (
  id             uuid primary key default gen_random_uuid(),
  empresa        text not null check (empresa in ('4H', '4H_OC')),
  legajo         integer not null check (legajo > 0),
  anio           integer not null check (anio between 2000 and 2100),      -- año del saldo del que se descuenta
  desde          date not null,
  hasta          date not null,
  dias           numeric not null check (dias > 0 and dias <= 366),       -- los escribe RRHH
  codigo         text not null check (codigo = upper(btrim(codigo)) and length(codigo) between 1 and 30),   -- VACJOR o VACM
  cantidad       numeric not null check (cantidad > 0),                    -- cantidad de cada novedad diaria (lo que lleva cada día en Delta)
  estado         text not null default 'pedido' check (estado in ('pedido', 'aprobado_jefe', 'aprobado', 'rechazado', 'cancelado')),
  jefe_nombre    text check (jefe_nombre is null or length(jefe_nombre) <= 100),   -- quién aprobó por el jefe (lo registra RRHH hasta que los jefes entren a la app)
  jefe_fecha     date,
  observaciones  text check (observaciones is null or length(observaciones) <= 200),
  motivo_rechazo text check (motivo_rechazo is null or length(motivo_rechazo) <= 200),
  creado_por     uuid default auth.uid(),
  creado_en      timestamptz not null default now(),
  decidido_por   uuid,
  decidido_en    timestamptz,
  novedades_generadas_en timestamptz,
  check (hasta >= desde)
);
create index if not exists rrhh_vac_pedidos_legajo_idx on public.rrhh_vac_pedidos (empresa, legajo, anio);

-- Novedades: origen 'vacaciones' y referencia al pedido.
alter table public.rrhh_novedades_carga drop constraint if exists rrhh_novedades_carga_origen_check;
alter table public.rrhh_novedades_carga add constraint rrhh_novedades_carga_origen_check check (origen in ('manual', 'fichadas', 'vacaciones'));
alter table public.rrhh_novedades_carga add column if not exists vac_pedido uuid references public.rrhh_vac_pedidos (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['rrhh_vac_saldos', 'rrhh_vac_pedidos'] loop
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
