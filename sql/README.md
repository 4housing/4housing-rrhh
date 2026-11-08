# SQL de RRHH — cuál es el vigente

Todo se corre **a mano** en el SQL Editor de Supabase (regla 2 de Pablo). Primero el SQL, después el HTML.

## Esquema oficial (el que queda)
Orden: `06_rrhh_reemplazo.sql` → `rrhh_00_sector.sql` → `rrhh_01_tablas.sql` → catálogo de conceptos (paso siguiente).

| Archivo | Qué hace |
|---|---|
| `06_rrhh_reemplazo.sql` | Borra el esquema provisorio. **Se frena solo** si hay datos cargados o si el oficial ya está instalado. |
| `rrhh_00_sector.sql` | Agrega `'rrhh'` a `sector_portal` si falta (hoy ya existe: no hace nada). |
| `rrhh_01_tablas.sql` | 11 tablas, permisos por sección (`liquidacion`, `costos`, `config`; sin lista guardada no se ve nada), RLS e importación. |

## Provisorio — reemplazado, NO volver a correr
`01_rrhh_esquema.sql`, `02_rrhh_rls.sql`, `03_rrhh_catalogo_seed.sql`, `04_rrhh_importacion.sql`, `05_rrhh_secciones.sql`.
Corridos en producción los cuatro primeros (el 05 nunca). Quedan en el repo como historia.
Correr `rrhh_01_tablas.sql` **encima** de ese esquema sin pasar por el 06 deja funciones rotas y políticas viejas activas
(quien tiene solo `ve_sueldos: true` seguiría viendo la liquidación).
