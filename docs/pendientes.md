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
- (Resuelto) `planificacion_persona_id` es uuid, como `planificacion_valor_hora_hist.persona_id`.
- Grupo/agrupador de 1100, 1102, 1500, 1550, 1600 (supuestos Haberes/SUELDO).

## Motor de cálculo (js/rrhh-calculo.js) — estado
- Tests sintéticos: `node --test test/calculo.test.js` (no usar `node --test test/`, falla en Node 22).
- Verificado en local contra los informes reales de octubre (sin subir nada): neto, cargas,
  costo, bono montaje y combo reproducen los valores de control del handoff.
- Control de horas §7.1: la referencia "horas de la liquidación" queda como parámetro;
  falta confirmar de dónde sale (en el Excel es la fila "Acreditación de Haberes").
- Octubre vs F.931: la diferencia de contribuciones S.S. sigue sin explicar (se revisa con contadora).

## Importador (etapa 2) — estado
- `sql/04_rrhh_importacion.sql`: funciones transaccionales `rrhh_importar_lote` y `rrhh_importar_padron`.
  Probadas en un Postgres 16 local con `tiene_sector`/`ve_sueldos` SIMULADAS (no las reales): idempotencia,
  atomicidad ante error, período cerrado, RLS, anon sin acceso, padrón conserva tipo_pago/sede.
- `js/rrhh-importador.js` + pantalla en `index.html`. Probado en Chromium con los informes reales de octubre
  y un Supabase simulado (1148 + 127 filas + 47 legajos, sin CUIL/correo en lo enviado).
- NO verificado: URL de SheetJS en cdnjs (la versión 0.18.5 sí existe en npm); las funciones reales en Supabase;
  los archivos de Novedades (no se subieron: el parser sigue los encabezados del handoff §3.2).
- Hallazgo octubre: legajos 1000–1003 aparecen en la liquidación OC y no en el padrón.
- Cada archivo es una transacción propia: si falla el tercero, los dos primeros quedan cargados (reimportar es seguro).

## Verificado en Supabase (consultas del usuario)
- `tiene_sector(s sector_portal)`: `'rrhh'` es un valor válido del tipo. El cuerpo se vio cortado
  ("select public.es_direccion() or exists (select 1 from public.perfiles p join public…").
- `ve_sueldos` NO es una función: es una clave booleana en `perfiles_sector.permisos`
  (ej. `{"ve_sueldos": true}`), hoy solo en filas de planificación. Ninguna política de la base la consulta
  (en planificación se aplica en la app). En RRHH se aplica en la base (`rrhh_ve_sueldos()` en `sql/02`).
- `perfiles`: id, email, nombre, activo, es_direccion, creado_en, actualizado_en.

## Acceso a importes de RRHH (sql/02) — a confirmar
- Estoy suponiendo que dirección ve sueldos sin la bandera (como `tiene_sector` deja pasar a dirección).
  Para exigir la bandera también a dirección: quitar `public.es_direccion() or` en `rrhh_ve_sueldos()`.
- Otras personas: en su fila de `perfiles_sector` con sector `rrhh`, `permisos = {"ve_sueldos": true}`.
- Probado en Postgres local con tablas/enum reproducidos y el cuerpo de `tiene_sector` SUPUESTO:
  dirección y rrhh+bandera importan; rrhh sin bandera o con `false` lee el catálogo pero no importa;
  una bandera de otro sector (planificación) no da acceso; anon no accede.

## Reglas de las otras apps (leídas de portal, planificacion-taller y adminfin)
- Visual: paleta oliva, Archivo/Quicksand, sidebar oscuro (#2f3a26) a la izquierda, topbar blanca, cards.
  Copiado de 4housing-adminfin; si allá cambia, cambiar acá. Aplicado a RRHH en este cambio.
- Permisos por sección: cada app publica sus secciones en `SECCIONES` de `portal/admin.html` (ver/editar en
  `perfiles_sector.permisos`) y en la base con funciones `<app>_puede_ver(seccion)` / `_puede_editar(seccion)`
  (ver `sql/2026-10_adminfin_secciones.sql` en adminfin). `SENSIBLE_DEFAULT` oculta por defecto las secciones sensibles.
- RRHH todavía NO está en `SECCIONES` del portal. Hoy RRHH usa la bandera `ve_sueldos` + sector.
  DECISIÓN PENDIENTE: pasar al modelo de secciones del portal.
- Prefijo `rrhh_`: no figura en la lista de prefijos de los CLAUDE.md de portal y planificación (sí está
  `rrhh` en el enum y en `SECTORES` del portal). Conviene que Pablo lo confirme.
- Falta un `CLAUDE.md` en este repo, como tienen los demás.
