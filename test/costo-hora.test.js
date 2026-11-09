// Tests del motor de costo por tipo de hora con datos SINTÉTICOS (inventados). node --test test/costo-hora.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const H = require('../js/rrhh-costo-hora.js');

const c = (nro, empresa, o) => ({ nro_concepto: nro, empresa, trata: 'costo', es_hora: false, ...o });
const CAT = [
  c('1', '4H', { grupo_sistema: 'Haberes', es_hora: true, tipo_hora: 'trabajada', prorrateo: 'directo' }),
  c('2', '4H', { grupo_sistema: 'Haberes', es_hora: true, tipo_hora: 'extra50', prorrateo: 'directo' }),
  c('3', '4H', { grupo_sistema: 'Haberes', es_hora: true, tipo_hora: 'vacaciones', prorrateo: 'directo' }),
  c('4', '4H', { grupo_sistema: 'Haberes', es_hora: true, tipo_hora: 'feriado', prorrateo: 'directo' }),
  c('5', '4H', { grupo_sistema: 'Haberes', es_hora: true, tipo_hora: 'enfermedad', prorrateo: 'directo' }),
  c('10', '4H', { grupo_sistema: 'Haberes', prorrateo: 'por_horas_pagas' }),
  c('11', '4H', { grupo_sistema: 'Haberes', prorrateo: 'por_pago_tipo' }),
  c('12', '4H', { grupo_sistema: 'No Remunerativo', prorrateo: 'fijo_mensual' }),
  c('13', '4H', { grupo_sistema: 'Contribuciones', prorrateo: 'cargas' }),
  c('14', '4H', { grupo_sistema: 'Haberes', prorrateo: null }),                 // sin regla
  c('20', '4H_OC', { grupo_sistema: 'No Remunerativo', prorrateo: 'fijo_mensual' }),   // coparticipación
  c('21', '4H_OC', { grupo_sistema: 'No Remunerativo', prorrateo: 'directo' }),        // sábado: directo
  c('22', '4H_OC', { grupo_sistema: 'No Remunerativo', trata: 'directo_proyecto' }),   // bono montaje
  c('23', '4H_OC', { grupo_sistema: 'No Remunerativo', trata: 'cuenta_rrhh' }),        // combo
  c('99', '4H', { grupo_sistema: 'No Remunerativo', trata: 'excluir' }),               // adelanto
];
const f = (empresa, nro, importe, cantidad, legajo) => ({ empresa, legajo: legajo || 1, nro_concepto: nro, importe, cantidad: cantidad || 0 });
const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol == null ? 0.005 : tol), a + ' ≉ ' + b);
const uno = filas => H.calcular(filas, CAT).legajos[1];

test('caso a mano: trabajada y vacaciones con los 5 tipos de pool', () => {
  // 10 h trabajadas ($1000) + 10 h vacaciones ($500). Pools: P1 200, P2 30, fijos 100, cargas 300.
  const r = uno([f('4H', '1', 1000, 10), f('4H', '3', 500, 10), f('4H', '10', 200), f('4H', '11', 30), f('4H', '12', 100), f('4H', '13', 300)]);
  // P1 por horas: 100 y 100. P2 por pago: 1000/1500 y 500/1500 de 30 = 20 y 10. Fijos: todo a trabajada.
  // Remunerativo asignado: trabajada 1000+100+20 = 1120; vacaciones 500+100+10 = 610 → cargas 300 en 1120:610.
  cerca(r.costo.trabajada, 1000 + 100 + 20 + 100 + 300 * 1120 / 1730);
  cerca(r.costo.vacaciones, 500 + 100 + 10 + 300 * 610 / 1730);
  cerca(r.valorHora.trabajada, r.costo.trabajada / 10);
  cerca(r.valorHora.vacaciones, r.costo.vacaciones / 10);
  assert.equal(r.total, 2130);
  assert.equal(r.control, 0);
  assert.equal(r.sinHoras, 0);
});

test('las horas extra NO entran en la base de «horas pagas» ni de antigüedad, pero se suman a la trabajada al informar', () => {
  const r = uno([f('4H', '1', 800, 80), f('4H', '2', 30, 2), f('4H', '3', 600, 100), f('4H', '10', 360), f('4H', '11', 40)]);
  // P1 por horas sin extras: 80 y 100 → 160 y 200. P2 por pago de trabajada y vacaciones: 800 y 600 → 22,857 y 17,143.
  cerca(r.costo.trabajada, 800 + 30 + 160 + 40 * 800 / 1400);            // incluye el pago de las extras
  cerca(r.costo.vacaciones, 600 + 200 + 40 * 600 / 1400);
  assert.equal(r.horas.trabajada, 82);                                   // 80 + 2 extras
  assert.equal(r.control, 0);
});

test('las ausencias cuentan como horas pagas (verificado con el concepto 1100 de octubre) pero no en la base de antigüedad', () => {
  const r = uno([f('4H', '1', 100, 10), f('4H', '5', 100, 10), f('4H', '10', 100), f('4H', '11', 20)]);
  cerca(r.costo.enfermedad, 100 + 50);                                   // P1 por horas: 50/50; antigüedad solo a trabajada
  cerca(r.costo.trabajada, 100 + 50 + 20);
  assert.equal(r.control, 0);
});

test('Bono Montaje, Combo Hogar y adelantos no entran al costo; el sábado se informa aparte y no entra al valor hora', () => {
  const r = uno([f('4H', '1', 1000, 10), f('4H_OC', '22', 500), f('4H_OC', '23', -50), f('4H', '99', -200), f('4H_OC', '21', 300)]);
  assert.equal(r.total, 1300);                                           // 1000 + 300 de sábado
  assert.equal(r.directoFinDeSemana, 300);
  cerca(r.costo.trabajada, 1000);
  cerca(r.valorHora.trabajada, 100);
  assert.equal(r.control, 0);
});

test('la coparticipación (OC, fija) va con las horas trabajadas', () => {
  const r = uno([f('4H', '1', 1000, 10), f('4H', '3', 1000, 10), f('4H_OC', '20', 400)]);
  cerca(r.costo.trabajada, 1400);
  cerca(r.costo.vacaciones, 1000);
});

test('sin horas trabajadas, los pagos fijos quedan «sin horas» (costo real sin valor hora)', () => {
  const r = uno([f('4H', '5', 1000, 100), f('4H', '12', 100)]);
  assert.equal(r.sinHoras, 100);
  assert.equal(r.valorHora.trabajada, undefined);
  cerca(r.costo.enfermedad, 1000);
  assert.equal(r.control, 0);
});

test('mensualizado sin horas por tipo: todo el costo queda «sin horas» y no hay valor hora', () => {
  const r = uno([f('4H', '14', 5000), f('4H', '10', 100), f('4H', '13', 1500)]);
  assert.equal(r.sinHoras, 6600);
  assert.deepEqual(r.horas, {});
  assert.deepEqual(r.valorHora, {});
  assert.equal(r.control, 0);
});

test('solo horas extra y sueldo mensual (mensualizado): sin valor hora; el sueldo y SUS cargas quedan «sin horas»', () => {
  const r = uno([f('4H', '2', 300, 10), f('4H', '14', 5000), f('4H', '13', 1500), f('4H', '12', 400)]);
  // El sueldo (5000, sin regla, remunerativo) no tiene horas base → «sin horas». Cargas sobre 5300: 5000 al sueldo, 300 a las extras.
  cerca(r.sinHoras, 5000 + 400 + 1500 * 5000 / 5300);
  cerca(r.costo.trabajada, 300 + 1500 * 300 / 5300);
  assert.equal(r.valorHora.trabajada, null);
  assert.equal(r.sinHorasBase, true);
  assert.equal(r.control, 0);
  assert.equal(r.total, 7200);
});

test('concepto de costo sin regla de reparto: se reparte por horas pagas y se LISTA', () => {
  const r = uno([f('4H', '1', 1000, 10), f('4H', '3', 1000, 10), f('4H', '14', 200)]);
  cerca(r.costo.trabajada, 1100);
  cerca(r.costo.vacaciones, 1100);
  assert.deepEqual(r.sinRegla, [{ concepto: '4H:14', importe: 200 }]);
});

test('conceptos sin catalogar o pendientes quedan afuera del costo', () => {
  const r = uno([f('4H', '1', 1000, 10), f('4H', '777', 999), f('4H', '5', 0, 0)]);
  assert.equal(r.total, 1000);
});

test('control en centavos: Σ por tipo + sin horas + fin de semana = total, aun con repartos que no cierran', () => {
  const r = uno([f('4H', '1', 100.01, 7), f('4H', '3', 100.01, 7), f('4H', '4', 33.33, 3), f('4H', '10', 100.01), f('4H', '13', 100.01), f('4H', '12', 0.01)]);
  const suma = Object.values(r.costo).reduce((a, b) => a + b, 0) + r.sinHoras + r.directoFinDeSemana;
  assert.equal(Math.round(suma * 100), Math.round(r.total * 100));
  assert.equal(r.control, 0);
});

test('repartir y redondearSuma', () => {
  assert.equal(H.repartir(100, { a: 0, b: 0 }), null);
  assert.deepEqual(H.repartir(100, { a: 1, b: 3 }), { a: 25, b: 75 });
  const r = H.redondearSuma({ a: 33.4, b: 33.3, c: 33.3 }, 100);
  assert.equal(r.a + r.b + r.c, 100);
});
