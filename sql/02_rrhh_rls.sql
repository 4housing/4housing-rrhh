-- ============================================================================
-- RRHH · Etapa 1 · RLS
-- Verificado en Supabase:
--   * public.tiene_sector(s sector_portal) existe y 'rrhh' es un valor válido del tipo.
--   * ve_sueldos NO es una función: es una clave booleana dentro de
--     perfiles_sector.permisos (ej.: {"ve_sueldos": true}). Hoy solo la usan filas
--     de planificación y ninguna política de la base la consulta.
-- Acá se aplica en la base (RLS): sin la bandera no se leen ni se importan importes.
-- ESTOY SUPONIENDO que dirección ve sueldos sin necesitar la bandera (igual que
-- tiene_sector deja pasar a es_direccion()). Para exigir la bandera también a
-- dirección: borrar la línea "public.es_direccion() or" de rrhh_ve_sueldos().
-- Para dar acceso a otra persona: en su fila de perfiles_sector con sector 'rrhh',
-- permisos = {"ve_sueldos": true}.
-- Nunca se otorga nada a anon.
-- ⚠ REEMPLAZADO por sql/05_rrhh_secciones.sql (permisos por sección del portal). Si ya corriste el 05,
--   NO vuelvas a correr este archivo: recrearía las políticas anteriores y, como se suman (OR), ampliaría el acceso.
-- ============================================================================

create or replace function public.rrhh_ve_sueldos() returns boolean
language sql stable security invoker set search_path = public as $$
  select public.es_direccion() or exists (
    select 1 from public.perfiles_sector ps
    where ps.perfil_id = auth.uid()
      and ps.sector = 'rrhh'
      and coalesce((ps.permisos->>'ve_sueldos')::boolean, false)
  )
$$;

create or replace function public.rrhh_puede() returns boolean
language sql stable security invoker set search_path = public as $$
  select public.tiene_sector('rrhh')
$$;

create or replace function public.rrhh_puede_importes() returns boolean
language sql stable security invoker set search_path = public as $$
  select public.tiene_sector('rrhh') and public.rrhh_ve_sueldos()
$$;

revoke all on function public.rrhh_ve_sueldos(), public.rrhh_puede(), public.rrhh_puede_importes() from public, anon;
grant execute on function public.rrhh_ve_sueldos(), public.rrhh_puede(), public.rrhh_puede_importes() to authenticated;

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
