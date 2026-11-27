'use strict';
const test = require('node:test'), assert = require('node:assert');
const V = require('../js/rrhh-vacaciones.js'), N = require('../js/rrhh-novedades.js');

const ped = (o) => ({ id: 'p1', empresa: '4H', legajo: 901, anio: 2030, desde: '2030-03-04', hasta: '2030-03-08', dias: 5, codigo: 'VACJOR', cantidad: 8, estado: 'aprobado', novedades_generadas_en: null, observaciones: null, ...o });

test('saldo: normalizar y validar', () => {
  const s = V.normalizarSaldo({ empresa: '4H', legajo: '901', anio: '2030', dias: '14,5', nota: ' ' });
  assert.deepStrictEqual(s, { empresa: '4H', legajo: 901, anio: 2030, dias: 14.5, nota: null });
  assert.deepStrictEqual(V.validarSaldo(s), []);
  assert.ok(V.validarSaldo({ ...s, empresa: '' }).length);
  assert.ok(V.validarSaldo({ ...s, dias: 14.3 }).length);          // de a medio día
  assert.ok(V.validarSaldo({ ...s, dias: -1 }).length);
  assert.ok(V.validarSaldo({ ...s, dias: NaN }).length);
  assert.ok(V.validarSaldo({ ...s, legajo: 0 }).length);
  assert.ok(V.validarSaldo({ ...s, anio: 1999 }).length);
});
test('pedido: normalizar toma el año de «desde» y valida', () => {
  const p = V.normalizarPedido({ empresa: '4H', legajo: '901', desde: '2030-03-04', hasta: '2030-03-08', dias: '5', codigo: ' vacjor ', cantidad: '8', observaciones: '' });
  assert.strictEqual(p.anio, 2030); assert.strictEqual(p.codigo, 'VACJOR'); assert.strictEqual(p.observaciones, null);
  assert.deepStrictEqual(V.validarPedido(p), []);
  assert.ok(V.validarPedido({ ...p, empresa: '' }).length);
  assert.ok(V.validarPedido({ ...p, hasta: '2030-03-03' }).length);
  assert.ok(V.validarPedido({ ...p, desde: '2030-02-31' }).length);
  assert.ok(V.validarPedido({ ...p, dias: 0 }).length);
  assert.ok(V.validarPedido({ ...p, dias: NaN }).length);
  assert.ok(V.validarPedido({ ...p, cantidad: 0 }).length);
  assert.ok(V.validarPedido({ ...p, codigo: '' }).length);
  assert.deepStrictEqual(V.validarPedido({ ...p, dias: 2.5 }), []);
});
test('circuito de estados', () => {
  assert.ok(V.puedePasar(ped({ estado: 'pedido' }), 'aprobado_jefe'));
  assert.ok(!V.puedePasar(ped({ estado: 'pedido' }), 'aprobado'));          // no se salta al jefe
  assert.ok(V.puedePasar(ped({ estado: 'aprobado_jefe' }), 'aprobado'));
  assert.ok(V.puedePasar(ped({ estado: 'aprobado' }), 'cancelado'));
  assert.ok(!V.puedePasar(ped({ estado: 'aprobado', novedades_generadas_en: '2030-03-01T00:00:00Z' }), 'cancelado'));
  assert.ok(!V.puedePasar(ped({ estado: 'rechazado' }), 'aprobado'));
  assert.ok(!V.puedePasar(ped({ estado: 'cancelado' }), 'pedido'));
});
test('rango y fechas sugeridas: lunes a viernes sin feriados, sin depender de la zona horaria', () => {
  assert.deepStrictEqual(V.rango('2030-03-09', '2030-03-11'), ['2030-03-09', '2030-03-10', '2030-03-11']);
  assert.strictEqual(V.rango('2030-03-01', '2030-03-31').length, 31);
  assert.deepStrictEqual(V.sugerirFechas('2030-03-04', '2030-03-10', new Set()), ['2030-03-04', '2030-03-05', '2030-03-06', '2030-03-07', '2030-03-08']);   // 2030-03-04 es lunes
  assert.deepStrictEqual(V.sugerirFechas('2030-03-04', '2030-03-08', ['2030-03-06']), ['2030-03-04', '2030-03-05', '2030-03-07', '2030-03-08']);
});
test('novedadesDePedido: una por fecha, solo si está aprobado y sin generar', () => {
  const f = V.sugerirFechas('2030-03-04', '2030-03-08', []);
  const r = V.novedadesDePedido(ped(), f);
  assert.deepStrictEqual(r.errores, []); assert.strictEqual(r.novedades.length, 5);
  assert.ok(r.novedades.every(n => n.codigo === 'VACJOR' && n.cantidad === 8 && n.valor === 0 && n.origen === 'vacaciones' && n.empresa === '4H' && n.vac_pedido === 'p1' && N.validar(N.normalizar(n)).length === 0));
  assert.ok(V.novedadesDePedido(ped({ estado: 'pedido' }), f).errores.length);
  assert.ok(V.novedadesDePedido(ped({ novedades_generadas_en: 'x' }), f).errores.length);
  assert.ok(V.novedadesDePedido(ped(), []).errores.length);
  assert.ok(V.novedadesDePedido(ped(), ['2030-04-01']).errores.length);
  assert.strictEqual(V.novedadesDePedido(ped(), [...f, ...f]).novedades.length, 5);        // sin repetidas
});
test('resumen: saldo, pendientes y control de integridad', () => {
  const saldos = [{ empresa: '4H', legajo: 901, anio: 2030, dias: 14 }, { empresa: '4H', legajo: 902, anio: 2030, dias: 2 }, { empresa: '4H_OC', legajo: 901, anio: 2030, dias: 20 }];
  const pedidos = [ped({ id: 'a', novedades_generadas_en: 'x' }), ped({ id: 'b', estado: 'pedido', dias: 3 }), ped({ id: 'c', legajo: 902, dias: 3 }), ped({ id: 'd', legajo: 903, dias: 1, estado: 'rechazado' })];
  const nov = [1, 2, 3, 4].map(() => ({ vac_pedido: 'a' }));          // 4 novedades para un pedido de 5 días
  const r = V.resumen(saldos, pedidos, nov), por = l => r.find(x => x.legajo === l && x.empresa === '4H');
  assert.strictEqual(por(901).restante, 9); assert.strictEqual(por(901).conPendientes, 6);
  assert.ok(por(901).control.some(c => /Novedades \(4\)/.test(c)));
  assert.strictEqual(por(902).restante, -1); assert.ok(por(902).control.includes('Saldo negativo')); assert.ok(por(902).control.some(c => /sin novedades generadas/i.test(c)));
  assert.ok(por(903).control.includes('Sin saldo cargado')); assert.strictEqual(por(903).restante, null);
  assert.strictEqual(r.length, 4);                                   // la misma persona en dos empresas = dos saldos
  assert.strictEqual(r.find(x => x.empresa === '4H_OC').restante, 20);
  assert.deepStrictEqual(V.resumen([{ empresa: '4H', legajo: 1, anio: 2030, dias: 10 }], [], []).map(x => x.control), [[]]);
});
