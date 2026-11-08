-- =====================================================================
-- Recursos Humanos · permisos por sección desde el portal (nov 2026)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de sql/01 a sql/04.
--
-- Qué hace (mismo modelo que Administración y Finanzas: sql/2026-10_adminfin_secciones.sql):
--   La app publica sus secciones en la pantalla de Usuarios del portal (admin.html → SECCIONES.rrhh):
--     importar · Importar informes (sueldos)   ← SENSIBLE: nadie la ve por defecto, la habilita dirección
--   Los tildes Ver / Editar se guardan en perfiles_sector.permisos.
--   · rrhh_puede_ver(seccion) / rrhh_puede_editar(seccion): dirección = todo; el resto solo lo que tenga tildado.
--     Sin listas guardadas, una sección sensible NO se ve ni se edita. "Solo visión" (lector) nunca edita.
--   · Las políticas RLS pasan de la bandera ve_sueldos a estas funciones (la bandera ve_sueldos era la de
--     planificación; RRHH ya no la usa).
--
-- ⚠ NO volver a correr sql/02_rrhh_rls.sql después de este archivo: recrearía las políticas anteriores
--   y, como las políticas se suman (OR), ampliaría el acceso.
-- Reversible: borrar las políticas rrhh_*_sel/_ins/_upd/_del y volver a correr sql/02.
--
-- Para sumar una sección nueva (ej. 'costos'): agregarla en SECCIONES.rrhh del portal, decidir si es sensible
-- (agregarla a v_sens en las dos funciones y a SENSIBLE_DEFAULT.rrhh del portal) y ampliar las políticas de
-- lectura de las tablas que use (hoy las de importes leen solo con 'importar').
-- =====================================================================

begin;

create or replace function public.rrhh_puede_ver(p_sec text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_sens text[] := array['importar'];   -- secciones sensibles: sin lista guardada no se ven
begin
  return public.es_direccion() or exists (
    select 1 from public.perfiles p join public.perfiles_sector ps on ps.perfil_id = p.id
     where p.id = auth.uid() and p.activo and ps.sector = 'rrhh'::public.sector_portal
       and case when jsonb_typeof(ps.permisos -> 'ver') = 'array' then (ps.permisos -> 'ver') ? p_sec
                else not (p_sec = any (v_sens)) end);
end $$;

create or replace function public.rrhh_puede_editar(p_sec text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_sens text[] := array['importar'];
begin
  return public.es_direccion() or exists (
    select 1 from public.perfiles p join public.perfiles_sector ps on ps.perfil_id = p.id
     where p.id = auth.uid() and p.activo and ps.sector = 'rrhh'::public.sector_portal
       and lower(coalesce(ps.cargo, '')) not in ('lector', 'lectura')
       and case when jsonb_typeof(ps.permisos -> 'ver') = 'array' then (ps.permisos -> 'ver') ? p_sec
                else not (p_sec = any (v_sens)) end
       and case when jsonb_typeof(ps.permisos -> 'editar') = 'array' then (ps.permisos -> 'editar') ? p_sec
                else lower(coalesce(ps.cargo, '')) <> 'editor' and not (p_sec = any (v_sens)) end);
end $$;

revoke all on function public.rrhh_puede_ver(text), public.rrhh_puede_editar(text) from public, anon;
grant execute on function public.rrhh_puede_ver(text), public.rrhh_puede_editar(text) to authenticated;

-- ---------------------------------------------------------------------
-- Políticas: se reemplazan las "_all" de sql/02 (sector + ve_sueldos)
-- ---------------------------------------------------------------------
drop policy if exists rrhh_periodos_all  on public.rrhh_periodos;
drop policy if exists rrhh_empleados_all on public.rrhh_empleados;
drop policy if exists rrhh_conceptos_all on public.rrhh_conceptos;
drop policy if exists rrhh_lotes_all     on public.rrhh_lotes;
drop policy if exists rrhh_liq_all       on public.rrhh_liquidacion_filas;
drop policy if exists rrhh_nov_all       on public.rrhh_novedades;
drop policy if exists rrhh_f931_all      on public.rrhh_f931;

-- Sin importes (períodos, padrón, catálogo): leer = tener el sector; escribir = editar 'importar'.
create policy rrhh_periodos_sel  on public.rrhh_periodos  for select to authenticated using (public.rrhh_puede());
create policy rrhh_periodos_ins  on public.rrhh_periodos  for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_periodos_upd  on public.rrhh_periodos  for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_periodos_del  on public.rrhh_periodos  for delete to authenticated using (public.rrhh_puede_editar('importar'));

create policy rrhh_empleados_sel on public.rrhh_empleados for select to authenticated using (public.rrhh_puede());
create policy rrhh_empleados_ins on public.rrhh_empleados for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_empleados_upd on public.rrhh_empleados for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_empleados_del on public.rrhh_empleados for delete to authenticated using (public.rrhh_puede_editar('importar'));

create policy rrhh_conceptos_sel on public.rrhh_conceptos for select to authenticated using (public.rrhh_puede());
create policy rrhh_conceptos_ins on public.rrhh_conceptos for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_conceptos_upd on public.rrhh_conceptos for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_conceptos_del on public.rrhh_conceptos for delete to authenticated using (public.rrhh_puede_editar('importar'));

-- Con importes (lotes, liquidación, novedades, F.931): leer = ver 'importar'; escribir = editar 'importar'.
create policy rrhh_lotes_sel on public.rrhh_lotes for select to authenticated using (public.rrhh_puede_ver('importar'));
create policy rrhh_lotes_ins on public.rrhh_lotes for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_lotes_upd on public.rrhh_lotes for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_lotes_del on public.rrhh_lotes for delete to authenticated using (public.rrhh_puede_editar('importar'));

create policy rrhh_liq_sel on public.rrhh_liquidacion_filas for select to authenticated using (public.rrhh_puede_ver('importar'));
create policy rrhh_liq_ins on public.rrhh_liquidacion_filas for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_liq_upd on public.rrhh_liquidacion_filas for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_liq_del on public.rrhh_liquidacion_filas for delete to authenticated using (public.rrhh_puede_editar('importar'));

create policy rrhh_nov_sel on public.rrhh_novedades for select to authenticated using (public.rrhh_puede_ver('importar'));
create policy rrhh_nov_ins on public.rrhh_novedades for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_nov_upd on public.rrhh_novedades for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_nov_del on public.rrhh_novedades for delete to authenticated using (public.rrhh_puede_editar('importar'));

create policy rrhh_f931_sel on public.rrhh_f931 for select to authenticated using (public.rrhh_puede_ver('importar'));
create policy rrhh_f931_ins on public.rrhh_f931 for insert to authenticated with check (public.rrhh_puede_editar('importar'));
create policy rrhh_f931_upd on public.rrhh_f931 for update to authenticated using (public.rrhh_puede_editar('importar')) with check (public.rrhh_puede_editar('importar'));
create policy rrhh_f931_del on public.rrhh_f931 for delete to authenticated using (public.rrhh_puede_editar('importar'));

commit;
