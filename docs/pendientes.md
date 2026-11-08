# RRHH · decisiones y pendientes

Estado según la conversación con Planificación y el handoff actualizado.
No incluye importes ni datos personales (el repo es público). El handoff
completo NO se versiona porque contiene valores de control de octubre.

## Decidido
- Prefijo de tablas: `rrhh_`; el módulo vive en RRHH (sector `rrhh`).
- Sábados: se imputan por lo realmente liquidado (opción A), no se cuentan en el divisor.
- Combo Hogar: fuera del costo del operario; solo recupero en la cuenta RRHH.
- El catálogo lleva bandera `prorrateo` (handoff §9.1).

## Abierto (el handoff dice [A DEFINIR]; no se asume)
1. Histórico: ¿hay los 4 informes de meses anteriores o solo el Excel viejo? (define si se carga `rrhh_liquidacion_filas` o solo resumen).
2. Legajos 162 y 170: ¿son operarios?
3. Bono Montaje: ¿a qué proyecto se imputa y de dónde sale el dato?
4. Legajo 110 (mensualizado): regla de horas.
5. 7b: pagos fijos mensuales con horas trabajadas (i) o prorrateados entre todas las pagas (ii).
6. Posventa 55020/55029, SAC, indemnizaciones, vacaciones no gozadas.
7. Diferencia de contribuciones S.S. contra F.931 y su tolerancia.

## Para verificar en Supabase antes de ejecutar el SQL
- Firma real de `tiene_sector` y `ve_sueldos` (el SQL 02 las supone).
- Tipo real del id de persona en planificación (`planificacion_persona_id`).
- Grupo/agrupador de 1100, 1102, 1500, 1550, 1600 (supuestos Haberes/SUELDO).

## Motor de cálculo (js/rrhh-calculo.js) — estado
- Tests sintéticos: `node --test test/calculo.test.js` (no usar `node --test test/`, falla en Node 22).
- Verificado en local contra los informes reales de octubre (sin subir nada): neto, cargas,
  costo, bono montaje y combo reproducen los valores de control del handoff.
- Control de horas §7.1: la referencia "horas de la liquidación" queda como parámetro;
  falta confirmar de dónde sale (en el Excel es la fila "Acreditación de Haberes").
- Octubre vs F.931: la diferencia de contribuciones S.S. sigue sin explicar (se revisa con contadora).
