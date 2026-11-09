# 4housing-rrhh — Contexto del proyecto

Módulo **Recursos Humanos** del portal 4housing: importa los informes mensuales de liquidación de sueldos, calcula
cuánto cuesta cada persona y cuánto cobra, controla contra el F.931 y (más adelante) imputa la mano de obra a proyectos.

## Stack
- HTML + JS vanilla estático (`index.html`, `js/`), GitHub Pages, org `4housing`. Backend: Supabase unificado (mismo proyecto que el portal).
- Libs por CDN con versión fija: supabase-js@2, SheetJS 0.18.5, pdf.js 3.11.174 (se carga solo al subir un F.931).
- `sql/` versiona las migraciones (prefijo de tabla `rrhh_`). `test/` = tests con `node --test test/*.test.js`.

## Reglas NO NEGOCIABLES (las mismas del portal y de todas las apps)
1. **Los datos de sueldos son confidenciales y el repo es público**: nunca van al repo (ni en código, tests, docs, PR ni commits). Tests solo con datos sintéticos. No se guarda ni se envía C.U.I.L., teléfono ni correo.
2. **SQL nunca se ejecuta solo**: se entrega como `.sql` (o bloque en el chat) y lo corre una persona a mano en Supabase. Orden de deploy: primero el SQL, después el HTML/JS.
3. **RLS siempre `authenticated`, nunca `anon`**, con compuerta por sección (`rrhh_puede_ver/editar`). Sin lista guardada = no ve nada; dirección ve todo.
4. **Secretos nunca en el código.**
5. **`node --check`** de todo el JS (y del script inline de `index.html`) antes de terminar.
6. Cambios chicos y aditivos, una feature por PR, commits en español. No romper lo que ya funciona.
7. Diagnosticar con evidencia; reportar con fidelidad (si algo no se verificó contra la base real, decirlo).

## Estándar de tablas (SIEMPRE, sin que haya que pedirlo)
Toda tabla con información usa `js/rrhh-tabla.js` (`RRHHTabla.crear`) y trae:
- ordenar por columna (clic en el título), filtro por columna con **buscador y selección múltiple** (▾),
- ancho de columna ajustable arrastrando el borde, **doble clic = autoajuste**, y autoajuste de todas las columnas al abrir (+ botón «Ajustar columnas»),
- contador «N de M filas», «Limpiar filtros», y el total (pie) recalculado sobre lo filtrado,
- exportar a Excel respetando filtros y orden.
Una tabla nueva sin esto no se da por terminada.
