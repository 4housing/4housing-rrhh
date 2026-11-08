-- =====================================================================
-- RRHH · paso 0 · registrar el sector "rrhh" en el portal
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, SOLO, ANTES de rrhh_01_tablas.sql.
--
-- Qué hace: agrega el valor 'rrhh' al tipo public.sector_portal si todavía no existe.
-- Si ya existe, no hace nada (idempotente). Corrélo en una ejecución separada del paso 1:
-- en Postgres un valor nuevo de un enum no se puede usar dentro de la misma transacción donde se crea.
--
-- IMPORTANTE (fuera de esta base): la pantalla de Usuarios del portal (admin.html → SECCIONES) tiene que
-- publicar las secciones de RRHH para poder tildar Ver / Editar a cada persona, como se hizo con adminfin:
--   liquidacion · Liquidación (cargar informes, ver y editar la liquidación)
--   costos      · Costos e imputación (ver costo por persona y por destino)
--   config      · Configuración (conceptos, diccionario, empleados)
-- Ese cambio es del portal, no de la app de RRHH.
-- =====================================================================

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'sector_portal' and e.enumlabel = 'rrhh'
  ) then
    alter type public.sector_portal add value 'rrhh';
  end if;
end $$;

-- Verificación: tiene que aparecer 'rrhh'
select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
 where t.typname = 'sector_portal' order by e.enumsortorder;
