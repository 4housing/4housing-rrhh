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

insert into public.rrhh_conceptos
  (nro_concepto, empresa, grupo_sistema, agrupador, trata, es_hora, hora_productiva, tipo_hora)
values
 -- Horas (4H, trata=costo) — handoff §6
 (1000,'4H','Haberes','SUELDO','costo',true,true,'jornalizada'),
 (3000,'4H','Haberes','SUELDO','costo',true,true,'extra_50'),
 (6800,'4H','Haberes','SUELDO','costo',true,true,'extra_50_mensualizado'),
 (1003,'4H','Haberes','SUELDO','costo',true,false,'descanso_compensatorio'),
 (1005,'4H','Haberes','SUELDO','costo',true,false,'justificadas'),
 (1010,'4H','Haberes','SUELDO','costo',true,false,'feriado'),
 (1029,'4H','Haberes','SUELDO','costo',true,false,'enfermedad'),
 (1031,'4H','Haberes','SUELDO','costo',true,false,'art'),
 -- Adelantos: excluir — §4
 (40000,'4H','No Remunerativo',null,'excluir',false,null,null),
 (40001,'4H','No Remunerativo',null,'excluir',false,null,null),
 (40002,'4H','No Remunerativo',null,'excluir',false,null,null),
 (55041,'4H_OC',null,null,'excluir',false,null,null),
 -- Contribuciones patronales (§4, §7): costo
 (80000,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80010,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80020,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80030,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80040,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80050,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80100,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80200,'4H','Contribuciones','CONTRIBUCIONES','costo',false,null,null),
 (80300,'4H','Contribuciones','SEGURO SINDICAL','costo',false,null,null),
 -- OC: coparticipación / fin de semana (agrupador COPAR → costo)
 (55013,'4H_OC',null,'COPAR','costo',false,null,null),  -- Sábado Taller
 (55014,'4H_OC',null,'COPAR','costo',false,null,null),  -- Horas extra OC
 (99999,'4H',null,'SUELDO','costo',false,null,null),    -- Redondeo (aparece en SUELDO y COPAR)
 (99999,'4H_OC',null,'COPAR','costo',false,null,null),
 -- Bono Montaje: directo a proyecto
 (55015,'4H_OC',null,'SUELDO','directo_proyecto',false,null,null),
 (55016,'4H_OC',null,'SUELDO','directo_proyecto',false,null,null),
 (55025,'4H_OC',null,'SUELDO','directo_proyecto',false,null,null),
 -- Posventa: [A DEFINIR: confirmar]
 (55020,'4H_OC',null,null,null,false,null,null),
 (55029,'4H_OC',null,null,null,false,null,null),
 -- RRHH (estructura): no entra al costo del operario
 (55035,'4H_OC',null,'RRHH','cuenta_rrhh',false,null,null),
 (55300,'4H_OC',null,'RRHH','cuenta_rrhh',false,null,null),
 (55302,'4H_OC',null,'RRHH','cuenta_rrhh',false,null,null)
on conflict (nro_concepto, empresa) do nothing;
