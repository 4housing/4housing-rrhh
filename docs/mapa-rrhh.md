# Mapa de RRHH: qué hay, qué se pisa y qué falta

Documento vivo. Sin datos de personas ni de sueldos. Lo marcado **[supuesto]** no está verificado contra la base real: hay que confirmarlo.
Última actualización: 2026-11-28.

## 1. Las fuentes de datos (de dónde sale cada cosa)
| Fuente | Qué trae | Cómo entra hoy | Dónde queda |
|---|---|---|---|
| Delta · Resumen de conceptos liquidados (por empresa 4H y 4H OC) | Importes y horas por concepto y persona | Pantalla *Importar informes* | `rrhh_liquidacion_filas` (por lote, período y empresa) |
| Delta · Novedades registradas (por empresa) | Novedades por día (HSTRA, HRSEX1, HSENF, VACJOR…) | *Importar informes* | `rrhh_novedades` (importadas) |
| Delta · Legajos (padrón) | Legajo, nombre, categoría, tipo de pago… (sin CUIL, teléfono ni correo) | *Importar informes* | `rrhh_empleados` |
| Tango Fichadas (`.txt`) | Marcas del reloj | *Fichadas → Cargar* | `rrhh_fichadas` |
| Delta · Informe resumen de partes | Cómo calcula Delta cada jornada | Solo se usó para calibrar las reglas (no se guarda) | — |
| F.931 (PDF) | Declaración jurada | *Controles* | `rrhh_f931` |
| Planificación (otra app) | Detalle diario, ausencias, feriados | Función de solo lectura | no se copia |
| Libro de bonos / COPAR / adicionales en efectivo | Bonos, coparticipación, pagos en efectivo | *Bonos*, *Asientos* | `rrhh_bonos*`, asientos (se descargan) |
| Cargado en la app | Horarios y feriados, correcciones de fichadas, extras aprobadas, **novedades a exportar**, saldos y pedidos de vacaciones | Pantallas propias | `rrhh_horarios`, `rrhh_feriados`, `rrhh_legajo_fichadas`, `rrhh_partes_dia`, `rrhh_novedades_carga`, `rrhh_vac_*` |

## 2. Dónde se está duplicando o se puede pisar
1. **Novedades en dos tablas.** `rrhh_novedades` (lo que Delta ya tiene) y `rrhh_novedades_carga` (lo que se carga para exportar). Una novedad exportada e importada en Delta termina estando en las dos. **Propuesta:** tratar `rrhh_novedades` como «lo que Delta tiene» y `rrhh_novedades_carga` como «pendiente de llegar a Delta»; al importar el informe del período, marcar como «confirmadas en Delta» las cargadas que coincidan (empresa, legajo, fecha, código). Evita cargar dos veces y sirve de control.
2. **Justificaciones de ausencias, tres lugares.** El archivo de Novedades que se sube en Fichadas, las cargadas en la app y las ya importadas. **Propuesta:** Fichadas lee las ya importadas (`rrhh_novedades`) y las cargadas; se deja de pedir el archivo.
3. **Horas, tres versiones.** (a) fichadas → parte calculado por la app; (b) horas de las novedades y del parte de Delta; (c) horas liquidadas (conceptos de hora en la liquidación) y, al final, el recibo. Hoy cada una vive en su pantalla. **Propuesta:** un control de punta a punta por persona y período (sección 4).
4. **Sábados, feriados y horas extra.** Existe `rrhh-sabados.js` (informe de sábados y pagos en efectivo, Asientos) y ahora Fichadas calcula extras de sábado y feriado. Es el mismo hecho contado dos veces. **Propuesta:** definir cuál es la fuente y que la otra solo controle (pregunta 29 del diccionario y pendientes de feriados).
5. **Personas.** `rrhh_empleados` (padrón), `rrhh_legajo_fichadas` (horario y unidad por legajo) y el listado de fichadas son tres listas del mismo legajo. Aceptable, pero faltan: fecha de ingreso, bajas y reingresos, y la empresa (hoy el legajo es único en el padrón; ver pregunta 27).
6. **Vacaciones tomadas.** El histórico de novedades ya tiene VACJOR / VACM de años anteriores. **No hay que tipear el pasado:** el historial de vacaciones se puede **armar desde las novedades importadas** y la app solo suma lo nuevo.
7. **Tablas de pantalla.** Todas usan `RRHHTabla`; pendiente compactar las que todavía no entran en una tablet (Partes por día, Resumen, Novedades, Vacaciones).

## 3. Lo que falta para cerrar el circuito
| Falta | Para qué | Qué necesito |
|---|---|---|
| **Fecha de ingreso, antigüedad reconocida, bajas y reingresos** por persona | Calcular días de vacaciones | Un informe de Delta (o planilla) por empresa con legajo, fecha de ingreso, fecha de egreso/reingreso y, si existe, la antigüedad reconocida. **Sin CUIL, teléfono ni correo.** |
| **Escala de días de vacaciones** | Calcular días por año | La tabla que aplican (por antigüedad, y si hay convenio que la cambie) y cómo cuentan el primer año. No la voy a deducir ni a cargar de memoria. |
| **Historial de vacaciones** | Saldo y registro histórico | De las novedades importadas (sección 2.6); falta confirmar desde qué año. |
| **Extras cobradas en el año por persona** | Registro histórico | Probablemente ya esté: los resúmenes de conceptos importados traen las horas extra por concepto. **[supuesto]** Hay que ver qué meses del año están importados (pantalla *Importar informes* / *Controles*). Si faltan meses, subirlos; si están, no hace falta volver a mandarlos. |
| **Recibos de sueldo** | Validar contra lo liquidado | Un recibo de ejemplo (puede ser de prueba o con los datos personales tapados) para ver si se puede leer automáticamente. |

## 4. Validación de punta a punta (recibos vs novedades vs fichadas)
Objetivo: que lo liquidado coincida con lo registrado, y que cualquier diferencia se informe para ajustarla acá o en el recibo.
1. **Por persona y período**, armar tres columnas de horas por tipo (normal, extra 50 %, extra 100 %, feriado, vacaciones, enfermedad…): *lo que dicen las fichadas aprobadas*, *lo que dicen las novedades (Delta)* y *lo que se liquidó* (concepto de hora de la liquidación o del recibo).
2. Marcar cada diferencia con su causa probable (extra no aprobada, novedad sin cargar, día no importado, redondeo de unidad…).
3. El recibo se leería en el navegador (como el F.931 con pdf.js) y **no se guarda ni sube al repo**. Cómo vienen los recibos de Delta (un PDF por persona o uno solo, texto o imagen) lo sé recién cuando vea un ejemplo.
4. Para importes (no solo horas) hace falta además el valor hora por persona; hoy lo calcula el motor de costos.

## 5. Plan sugerido (en orden)
1. **Ya:** corregir las tablas para tablet (hecho en Aprobar extras; falta el resto).
2. **Antes de seguir con vacaciones 3b:** subir el informe con fecha de ingreso (sección 3) y la escala de días, y confirmar de qué mes/año hay novedades importadas.
3. **Vacaciones 3b:** vínculo usuario ↔ legajo, saldo calculado con ingreso + antigüedad reconocida (cargada por RRHH), historial armado desde novedades, pedidos del empleado, aprobación del jefe y de RRHH, generación de novedades.
4. **Control de punta a punta** (sección 4) con los meses ya importados.
5. **Recibos:** lectura de un PDF de ejemplo y comparación.
