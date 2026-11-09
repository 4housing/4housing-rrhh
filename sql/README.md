# SQL de RRHH — cuál es el vigente

Todo se corre **a mano** en el SQL Editor de Supabase (regla 2 de Pablo). Primero el SQL, después el HTML.

## Esquema oficial (el que queda)
Orden: `06_rrhh_reemplazo.sql` → `rrhh_00_sector.sql` (opcional) → `rrhh_01_tablas.sql` → `rrhh_02_catalogo_conceptos.sql`.

| Archivo | Qué hace |
|---|---|
| `06_rrhh_reemplazo.sql` | Borra el esquema provisorio. **Se frena solo** si hay datos cargados o si el oficial ya está instalado. |
| `rrhh_00_sector.sql` | Agrega `'rrhh'` a `sector_portal` si falta (hoy ya existe: no hace nada). |
| `rrhh_01_tablas.sql` | 11 tablas, permisos por sección (`liquidacion`, `costos`, `config`; sin lista guardada no se ve nada), RLS e importación. |
| `rrhh_02_catalogo_conceptos.sql` | Catálogo de 111 conceptos (tratamiento y prorrateo). 15 quedan PENDIENTES (`trata` nula: bloquean el cierre). 1602 y 6501 se cargaron como costo el 2026-11-09. No pisa lo editado a mano. |
| `rrhh_03_lectura_planificacion.sql` | Función de SOLO LECTURA `rrhh_planificacion_mes('AAAA-MM')`: devuelve en un json el detalle diario, la no disponibilidad, los feriados y la supervisión de planificación. Solo para dirección o quien tenga Ver en «costos». No devuelve costos, presupuestos ni nombres. |
| `rrhh_04_lineas_propias.sql` | Aguinaldo y bajas como líneas propias. |
| `rrhh_06_bonos_conservar_ediciones.sql` | Reemplaza `rrhh_importar_bonos`: al volver a importar el libro conserva el tipo y el período corregidos a mano. |
| `rrhh_05_bonos.sql` | Bonos de proyecto (histórico): `rrhh_bonos`, `rrhh_bonos_persona` y `rrhh_importar_bonos()`. Sección «costos». |

## Provisorio — reemplazado, NO volver a correr
`01_rrhh_esquema.sql`, `02_rrhh_rls.sql`, `03_rrhh_catalogo_seed.sql`, `04_rrhh_importacion.sql`, `05_rrhh_secciones.sql`.
Corridos en producción los cuatro primeros (el 05 nunca). Quedan en el repo como historia.
Correr `rrhh_01_tablas.sql` **encima** de ese esquema sin pasar por el 06 deja funciones rotas y políticas viejas activas
(quien tiene solo `ve_sueldos: true` seguiría viendo la liquidación).

## Estado en producción (Supabase `wcpkpwxhqdcdljfwzcmy`)
Corridos el 2026-11-08 (y `rrhh_03_lectura_planificacion.sql` el 2026-11-09, verificado con octubre): `06_rrhh_reemplazo.sql`, `rrhh_01_tablas.sql` y `rrhh_02_catalogo_conceptos.sql`
(`rrhh_00_sector.sql` no hizo falta: `'rrhh'` ya existía en `sector_portal`). Octubre 2026 importado desde la pantalla;
verificado contra el F.931: 4 lotes, 47 legajos y remuneraciones (Haberes 4H) idénticas a la declaración jurada.
