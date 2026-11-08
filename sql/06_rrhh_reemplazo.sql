-- =====================================================================
-- RRHH · migración 06 · reemplazar el esquema provisorio (sql/01 a 05) por el oficial (rrhh_00 / rrhh_01)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor.
--
-- Orden de este paso:   1) este archivo   2) rrhh_00_sector.sql (no hace nada si 'rrhh' ya existe)
--                       3) rrhh_01_tablas.sql   4) catálogo de conceptos   5) recién ahí, el HTML nuevo
--
-- Qué hace
--   · Se FRENA SOLO si alguna tabla de datos (lotes, liquidación, novedades, F.931, empleados) tiene filas,
--     o si el esquema oficial ya está instalado (rrhh_lotes.archivo_nombre existe). En esos casos no borra nada.
--   · Si están vacías, borra las 7 tablas provisorias (y con ellas sus políticas) y las funciones provisorias.
--   · El catálogo de conceptos (rrhh_conceptos) se borra aunque tenga filas: es configuración y se recarga.
--
-- Mientras no corras rrhh_01_tablas.sql no hay tablas rrhh_*: la pantalla de importación actual no funciona.
-- Está bien: hoy no hay datos cargados. Corré el paso 3 enseguida.
-- Reversible: volver a correr sql/01 a 04 (recrea el esquema provisorio, vacío).
-- =====================================================================

begin;

do $$
declare
  t text;
  v_n bigint;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'rrhh_lotes' and column_name = 'archivo_nombre') then
    raise exception 'El esquema oficial ya está instalado (rrhh_lotes.archivo_nombre existe). No se borró nada.';
  end if;
  foreach t in array array['rrhh_novedades','rrhh_liquidacion_filas','rrhh_lotes','rrhh_f931','rrhh_empleados'] loop
    if to_regclass('public.' || t) is not null then
      execute format('select count(*) from public.%I', t) into v_n;
      if v_n > 0 then
        raise exception 'La tabla % tiene % filas: no se reemplaza. Resolvé primero qué hacer con esos datos. No se borró nada.', t, v_n;
      end if;
    end if;
  end loop;
end $$;

drop table if exists public.rrhh_novedades, public.rrhh_liquidacion_filas, public.rrhh_lotes,
  public.rrhh_f931, public.rrhh_empleados, public.rrhh_conceptos, public.rrhh_periodos cascade;

drop function if exists public.rrhh_importar_lote(text, text, text, jsonb);
drop function if exists public.rrhh_importar_padron(jsonb);
drop function if exists public.rrhh_puede_importes();
drop function if exists public.rrhh_puede();
drop function if exists public.rrhh_ve_sueldos();
-- rrhh_puede_ver / rrhh_puede_editar (de sql/05, si se hubiera corrido) las reemplaza rrhh_01_tablas.sql.

commit;

-- Verificación: no tiene que quedar ninguna tabla rrhh_ ni función rrhh_ (salvo, quizá, rrhh_puede_ver / rrhh_puede_editar)
select count(*) as tablas_rrhh from information_schema.tables where table_schema = 'public' and table_name like 'rrhh\_%';
select proname from pg_proc where proname like 'rrhh\_%' order by 1;
