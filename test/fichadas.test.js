// Tests de fichadas y parte diario. Horario y datos SINTÉTICOS (inventados). node --test test/fichadas.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/rrhh-fichadas.js');

const sem = [{ desde: '08:00', hasta: '17:00', tolDesde: 15, tolHasta: 15, tipo: 'NORMAL 1' }, { desde: '17:00', hasta: '22:00', tolDesde: 15, tolHasta: 15, tipo: 'EXTRA 50%' }];
const HOR = { dias: { 1: sem, 2: sem, 3: sem, 4: sem, 5: sem,
  6: [{ desde: '08:00', hasta: '13:00', tolDesde: 15, tolHasta: 0, tipo: 'EXTRA 50%' }, { desde: '13:00', hasta: '22:00', tolDesde: 0, tolHasta: 10, tipo: 'EXTRA 100%' }],
  0: [{ desde: '08:00', hasta: '17:00', tolDesde: 15, tolHasta: 15, tipo: 'EXTRA 100%' }] },
  feriados: { 1: [{ desde: '07:00', hasta: '14:00', tolDesde: 15, tolHasta: 15, tipo: 'EXTRA 100%' }] },
  descanso: { desde: '12:00', minutos: 60 } };
const dia = (fecha, horas, extra) => F.calcularDia({ fecha, horas, horario: HOR, unidad: 30, ...(extra || {}) });
const LUN = '2026-03-02', SAB = '2026-03-07', DOM = '2026-03-08';        // 2026-03-02 es lunes

test('leerTxt y armarTxt: formato de 42 caracteres, ordenado, sin salto de línea final', () => {
  const txt = ['0203202607050001                ABC       ', '0203202616250002                ABC       ', '0103202608000001                ABC       '].join('\n');
  const r = F.leerTxt(txt);
  assert.equal(r.fichadas.length, 3); assert.equal(r.errores.length, 0);
  assert.deepEqual(r.fichadas[0], { fecha: '2026-03-02', hora: '07:05', codigo: '0001', legajo: 1, reloj: 'ABC' });
  const salida = F.armarTxt(r.fichadas);
  assert.equal(salida.split('\n')[0], '0103202608000001                ABC       ');   // la del 01/03 va primero
  assert.ok(salida.split('\n').every(l => l.length === 42)); assert.ok(!salida.endsWith('\n'));
  assert.equal(F.armarTxt(F.leerTxt(salida).fichadas), salida);
  assert.equal(F.codigoFichador(102), '0102'); assert.equal(F.codigoFichador(1000), '1000');
});

test('leerTxt marca las líneas inválidas sin cortar la lectura', () => {
  const r = F.leerTxt('basura\n3102202607050001                ABC       \n0203202607050001                ABC       \n\n');
  assert.equal(r.fichadas.length, 1); assert.equal(r.errores.length, 2);
  assert.deepEqual(r.errores.map(e => e.linea), [1, 2]);
});

test('día hábil: llegar antes no es extra (queda fuera de horario) y el día completo se paga con tolerancia', () => {
  const a = dia(LUN, ['07:23', '17:00']);
  assert.deepEqual(a.pagado, { 'NORMAL 1': 480 }); assert.equal(a.sinHoraMin, 37); assert.equal(a.esperadoMin, 480);
  assert.deepEqual(dia(LUN, ['08:12', '16:50']).pagado, { 'NORMAL 1': 480 });        // dentro de la tolerancia de entrada y de salida
  assert.ok(!dia(LUN, ['07:23', '17:00']).marcas.includes('extra'));
});

test('extras después del horario: se redondea a 30 minutos (la mitad hacia arriba)', () => {
  const ex = h => dia(LUN, ['08:00', h]).pagado['EXTRA 50%'] || 0;
  assert.equal(ex('17:14'), 0); assert.equal(ex('17:15'), 30); assert.equal(ex('17:44'), 30); assert.equal(ex('17:45'), 60);
  assert.equal(ex('18:16'), 90); assert.equal(ex('18:46'), 120); assert.equal(ex('19:18'), 150);
  assert.ok(dia(LUN, ['08:00', '17:20']).marcas.includes('extra'));
});

test('unidad 1: minutos exactos, sin mínimo', () => {
  const ex = h => F.calcularDia({ fecha: LUN, horas: ['08:00', h], horario: HOR, unidad: 1 }).pagado['EXTRA 50%'] || 0;
  assert.equal(ex('17:17'), 17); assert.equal(ex('17:01'), 1); assert.equal(ex('18:01'), 61);
});

test('llegada tarde grande: se paga lo trabajado menos el descanso, en bloques de 30; propone perdonarla', () => {
  const a = dia(LUN, ['10:59', '17:00']);
  assert.equal(a.pagado['NORMAL 1'], 300);                     // 361 − 60 de descanso = 301 → 300
  assert.ok(a.marcas.includes('tarde')); assert.deepEqual(a.sugerencias[0], { accion: 'reemplazar', de: '10:59', hora: '08:00', motivo: 'Llegada tarde perdonada' });
  assert.equal(dia(LUN, ['12:30', '17:00']).pagado['NORMAL 1'], 240);   // entra a mitad del descanso: solo se descuentan 30
});

test('una sola fichada: queda a revisar, no se paga y propone completarla con el borde del horario', () => {
  const m = dia(LUN, ['07:50']), t = dia(LUN, ['17:25']);
  assert.ok(m.marcas.includes('fichada_unica')); assert.deepEqual(m.pagado, {}); assert.deepEqual(m.sugerencias, [{ accion: 'agregar', hora: '17:00', motivo: 'Falta la salida' }]);
  assert.deepEqual(t.sugerencias, [{ accion: 'agregar', hora: '08:00', motivo: 'Falta la entrada' }]);
  const h2 = { ...HOR, salidaSugerida: '17:30' };
  assert.equal(F.calcularDia({ fecha: LUN, horas: ['07:50'], horario: h2 }).sugerencias[0].hora, '17:30');
});

test('sábado: tramo al 50 % completo con tolerancia de inicio y tramo al 100 % redondeado a 30', () => {
  assert.deepEqual(dia(SAB, ['07:05', '16:10']).pagado, { 'EXTRA 50%': 300, 'EXTRA 100%': 180 });   // 190 → 180
  assert.deepEqual(dia(SAB, ['08:10', '14:06']).pagado, { 'EXTRA 50%': 300, 'EXTRA 100%': 60 });    // llegó dentro de la tolerancia: cuenta desde las 08:00; 66 → 60
  assert.deepEqual(dia(SAB, ['07:30', '14:20']).pagado, { 'EXTRA 50%': 300, 'EXTRA 100%': 90 });    // 80 → 90
  assert.ok(dia(SAB, ['08:00', '13:00']).marcas.includes('fin_de_semana') || dia(SAB, ['08:00', '14:00']).marcas.includes('extra'));
  assert.deepEqual(dia(DOM, ['08:00', '12:00']).pagado, { 'EXTRA 100%': 240 });
});

test('feriado trabajado: se calcula con el horario de feriados pero queda marcado para revisar', () => {
  const a = dia(LUN, ['06:56', '14:27'], { feriado: true });
  assert.ok(a.marcas.includes('feriado') && a.marcas.includes('revisar_feriado'));
  assert.equal(a.esperadoMin, 0);
  assert.equal(a.pagado['EXTRA 100%'], 420);                   // 07:00–14:00
});

test('persona sin horario: se marca y no se calcula', () => {
  const a = F.calcularDia({ fecha: LUN, horas: ['08:00', '17:00'], horario: null });
  assert.ok(a.marcas.includes('sin_horario')); assert.deepEqual(a.pagado, {});
});

test('armarPartes: ausentes de días hábiles, sin parte en fin de semana ni feriado, y unidad por legajo', () => {
  const fich = [{ legajo: 1, fecha: '2026-03-02', hora: '08:00' }, { legajo: 1, fecha: '2026-03-02', hora: '17:20' },
    { legajo: 2, fecha: '2026-03-02', hora: '08:00' }, { legajo: 2, fecha: '2026-03-02', hora: '17:20' }, { legajo: 1, fecha: '2026-03-03', hora: '08:00' }, { legajo: 1, fecha: '2026-03-03', hora: '17:00' }];
  const legajos = new Map([[1, { horario: 'H', unidad: 30 }], [2, { horario: 'H', unidad: 1 }], [3, { horario: 'H', unidad: 30 }], [4, { horario: 'H', habilitado: false }]]);
  const p = F.armarPartes({ fichadas: fich, legajos, horarios: new Map([['H', HOR]]), feriados: new Set(['2026-03-05']), desde: '2026-03-02', hasta: '2026-03-08' });
  const k = (l, f) => p.find(x => x.legajo === l && x.fecha === f);
  assert.equal(k(1, '2026-03-02').pagado['EXTRA 50%'], 30); assert.equal(k(2, '2026-03-02').pagado['EXTRA 50%'], 20);
  assert.ok(k(3, '2026-03-02').marcas.includes('ausente') && k(3, '2026-03-06').marcas.includes('ausente'));
  assert.equal(k(3, '2026-03-05'), undefined);                  // feriado
  assert.equal(k(3, '2026-03-07'), undefined);                  // sábado sin fichadas
  assert.equal(p.filter(x => x.legajo === 4).length, 0);        // no habilitado
  assert.deepEqual(p.map(x => x.fecha), p.map(x => x.fecha).slice().sort());
  const orden = F.armarPartes({ fichadas: [{ legajo: 1, fecha: '2026-03-02', hora: '17:00' }, { legajo: 1, fecha: '2026-03-02', hora: '08:00' }], legajos: new Map([[1, { horario: 'H' }]]), horarios: new Map([['H', HOR]]), desde: '2026-03-02', hasta: '2026-03-02' });
  assert.deepEqual(orden[0].horas, ['08:00', '17:00']);                     // las fichadas se muestran ordenadas por hora
});

test('clasificar: solo pide decisión lo que falta o es llamativo; la ausencia con novedad ya está resuelta', () => {
  const parte = (horas, extra) => ({ ...F.calcularDia({ fecha: LUN, horas, horario: HOR, unidad: 30, ...(extra || {}) }) });
  assert.equal(F.clasificar(parte(['07:40', '17:00'])).clase, 'ok');                 // llegar antes no se mira
  assert.equal(F.clasificar(parte(['08:00', '17:40'])).clase, 'extra');              // solo extra para aprobar
  assert.equal(F.clasificar(parte(['08:00'])).clase, 'revisar');                     // fichada única
  assert.equal(F.clasificar(parte(['08:40', '17:00'])).clase, 'revisar');            // llegó tarde
  assert.equal(F.clasificar(parte(['08:00', '17:40'], { feriado: true })).clase, 'revisar');
  const aus = parte([]);
  assert.equal(F.clasificar(aus).clase, 'revisar');
  const j = F.clasificar(aus, ['HSTRA', 'HSENF']);
  assert.deepEqual(j, { clase: 'ok', justificacion: 'Enfermedad' });                 // ausente con novedad de enfermedad
  assert.equal(F.clasificar(aus, ['HSTRA']).clase, 'revisar');                       // una novedad que no justifica no la resuelve
});

test('resumenPersonas: totales por persona, extras aprobadas vs por aprobar y lo llamativo', () => {
  const mk = (legajo, fecha, pagado, marcas, extra) => ({ legajo, horario: 'H', fecha, n: 2, pagado, marcas, ...extra });
  const partes = [
    mk(1, '2026-03-02', { 'NORMAL 1': 480, 'EXTRA 50%': 300 }, ['extra'], { clase: 'extra', revisado: false }),
    mk(1, '2026-03-03', { 'NORMAL 1': 480, 'EXTRA 50%': 240 }, ['extra'], { clase: 'extra', revisado: true, aprob50: 180 }),
    mk(1, '2026-03-04', { 'NORMAL 1': 480 }, ['tarde'], { clase: 'revisar', revisado: false }),
    mk(2, '2026-03-02', {}, ['ausente'], { n: 0, clase: 'revisar', revisado: false }),
    mk(2, '2026-03-03', {}, ['ausente'], { n: 0, clase: 'ok', justificacion: 'Enfermedad', revisado: false })];
  const r = F.resumenPersonas(partes, { extrasAltasMin: 480 }), a = r[0], b = r[1];
  assert.deepEqual(F.resumenPersonas(partes)[0].llamativo, []);                          // por defecto el límite es 30 h: 9 h de extras no es llamativo
  assert.deepEqual([a.dias, a.normalMin, a.extra50Min, a.aprob50Min, a.extraPorAprobar, a.porRevisar], [3, 1440, 540, 180, 1, 1]);
  assert.deepEqual(a.llamativo, ['Extras altas']);                                   // 540 min > 480
  assert.deepEqual([b.dias, b.ausentesSinAviso, b.justificados], [0, 1, 1]);
  assert.deepEqual(b.llamativo, ['Ausente sin aviso']);
});

test('describirCambios: dice qué se modificó, qué había antes, por quién y cuándo; sin cambios no marca nada', () => {
  const dia = [{ hora: '16:25', origen: 'tango', anulada: false }, { hora: '07:30', origen: 'manual', anulada: false, motivo: 'Falta la entrada', creado_por: 'u1', creado_en: '2026-11-28T10:32:00Z' }];
  const antes = F.calcularDia({ fecha: LUN, horas: ['16:25'], horario: HOR }), ahora = F.calcularDia({ fecha: LUN, horas: ['07:30', '16:25'], horario: HOR });
  const r = F.describirCambios({ fichadasDia: dia, antes, ahora, quien: u => ({ u1: 'Ana' }[u]), cuando: t => 'hace un rato' });
  assert.equal(r.modificado, true);
  assert.equal(r.lineas[0], 'Fichadas — antes: 16:25 → ahora: 07:30 · 16:25');
  assert.ok(r.lineas.includes('+ 07:30 agregada por RRHH (Falta la entrada) — Ana, hace un rato'));
  assert.ok(r.lineas.includes('Normal: 0,00 h → 7,00 h'));                 // sale 35 min antes del horario: se paga lo trabajado
  // fichada de Tango anulada
  const d2 = [{ hora: '09:08', origen: 'tango', anulada: true, motivo: 'Llegada tarde perdonada', anulada_por: 'u1', anulada_en: 'x' }, { hora: '08:00', origen: 'manual', anulada: false, motivo: 'Llegada tarde perdonada' }, { hora: '17:00', origen: 'tango', anulada: false }];
  const r2 = F.describirCambios({ fichadasDia: d2, antes: { horas: ['09:08', '17:00'], pagado: {} }, ahora: { horas: ['08:00', '17:00'], pagado: {} } });
  assert.ok(r2.lineas.some(l => l.startsWith('− 09:08 anulada (Llegada tarde perdonada)')));
  // extra aprobada distinta de la calculada
  const r3 = F.describirCambios({ fichadasDia: [], antes: { horas: [], pagado: {} }, ahora: { horas: ['08:00', '19:00'], pagado: { 'EXTRA 50%': 120 } }, aprobacion: { extra50_aprobada_min: 90, extra100_aprobada_min: null } });
  assert.deepEqual(r3.lineas, ['Extra 50 % aprobada: calculada 2,00 h → aprobada 1,50 h']);
  // sin cambios: lo calculado y aprobado coinciden, solo fichadas de Tango
  const r4 = F.describirCambios({ fichadasDia: [{ hora: '08:00', origen: 'tango', anulada: false }], antes: { horas: ['08:00'], pagado: {} }, ahora: { horas: ['08:00'], pagado: { 'EXTRA 50%': 60 } }, aprobacion: { extra50_aprobada_min: 60 } });
  assert.deepEqual(r4, { modificado: false, lineas: [] });
  // una fichada agregada y luego anulada no cuenta como cambio
  assert.equal(F.describirCambios({ fichadasDia: [{ hora: '07:00', origen: 'manual', anulada: true }], antes: { horas: [], pagado: {} }, ahora: { horas: [], pagado: {} } }).modificado, false);
});

test('celdaCalendario: horas en verde, extras en azul chico, menos horas en rojo, ausencias por tipo', () => {
  const c = (p, extra) => F.celdaCalendario({ pagado: {}, marcas: [], n: 2, esperadoMin: 480, ...p, ...(extra || {}) });
  assert.deepEqual(c({ pagado: { 'NORMAL 1': 480 } }), { texto: '8', clase: 'ok', extras: '', menos: '' });
  assert.deepEqual(c({ pagado: { 'NORMAL 1': 480, 'EXTRA 50%': 90 } }), { texto: '8', clase: 'ok', extras: '+1,5 h 50 %', menos: '' });
  assert.equal(c({ pagado: { 'NORMAL 1': 480, 'EXTRA 50%': 60, 'EXTRA 100%': 120 } }).extras, '+1 h 50 % · +2 h 100 %');
  assert.deepEqual(c({ pagado: { 'NORMAL 1': 420 } }), { texto: '7', clase: 'ok', extras: '', menos: '−1 h' });                  // trabajó una hora menos
  assert.equal(c({ pagado: { 'NORMAL 1': 210 } }).menos, '−4,5 h');
  assert.equal(c({ pagado: { 'NORMAL 1': 480, 'EXTRA 50%': 17 } }).extras, '+17 min 50 %');                                    // minutos exactos (unidad 1)
  assert.equal(c({ pagado: { 'NORMAL 1': 412 } }).menos, '−1 h 8 min'); assert.equal(c({ pagado: { 'NORMAL 1': 452 } }).menos, '−28 min');
  assert.deepEqual(c({ pagado: { 'NORMAL 1': 300 }, esperadoMin: 300 }).menos, '');                                              // jornada parcial completa
  const aus = ex => c({ marcas: ['ausente'], n: 0, ...ex });
  assert.deepEqual([aus({ codigos: ['VACM'] }).texto, aus({ codigos: ['VACM'] }).clase], ['Vac.', 'vac']);
  assert.deepEqual([aus({ codigos: ['HSENF'], justificacion: 'Enfermedad' }).texto, aus({ codigos: ['HSENF'] }).clase], ['Enf.', 'justificada']);
  assert.equal(aus({ codigos: ['LICART'], justificacion: 'Licencia por ART' }).texto, 'ART');
  assert.deepEqual([aus({ codigos: ['HSJUS'], justificacion: 'Horas justificadas' }).texto, aus({ codigos: ['HSJUS'], justificacion: 'x' }).clase], ['Aus J.', 'justificada']);
  assert.deepEqual([aus({}).texto, aus({}).clase], ['Aus. Inj.', 'injustificada']);                                               // sin novedad = sin aviso
  assert.equal(aus({ codigos: ['HSINJ'], justificacion: 'Ausencia injustificada (ya cargada)' }).texto, 'Aus. Inj.');
  assert.deepEqual([c({ marcas: ['fichada_unica'], n: 1 }).texto, c({ n: 1 }).clase], ['?', 'unica']);
  const sab = c({ pagado: { 'EXTRA 50%': 300, 'EXTRA 100%': 90 }, esperadoMin: 0 });                                             // sábado trabajado: sin horas normales, solo extras
  assert.deepEqual([sab.texto, sab.clase, sab.extras, sab.menos], ['', 'ok', '+5 h 50 % · +1,5 h 100 %', '']);
  assert.deepEqual([c({ marcas: ['feriado'], pagado: { 'EXTRA 100%': 420 }, esperadoMin: 0 }).texto, c({ marcas: ['feriado'], pagado: { 'EXTRA 100%': 420 }, esperadoMin: 0 }).clase], ['Fer.', 'fer']);
});
