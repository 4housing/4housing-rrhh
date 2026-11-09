// Tests de la lógica de la tabla estándar. Datos SINTÉTICOS. node --test test/tabla.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const { _logica: L } = require('../js/rrhh-tabla.js');
const M = require('../js/rrhh-mes-a-mes.js');

const COLS = [{ k: 'nombre', titulo: 'Nombre' }, { k: 'depto', titulo: 'Depto' }, { k: 'monto', titulo: 'Monto', tipo: 'n', texto: f => String(f.monto) }];
const F = [{ nombre: 'Ñandú', depto: 'B', monto: 10 }, { nombre: 'Ana', depto: 'A', monto: 200 }, { nombre: 'Zoe', depto: 'A', monto: null }, { nombre: 'Beto', depto: 'B', monto: 9 }];

test('ordenar: números como números, textos en castellano, vacíos siempre al final, estable', () => {
  assert.deepEqual(L.ordenar(F, COLS, { k: 'monto', dir: 'asc' }).map(f => f.nombre), ['Beto', 'Ñandú', 'Ana', 'Zoe']);
  assert.deepEqual(L.ordenar(F, COLS, { k: 'monto', dir: 'desc' }).map(f => f.nombre), ['Ana', 'Ñandú', 'Beto', 'Zoe']);
  assert.deepEqual(L.ordenar(F, COLS, { k: 'nombre', dir: 'asc' }).map(f => f.nombre), ['Ana', 'Beto', 'Ñandú', 'Zoe']);
  assert.deepEqual(L.ordenar(F, COLS, null).map(f => f.nombre), F.map(f => f.nombre));       // sin orden: como vino
  assert.equal(F[0].nombre, 'Ñandú');                                                          // no muta
});

test('filtrar: varios valores a la vez, varias columnas a la vez (Y), y se puede omitir una columna', () => {
  const f1 = L.filtrar(F, COLS, { depto: new Set(['A', 'B']) });
  assert.equal(f1.length, 4);
  const f2 = L.filtrar(F, COLS, { depto: new Set(['A']), nombre: new Set(['Ana', 'Beto']) });
  assert.deepEqual(f2.map(f => f.nombre), ['Ana']);
  const sin = L.filtrar(F, COLS, { depto: new Set(['A']) }, 'depto');                          // para armar las opciones de esa misma columna
  assert.equal(sin.length, 4);
  assert.equal(L.filtrar(F, COLS, {}).length, 4);
});

test('opciones del filtro: distintas, ordenadas, y el vacío es una opción', () => {
  assert.deepEqual(L.opciones(F, COLS[1]), ['A', 'B']);
  assert.deepEqual(L.opciones(F, COLS[2]), ['9', '10', '200', 'null']);   // «texto» del ejemplo; el orden sigue al valor numérico
});

test('buscador del filtro: sin distinguir mayúsculas ni tildes', () => {
  assert.equal(L.coincide('Ñandú', 'NANDU'), true);                       // ignora tildes y mayúsculas (como el buscador de Excel)
  assert.equal(L.coincide('Matías', 'matias'), true);
  assert.equal(L.coincide('Matías', ''), true);
  assert.equal(L.coincide('Ana', 'x'), false);
});

test('Costo por mes: sumar() de las filas que quedan filtradas, exacto en centavos', () => {
  const filas = [{ meses: { '2026-08': 100.10, '2026-09': 1 } }, { meses: { '2026-08': 0.20, '2026-09': 2 } }];
  const t = M.sumar(filas, ['2026-08', '2026-09']);
  assert.equal(t.meses['2026-08'], 100.30);
  assert.equal(t.total, 103.30);
  assert.equal(M.sumar([], ['2026-08']).total, 0);
});
