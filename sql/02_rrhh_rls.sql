-- ============================================================================
-- RRHH · Etapa 1 · RLS
-- ESTOY SUPONIENDO (verificar antes de ejecutar):
--   * existe public.tiene_sector(text) returns boolean
--   * existe public.ve_sueldos() returns boolean
-- Ninguna de las dos me fue mostrada; si la firma real es otra, ajustar solo
-- las dos funciones helper de abajo y el resto sigue igual.
-- Nunca se otorga nada a anon.
-- ============================================================================

create or replace function public.rrhh_puede() returns boolean
language sql stable security invoker as $$
  select public.tiene_sector('rrhh')
$$;

create or replace function public.rrhh_puede_importes() returns boolean
language sql stable security invoker as $$
  select public.tiene_sector('rrhh') and public.ve_sueldos()
$$;

-- Tablas sin importes: basta el sector.
alter table public.rrhh_periodos  enable row level security;
alter table public.rrhh_empleados enable row level security;
alter table public.rrhh_conceptos enable row level security;

create policy rrhh_periodos_all  on public.rrhh_periodos  for all to authenticated
  using (public.rrhh_puede()) with check (public.rrhh_puede());
create policy rrhh_empleados_all on public.rrhh_empleados for all to authenticated
  using (public.rrhh_puede()) with check (public.rrhh_puede());
create policy rrhh_conceptos_all on public.rrhh_conceptos for all to authenticated
  using (public.rrhh_puede()) with check (public.rrhh_puede());

-- Tablas con importes: sector + bandera ve_sueldos.
alter table public.rrhh_lotes             enable row level security;
alter table public.rrhh_liquidacion_filas enable row level security;
alter table public.rrhh_novedades         enable row level security;
alter table public.rrhh_f931              enable row level security;

create policy rrhh_lotes_all on public.rrhh_lotes for all to authenticated
  using (public.rrhh_puede_importes()) with check (public.rrhh_puede_importes());
create policy rrhh_liq_all on public.rrhh_liquidacion_filas for all to authenticated
  using (public.rrhh_puede_importes()) with check (public.rrhh_puede_importes());
create policy rrhh_nov_all on public.rrhh_novedades for all to authenticated
  using (public.rrhh_puede_importes()) with check (public.rrhh_puede_importes());
create policy rrhh_f931_all on public.rrhh_f931 for all to authenticated
  using (public.rrhh_puede_importes()) with check (public.rrhh_puede_importes());

revoke all on public.rrhh_periodos, public.rrhh_empleados, public.rrhh_conceptos,
  public.rrhh_lotes, public.rrhh_liquidacion_filas, public.rrhh_novedades,
  public.rrhh_f931 from anon;
grant select, insert, update, delete on public.rrhh_periodos, public.rrhh_empleados,
  public.rrhh_conceptos, public.rrhh_lotes, public.rrhh_liquidacion_filas,
  public.rrhh_novedades, public.rrhh_f931 to authenticated;
