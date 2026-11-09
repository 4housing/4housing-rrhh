-- =====================================================================
-- RRHH · Bonos: al volver a importar el libro se CONSERVAN las correcciones hechas a mano.
-- Reemplaza SOLO la función rrhh_importar_bonos (las tablas no se tocan). Corré este archivo entero ANTES de publicar el HTML.
--   · Antes: cada importación borraba todo el histórico y lo cargaba de nuevo (se perdía el tipo corregido a mano).
--   · Ahora: actualiza los bonos que ya existen (mismo num_bono) y conserva:
--       - el tipo (montaje / posventa / produccion) si la planilla lo trae como «sin_discriminar»;
--       - el período si la planilla lo trae vacío o inválido.
--     Lo que la planilla trae con valor (monto, proyecto, nombre, y un tipo o período válido) se actualiza.
--   · Los bonos que ya no están en la planilla se borran (junto con sus importes por persona); los importes por persona se recargan.
-- Idempotente. No borra datos al correrlo (solo al importar).
-- =====================================================================
begin;

create or replace function public.rrhh_importar_bonos(p_bonos jsonb, p_personas jsonb)
returns integer
language plpgsql security definer set search_path = public as $$
begin
  if not public.rrhh_puede_editar('costos') then raise exception 'Sin permiso para cargar bonos'; end if;
  if jsonb_typeof(p_bonos) <> 'array' or jsonb_typeof(p_personas) <> 'array' then raise exception 'Los datos tienen que venir como lista'; end if;

  -- los que ya no están en la planilla se van (cascade: también sus personas)
  delete from public.rrhh_bonos
   where origen = 'historico'
     and num_bono not in (select (x->>'num_bono')::integer from jsonb_array_elements(p_bonos) x);

  insert into public.rrhh_bonos (num_bono, nombre, proyecto, tipo, etiqueta_periodo, periodo_desde, periodo_hasta, monto, caja, planilla_cerrada, origen)
    select (x->>'num_bono')::integer, x->>'nombre', x->>'proyecto', coalesce(x->>'tipo', 'sin_discriminar'), x->>'etiqueta_periodo',
           nullif(x->>'periodo_desde', ''), nullif(x->>'periodo_hasta', ''), coalesce((x->>'monto')::numeric, 0),
           (x->>'caja')::numeric, (x->>'planilla_cerrada')::numeric, 'historico'
      from jsonb_array_elements(p_bonos) x
  on conflict (num_bono) do update set
    nombre = excluded.nombre,
    proyecto = excluded.proyecto,
    monto = excluded.monto,
    caja = excluded.caja,
    planilla_cerrada = excluded.planilla_cerrada,
    tipo = case when excluded.tipo = 'sin_discriminar' then public.rrhh_bonos.tipo else excluded.tipo end,
    etiqueta_periodo = case when excluded.periodo_desde is null then coalesce(public.rrhh_bonos.etiqueta_periodo, excluded.etiqueta_periodo) else excluded.etiqueta_periodo end,
    periodo_desde = coalesce(excluded.periodo_desde, public.rrhh_bonos.periodo_desde),
    periodo_hasta = coalesce(excluded.periodo_hasta, public.rrhh_bonos.periodo_hasta)
  where public.rrhh_bonos.origen = 'historico';

  delete from public.rrhh_bonos_persona where num_bono in (select num_bono from public.rrhh_bonos where origen = 'historico');
  insert into public.rrhh_bonos_persona (num_bono, legajo, importe)
    select (x->>'num_bono')::integer, (x->>'legajo')::integer, (x->>'importe')::numeric
      from jsonb_array_elements(p_personas) x;
  return jsonb_array_length(p_personas);
end $$;
revoke all on function public.rrhh_importar_bonos(jsonb, jsonb) from public, anon;
grant execute on function public.rrhh_importar_bonos(jsonb, jsonb) to authenticated;

commit;

-- Comprobación (debería devolver 1 función):
select count(*) as funcion from pg_proc where proname = 'rrhh_importar_bonos';
