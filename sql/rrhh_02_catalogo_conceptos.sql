-- =====================================================================
-- RRHH · paso 2 · catálogo de conceptos (configuración; no contiene importes ni datos personales)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_01_tablas.sql.
--
-- Fuente: hoja «Conceptos» del Excel de control de octubre 2026 (número, descripción, agrupador) cruzada con los
-- informes de octubre (empresa y grupo del sistema de cada concepto) y las reglas de tratamiento del handoff §4 y §9.1.
-- Los conceptos que no aparecieron en octubre llevan la empresa y el grupo DEDUCIDOS (55xxx = OC; grupo por agrupador).
--
-- trata NULL = PENDIENTE de definir (SAC, indemnizaciones, vacaciones no gozadas, y algunos dudosos):
-- la app los marca «sin tratamiento» y BLOQUEA EL CIERRE si aparecen en un período. Se completan desde la app/SQL cuando
-- administración decida.
-- 1602 (Premio Variable Voluntario) se carga como COSTO por decisión de administración (2026-11-09). Sin regla de reparto
-- todavía (prorrateo nulo): el motor lo reparte por horas pagas y lo lista para que se defina.
-- 6501 (Adic. Reintegro impuestos) se carga como COSTO por decisión de administración (2026-11-09): es de una persona con licencia
-- y se trata como una ART (costo sin horas productivas). Sin regla de reparto (prorrateo nulo).
-- No pisa lo que ya esté cargado o editado (on conflict do nothing).
-- =====================================================================

insert into public.rrhh_conceptos
  (nro_concepto, empresa, descripcion, grupo_sistema, agrupador, trata, es_hora, tipo_hora, prorrateo)
values
  ('1000','4H','Hora Jornalizados','Haberes','SUELDO','costo',true,'trabajada','directo'),
  ('1003','4H','Horas descanso compensatorio','Haberes','SUELDO','costo',true,'otra','directo'),
  ('1005','4H','Hora Justificadas','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1010','4H','Horas feriado','Haberes','SUELDO','costo',true,'feriado','directo'),
  ('1029','4H','Horas por enfermedad','Haberes','SUELDO','costo',true,'enfermedad','directo'),
  ('1031','4H','Licencia por ART','Haberes','SUELDO','costo',true,'art','directo'),
  ('1100','4H','Descanso Art-20 CCT','Haberes','SUELDO','costo',false,null,'por_horas_pagas'),
  ('1102','4H','HORAS Desc Adicional','Haberes','SUELDO','costo',false,null,'por_horas_pagas'),
  ('1481','4H','Inconveniente por Temporal','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1482','4H','Hora Justificadas V. Ad.','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1483','4H','Lic. por Exámen','Haberes','SUELDO','costo',false,null,null),
  ('1484','4H','Lic. por Mudanza','Haberes','SUELDO','costo',false,null,null),
  ('1487','4H','Trámites Personales','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1488','4H','Licencia por fallecimiento - J','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1490','4H','Vacaciones jornalizado','Haberes','VACACIONES','costo',true,'vacaciones','directo'),
  ('1491','4H','Vacaciones jornalizado','Haberes','VACACIONES','costo',true,'vacaciones','directo'),
  ('1492','4H','Licencia por cuidado familiar','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1493','4H','Turno médico','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('1500','4H','Antigüedad','Haberes','SUELDO','costo',false,null,'por_pago_tipo'),
  ('1501','4H','Antigüedad M','Haberes','SUELDO','costo',false,null,null),
  ('1550','4H','Presentismo','Haberes','SUELDO','costo',false,null,'por_horas_pagas'),
  ('1560','4H','AJUSTE RETROACTIVO','Haberes','SUELDO','costo',false,null,null),
  ('1561','4H','AJUSTE LIQUIDACIÓN ANTERIOR','Haberes','SUELDO','costo',false,null,null),
  ('1562','4H','AJUSTE RETROACTIVO','Haberes','SUELDO','costo',false,null,null),
  ('1565','4H','Ajuste retroactivo  1Q-Ago 2026','Haberes','SUELDO','costo',false,null,null),
  ('1600','4H','A cuenta futuros aumentos','Haberes','SUELDO','costo',false,null,'por_horas_pagas'),
  ('1601','4H','A cuenta futuros aumentos 1/2 J','Haberes','SUELDO','costo',false,null,null),
  ('1602','4H','Premio Variable Voluntario','Haberes','SUELDO','costo',false,null,null),
  ('3000','4H','Hs extras 50%','Haberes','SUELDO','costo',true,'extra50','directo'),
  ('6000','4H','Sueldo básico','Haberes','SUELDO','costo',false,null,null),
  ('6001','4H','Lic. por maternidad','Haberes','SUELDO','costo',false,null,null),
  ('6002','4H','Excedencia. por maternidad','Haberes','SUELDO','costo',false,null,null),
  ('6030','4H','Adicional A Cta. Fut. Aumentos','Haberes','SUELDO','costo',false,null,null),
  ('6040','4H','Licencia sin goce de sueldo','Haberes','SUELDO','costo',false,null,null),
  ('6800','4H','Hs extras 50%','Haberes','SUELDO','costo',true,'extra50','directo'),
  ('6501','4H','Adic. Reintegro impuestos','Haberes','SUELDO','costo',false,null,null),
  ('8000','4H','Plus Vacacional','Haberes','VACACIONES','costo',false,null,null),
  ('8005','4H','Licencia por Matrimonio','Haberes','SUELDO','costo',true,'justificada','directo'),
  ('10000','4H','SAC','Haberes','SUELDO',null,false,null,null),
  ('10010','4H','SAC Proporcional','Haberes','SAC',null,false,null,null),
  ('10021','4H','Ajuste liq. anterior','Haberes','SUELDO','costo',false,null,null),
  ('20000','4H','Jubilación','Retenciones','APORTES','retencion',false,null,null),
  ('20010','4H','Ley 19.032 3 %','Retenciones','APORTES','retencion',false,null,null),
  ('20030','4H','Obra Social 3 %','Retenciones','APORTES','retencion',false,null,null),
  ('20040','4H','DESCUENTO OBRA SOCIAL AC UOM',null,'CONTRIBUCIONES',null,false,null,null),
  ('20300','4H','Sindicato 2.5 %','Retenciones','APORTES','retencion',false,null,null),
  ('20350','4H','Seguro de Vida y Sepelio','Retenciones','APORTES','retencion',false,null,null),
  ('29800','4H','Embargo judicial','Retenciones','APORTES','retencion',false,null,null),
  ('29810','4H','Cuota alimentaria','Retenciones','APORTES','retencion',false,null,null),
  ('29811','4H','Cuota alimentaria Ajuste Mes anterior','Retenciones','APORTES','retencion',false,null,null),
  ('40000','4H','ADELANTO DE SUELDO','No Remunerativo','SUELDO','excluir',false,null,null),
  ('40001','4H','DESCUENTO ADELANTO DE SUELDO','No Remunerativo','SUELDO','excluir',false,null,null),
  ('40002','4H','ADELANTO DE SUELDO','No Remunerativo','SUELDO','excluir',false,null,null),
  ('41003','4H','Gratif Extraord No Remun Abril -Mayo','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41004','4H','Gratif Extraord No Remun Junio','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41008','4H','Gratif Extraord No Remun Enero ´26','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41010','4H','Gratif Extraord No Remun Marzo ´26','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41011','4H','Gratif Extraord No Remun Agosto ´26','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41012','4H','Compen Extraord No Remun Abril-Julio ´26','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41013','4H','Gratif Extraord No Remun Septiembre ´26','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41014','4H','Gratif Extraord No Remun Octubre ´26','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('41200','4H','Gratif Extraord No Remun Ac. UOM','No Remunerativo','SUELDO','costo',false,null,'fijo_mensual'),
  ('50000','4H','Vacaciones no gozadas','Haberes','VACACIONES',null,false,null,null),
  ('50001','4H','Vacaciones no gozadas pendienes','Haberes','VACACIONES',null,false,null,null),
  ('50010','4H','SAC s/Vacaciones no gozadas','Haberes','VACACIONES',null,false,null,null),
  ('50018','4H','Integración mes de despido','Haberes','INDEMNIZACION',null,false,null,null),
  ('50020','4H','SAC s/Integraci´n mes de despido','Haberes','INDEMNIZACION',null,false,null,null),
  ('50070','4H','Preaviso','Haberes','INDEMNIZACION',null,false,null,null),
  ('50075','4H','SAC s/Preaviso','Haberes','INDEMNIZACION',null,false,null,null),
  ('50150','4H','Indemnización por antiguedad','Haberes','INDEMNIZACION',null,false,null,null),
  ('50152','4H','Gratificación','Haberes','SUELDO',null,false,null,null),
  ('55000','4H_OC','Coparticipación Adm.','No Remunerativo','COPAR','costo',false,null,'fijo_mensual'),
  ('55010','4H_OC','Coparticipación Ope.','No Remunerativo','COPAR','costo',false,null,'fijo_mensual'),
  ('55011','4H_OC','Copar. Neuquén','No Remunerativo','COPAR','costo',false,null,'fijo_mensual'),
  ('55012','4H_OC','Recat.','No Remunerativo','COPAR','costo',false,null,'fijo_mensual'),
  ('55013','4H_OC','Sábado Taller','No Remunerativo','COPAR','costo',false,null,'directo'),
  ('55014','4H_OC','Horas extras al 50%','No Remunerativo','COPAR','costo',false,null,'directo'),
  ('55015','4H_OC','Bono Montaje - ADM','No Remunerativo','SUELDO','directo_proyecto',false,null,null),
  ('55016','4H_OC','Bono Montaje - ADM','No Remunerativo','SUELDO','directo_proyecto',false,null,null),
  ('55020','4H_OC','Bono Posventa - ADM','No Remunerativo','BONOS','directo_proyecto',false,null,null),
  ('55025','4H_OC','Bono Montaje - OPE','No Remunerativo','SUELDO','directo_proyecto',false,null,null),
  ('55029','4H_OC','Bono Posventa - OPE','No Remunerativo','BONOS','directo_proyecto',false,null,null),
  ('55030','4H_OC','Feriado Trabajado','No Remunerativo','SUELDO','costo',false,null,'directo'),
  ('55035','4H_OC','Descuento - Combo Hogar','No Remunerativo','RRHH','cuenta_rrhh',false,null,null),
  ('55041','4H_OC','Descuento - Adelanto de Coparticipación','No Remunerativo','COPAR','excluir',false,null,null),
  ('55050','4H_OC','Comisión Rental - Alquiler','No Remunerativo','COPAR','costo',false,null,null),
  ('55051','4H_OC','Comisión Rental - Servicios','No Remunerativo','COPAR','costo',false,null,null),
  ('55055','4H_OC','Comisión - Ventas','No Remunerativo','COPAR','costo',false,null,null),
  ('55060','4H_OC','Adicional Formica','No Remunerativo','COPAR','costo',false,null,null),
  ('55200','4H_OC','Vacaciones Liquidadas  M','No Remunerativo','COPAR','costo',false,null,null),
  ('55300','4H_OC','Cochera','No Remunerativo','RRHH','cuenta_rrhh',false,null,null),
  ('55301','4H_OC','OSDE','No Remunerativo','COPAR','costo',false,null,null),
  ('55302','4H_OC','Viáticos - Transporte Público','No Remunerativo','RRHH','cuenta_rrhh',false,null,null),
  ('55303','4H_OC','Adicional Socios','No Remunerativo','SUELDO','costo',false,null,null),
  ('55304','4H_OC','Adicional Formica','No Remunerativo','SUELDO','costo',false,null,null),
  ('55305','4H_OC','Monotributo','No Remunerativo','SUELDO','costo',false,null,null),
  ('55500','4H_OC','Gratificación por Liq. Final','No Remunerativo','COPAR',null,false,null,null),
  ('55550','4H_OC','Ajuste liq. anterior por Aumento UOM','No Remunerativo','COPAR','costo',false,null,null),
  ('55551','4H_OC','Horas extras al 50% Man.','No Remunerativo','SUELDO','costo',false,null,'directo'),
  ('80000','4H','CONTRIBUCION JUBILACIÓN','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80010','4H','CONTRIBUCION LEY 19032','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80020','4H','CONTRIBUCION AS. FAMILIARES','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80030','4H','CONTRIBUCION FNE','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80040','4H','CONTRIBUCION ANSSAL','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80050','4H','CONTRIBUCION OB. SOCIAL','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80100','4H','ART','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80200','4H','SVO','Contribuciones','CONTRIBUCIONES','costo',false,null,'cargas'),
  ('80300','4H','SEGURO SINDICAL','Contribuciones','SEGURO SINDICAL','costo',false,null,'fijo_mensual'),
  ('90000','4H','Retención Imp. Ganancias','Retenciones','APORTES','retencion',false,null,null),
  ('99999','4H','Redondeo','No Remunerativo','SUELDO','costo',false,null,null),
  ('99999','4H_OC','Redondeo','No Remunerativo','COPAR','costo',false,null,null)
on conflict (nro_concepto, empresa) do nothing;

-- Verificación: cantidad por tratamiento (NULL = pendiente)
select coalesce(trata, '(pendiente)') as trata, count(*) as conceptos
  from public.rrhh_conceptos group by 1 order by 1;
