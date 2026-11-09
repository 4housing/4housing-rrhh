// Tests de «Costo por mes». Datos SINTÉTICOS (inventados). node --test test/mes-a-mes.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../js/rrhh-mes-a-mes.js');

const f = (legajo, nombre, departamento, o) => ({ legajo, nombre, departamento, cuestaTotal: 0, cobra: 0, neto4H: 0, ocTotal: 0, ...o });
const INF = {
  '2026-08': { filas: [f(1, 'Ana', 'OPERACIONES', { cuestaTotal: 100.10, cobra: 60, neto4H: 50, ocTotal: 10 }), f(2, 'Beto', 'ADMIN', { cuestaTotal: 200, cobra: 120, neto4H: 120, ocTotal: 0 })] },
  '2026-09': { filas: [f(1, 'Ana', 'OPERACIONES', { cuestaTotal: 110.20, cobra: 65, neto4H: 55, ocTotal: 10 }), f(3, 'Carla', null, { cuestaTotal: 50, cobra: 30, neto4H: 30, ocTotal: 0 })] },
};
const P = ['2026-09', '2026-08'];   // desordenados a propósito

test('una persona por fila, un mes por columna, total de la fila y total general', () => {
  const r = M.matriz(INF, P, { medida: 'costo' });
  assert.deepEqual(r.periodos, ['2026-08', '2026-09']);
  const ana = r.filas.find(x => x.legajo === 1);
  assert.equal(ana.meses['2026-08'], 100.10);
  assert.equal(ana.total, 210.30);                         // suma exacta en centavos
  assert.equal(r.filas.find(x => x.legajo === 2).meses['2026-09'], 0);   // no estuvo ese mes
  assert.equal(r.totales.meses['2026-08'], 300.10);
  assert.equal(r.totales.meses['2026-09'], 160.20);
  assert.equal(r.totales.total, 460.30);
  assert.equal(r.totales.personas, 3);
});

test('las cuatro medidas salen de la columna correcta del informe', () => {
  const t = k => M.matriz(INF, P, { medida: k }).totales.total;
  assert.equal(t('costo'), 460.30);
  assert.equal(t('cobrado'), 60 + 120 + 65 + 30);
  assert.equal(t('cobrado4h'), 50 + 120 + 55 + 30);
  assert.equal(t('cobradooc'), 10 + 10);
  assert.throws(() => M.matriz(INF, P, { medida: 'otra' }));
});

test('por departamento: grupos con subtotal; sin departamento al final; el total general no cambia', () => {
  const r = M.matriz(INF, P, { medida: 'costo', porDepto: true });
  assert.deepEqual(r.grupos.map(g => g.departamento), ['ADMIN', 'OPERACIONES', M.SIN_DEPTO]);
  assert.equal(r.grupos[1].total, 210.30);
  assert.equal(r.grupos[1].meses['2026-09'], 110.20);
  assert.equal(r.grupos.reduce((s, g) => s + g.total, 0).toFixed(2), r.totales.total.toFixed(2));
});

test('filtros por departamento y por texto; el total es el de lo filtrado', () => {
  assert.equal(M.matriz(INF, P, { depto: 'ADMIN' }).totales.total, 200);
  assert.equal(M.matriz(INF, P, { depto: M.SIN_DEPTO }).totales.total, 50);
  assert.equal(M.matriz(INF, P, { texto: 'ana' }).filas.length, 1);
  assert.equal(M.matriz(INF, P, { texto: '3' }).filas[0].nombre, 'Carla');
});

test('un mes sin informe cargado no rompe; los departamentos se listan sin repetir', () => {
  const r = M.matriz(INF, ['2026-07', '2026-08']);
  assert.equal(r.totales.meses['2026-07'], 0);
  assert.equal(r.totales.total, 300.10);
  assert.deepEqual(M.departamentos(INF, P), ['ADMIN', 'OPERACIONES', M.SIN_DEPTO]);
});

test('bonos de proyecto: se pueden sacar por tipo del costo, del cobrado y del cobrado 4H OC; el 4H del recibo no cambia', () => {
  const g = (legajo, o) => ({ legajo, nombre: 'P' + legajo, departamento: 'X', cuestaTotal: 1000, cobra: 800, neto4H: 500, ocTotal: 300, bonoMontaje: 0, bonoPosventa: 0, bonoOtro: 0, ...o });
  const inf = { '2026-10': { filas: [g(1, { bonoMontaje: 100, bonoPosventa: 40, bonoOtro: 10 })] } };
  const t = (medida, sinBonos) => M.matriz(inf, ['2026-10'], { medida, sinBonos }).totales.total;
  assert.equal(t('costo', []), 1000);
  assert.equal(t('costo', ['montaje']), 900);
  assert.equal(t('costo', ['montaje', 'posventa', 'otro']), 850);
  assert.equal(t('cobrado', ['posventa']), 760);
  assert.equal(t('cobradooc', ['montaje', 'posventa', 'otro']), 150);
  assert.equal(t('cobrado4h', ['montaje', 'posventa', 'otro']), 500);
});
