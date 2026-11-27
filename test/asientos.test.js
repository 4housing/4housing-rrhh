// Tests de los asientos de sueldos. Datos SINTÉTICOS (nombres y importes inventados). node --test test/asientos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../js/rrhh-asientos.js');

const LEG = A.leerLegajos([
  { 'Número': 1, 'Apellido y nombre': 'Alfa, Ana', 'Descripción de departamento': 'GERENCIA TECNICA', CUIL: 'NO-VA', 'Correo electrónico': 'no@va' },
  { 'Número': 2, 'Apellido y nombre': 'Beta, Beto', 'Descripción de departamento': 'GERENCIA COMPRAS Y LOGISTICA' },
  { 'Número': 3, 'Apellido y nombre': 'Gama, Gabi', 'Descripción de departamento': 'GERENCIA OPERACIONES' },
  { 'Número': 4, 'Apellido y nombre': 'Delta, Dani', 'Descripción de departamento': 'GERENCIA ADMIN Y FINANZAS' },
  { 'Número': 5, 'Apellido y nombre': 'Epsilon, Eli', 'Descripción de departamento': 'GERENCIA COMERCIAL' },
  { 'Número': 6, 'Apellido y nombre': 'Zeta, Zoe', 'Descripción de departamento': 'GERENCIA OPERACIONES' },
  { 'Número': 7, 'Apellido y nombre': 'Eta, Edu', 'Descripción de departamento': 'GERENCIA OPERACIONES' },
]);
const fila = (ap, no, nro, desc, importe) => ({ legajo: 99, apellidos: ap, nombre: no, nro, desc, importe });
const suma = (a, cuenta, lado) => a.renglones.filter(r => r.cuenta === cuenta).reduce((s, r) => s + (r[lado] || 0), 0);
const asi = (res, ini) => res.asientos.find(a => a.concepto.startsWith(ini));

test('porcentajes: 2 decimales y suman exactamente 100', () => {
  const p = A.porcentajes([2464000, 2464000, 10411000, 6914000, 3486000]);
  assert.equal(Math.round(p.reduce((s, x) => s + x, 0) * 100), 10000);
  assert.deepEqual(A.porcentajes([1, 1, 1]).map(x => Math.round(x * 100)), [3334, 3333, 3333]);
  assert.deepEqual(A.porcentajes([0, 0]), [0, 0]);
});

test('leerLegajos y leerResumen descartan C.U.I.L., teléfono y correo', () => {
  assert.deepEqual(Object.keys(LEG.get('alfa ana')).sort(), ['depto', 'legajo', 'nombre']);
  const r = A.leerResumen([{ Legajo: 1, Apellidos: 'Alfa', Nombre: 'Ana', 'C.U.I.L.': 'NO-VA', 'Nro. de concepto': 55000, 'Desc. de concepto': 'x', 'Importe liquidado': 10, 'Período liquidado': new Date(2026, 9, 1) }], 202610);
  assert.deepEqual(Object.keys(r[0]).sort(), ['apellidos', 'desc', 'importe', 'legajo', 'nombre', 'nro', 'periodo']);
  assert.equal(A.leerResumen([{ Legajo: 1, 'Nro. de concepto': 1, 'Importe liquidado': 1, 'Período liquidado': new Date(2026, 8, 1) }], 202610).length, 0);
});

test('pool = 55000 sin los individuales; sector por LEGAJOS; individual con OSDE; cochera y hogar al asiento del pool', () => {
  const filas = [
    fila('Alfa', 'Ana', 55000, 'Copart', 1000), fila('Beta', 'Beto', 55000, 'Copart', 2000), fila('Gama', 'Gabi', 55000, 'Copart', 300), fila('Delta', 'Dani', 55000, 'Copart', 500),
    fila('Epsilon', 'Eli', 55000, 'Copart', 700), fila('Epsilon', 'Eli', 55301, 'OSDE', 50), fila('Epsilon', 'Eli', 55300, 'Cochera', 20),
    fila('Delta', 'Dani', 55035, 'Hogar', -40), fila('Delta', 'Dani', 55302, 'Viáticos', 10),
  ];
  const cfg = { personas: { 'epsilon eli': { asiento: 'ind', sector: '06' } } };
  const res = A.generar({ filas, legajos: LEG, config: cfg, periodo: '202610', fecha: '2026-10-31' });
  const pool = asi(res, 'COMISION COPART ADM');
  assert.equal(suma(pool, '55000014', 'debe'), 3800);                    // 1000+2000+300+500, sin Epsilon
  assert.equal(suma(pool, '56000009', 'haber'), 40);                     // descuento hogar
  assert.equal(suma(pool, '52000002', 'debe'), 30);                      // cochera + viáticos
  const sueldos = res.asientos.length && pool.auxiliares.filter(x => x.tipoCod === '10');
  assert.deepEqual(sueldos.map(x => [x.cod, x.importe]), [['01', 300], ['04', 1000], ['05', 2000], ['07', 500]]);
  assert.equal(Math.round(sueldos.reduce((s, x) => s + x.pct, 0) * 100), 10000);
  const ind = asi(res, 'SUELDOS VENTAS');
  assert.equal(suma(ind, '56000001', 'debe'), 750);                      // copart + OSDE, sin cochera
  assert.equal(res.control.diferencia, 0);
  assert.equal(res.avisos.length, 0);
});

test('socios, diferencia de categoría y asientos balanceados', () => {
  const filas = [fila('Alfa', 'Ana', 55303, 'Socios', 1000), fila('Beta', 'Beto', 55303, 'Socios', 1000), fila('Gama', 'Gabi', 55012, 'Recat', 120), fila('Gama', 'Gabi', 55550, 'UOM', 45)];
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31' });
  assert.equal(suma(asi(res, 'SUELDOS 2026'), '56000001', 'debe'), 2000);
  assert.equal(asi(res, 'SUELDOS 2026').auxiliares.find(x => x.tipoCod === '10').cod, '08');
  assert.equal(suma(asi(res, 'Sueldos - Dif'), '56000001', 'debe'), 165);
  assert.equal(asi(res, 'Sueldos - Dif').auxiliares.find(x => x.tipoCod === '10').cod, '01');
  res.asientos.forEach(a => assert.equal(a.debe, a.haber));
  assert.equal(res.control.diferencia, 0);
});

test('comisión rental: cada importe al múltiplo de 500 consumiendo el redondeo de la persona', () => {
  const filas = [fila('Delta', 'Dani', 55050, 'Alq', 120300.40), fila('Delta', 'Dani', 55051, 'Srv', 45180.25), fila('Delta', 'Dani', 99999, 'Redondeo', 19.35)];
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202608', fecha: '2026-08-31' });
  const a = asi(res, 'COMISION VENTA');
  assert.equal(suma(a, '55000004', 'debe'), 120500);
  assert.equal(suma(a, '55000010', 'debe'), 45000);
  assert.equal(res.control.diferencia, 0);
  assert.equal(res.sinDestino.length, 0);
});

test('Neuquén: un asiento con todo lo de esas personas contra Remuneraciones a pagar; la gratificación final a Indemnizaciones', () => {
  const filas = [fila('Zeta', 'Zoe', 55011, 'Copar Neuquén', 700000.5), fila('Zeta', 'Zoe', 55013, 'Sábado', 50000.25), fila('Zeta', 'Zoe', 99999, 'Redondeo', 0.25),
    fila('Eta', 'Edu', 55011, 'Copar Neuquén', 900), fila('Eta', 'Edu', 55500, 'Grat. final', 500),
    fila('Gama', 'Gabi', 55998, 'Concepto sin regla', 120000)];        // concepto que todavía no tiene asiento
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202609', fecha: '2026-09-30' });
  const a = asi(res, 'COMISION COPART NEUQUEN');
  assert.equal(res.asientos.filter(x => x.concepto.includes('NEUQUEN')).length, 1);
  assert.equal(suma(a, '55000014', 'debe'), 750001 + 900);              // copar + sábado + redondeo cierran en 750.001 (Zoe) y 900 (Edu)
  assert.equal(suma(a, '56000008', 'debe'), 500);
  assert.equal(suma(a, '21400001', 'haber'), 750001 + 900 + 500);
  assert.ok(a.auxiliares.every(x => x.tipoCod !== '10' || x.cod === '20'));
  assert.equal(res.sinDestino.length, 1);                               // lo que no tiene regla queda a la vista
  assert.equal(res.sinDestino[0].importe, 120000);
  assert.equal(res.control.diferencia, 0);
});

test('redondeo acompaña a la línea con decimales (vacaciones) y no a la coparticipación redonda', () => {
  const filas = [fila('Delta', 'Dani', 55000, 'Copart', 500000), fila('Delta', 'Dani', 55200, 'Vacaciones', 80000.3), fila('Delta', 'Dani', 99999, 'Redondeo', 0.7)];
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202609', fecha: '2026-09-30' });
  const a = asi(res, 'COMISION COPART ADM');
  assert.equal(suma(a, '55000014', 'debe'), 500000);
  assert.equal(suma(a, '56000001', 'debe'), 80001);
  assert.equal(res.control.diferencia, 0);
});

test('Bono Montaje con proyecto y aviso si falta; Copart. Operarios repartida entre proyectos', () => {
  const filas = [fila('Gama', 'Gabi', 55025, 'Bono Montaje OPE', 321000.4), fila('Gama', 'Gabi', 99999, 'Redondeo', 0.6), fila('Zeta', 'Zoe', 55010, 'Copart Ope', 1000), fila('Eta', 'Edu', 55010, 'Copart Ope', 2000)];
  const copar = [{ codigo: 'PL0001', nombre: 'PL0001 ALFA', importe: 300 }, { codigo: 'IF0002', nombre: 'IF0002 BETA', importe: 100 }];
  const sin = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31', copar });
  assert.ok(sin.avisos.some(t => t.includes('Bono Montaje')));
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31', copar, bono: { proyecto: 'PL0030 VDP' } });
  const b = asi(res, 'BONOS MONTAJE PL0030 VDP');
  assert.equal(suma(b, '55000016', 'debe'), 321001);
  assert.deepEqual(b.auxiliares.filter(x => x.tipoCod === '03').map(x => [x.cod, x.desc]), [['PL0030', 'PL0030 VDP']]);
  const c = asi(res, 'COMISION COPART OPERARIOS');
  assert.equal(suma(c, '55000014', 'debe'), 3000);
  assert.deepEqual(c.auxiliares.filter(x => x.tipoCod === '03').map(x => [x.cod, x.importe, x.pct]), [['PL0001', 2250, 75], ['IF0002', 750, 25]]);
  assert.equal(res.control.diferencia, 0);
});

test('adelanto de coparticipación: préstamo en dólares a la cotización indicada; sin cotización queda sin destino', () => {
  const filas = [fila('Delta', 'Dani', 55041, 'Adelanto', -800000)];
  const cfg = { personas: { 'delta dani': { prestamo: '46' } } };
  const res = A.generar({ filas, legajos: LEG, config: cfg, periodo: '202608', fecha: '2026-08-31', cotizacion: 1450 });
  const a = asi(res, 'PRESTAMO DELTA');
  assert.equal(a.moneda, 'DOL'); assert.equal(a.cotizacion, 1450);
  assert.equal(suma(a, '11220002', 'haber'), 551.72);                    // 800.000 / 1.450
  assert.equal(suma(a, '11110071', 'debe'), 551.72);
  assert.equal(a.auxiliares[0].cod, '46'); assert.equal(a.auxiliares[0].importe, 800000);
  assert.equal(res.control.diferencia, 0);
  const sin = A.generar({ filas, legajos: LEG, config: cfg, periodo: '202608', fecha: '2026-08-31' });
  assert.equal(sin.asientos.length, 0); assert.equal(sin.sinDestino[0].motivo, 'Falta la cotización del dólar'); assert.equal(sin.control.diferencia, 0);
});

test('persona fuera de LEGAJOS: avisa y no inventa el sector; con sector a mano entra al reparto', () => {
  const filas = [fila('Nadie', 'Nico', 55000, 'Copart', 1500)];
  const sin = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31' });
  assert.ok(sin.avisos.some(t => t.includes('Nadie') && t.includes('LEGAJOS')));
  assert.equal(asi(sin, 'COMISION COPART ADM').auxiliares.find(x => x.tipoCod === '10').desc, 'SIN SECTOR');
  const con = A.generar({ filas, legajos: LEG, config: { personas: { 'nadie nico': { sector: '01' } } }, periodo: '202610', fecha: '2026-10-31' });
  assert.equal(asi(con, 'COMISION COPART ADM').auxiliares.find(x => x.tipoCod === '10').cod, '01');
});

test('hojas de salida y planilla COPAR', () => {
  const res = A.generar({ filas: [fila('Alfa', 'Ana', 55303, 'Socios', 1000)], legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31' });
  const h = A.hojas(res, { fecha: '2026-10-31' });
  assert.deepEqual(Object.keys(h), ['Asientos contables', 'Renglones', 'Cotizaciones', 'Auxiliares a cargar', 'Sábados y extras por día', 'Sin destino', 'Control']);
  assert.equal(h['Renglones'].length, 3);
  const aoa = [['PROYECTO', 'CONCEPTO', 'F. INICIO', 'TOTAL', new Date(2026, 8, 30), new Date(2026, 9, 31)],
    ['PL0001 ALFA', 'Contrato', null, 10, 40, 100], ['PL0001 ALFA - DESC.', 'Rev', null, 0, null, -10], ['IF0002 BETA', 'x', null, 5, null, 50], ['-', '-', null, 0, null, null]];
  assert.deepEqual(A.leerCopar(aoa, [202610]).proyectos, [{ codigo: 'PL0001', nombre: 'PL0001 ALFA', importe: 90 }, { codigo: 'IF0002', nombre: 'IF0002 BETA', importe: 50 }]);
  assert.equal(A.leerCopar(aoa, [202609, 202610]).proyectos[0].importe, 130);
});

test('el redondeo de una persona con un concepto sin destino con decimales queda junto a ese concepto (no engorda la coparticipación)', () => {
  const filas = [fila('Delta', 'Dani', 55000, 'Copart', 800000), fila('Delta', 'Dani', 55998, 'Concepto sin regla', 300000.37), fila('Delta', 'Dani', 99999, 'Redondeo', 0.63)];
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31' });
  assert.equal(suma(asi(res, 'COMISION COPART ADM'), '55000014', 'debe'), 800000);
  assert.deepEqual(res.sinDestino.map(x => x.concepto).sort(), ['Concepto sin regla', 'Redondeo']);
  assert.equal(res.control.diferencia, 0);
});

test('sábados, horas extra y feriados: un asiento al proyecto indicado con el motivo; los de Neuquén siguen en el asiento de Neuquén', () => {
  const filas = [fila('Gama', 'Gabi', 55013, 'Sábado Taller', 100000.4), fila('Gama', 'Gabi', 55014, 'Hs extra 50%', 20000.2), fila('Gama', 'Gabi', 99999, 'Redondeo', 0.4),
    fila('Delta', 'Dani', 55030, 'Feriado', 30000), fila('Zeta', 'Zoe', 55011, 'Copar Neuquén', 1000), fila('Zeta', 'Zoe', 55013, 'Sábado', 500)];
  const sin = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31' });
  assert.ok(sin.avisos.some(t => t.includes('falta indicar el proyecto')) && sin.avisos.some(t => t.includes('falta el motivo')));
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31', sabados: { proyecto: 'IF0001 PROYECTO UNO', motivo: 'Entrega adelantada' } });
  const a = asi(res, 'SABADOS, HS EXTRA Y FERIADOS IF0001 PROYECTO UNO');
  assert.equal(suma(a, '56000001', 'debe'), 100000.4 + 20000.2 + 0.4 + 30000);
  assert.equal(a.observaciones, 'Entrega adelantada');
  assert.ok(a.renglones[0].leyenda.startsWith('Entrega adelantada'));
  const ax = t => a.auxiliares.filter(x => x.tipoCod === t).map(x => [x.cod, x.desc, x.pct]);
  assert.deepEqual(ax('02'), [['02', 'A) CMV VENTA', 100]]);
  assert.deepEqual(ax('03'), [['IF0001', 'IF0001 PROYECTO UNO', 100]]);
  assert.deepEqual(ax('10'), [['10', 'NO APLICA', 100]]);
  assert.equal(suma(asi(res, 'COMISION COPART NEUQUEN'), '55000014', 'debe'), 1500);
  assert.equal(res.sinDestino.length, 0); assert.equal(res.control.diferencia, 0);
});

const CSV = '\uFEFF"Legajo";"Empleado";"Periodo";"Fecha";"Dia";"Ubicación";"Proyecto";"Lote";"Posventa/Montaje";"Modulo";"TAREAS";"Desc Tarea";"Otros";"Trámite";"Ausente";"Control (no pegar)"\r\n'
  + '"3";"Gabi Gama";"202610";"2026-10-03";"sábado";"Huella 610";"9001 PROYECTO UNO";"";"Producción ";"";"Tareas de Herrería";"x · y (8h)";"";"";"";""\r\n'
  + '"3";"Gabi Gama";"202610";"2026-10-10";"sábado";"Huella 610";"PL0002 PROYECTO DOS";"";"Producción ";"";"Ensamble de modulos";"x";"";"";"";""\r\n'
  + '"3";"Gabi Gama";"202610";"2026-10-12";"lunes";"Huella 610";"9001 PROYECTO UNO";"";"Producción ";"";"Tareas de Herrería";"x";"";"";"";""\r\n'
  + '"7";"Edu Eta";"202610";"2026-10-03";"sábado";"N/A";"Ausente";"";"Licencia";"";"Vacaciones";"Vacaciones";"";"";"";""\r\n'
  + '"6";"Zoe Zeta";"202610";"2026-10-03";"sábado";"";"";"";"";"";"";"";"";"";"";""\r\n'
  + '"5";"Eli Epsilon";"202610";"2026-10-17";"sábado";"Huella 610";"Mantenimiento";"";"Mantenimiento";"";"Mantenimiento";"x";"";"";"";""\r\n'
  + '"4";"Dani Delta";"202610";"2026-10-24";"sábado";"Huella 610";"9001 PROYECTO UNO";"";"Producción ";"";"Tareas de Herrería";"x";"";"";"";""\r\n';

test('leerDatos: CSV del informe de planificación (BOM, comillas, «;») y también columnas pegadas con tabulación', () => {
  const r = A.leerDatos(CSV);
  assert.equal(r.length, 7);
  assert.deepEqual(r[0], { legajo: '3', fecha: '2026-10-03', dia: 'sabado', proyecto: '9001 PROYECTO UNO', tarea: 'Tareas de Herrería', desc: 'x · y (8h)' });
  const tsv = '3\tGabi Gama\t202610\t2026-10-03\tsábado\tHuella 610\t9001 PROYECTO UNO\t\tProducción \t\tTareas de Herrería\tdesc\t\t\t';
  assert.equal(A.leerDatos(tsv)[0].proyecto, '9001 PROYECTO UNO');
  assert.deepEqual(A.leerDatos(''), []);
});

test('Sábado Taller se justifica con el informe de planificación: partes iguales entre los sábados con proyecto; el resto al proyecto indicado', () => {
  const filas = [fila('Gama', 'Gabi', 55013, 'Sábado Taller', 1000), fila('Gama', 'Gabi', 55014, 'Hs extra 50%', 300),
    fila('Eta', 'Edu', 55013, 'Sábado Taller', 400)];                     // Edu: solo ausente en la planificación → va al proyecto indicado
  filas.forEach(f => { f.legajo = f.nombre === 'Gabi' ? 3 : 7; });
  const datos = A.leerDatos(CSV);
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31', datos, sabados: { proyecto: 'IF0007 BASE', motivo: 'Cierre de obra' } });
  const a = asi(res, 'SABADOS, HS EXTRA Y FERIADOS VARIOS PROYECTOS');
  assert.equal(suma(a, '56000001', 'debe'), 1700);
  const inst = a.auxiliares.filter(x => x.tipoCod === '03').map(x => [x.cod, x.desc, x.importe]);
  assert.deepEqual(inst, [['IF9001', 'IF9001 PROYECTO UNO', 500], ['PL0002', 'PL0002 PROYECTO DOS', 500], ['IF0007', 'IF0007 BASE', 700]]);   // 9001 → IF9001 (supuesto)
  assert.equal(Math.round(a.auxiliares.filter(x => x.tipoCod === '03').reduce((s, x) => s + x.pct, 0) * 100), 10000);
  assert.deepEqual(res.sabados.slice(0, 2).map(x => [x.fecha, x.proyecto, x.importe]), [['2026-10-03', '9001 PROYECTO UNO', 500], ['2026-10-10', 'PL0002 PROYECTO DOS', 500]]);
  assert.ok(res.avisos.some(t => t.includes('9001 PROYECTO UNO') && t.includes('IF9001 PROYECTO UNO')));
  assert.ok(res.avisos.some(t => t.includes('Edu') || t.includes('Eta')));            // sin sábado planificado con proyecto
  assert.ok(res.avisos.some(t => t.includes('SIN «Sábado Taller»') && t.includes('4 (1)') && !t.includes('5 (1)')));   // Dani sí; Eli (solo Mantenimiento) y Edu (ausente) no cuentan
  assert.equal(res.control.diferencia, 0);
  assert.deepEqual(res.proyectosPlan, ['9001 PROYECTO UNO', 'PL0002 PROYECTO DOS']);
});

test('equivalencia de proyecto configurada: manda sobre el prefijo supuesto', () => {
  const filas = [fila('Gama', 'Gabi', 55013, 'Sábado Taller', 1000)]; filas[0].legajo = 3;
  const res = A.generar({ filas, legajos: LEG, config: { proyectos: { '9001 PROYECTO UNO': { cod: 'XX9001', desc: 'XX9001 UNO' }, 'PL0002 PROYECTO DOS': { cod: 'PL0002', desc: 'PL0002 DOS' } } },
    periodo: '202610', fecha: '2026-10-31', datos: A.leerDatos(CSV), sabados: { proyecto: 'IF0007 BASE', motivo: 'm' } });
  const a = asi(res, 'SABADOS');
  assert.deepEqual(a.auxiliares.filter(x => x.tipoCod === '03').map(x => [x.cod, x.desc]), [['XX9001', 'XX9001 UNO'], ['PL0002', 'PL0002 DOS']]);
  assert.ok(!res.avisos.some(t => t.includes('se supone el prefijo')));
});

test('leerNovedades: solo fecha, legajo, código y cantidad (nunca C.U.I.L. ni nombre)', () => {
  const r = A.leerNovedades([{ Fecha: new Date(2026, 9, 24), 'C.U.I.L.': 'NO-VA', Legajo: 3, 'Apellido y nombre': 'No Va', 'Cód. novedad': 'hrsex1', Cantidad: 1.5 }, { Fecha: 'x', Legajo: 3, 'Cód. novedad': 'SABADO' }]);
  assert.deepEqual(r, [{ fecha: '2026-10-24', legajo: '3', cod: 'HRSEX1', cantidad: 1.5 }]);
});

test('días pagados por novedades: SABADO en partes iguales por día, HRSEX1 proporcional a las horas; el proyecto de cada día sale de la planificación', () => {
  const CSV2 = '\uFEFF"Legajo";"Empleado";"Periodo";"Fecha";"Dia";"Ubicación";"Proyecto";"Lote";"Posventa/Montaje";"Modulo";"TAREAS";"Desc Tarea"\r\n'
    + '"3";"G";"202610";"2026-10-24";"sábado";"H";"9001 PROYECTO UNO";"";"P";"";"Herrería";"d"\r\n'
    + '"3";"G";"202610";"2026-10-31";"sábado";"H";"PL0002 PROYECTO DOS";"";"P";"";"Ensamble";"d"\r\n'
    + '"3";"G";"202610";"2026-10-14";"miércoles";"H";"9001 PROYECTO UNO";"";"P";"";"Herrería";"d"\r\n';
  const filas = [fila('Gama', 'Gabi', 55013, 'Sábado Taller', 1000), fila('Gama', 'Gabi', 55014, 'Hs extra', 300), fila('Gama', 'Gabi', 99999, 'Redondeo', 0.5)];
  filas.forEach(f => { f.legajo = 3; });
  filas[0].importe = 999.5;
  const nov = A.leerNovedades([
    { Fecha: new Date(2026, 9, 24), Legajo: 3, 'Cód. novedad': 'SABADO', Cantidad: 1 }, { Fecha: new Date(2026, 9, 31), Legajo: 3, 'Cód. novedad': 'SABADO', Cantidad: 1 },
    { Fecha: new Date(2026, 9, 14), Legajo: 3, 'Cód. novedad': 'HRSEX1', Cantidad: 1.5 }, { Fecha: new Date(2026, 9, 24), Legajo: 3, 'Cód. novedad': 'HRSEX1', Cantidad: 4.5 }]);
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31', datos: A.leerDatos(CSV2), novedades: nov, sabados: { proyecto: 'IF0007 BASE', motivo: 'm' } });
  const a = asi(res, 'SABADOS, HS EXTRA Y FERIADOS VARIOS PROYECTOS');
  assert.equal(suma(a, '56000001', 'debe'), 1300);                       // 1000 (999,5 + redondeo 0,5) + 300
  const det = res.sabados.map(x => [x.concepto, x.fecha, x.proyecto, x.importe]);
  assert.deepEqual(det, [['Sábado Taller', '2026-10-24', '9001 PROYECTO UNO', 500], ['Sábado Taller', '2026-10-31', 'PL0002 PROYECTO DOS', 500],
    ['Horas extra / feriado', '2026-10-14', '9001 PROYECTO UNO', 75], ['Horas extra / feriado', '2026-10-24', '9001 PROYECTO UNO', 225]]);
  const inst = a.auxiliares.filter(x => x.tipoCod === '03').map(x => [x.cod, x.importe]);
  assert.deepEqual(inst, [['IF9001', 800], ['PL0002', 500]]);
  assert.equal(res.control.diferencia, 0);
});

test('con novedades: sin novedad de la persona, o día sin proyecto en la planificación → avisa y va al proyecto indicado', () => {
  const filas = [fila('Gama', 'Gabi', 55013, 'Sábado Taller', 600), fila('Eta', 'Edu', 55013, 'Sábado Taller', 200), fila('Eta', 'Edu', 55014, 'Hs extra', 100)];
  filas[0].legajo = 3; filas[1].legajo = 7; filas[2].legajo = 7;
  const nov = A.leerNovedades([{ Fecha: new Date(2026, 9, 3), Legajo: 3, 'Cód. novedad': 'SABADO', Cantidad: 1 }, { Fecha: new Date(2026, 9, 10), Legajo: 7, 'Cód. novedad': 'SABADO', Cantidad: 1 }]);
  const res = A.generar({ filas, legajos: LEG, config: {}, periodo: '202610', fecha: '2026-10-31', datos: A.leerDatos(CSV), novedades: nov, sabados: { proyecto: 'IF0007 BASE', motivo: 'm' } });
  assert.ok(res.avisos.some(t => t.includes('2026-10-10') && t.includes('no figura con proyecto')));     // Edu: día pagado sin proyecto en la planificación
  assert.ok(res.avisos.some(t => t.includes('HRSEX1')));                                              // Edu: horas extra pagadas sin novedad HRSEX1
  const porProy = Object.fromEntries(res.sabados.map(x => [x.proyecto + '|' + x.concepto, x.importe]));
  assert.equal(porProy['9001 PROYECTO UNO|Sábado Taller'], 600);
  assert.equal(porProy['IF0007 BASE|Sábado Taller'], 200);
  assert.equal(porProy['IF0007 BASE|Horas extra / feriado'], 100);
  assert.equal(res.control.diferencia, 0);
});
