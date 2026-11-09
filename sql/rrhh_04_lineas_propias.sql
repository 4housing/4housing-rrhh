-- =====================================================================
-- RRHH · paso 4 · líneas propias: aguinaldo y bajas (decisión de administración, 2026-11-09)
-- Proyecto Supabase: wcpkpwxhqdcdljfwzcmy. Correr A MANO en el SQL Editor, DESPUÉS de rrhh_02_catalogo_conceptos.sql.
--
-- Qué hace
--   · Agrega al catálogo la columna `linea` ('aguinaldo' | 'bajas', opcional). Sirve para los conceptos que vienen MEZCLADOS en
--     otra liquidación (p. ej. la gratificación por liquidación final, que llega por OC en la quincena).
--   · Marca los conceptos de aguinaldo y de bajas y les da tratamiento «costo» si no lo tenían (SAC, vacaciones no gozadas,
--     integración del mes de despido, preaviso, indemnización, gratificación final).
--   · Lo que se liquida como tipo «Bajas» o «Aguinaldo» ya se detecta solo por el TIPO DE LIQUIDACIÓN del informe: no depende de esta columna.
--   · Una línea propia cuenta como costo y como cobro, se muestra aparte y NO entra al valor hora.
--
-- No borra nada. Seguro de correr más de una vez. Reversible: alter table public.rrhh_conceptos drop column linea;
-- =====================================================================

alter table public.rrhh_conceptos add column if not exists linea text;
alter table public.rrhh_conceptos drop constraint if exists rrhh_conceptos_linea_check;
alter table public.rrhh_conceptos add constraint rrhh_conceptos_linea_check check (linea is null or linea in ('aguinaldo', 'bajas'));

update public.rrhh_conceptos
   set linea = 'aguinaldo', trata = coalesce(trata, 'costo')
 where nro_concepto in ('10000');

update public.rrhh_conceptos
   set linea = 'bajas', trata = coalesce(trata, 'costo')
 where nro_concepto in ('50000', '50001', '50010', '50018', '50020', '50070', '50075', '50150', '50152', '55500');

-- Verificación: conceptos por línea y tratamiento
select coalesce(linea, '(sin línea)') as linea, coalesce(trata, '(pendiente)') as trata, count(*) as conceptos
  from public.rrhh_conceptos group by 1, 2 order by 1, 2;
