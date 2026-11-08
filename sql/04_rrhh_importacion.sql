-- ============================================================================
-- RRHH · Etapa 2 · Funciones de importación (idempotentes, transaccionales)
-- supabase-js no tiene transacciones: el borrado del lote anterior y la carga
-- del nuevo van en UNA función, que Postgres ejecuta como una sola transacción.
-- security invoker: se aplican las políticas RLS de 02 (sector rrhh + ve_sueldos).
-- Ejecutar a mano DESPUÉS de 01, 02 y 03. No probado contra una base real.
-- ============================================================================

create or replace function public.rrhh_importar_lote(
  p_periodo text, p_empresa text, p_tipo text, p_filas jsonb
) returns bigint
language plpgsql security invoker set search_path = public as $$
declare
  v_id bigint;
  v_estado text;
begin
  if p_tipo not in ('resumen','novedades') then
    raise exception 'tipo inválido: %', p_tipo;
  end if;
  if p_empresa not in ('4H','4H_OC') then
    raise exception 'empresa inválida: %', p_empresa;
  end if;
  if jsonb_typeof(p_filas) <> 'array' then
    raise exception 'p_filas debe ser un array';
  end if;

  insert into rrhh_periodos(periodo) values (p_periodo) on conflict (periodo) do nothing;
  select estado into v_estado from rrhh_periodos where periodo = p_periodo;
  if v_estado = 'cerrado' then
    raise exception 'El período % está cerrado: no se puede reimportar', p_periodo;
  end if;

  -- reimportar = reemplazar el lote completo (las filas caen por on delete cascade)
  delete from rrhh_lotes where periodo = p_periodo and empresa = p_empresa and tipo = p_tipo;
  insert into rrhh_lotes(periodo, empresa, tipo) values (p_periodo, p_empresa, p_tipo)
    returning id into v_id;

  if p_tipo = 'resumen' then
    insert into rrhh_liquidacion_filas
      (lote_id, periodo, empresa, legajo, tipo_liquidacion, nro_concepto, importe, cantidad, valor)
    select v_id, p_periodo, p_empresa, x.legajo, x.tipo_liquidacion, x.nro_concepto,
           coalesce(x.importe, 0), x.cantidad, x.valor
    from jsonb_to_recordset(p_filas) as x(
      legajo integer, tipo_liquidacion text, nro_concepto integer,
      importe numeric, cantidad numeric, valor numeric);
  else
    insert into rrhh_novedades
      (lote_id, periodo, empresa, fecha, legajo, cod_novedad, novedad, cantidad, expresion, valor, origen)
    select v_id, p_periodo, p_empresa, x.fecha, x.legajo, x.cod_novedad, x.novedad,
           x.cantidad, x.expresion, x.valor, x.origen
    from jsonb_to_recordset(p_filas) as x(
      fecha date, legajo integer, cod_novedad text, novedad text,
      cantidad numeric, expresion text, valor numeric, origen text);
  end if;

  update rrhh_periodos set estado = 'cargado'
    where periodo = p_periodo and estado = 'abierto';
  return v_id;
end $$;

-- Padrón: solo legajo, nombre y departamento. Si el legajo ya existe se actualizan
-- esos tres campos y se CONSERVAN tipo_pago, sede, activo y el vínculo a planificación.
create or replace function public.rrhh_importar_padron(p_empleados jsonb)
returns integer
language plpgsql security invoker set search_path = public as $$
declare v_n integer;
begin
  if jsonb_typeof(p_empleados) <> 'array' then
    raise exception 'p_empleados debe ser un array';
  end if;
  insert into rrhh_empleados(legajo, nombre, departamento)
  select x.legajo, x.nombre, x.departamento
  from jsonb_to_recordset(p_empleados) as x(legajo integer, nombre text, departamento text)
  on conflict (legajo) do update
    set nombre = excluded.nombre, departamento = excluded.departamento;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.rrhh_importar_lote(text,text,text,jsonb) from public, anon;
revoke all on function public.rrhh_importar_padron(jsonb) from public, anon;
grant execute on function public.rrhh_importar_lote(text,text,text,jsonb) to authenticated;
grant execute on function public.rrhh_importar_padron(jsonb) to authenticated;
