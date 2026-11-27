# Diccionario de funcionamiento — Fichadas y Novedades

Documento vivo: se actualiza cada vez que cambia algo. Sin datos de personas ni de sueldos (el repo es público); los ejemplos son inventados.
Última actualización: 2026-11-27 · Estado: Fichadas (etapa 1) y Novedades (etapa 2, v1) publicadas; vacaciones sin empezar.

## 1. El circuito, paso a paso
1. **Tango Fichadas** exporta un `.txt` con las marcas del reloj (idealmente a las 00:05, con período «ayer»). El servicio automático Tango → Delta tiene que estar **apagado**, para que nada llegue a Delta sin depurar.
2. Quien corresponda **sube el `.txt`** en la pantalla *Fichadas* («Guardar fichadas»). Las que ya estaban se ignoran, no se duplican.
3. La app calcula el **parte diario** de cada persona y día con el horario que tiene cada legajo en Delta.
4. **RRHH revisa solo lo que necesita decisión**: corrige fichadas (agregar o anular, siempre con motivo), aprueba horas extra día por día y carga novedades.
5. La app genera el **`.txt` depurado** (ordenado por fecha y hora). RRHH lo importa en Delta: *Control de personal → Lectura de fichadas* (empresa 4COMMERCE SRL).
6. Lo que no sale de las fichadas (justificaciones, licencias, vacaciones, adelantos, descuentos) se carga en *Novedades*, y de ahí sale un **Excel** que se importa en Delta.

## 2. Glosario
| Término | Qué es |
|---|---|
| **Fichada** | Una marca de reloj: fecha, hora y código de fichador. El código de fichador es el legajo con ceros a la izquierda (0102 = legajo 102). |
| **Parte diario** | El resultado de un día de una persona: entrada, salida, horas normales, horas extra, anormalidades. |
| **Entrada / salida** | La primera y la última fichada del día. |
| **Tramo** | Franja del horario (normal o extra) con su tolerancia. Ej.: lunes a viernes normal, sábado al 50 %, después de las 13:00 al 100 %. |
| **Tolerancia** | Minutos de margen al inicio y al fin de un tramo. |
| **Unidad** | Con qué granularidad se pagan las extras: 30 min (se redondea al múltiplo más cercano, la mitad hacia arriba) o 1 min (exactos). Se define por legajo. |
| **Fuera de horario** | Llegar antes del inicio. **No** es hora extra y no se paga; queda registrado. |
| **Hora extra aprobada** | Minutos de extra al 50 % / 100 % que RRHH aprobó **para ese día y esa persona**. Se aprueba por día; también hay aprobación en bloque, que solo toma los días sin otras anormalidades. |
| **Novedad** | Un renglón para Delta: fecha, legajo, código (ej. HSENF = enfermedad, LICART = licencia por ART, VACJOR / VACM = vacaciones), cantidad, valor, observaciones. |
| **Modificado** | Marca amarilla: alguien cambió algo a mano (fichada agregada o anulada, extra aprobada distinta de la calculada). Al pasar el cursor se ve qué había antes, qué cambió, quién y cuándo. |

## 3. Cómo se clasifica cada día (revisión por excepción)
- **Sin novedades**: día normal, no hace falta mirarlo.
- **Extra por aprobar**: solo tiene horas extra para aprobar o no.
- **Por revisar**: falta algo o es llamativo — una sola fichada, más de dos fichadas, llegó tarde, salió temprano, ausente sin aviso, feriado, sin horario, día sin horario.
- **Revisado**: RRHH ya lo vio.
- Una **ausencia** deja de marcarse si ese día hay una novedad de justificación (la cargada en la app o la que viene en el archivo de Delta que se puede subir).

## 4. Reglas de cálculo
Marcadas **[verificado]** cuando coinciden con el informe de partes de Delta de la 1ª quincena de noviembre 2026 (143 de 143 jornadas) y **[hipótesis]** cuando hay pocos casos.
- Una sola fichada → no se paga nada, queda por revisar. **[verificado]**
- Llegar antes del inicio → no es extra, no se paga. **[verificado]**
- Tramo normal: entrada dentro de la tolerancia de inicio y salida dentro de la tolerancia de fin → se paga el día completo. Si no, se paga lo trabajado menos el descanso (60 min fijos desde las 12:00), en bloques de 30 min hacia abajo. **[hipótesis: 3 casos]**
- Tramos extra: se cuentan los minutos dentro del tramo y se redondean a la unidad del legajo. Con unidad 30: 14 min = 0, 15 min = 30, 45 min = 60. Con unidad 1: minutos exactos, sin mínimo. **[verificado]**
- Sábado: extra al 50 % de 07:30 a 13:00 y al 100 % de 13:00 a 22:00. **[verificado]**
- Feriados: se calculan con el horario de feriados pero **siempre** quedan para revisar. **[sin resolver, ver pregunta 1]**
- Extras llamativas: más de 30 h en el período (se puede cambiar en pantalla).

## 4 bis. Vacaciones (etapa 3a)
- **Saldo**: los días que corresponden a cada persona y año **los escribe RRHH**; la app no los calcula. Restan = corresponden − días de pedidos aprobados. «Restarían si apruebo todo» descuenta además los pedidos sin decidir.
- **Pedido**: desde, hasta, días (escritos por RRHH), código y cantidad por día. Estados: Pedido → Aprobado por el jefe → Aprobado (RRHH); o Rechazado / Cancelado. Un aprobado con novedades ya generadas no se cancela desde la pantalla.
- **Generar novedades**: una por día elegido. Las fechas sugeridas son lunes a viernes sin feriados cargados; RRHH las confirma. **No es la regla de Tango**: cuando se defina, se ajusta para que coincidan.
- **Control de integridad**: avisa saldo negativo, sin saldo cargado, aprobado sin novedades generadas y novedades distintas de los días del pedido.
- Todavía **no** hay acceso para empleados ni jefes (etapa 3b).

## 4 ter. Empresas y períodos
- La app maneja **dos empresas**, con los códigos que ya usa el módulo: **4H** (4Commerce) y **4H OC** (4Commerce órdenes de compra). Delta se importa **por empresa**: cada novedad y cada pedido de vacaciones lleva su empresa, y el Excel para Delta sale de una empresa por vez.
- En Novedades se filtra por empresa y por mes; por defecto se ve el **mes actual** (no los meses anteriores). Exportar pide elegir una empresa.
- **No confundir** `rrhh_novedades` (las «Novedades registradas» que se importan de Delta por período y empresa, ya existían) con `rrhh_novedades_carga` (lo que se carga en la app para exportar).
- Las fichadas hoy no tienen empresa (el `.txt` es de 4COMMERCE SRL); las novedades cargadas desde el panel de un día piden la empresa.

## 5. Pantallas
- **Fichadas → Partes por día**: una fila por persona y día, con filtros por columna, orden, ancho ajustable y exportación a Excel. Clic en una fila abre el panel para corregir.
- **Fichadas → Calendario**: personas × días. Verde = horas normales; naranja = «Aus. J.», «Enf.», «ART»; rojo = «Aus. Inj.»; azul = «Vac.»; gris = «Fer.»; amarillo «?» = fichada única. Debajo, en chico: extras en azul («+1,5 h 50 %») y horas de menos en rojo («−1 h»). Borde amarillo = necesita decisión; esquina marcada = modificado.
- **Fichadas → Resumen del período**: por persona (días, horas, extras aprobadas, ausencias, llegadas tarde); fila amarilla = algo llamativo.
- **Vacaciones**: solapa *Pedidos* (carga, aprobación del jefe y de RRHH, generación de novedades VACJOR / VACM) y solapa *Saldos y control* (días que corresponden, aprobados, restantes y control de integridad).
- **Novedades**: carga de renglones, tabla de pendientes y exportadas, **Exportar pendientes para Delta** (marca como exportado; lo exportado ya no se puede borrar).

## 6. Qué se guarda y quién lo ve
- Se guardan: fichadas (legajo, fecha, hora; las agregadas a mano con motivo y usuario; las anuladas con rastro), revisión de cada día, horarios por legajo, feriados y novedades (en novedades puede haber importes de adelantos y descuentos).
- **No** se guarda ni se envía C.U.I.L., teléfono ni correo.
- Acceso: solo usuarios autenticados con permiso sobre «Liquidación» (ver / editar). Sin permiso guardado no se ve nada; dirección ve todo.
- El SQL siempre lo corre una persona a mano en Supabase, **antes** de publicar la parte web.

## 7. Dudas pendientes para resolver con RRHH
Cada una dice por qué importa. Marcá la respuesta y la fecha cuando se resuelva (y avisame para actualizar el diccionario).

| # | Duda | Por qué importa | Respuesta |
|---|---|---|---|
| 1 | **Feriados trabajados**: ¿cómo se pagan las horas trabajadas en un feriado? En noviembre Delta trató dos feriados como días comunes en los partes, y la liquidación pagó 8 h de feriado por día. | Hoy la app los marca siempre para revisar y no sabe qué tiene que dar por correcto. | |
| 2 | **Día parcial** (llega tarde o se va antes, fuera de tolerancia): ¿se paga lo trabajado en bloques de 30 min hacia abajo? Lo deduje de 3 casos. | Afecta cuánto se paga en cada llegada tarde o salida temprana. | |
| 3 | **Descanso**: ¿es siempre 1 h desde las 12:00, o cambia por horario o categoría? | Se descuenta del día parcial. | |
| 4 | **Tolerancia**: ¿cuántos minutos son, y valen igual para la entrada normal y para el inicio de las extras? (Se mencionó 30 min.) | Define cuándo se paga el día completo. | |
| 5 | **Llegar antes del horario**: ¿nunca se paga ni se cuenta como extra, o RRHH a veces lo ajusta a mano? (Ej.: una entrada a las 06:00 que RRHH corrige.) | Hoy la app no lo paga; si RRHH lo ajusta, hay que modelarlo. | |
| 6 | **¿Qué ajusta RRHH hoy a mano en los partes?** Lista de casos típicos. | Para automatizarlos o sugerirlos. | |
| 7 | **Fichada única**: ¿qué se hace — se agrega la salida con la hora del horario, se pregunta a la persona, se justifica? | Hoy queda sin pagar hasta que RRHH la completa. | |
| 8 | **Más de dos fichadas en un día**: ¿se toma la primera y la última, o se descarta alguna? | Hoy se toma primera y última y queda marcado. | |
| 9 | **Ausencia sin aviso**: ¿se carga HSINJ o se deja sin novedad? ¿Qué pasa en Delta si no se carga nada? | Define si Novedades debe sugerirla. | |
| 10 | **Horas extra**: ¿Delta las paga solo con lo que calcula de las fichadas depuradas, o hay que cargarlas como novedad? En el histórico hay códigos HRSEX1 (pocos) y ninguno para extra al 100 %. | Decide si las extras aprobadas entran a Novedades (hoy quedaron afuera). | |
| 11 | **Quién aprueba las extras**: ¿RRHH, el supervisor, el jefe directo? ¿Hace falta un segundo nivel? | Hoy aprueba cualquiera con permiso de editar Liquidación. | |
| 12 | **Importación de novedades en Delta**: nombre exacto de la hoja y de las columnas que acepta. (Se usó el de «Novedades registradas»: hoja «Novedades».) | Si Delta la rechaza, hay que ajustar el formato. Probar con una fila. | |
| 13 | **Cantidad por código**: ¿es en horas o en días? En el histórico VACJOR aparece con 8, VACM con 7, EXCEDENCIA con 28, NACIMIENTO con 16. | Una cantidad en la unidad equivocada paga mal. | |
| 14 | **Códigos sin descripción**: ¿qué significan ADELANTO, DESCADEL, HSDESC, AJTE y CUOTA-A, y cuáles se cargan a mano? | Para completar el catálogo de Novedades. | |
| 15 | **Jornada parcial y Neuquén**: reglas especiales de horario, descanso o feriados. | Hay pocos casos; puede haber diferencias no detectadas. | |
| 16 | **Extras llamativas**: ¿30 h por período es un buen umbral? | Define qué se marca en amarillo en el Resumen. | |
| 17 | **Rutina diaria**: ¿quién sube el `.txt` y a qué hora? ¿Quién tiene permiso de ver y de editar? ¿Está confirmado que el servicio automático a Delta está apagado? | Si el servicio sigue prendido, llegan fichadas sin depurar. | |
| 18 | **Vacaciones** (etapa 3): ¿quién entra a la app (cada persona, el jefe, RRHH)? ¿Cómo se aprueban los pedidos? ¿Cómo se calculan los días que corresponden a cada persona (antigüedad, proporcionales, qué se considera día hábil)? | Sin esto no se puede empezar. Después se generan VACJOR / VACM. | **Parcial (2026-11-27):** cada empleado entra a ver su saldo y pedir; aprueban primero el jefe y luego RRHH; el cálculo de días se define con RRHH. Siguen abiertas las preguntas 21 a 25. |
| 19 | **Segunda quincena de noviembre**: pasar el informe de partes de Delta para una prueba ciega del cálculo. | Hoy la regla se verificó con una sola quincena. | |
| 20 | **Seguridad**: rotar la clave de Tango Fichadas y el token de desarrollador de Delta que se compartieron durante la configuración. | Quedaron expuestos en la conversación de trabajo. | |

### Vacaciones (etapa 3): preguntas abiertas
| # | Duda | Por qué importa | Respuesta |
|---|---|---|---|
| 21 | **Usuarios**: ¿todo el personal tiene cuenta Microsoft de la empresa (la que usa el portal)? Si no, ¿con qué entrarían? | El portal hoy solo entra con Microsoft. Sin cuenta no hay acceso propio. | |
| 22 | **Jefes**: ¿quién es jefe de quién? ¿Un jefe aprueba solo a su equipo directo? ¿Y si el jefe está de vacaciones? | Define a quién le llega cada pedido. | |
| 23 | **Cálculo de días**: regla exacta (antigüedad, ingreso en el año, días corridos o hábiles, sábados, feriados dentro del período). | La app no va a deducirlo; un error afecta el pago. | |
| 24 | **Códigos**: ¿VACJOR y VACM son por tipo de pago (jornalizado / mensualizado)? ¿Qué cantidad lleva cada día (8 y 7 en el histórico)? ¿Depende de la persona o del horario? | Es lo que se genera para Delta. | |
| 25 | **Reglas del pedido**: anticipación mínima, máximo de personas del equipo a la vez, si se pueden partir en períodos, qué pasa si se cancela uno ya aprobado. | Sin esto los pedidos se aceptan sin control. | |

### Empresas y liquidación por grupo (2026-11)
| # | Duda | Por qué importa | Respuesta |
|---|---|---|---|
| 26 | **Empresas**: ¿4H es 4Commerce y 4H OC es 4Commerce órdenes de compra? (Lo supuse por los nombres que usaste.) | Si está al revés, se exportaría a la empresa equivocada. | |
| 27 | **Personas en las dos empresas** (administración): ¿tienen el mismo legajo en ambas, o uno distinto en cada una? ¿Las fichadas y las vacaciones se cargan en una sola empresa o en las dos? | La app identifica a la persona por legajo; si repite, hay que cargar cada novedad en la empresa correcta. | |
| 28 | **Operarios de 4H OC**: ¿ficha en el mismo reloj/`.txt`? ¿Sus novedades se importan en Delta de la empresa de órdenes de compra? | Hoy las fichadas no tienen empresa. | |
| 29 | **Quincenas**: operarios se liquidan por quincena y administración por mes. ¿Querés filtrar y exportar las novedades por quincena además de por mes? (La 1ª quincena de noviembre de operarios ya se liquidó en 4H.) | Evita exportar de nuevo lo ya liquidado. | |

## 8. Registro de cambios del diccionario
- 2026-11-27: primera versión (circuito, glosario, clasificación, reglas, pantallas, qué se guarda y 20 dudas pendientes). Novedades v1 publicada; las extras aprobadas quedaron afuera hasta resolver la duda 10.
- 2026-11-27: vacaciones: decisiones tomadas (cada empleado entra; aprueba jefe y luego RRHH; cálculo de días a definir con RRHH) y preguntas 21 a 25.
- 2026-11-27: vacaciones etapa 3a publicada en la rama (saldos y pedidos cargados por RRHH, control de integridad); los días los escribe RRHH hasta definir la regla de Tango.
- 2026-11-27: empresas (4H / 4H OC) en novedades, saldos y pedidos de vacaciones; la tabla de novedades cargadas pasó a llamarse `rrhh_novedades_carga` para no pisar la de las novedades importadas; filtro por mes (por defecto el actual). Preguntas 26 a 29.
