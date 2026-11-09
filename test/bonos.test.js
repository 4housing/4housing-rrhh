// Tests del libro de bonos. Datos SINTÉTICOS (inventados). node --test test/bonos.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../js/rrhh-bonos.js');

const PROYECTOS = [['Num Bono', 'PROYECTO', 'VENTA', 'BONOS', null, 'Caja GP', 'Diferencias', null, 'Planilla Cerrada'],
  [1, 'PL0001 ALFA - 1', 'PL0001 ALFA', 300, null, 250, 50, null, 300],
  [2, 'PL0001 ALFA - Post Venta', 'PL0001 ALFA', 70, null, 70, 0, null, 70],
  [3, 'SABADO 20260101', 'SABADO 20260101', 10, null, 0, 0, null, 10],
  [null, null, null, 380]];
const PERSONAL = [['Legajo', 'Empleado', 'PL0001 ALFA - 1', 'PL0001 ALFA - Post Venta', 'SABADO 20260101', null, 'Total'],
  [null, null, '202504/202505', 202506, 'xx606'],
  [7, 'Nombre Inventado', 200, 0, 10],
  [8, 'Otro Inventado', 100, 70, 0],
  [null, null, null]];

test('lee bonos y personas; los renglones de totales y los importes en cero no entran', () => {
  const r = B.parseLibro({ PROYECTOS, PERSONAL });
  assert.equal(r.errores.length, 0);
  assert.equal(r.bonos.length, 3);
  assert.deepEqual(r.personas.map(p => [p.num_bono, p.legajo, p.importe]), [[1, 7, 200], [3, 7, 10], [1, 8, 100], [2, 8, 70]]);
  assert.equal(r.control.diferencias, 0);
  assert.equal(r.control.personas, 2);
});

test('tipo: Post Venta / PV se reconoce; el resto queda sin discriminar', () => {
  const r = B.parseLibro({ PROYECTOS, PERSONAL });
  assert.deepEqual(r.bonos.map(b => b.tipo), ['sin_discriminar', 'posventa', 'sin_discriminar']);
  assert.equal(B.tipoDe('PL0079 ANTONY PV'), 'posventa');
  assert.equal(B.tipoDe('PL0075 ROCAS NEGRAS - 5'), 'sin_discriminar');
});

test('períodos: AAAAMM y AAAAMM/AAAAMM; uno inválido queda sin período y avisa', () => {
  const r = B.parseLibro({ PROYECTOS, PERSONAL });
  assert.deepEqual([r.bonos[0].periodo_desde, r.bonos[0].periodo_hasta], ['2025-04', '2025-05']);
  assert.deepEqual([r.bonos[1].periodo_desde, r.bonos[1].periodo_hasta], ['2025-06', '2025-06']);
  assert.equal(r.bonos[2].periodo_desde, null);
  assert.ok(r.advertencias.some(a => a.includes('xx606')));
  assert.equal(B.periodoDe('20606'), null);
});

test('control: avisa si la suma de las personas no coincide con el monto del bono', () => {
  const mal = PERSONAL.map(r => r.slice()); mal[2][2] = 150;
  const r = B.parseLibro({ PROYECTOS, PERSONAL: mal });
  assert.equal(r.control.diferencias, 1);
  assert.ok(r.advertencias.some(a => a.includes('no coincide')));
});

test('columnas que no están en PROYECTOS, legajos repetidos y hojas faltantes', () => {
  const p2 = PERSONAL.map(r => r.slice()); p2[0][4] = 'NO EXISTE'; p2.push([7, 'Repetido', 5, 5, 5]);
  const r = B.parseLibro({ PROYECTOS, PERSONAL: p2 });
  assert.ok(r.advertencias.some(a => a.includes('NO EXISTE')));
  assert.ok(r.advertencias.some(a => a.includes('legajo 7')));
  assert.ok(B.parseLibro({ PROYECTOS: [], PERSONAL }).errores.length > 0);
});

test('resumen por proyecto: bonos, personas distintas y total exacto; detalle con padrón', () => {
  const r = B.parseLibro({ PROYECTOS, PERSONAL });
  const res = B.resumenProyectos(r.bonos, r.personas);
  const alfa = res.find(x => x.proyecto === 'PL0001 ALFA');
  assert.equal(alfa.bonos, 2); assert.equal(alfa.personas, 2); assert.equal(alfa.total, 370); assert.equal(alfa.tipo, 'mixto');
  assert.equal(alfa.desde, '2025-04'); assert.equal(alfa.hasta, '2025-06');
  const det = B.detallePersonas(r.bonos, r.personas, [{ legajo: 7, nombre: 'Padrón Siete', departamento: 'D' }]);
  assert.equal(det.find(d => d.legajo === 7).nombre, 'Padrón Siete');
  assert.equal(det.find(d => d.legajo === 8).nombre, null);
});

test('lo liquidado por mes: solo conceptos OC de bono de proyecto, abiertos por tipo', () => {
  const cat = [{ nro_concepto: '1', empresa: '4H_OC', trata: 'directo_proyecto', descripcion: 'Bono Montaje - X' },
               { nro_concepto: '2', empresa: '4H_OC', trata: 'directo_proyecto', descripcion: 'Bono Posventa - X' },
               { nro_concepto: '3', empresa: '4H_OC', trata: 'costo', descripcion: 'Otro' }];
  const tipo = c => (/posventa/i.test(c.descripcion) ? 'posventa' : /montaje/i.test(c.descripcion) ? 'montaje' : 'otro');
  const filas = [{ periodo: '2026-09', empresa: '4H_OC', legajo: 1, nro_concepto: '1', importe: 100 }, { periodo: '2026-09', empresa: '4H_OC', legajo: 2, nro_concepto: '2', importe: 40 },
                 { periodo: '2026-09', empresa: '4H_OC', legajo: 2, nro_concepto: '3', importe: 999 }, { periodo: '2026-10', empresa: '4H_OC', legajo: 1, nro_concepto: '1', importe: 5 }];
  const r = B.liquidadoPorMes(filas, cat, tipo);
  assert.deepEqual(r.map(x => [x.periodo, x.montaje, x.posventa, x.total, x.personas]), [['2026-09', 100, 40, 140, 2], ['2026-10', 5, 0, 5, 1]]);
});

test('histórico por período: agrupa por la etiqueta de la planilla y abre el total por tipo', () => {
  const bonos = [{ num_bono: 1, tipo: 'sin_discriminar', etiqueta_periodo: '202504/202505', periodo_desde: '2025-04' }, { num_bono: 2, tipo: 'posventa', etiqueta_periodo: '202506', periodo_desde: '2025-06' },
                 { num_bono: 3, tipo: 'montaje', etiqueta_periodo: '202506', periodo_desde: '2025-06' }, { num_bono: 4, tipo: 'sin_discriminar', etiqueta_periodo: null, periodo_desde: null }];
  const personas = [{ num_bono: 1, legajo: 1, importe: 100.10 }, { num_bono: 2, legajo: 1, importe: 40 }, { num_bono: 3, legajo: 2, importe: 60.20 }, { num_bono: 4, legajo: 3, importe: 1 }];
  const r = B.resumenPorPeriodo(bonos, personas);
  assert.deepEqual(r.map(x => x.etiqueta), ['202504/202505', '202506', '(sin período)']);   // por fecha; sin período al final
  const j = r.find(x => x.etiqueta === '202506');
  assert.equal(j.bonos, 2); assert.equal(j.personas, 2); assert.equal(j.posventa, 40); assert.equal(j.montaje, 60.20); assert.equal(j.total, 100.20);
  assert.equal(r[0].sin_discriminar, 100.10);
});
