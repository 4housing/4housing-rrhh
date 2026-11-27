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
6. SAC, indemnizaciones, vacaciones no gozadas.
7. Diferencia de contribuciones S.S. contra F.931 y su tolerancia.

## Para verificar en Supabase antes de ejecutar el SQL
- Firma real de `tiene_sector` y `ve_sueldos` (el SQL 02 las supone).
- (Resuelto) `planificacion_persona_id` es uuid, como `planificacion_valor_hora_hist.persona_id`.
- Grupo/agrupador de 1100, 1102, 1500, 1550, 1600 (supuestos Haberes/SUELDO).

## Sábados, extras de fin de semana y fichadas (decisión de administración)
- Los sábados y las extras se pagan por OC y se imputan por lo liquidado (opción A). `js/rrhh-sabados.js` avisa cuando un
  día se pagó y NO figura en la planificación (o al revés) y pide que administración VALIDE; no es un error automático:
  la planificación puede no reflejarlo y **manda la fichada y la autorización del supervisor** para el pago.
- Hoy el control queda en `sin_planificacion` (no se puede comparar hasta tener la lectura de planificación). Octubre:
  23 días de fin de semana pagados en 15 legajos para validar.
- **Etapa futura:** trabajar con fichadas y con la autorización de horas extra (supervisor); la validación pasará a hacerse contra ellas.

## Motor de costo por tipo de hora (js/rrhh-costo-hora.js) — estado
- Reglas en el encabezado del archivo. Verificadas con los 20 operarios de octubre (solo local, sin guardar cifras acá):
  para cada uno, Σ costo por tipo + «sin horas» + sábados/extras OC = su CUESTA; la cantidad del concepto 1100 = horas de
  todos los tipos menos las extras; el mensualizado (110) cierra con la cifra de control del handoff.
- Legajo 148 (octubre): el reparto queda a menos de 0,05% de los valores por hora del handoff (que dice «aproximado»).
  Ninguna combinación de bases los reproduce exacto. Los valores por persona NO se escriben en el repo (es público).
- Quedan «sin regla» (se reparten por horas pagas y se listan): 6000 Sueldo básico y 99999 Redondeo. A definir con administración.
- Los pagos fijos sin horas trabajadas (mes entero de ART/enfermedad, mensualizados) quedan «sin horas»: costo real sin valor hora.
- Pendiente: guardar el resultado (rrhh_costo_mensual / rrhh_valor_hora), pantalla de Costos y publicar a planificación.

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

## Decisiones de administración — 2026-11-09
- **Legajo 170: es operario.** Existe (administración decía que no); está con licencia, por eso no figura en planificación
  (igual que 163 y 164). Los operarios para el costo son 21: los 20 de la hoja de control de octubre + el 170. El 162 no es operario.
- **Concepto 1602 (Premio Variable Voluntario): se carga como costo.** Sin regla de reparto todavía (el motor lo reparte por horas pagas y lo lista).
- Sigue pendiente: 6501 (Adic. Reintegro impuestos; no es de un operario) frena el cierre hasta que administración decida su tratamiento.
- Planificación: `planificacion_valor_hora_hist` guarda el mes como `AAAA-MM` y tiene UNIQUE (persona_id, mes): publicar el valor hora = upsert por persona y mes.

## Pedidos de la usuaria — 2026-11-09 (para seguir)
- **Costo por empleado (hecho, Vista 1 «Mes»):** una fila por persona y mes con 4H, 4H OC, bono, «cuesta» con y sin bono, «cobra en el bolsillo»,
  las columnas del Excel de control y el detalle por concepto; filtros por mes, departamento y búsqueda; exportar a Excel.
- **Vista 2 «Mes a mes»:** personas (o departamentos) × meses con una columna Total que es la SUMA de los meses (no acumulado corrido),
  con selector de medida. Requiere cargar los meses anteriores.
- **Control F.931 en la app:** hoy la app NO pide cargarlo y debe pedirlo. Carga manual de los datos del mes (rem. 1, contribuciones S.S. y O.S.,
  L.R.T., seguro de vida, aportes, empleados; tabla `rrhh_f931`) y tabla de control liquidación vs F.931 con tolerancia configurable.
  El cálculo del control ya existe en `js/rrhh-calculo.js` (`controlF931`).
- **Histórico:** se recrea trabajando con la solapa «Resumen» de los Excel de control de cada mes. Los bonos se liquidaban aparte
  (archivo BONOS 2025-2026: pagos por proyecto, persona y período, con asientos contables); se usará para reconstruir el bono histórico.
- **Imputación (informe C):** mano de obra directa a proyectos según planificación; administración no se imputa a proyectos, va al concepto de gasto general.

## Líneas propias: aguinaldo y bajas (decisión de administración, 2026-11-09)
- Lo liquidado como tipo «Bajas» o «Aguinaldo» (y los conceptos marcados con `linea` en el catálogo, p. ej. la gratificación final por OC)
  cuenta como **costo y como cobro**, se muestra en columnas propias y **no entra al valor hora**.
- Se define por el TIPO DE LIQUIDACIÓN del informe (no hace falta catalogar cada concepto de una baja). El SQL `rrhh_04_lineas_propias.sql`
  agrega la columna `linea` para lo que viene mezclado en otra liquidación.
- Verificado solo en local con los Excel de control de septiembre y octubre: septiembre coincide con la hoja `Project` en todos los operarios y su cierre
  queda sin bloqueos; octubre no cambia.
- Sigue abierto: el SAC (aguinaldo) se provisiona 1/12 por mes o se imputa al pagarse.

## Control del F.931 en la app (2026-11-09)
- Nueva solapa **Controles**: se sube el PDF del F.931 apenas se recibe. Se lee EN EL NAVEGADOR con pdf.js (se carga solo al subir el PDF) y **el archivo
  no se guarda**: se muestran los valores leídos para confirmarlos o corregirlos y se guardan solo esos números en `rrhh_f931`.
- Si el PDF es de otro mes que el elegido, no se carga nada. Si el lector de PDF no carga o falta algún dato, se completa a mano; el extractor nunca inventa valores.
- El control compara contra lo liquidado en el recibo 4H, con tolerancia configurable, y muestra como informativas (no bloquean) los aportes y las contribuciones
  S.S. sin ANSSAL, para hablarlas con el contador.
- Verificado solo en local con el F.931 real de octubre. Pendiente: probar contra la base real y con la URL de pdf.js en cdnjs desde el navegador.
- **SAC (decisión):** por ahora se muestra en el mes en que se paga; después se define si se provisiona.

- **Concepto 6501 (Adic. Reintegro impuestos): se carga como costo** (decisión de administración, 2026-11-09): es de una persona con licencia y se trata
  como una ART (costo sin horas productivas). Sin regla de reparto. Con él, el cierre de octubre ya no queda frenado por conceptos sin catalogar y la línea
  de Remuneraciones del control del F.931 coincide; quedan las diferencias de ART/LRT y de contribuciones S.S. para revisar con el contador.

## Bonos (decisiones de administración, 2026-11)
- Tipos: **Producción** (porcentaje sobre ventas), **Montaje** (adicional por ir a trabajar a un montaje), **Posventa** (adicional por ir a trabajar a un posventa).
  Hasta ahora todo se llamaba «Bono Producción»; **a futuro se discriminan**. Todos se computan contra proyectos.
- Montaje = conceptos 55015, 55016, 55025. Posventa = 55020, 55029 (tratamiento `directo_proyecto`, igual que Montaje).
  Falta saber qué concepto(s) de la liquidación son el Bono Producción: mientras tanto lo no discriminado cae en «Otros (sin discriminar)».
- «Costo por mes» permite incluir o no cada tipo de bono (Montaje / Posventa / Otros).
- Solapa **Bonos** (pendiente): histórico desde BONOS_2025-2026.xlsx y los archivos por proyecto (n° 43, 44…), más lo liquidado.
  A futuro, al importar conceptos de bono la app pregunta a qué proyecto corresponde: se propone uno con el total liquidado (editable),
  un **+** agrega otro proyecto con su importe, y la suma tiene que coincidir con lo liquidado. Requiere tablas nuevas (SQL aparte).
- Etapa siguiente (faltan archivos): ajuste de fichadas (salida sin fichar, aprobar horas extra) y Excel de salida para importar novedades en Tango.

## Asientos contables de los adicionales en efectivo (2026-11) — primera versión
- **Alcance (aclarado por administración):** esta solapa es para el informe de lo que se paga **adicional y en efectivo** (caja en pesos). Es **distinto** de la liquidación
  formal por sueldos (la que se transfiere por banco y se controla contra el F.931, que es lo que ya hace el resto de la app).
- Nueva solapa **Asientos** (`js/rrhh-asientos.js` = lógica pura probada en `test/asientos.test.js`; `js/rrhh-vista-asientos.js` = pantalla). Se sube en el navegador el
  «Resumen de conceptos liquidados», el padrón (solapa LEGAJOS) y, si hay coparticipación de operarios, la planilla COPAR. **No hay SQL ni se guarda nada en la base**;
  solo se recuerda en el navegador (localStorage) la configuración por persona. Del padrón se descartan C.U.I.L., teléfono y correo al leer.
- Genera, para cargar a mano en Tango: asientos, renglones y una solapa **Auxiliares a cargar** (tipo, auxiliar, porcentaje, importe); más «Sin destino» y un control
  contra el total del informe (debe dar diferencia 0). Exporta un Excel con las columnas de las solapas de Tango.
- **Reglas (confirmadas por administración o deducidas y verificadas contra agosto y septiembre; ver la cabecera de `rrhh-asientos.js`):** Adicional Socios; asientos
  individuales por sector; coparticipación del resto con auxiliar Sueldos repartido por el departamento del padrón (el porcentaje se CALCULA, no es fijo); comisión rental
  (múltiplos de $500); diferencia de categoría; Neuquén en un solo asiento al cierre contra Remuneraciones a pagar; Bono Montaje con el proyecto elegido; coparticipación de
  operarios repartida por proyecto según COPAR; adelanto de coparticipación como préstamo en dólares.
- **Verificado solo en local** con los Excel de agosto, septiembre y octubre de administración (no se prueba contra Tango real). Los asientos de agosto y septiembre
  coinciden con los cargados, salvo lo listado abajo.
- **Abierto / a confirmar:**
  - **Sábados, horas extra y feriados por día** (decisión de administración): los **días pagados** salen del archivo de **Novedades registradas** (códigos `SABADO` = días y
    `HRSEX1` = horas extra al 50 %, de fin de semana o feriado; los demás códigos se ignoran) y el **proyecto y la tarea (motivo)** de cada día, del informe «formato DATOS»
    de la app de planificación. «Sábado Taller» (55013) se reparte **en partes iguales por día** (verificado con octubre: el importe por día es parejo dentro de cada persona);
    horas extra / feriado (55014, 55551, 55030) **proporcional a las horas** de cada día `HRSEX1`; el redondeo acompaña a la parte mayor. Todo sale en un asiento (EERR «A) CMV VENTA»,
    Instructivo por proyecto con porcentaje, Sueldos «NO APLICA»); la solapa «Sábados y extras por día» muestra cada línea con su origen para revisar.
  - Lo que no se puede ubicar por día (persona sin novedad, o día que no figura con proyecto en la planificación) va al **proyecto y motivo indicados** en la pantalla y se avisa.
    Sin archivo de novedades se usa lo anterior: sábados planificados con proyecto en partes iguales. Si el informe de planificación trae varios proyectos el mismo día,
    se usa el primero (el resto va solo en la descripción). **Sin verificar:** qué novedad corresponde a «Feriado trabajado» (55030) y a «Horas extras Man.» (55551): octubre no tuvo.
  - **Archivo de novedades de octubre (referencia de códigos):** `SABADO` ↔ Sábado Taller, `HRSEX1` ↔ Horas extras al 50 %, `HABMTJ` ↔ Bono Montaje (días hábiles), `HSNQN` ↔ Neuquén
    (horas por quincena), `BRUTO` ↔ sueldo bruto del recibo. `HABVTA` (día hábil posventa) no tuvo concepto en el informe de efectivo de octubre.
  - **No hace falta correr `rrhh_03_lectura_planificacion.sql`** para esto (el reparto usa el CSV de planificación y el archivo de novedades subidos en el navegador). Sigue siendo
    la forma de leer la planificación directo desde la app a futuro.
  - **Equivalencia de proyectos (confirmada por administración):** «IF» es el **Instructivo de Fabricación**, la clasificación (auxiliar) que usan todas las apps; la planificación la resume
    solo con el número («4417 VICUÑA» = «IF4417 VICUÑA»). Para códigos numéricos se agrega IF automáticamente; se puede corregir por proyecto en la tabla de la pantalla (se recuerda en el navegador).
  - **Varios proyectos el mismo día:** se usa el primero (confirmado por administración).
  - **Personal fuera de la planificación de producción** (administrativos, Neuquén): sus días van al proyecto indicado (octubre: 4417) **sin aviso**. Se deduce de que no figure en el informe de
    planificación, o se marca a mano en la tabla de personas (lo configurado manda). Quien figura en el informe (p. ej. como supervisor) sin proyecto ese día se avisa hasta que se lo marque.
  - **Controles al cruzar los informes** (octubre): varias personas tienen días pagados (novedades) que no figuran con proyecto en la planificación, y hay sábados planificados
    sin pago en el informe de efectivo. La app los avisa; falta que administración y planificación los revisen.
  - Neuquén: el asiento suma todos los conceptos de esas personas; en septiembre difiere de lo cargado porque se registró una rendición final con otro importe.
  - Bono Montaje de operarios: en septiembre lo cargado fue menor que lo liquidado; no se sabe a qué otro asiento fue el resto.
  - Coparticipación de operarios por proyecto: se asume el reparto proporcional a la columna del mes de COPAR (se pueden tildar varios meses). La planilla tiene
    meses «IMPAGOS» acumulados: confirmar cuál es la regla.
  - Códigos de auxiliar «Instructivo de fabricación» (`4)` SUEPRO y `1)` NA) y el código de proyecto (primer término del nombre) están deducidos del export de Tango: verificar.
  - **Identificador** del asiento en el Excel de salida es provisorio (lo asigna Tango); **no se probó importarlo** a Tango. Hoy se usa como guía para cargar a mano.
  - La lista de quién va en asiento individual y su sector vive solo en el navegador de cada persona; si hace falta compartirla, hay que pasarla a una tabla (SQL aparte).
  - **Revisión en dos vistas (pedido de administración):** la pantalla y el Excel de salida tienen **solo dos solapas**: «Detalle» (una fila por línea del informe, como la solapa Totales de Tango, con el asiento
    de destino, subtotales por legajo, total por destino y el control) y «Asiento» (una sola tabla con todo lo necesario para cargarlo: título del asiento con fecha, moneda y cotización; sus renglones y, debajo
    de cada uno, sus auxiliares). El detalle de sábados y extras por día queda como tercera pestaña en pantalla y al pie de «Detalle» en el Excel.
  - **Préstamo con el formato del asiento modelo de Tango** (en dólares): concepto «PRESTAMO <etiqueta> AAAAMM», leyenda «<legajo> - PRESTAMO <etiqueta> AAAAMM Cuota N» y auxiliar tipo 30 «<código> - <legajo> <apellido y nombre>»
    con el importe en dólares. La etiqueta (p. ej. «ABC DEPTO») y la cuota se cargan en la tabla de personas; la cotización es la del dólar blue promedio del último día del mes (la ingresa la persona; la app no la busca).
  - **Fechas del Excel:** se escriben como número de día con formato dd/mm/aaaa. Con un `Date` la librería (SheetJS 0.18.5) en la zona horaria de Argentina grababa 23:59:12 del día anterior y Excel mostraba un día antes.
  - **Cruce con los «Totales» multidimensionales de Tango (octubre, solo local):** los totales de Tango por legajo y concepto difirieron del «Resumen de conceptos liquidados» usado en tres casos: la coparticipación de una persona
    liquidada con otra categoría, un descuento de Hogar que figura solo en Tango y un Monotributo que figura solo en el resumen. Falta definir cuál es la versión vigente. Posible mejora: leer directamente la solapa «Totales»
    (trae el concepto por nombre, no por número).


## Fichadas y partes diarios (2026-11) — etapa 1
- **Circuito:** Tango Fichadas exporta el `.txt` (aplicación de consola) → la app lo lee, calcula el parte de cada persona y día, RRHH corrige y aprueba extras → la app genera el `.txt` **depurado** que RRHH importa en Delta (Control de personal → Lectura de fichadas)
  de la empresa **4COMMERCE SRL**. El servicio automático de Tango Fichadas hacia Delta tiene que estar apagado para que no llegue nada sin depurar.
- **Piezas:** `js/rrhh-fichadas.js` (lectura/armado del `.txt` y cálculo del parte, lógica pura, `test/fichadas.test.js`), `js/rrhh-vista-fichadas.js` (solapa **Fichadas**), `sql/rrhh_06_fichadas.sql` (tablas `rrhh_fichadas`, `rrhh_partes_dia`,
  `rrhh_legajo_fichadas`, `rrhh_horarios`, `rrhh_feriados`, con RLS por la sección «liquidación»). **Orden de deploy: primero el SQL, después el HTML/JS.**
- **Datos que NO van al repo:** los horarios, el horario de cada legajo y los feriados se cargan con un SQL aparte (semilla) que se entrega por fuera. El `.txt` y las fichadas no llevan C.U.I.L., teléfono ni correo.
- **Correcciones:** las fichadas de Tango no se tocan; RRHH agrega una (origen «manual», con motivo y usuario) o anula una (queda el rastro). La app propone completar la entrada/salida que falta con el borde del horario y perdonar llegadas tarde
  (es lo que hace RRHH hoy). El archivo depurado sale ordenado por fecha y hora, de 42 caracteres por línea y sin salto final, como el de Tango.
- **Cálculo (verificado contra el «Informe resumen de partes» de Delta, 1ª quincena de noviembre 2026, solo local):** coincide en las **143 jornadas** hábiles y de sábado con 2 o más fichadas (horas normales, extra 50 % y extra 100 %), y detecta los **mismos 30 ausentes**.
  Reglas: llegar antes no es extra; extras redondeadas a 30 minutos (la mitad hacia arriba) o minutos exactos para los legajos con unidad 1; sábado al 50 % hasta las 13:00 y al 100 % después; descanso de 1 h desde las 12:00. Ver la cabecera del archivo.
- **Hipótesis con pocos casos:** el día parcial se paga en bloques de 30 minutos (3 casos). **Feriados:** se calculan con el horario de feriados pero quedan siempre marcados para revisar: en noviembre Delta liquidó el 9 y el 11 como días comunes en los partes, y la
  liquidación pagó 8 h de feriado por día. Falta definir con administración cómo se pagan las horas trabajadas en feriado.
- **Lo que hace RRHH después y todavía no está en la app (etapa 2):** el Excel de **novedades** (formato `Fecha, Número de legajo, Código de novedad, Cantidad, Valor, Observaciones`, sin C.U.I.L.) para lo que no sale de las fichadas (justificaciones, licencias, adelantos)
  y las horas extra aprobadas; y las **vacaciones**: que cada persona vea sus días, los pida, y la app genere las novedades (`VACJOR`, `VACM`). Pendiente definir quién entra a la app, cómo se aprueban y cómo se calculan los días que corresponden.
- **Pendiente de datos:** qué ajusta RRHH a mano en los partes (el sistema puede tomar como extra una entrada a las 06:00 que RRHH corrige); la 2ª quincena de noviembre para una prueba ciega; reglas de Neuquén y jornada parcial con más casos.
- **Revisión por excepción (2026-11):** cada parte se clasifica en «Sin novedades» (no hace falta mirarlo), «Extra por aprobar» (solo tiene horas extra) o «Por revisar» (falta algo o es llamativo: fichada única, más de dos fichadas, llegó tarde, salió temprano,
  ausente sin aviso, feriado, sin horario). La pantalla muestra por defecto solo lo que necesita una decisión. Con las fichadas de la 1ª quincena de noviembre (solo local): de 210 partes, 102 sin novedades, 51 con extras por aprobar y 57 por revisar
  (29 de esos 57 son solo por ser feriado); tras aprobar las extras en bloque y marcar los feriados quedan 28 por decidir.
- **Ausencias ya justificadas:** si se sube el archivo de **Novedades registradas** (opcional, no se guarda), una ausencia con una novedad ese día (enfermedad, ART, horas justificadas, vacaciones, licencias…) deja de marcarse. En noviembre, 29 de las 30 ausencias
  tenían una novedad. Los códigos reconocidos están en `JUSTIFICACION` de `js/rrhh-fichadas.js`.
- **Resumen del período** por persona: días con fichadas, horas normales y extra, extras aprobadas, días por aprobar o revisar, ausentes con y sin aviso, llegadas tarde y fichadas únicas; marca como llamativo (fila amarilla) las extras por encima de un límite
  configurable (30 h por defecto, se recuerda en el navegador), ausencias sin aviso, 3 o más llegadas tarde y fichadas por completar.
- **En bloque:** «Aprobar en bloque las extras sin otras anormalidades» (o las de una persona) aprueba las extras calculadas de los días que no tienen otra anormalidad; «Marcar como revisados los feriados trabajados» solo los marca como vistos (no aprueba horas).
  «Pendiente» en la versión anterior = el día todavía no fue marcado como revisado por RRHH.
- **Marca «Modificado» (pedido de administración):** todo cambio hecho a mano se ve en la tabla con una marca amarilla «Modificado»; al acercar el cursor aparece un recuadro con lo que había antes (las fichadas tal como llegaron de Tango y las horas que daban),
  lo que cambió (fichadas agregadas o anuladas con su motivo) y, si RRHH aprobó una extra distinta de la calculada, la diferencia; con quién lo hizo y cuándo. El mismo detalle se ve completo en el panel del día. El botón **Registro de cambios (Excel)** baja todos
  los cambios del período. Lógica en `describirCambios` (`js/rrhh-fichadas.js`, probada). El nombre de quien modificó sale de la tabla `perfiles` del portal si el usuario puede leerla; si no, figura «RRHH» (queda guardado el usuario en la base).
- **Tabla estándar: títulos en dos líneas.** `RRHHTabla` acepta un salto de línea en `titulo` («Extra\n50 % (h)»): la columna se ancha por la línea más larga y el filtro y el Excel usan el título en una línea. Las tablas que no lo usan no cambian. En Fichadas, además, el día va
  junto a la fecha y el texto «TOTAL» del pie va en la columna Persona (antes ensanchaba la primera columna): la tabla de partes pasó de unos 1.820 a unos 1.620 px de ancho.
- **Solapa Calendario (pedido de administración):** grilla personas × días como el Excel de RRHH. Verde = horas normales del día; naranja = «Aus. J.» / «Enf.» / «ART» (ausencia con novedad); rojo = «Aus. Inj.» (sin novedad); azul = «Vac.» (solo si se subió el archivo de novedades con VACJOR/VACM); gris = «Fer.»; amarillo «?» = fichada única. Las extras van debajo en azul chico («+1,5 h 50 %») y las horas de menos en rojo chico («−1 h»); múltiplos de 30 min en horas decimales, el resto en minutos. Borde amarillo = día que todavía necesita una decisión; esquina marcada = día modificado. Clic en una celda abre el panel del día; el cursor muestra el detalle. Exporta a Excel. Lógica en `celdaCalendario` (`js/rrhh-fichadas.js`, probada).
