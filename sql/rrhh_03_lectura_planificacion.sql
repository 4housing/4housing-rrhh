-- =====================================================================
-- RRHH · paso 3 · lectura de la planificación desde RRHH (SOLO LECTURA)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_01_tablas.sql.
--
-- Qué hace
--   · Crea rrhh_planificacion_mes(p_periodo 'AAAA-MM'): devuelve, en UN json, lo que RRHH necesita de planificación
--     para ese mes: detalle diario (persona, proyecto, tarea, horas, ausencias), no disponibilidad (vacaciones, licencias),
--     feriados y supervisión.
--   · Corre con permisos propios (security definer) para poder leer las tablas de planificación SIN darle a RRHH
--     acceso directo a ellas. Solo responde a quien tenga VER en la sección «costos» de RRHH (dirección = todo).
--   · NO escribe nada y NO modifica ninguna tabla de planificación.
--   · NO devuelve datos de sueldos ni personales: ni costo_hora, ni valor_hora_plan, ni presupuestos, ni nombres de
--     personas (solo el legajo). Los nombres de proyecto sí (son necesarios para imputar el costo).
--   · RLS/permisos: execute solo para authenticated; anon no tiene acceso.
--
-- Reversible: drop function public.rrhh_planificacion_mes(text);
-- =====================================================================

create or replace function public.rrhh_planificacion_mes(p_periodo text)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_desde date;
  v_hasta date;   -- exclusivo: primer día del mes siguiente
begin
  if not public.rrhh_puede_ver('costos') then
    raise exception 'Sin permiso para leer la planificación desde RRHH';
  end if;
  if p_periodo is null or p_periodo !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Período inválido: % (se espera AAAA-MM)', p_periodo;
  end if;
  v_desde := (p_periodo || '-01')::date;
  v_hasta := (v_desde + interval '1 month')::date;

  return jsonb_build_object(
    'periodo', p_periodo,

    -- Detalle diario: la persona REAL es la que importa para el costo; se manda también la planificada.
    'detalle', coalesce((
      select jsonb_agg(jsonb_build_object(
               'fecha', d.fecha, 'sede', d.sede,
               'legajo', nullif(trim(pr.legajo), ''), 'tipo_persona', pr.tipo,
               'legajo_plan', nullif(trim(pp.legajo), ''),
               'proyecto_codigo', py.codigo, 'proyecto_nombre', py.nombre,
               'estacion_plan', d.estacion_plan, 'estacion_real', d.estacion_real, 'subtarea_real', d.subtarea_real,
               'horas_normales', d.horas_normales, 'horas_extra', d.horas_extra, 'horas_plan', d.horas_plan,
               'ausente', d.ausente, 'es_extra', d.es_extra)
             order by d.fecha, pr.legajo)
        from public.planificacion_detalle_diario d
        left join public.planificacion_personal pr on pr.id = d.persona_real
        left join public.planificacion_personal pp on pp.id = d.persona_plan
        left join public.planificacion_proyectos py on py.id = d.proyecto_id
       where d.fecha >= v_desde and d.fecha < v_hasta), '[]'::jsonb),

    -- No disponibilidad (vacaciones, licencias, etc.) que toca el mes
    'no_disponibilidad', coalesce((
      select jsonb_agg(jsonb_build_object(
               'legajo', nullif(trim(p.legajo), ''), 'tipo', n.tipo, 'desde', n.desde, 'hasta', n.hasta)
             order by n.desde, p.legajo)
        from public.planificacion_no_disponibilidad n
        left join public.planificacion_personal p on p.id = n.persona_id
       where n.desde < v_hasta and coalesce(n.hasta, n.desde) >= v_desde), '[]'::jsonb),

    'feriados', coalesce((
      select jsonb_agg(jsonb_build_object('fecha', f.fecha, 'nombre', f.nombre, 'se_trabaja', f.se_trabaja) order by f.fecha)
        from public.planificacion_feriados f
       where f.fecha >= v_desde and f.fecha < v_hasta), '[]'::jsonb),

    -- Supervisión: «proyectos» es la lista de proyectos supervisados (texto) y se interpreta del lado de la app
    'supervision', coalesce((
      select jsonb_agg(jsonb_build_object(
               'legajo', nullif(trim(p.legajo), ''), 'proyectos', s.proyectos,
               'desde', s.fecha_desde, 'hasta', s.fecha_hasta, 'horas', s.horas)
             order by s.fecha_desde, p.legajo)
        from public.planificacion_supervision s
        left join public.planificacion_personal p on p.id = s.supervisor_id
       where coalesce(s.fecha_desde, v_desde) < v_hasta and coalesce(s.fecha_hasta, v_hasta) >= v_desde), '[]'::jsonb)
  );
end $$;

revoke all on function public.rrhh_planificacion_mes(text) from public, anon;
grant execute on function public.rrhh_planificacion_mes(text) to authenticated;
