-- ============================================================================
-- RRHH · Etapa 1 · Catálogo de conceptos (configuración, sin importes)
-- SOLO los conceptos con número explícito en el handoff §4/§6.
-- Faltan cargar desde la hoja `Conceptos` del Excel (no la tengo): descripciones,
-- rangos 41xxx, 50xxx, retenciones intermedias 20000–20350, y el resto.
-- Estoy suponiendo la empresa (4H / 4H_OC) de cada uno según la sección del
-- handoff donde aparece; verificar contra la hoja Conceptos.
-- trata NULL = [A DEFINIR]; la app bloquea el cierre mientras haya NULL.
-- 1602 y 6501 NO se cargan: están sin catalogar y sin criterio acordado.
-- ============================================================================

-- Conceptos 1100, 1102, 1500, 1550, 1600 (handoff §9.1): ESTOY SUPONIENDO
-- grupo_sistema='Haberes' y agrupador='SUELDO' (el handoff no lo dice); verificar.
-- 'prorrateo' sale de §9.1. Sábado Taller/Extras OC = 'directo' por decisión
-- "sábados por lo liquidado" (opción A); es mi interpretación de esa decisión.
-- Redondeo 99999 y posventa quedan sin prorrateo hasta definirse.

insert into public.rrhh_conceptos
  (nro_concepto, empresa, grupo_sistema, agrupador, trata, es_hora, hora_productiva, tipo_hora, prorrateo)
values
 (1000,'4H','Haberes','SUELDO','costo',true,true,'jornalizada','directo'),
 (3000,'4H','Haberes','SUELDO','costo',true,true,'extra_50','directo'),
 (6800,'4H','Haberes','SUELDO','costo',true,true,'extra_50_mensualizado','directo'),
 (1003,'4H','Haberes','SUELDO','costo',true,false,'descanso_compensatorio','directo'),
 (1005,'4H','Haberes','SUELDO','costo',true,false,'justificadas','directo'),
 (1010,'4H','Haberes','SUELDO','costo',true,false,'feriado','directo'),
 (1029,'4H','Haberes','SUELDO','costo',true,false,'enfermedad','directo'),
 (1031,'4H','Haberes','SUELDO','costo',true,false,'art','directo'),
 (1490,'4H','Haberes','VACACIONES','costo',true,false,'vacaciones','directo'),
 (1491,'4H','Haberes','VACACIONES','costo',true,false,'vacaciones','directo'),
 (1100,'4H','Haberes','SUELDO','costo',false,null,null,'por_horas_pagas'),
 (1102,'4H','Haberes','SUELDO','costo',false,null,null,'por_horas_pagas'),
 (1600,'4H','Haberes','SUELDO','costo',false,null,null,'por_horas_pagas'),
 (1550,'4H','Haberes','SUELDO','costo',false,null,null,'por_horas_pagas'),
 (1500,'4H','Haberes','SUELDO','costo',false,null,null,'por_pago_tipo'),
 (40000,'4H','No Remunerativo',null,'excluir',false,null,null,null),
 (40001,'4H','No Remunerativo',null,'excluir',false,null,null,null),
 (40002,'4H','No Remunerativo',null,'excluir',false,null,null,null),
 (55041,'4H_OC',null,null,'excluir',false,null,null,null),
 (80000,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80010,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80020,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80030,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80040,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80050,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80100,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80200,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null,'cargas'),
 (80300,'4H','Contribuciones','SEGURO SINDICAL','costo',false,null,null,'fijo_mensual'),
 (55013,'4H_OC',null,'COPAR','costo',false,null,null,'directo'),  -- Sábado Taller
 (55014,'4H_OC',null,'COPAR','costo',false,null,null,'directo'),  -- Horas extra OC
 (99999,'4H',null,'SUELDO','costo',false,null,null,null),
 (99999,'4H_OC',null,'COPAR','costo',false,null,null,null),
 (55015,'4H_OC',null,'SUELDO','directo_proyecto',false,null,null,null),
 (55016,'4H_OC',null,'SUELDO','directo_proyecto',false,null,null,null),
 (55025,'4H_OC',null,'SUELDO','directo_proyecto',false,null,null,null),
 (55020,'4H_OC',null,null,null,false,null,null,null),  -- posventa: A DEFINIR
 (55029,'4H_OC',null,null,null,false,null,null,null),  -- posventa: A DEFINIR
 (55035,'4H_OC',null,'RRHH','cuenta_rrhh',false,null,null,null),
 (55300,'4H_OC',null,'RRHH','cuenta_rrhh',false,null,null,null),
 (55302,'4H_OC',null,'RRHH','cuenta_rrhh',false,null,null,null)
on conflict (nro_concepto, empresa) do update set prorrateo = excluded.prorrateo
  where public.rrhh_conceptos.prorrateo is null;
