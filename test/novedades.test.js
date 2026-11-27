'use strict';
const test = require('node:test'), assert = require('node:assert');
const N = require('../js/rrhh-novedades.js');

test('normalizar: mayúsculas, coma decimal y vacíos', () => {
  const n = N.normalizar({ empresa: ' 4H ', fecha: ' 2030-05-06 ', legajo: '901', codigo: ' hsenf ', cantidad: '7,5', valor: '', observaciones: '  ' });
  assert.deepStrictEqual(n, { empresa: '4H', fecha: '2030-05-06', legajo: 901, codigo: 'HSENF', cantidad: 7.5, valor: 0, observaciones: null, origen: 'manual' });
  assert.strictEqual(N.normalizar({ fecha: '2030-05-06', legajo: 1, codigo: 'X', cantidad: 1, origen: 'fichadas' }).origen, 'fichadas');
});
test('validar: casos válidos e inválidos', () => {
  const ok = { empresa: '4H_OC', fecha: '2030-05-06', legajo: 901, codigo: 'HSENF', cantidad: 8, valor: 0, observaciones: null };
  assert.deepStrictEqual(N.validar(ok), []);
  assert.deepStrictEqual(N.validar({ ...ok, cantidad: 0, valor: 1500 }), []);                 // adelanto: solo importe
  assert.ok(N.validar({ ...ok, cantidad: 0, valor: 0 }).length);                                // sin cantidad ni valor
  assert.ok(N.validar({ ...ok, empresa: '' }).length);                                        // la empresa es obligatoria
  assert.ok(N.validar({ ...ok, empresa: '5X' }).length);
  assert.ok(N.validar({ ...ok, fecha: '2030-13-45' }).length);
  assert.ok(N.validar({ ...ok, fecha: '' }).length);
  assert.ok(N.validar({ ...ok, legajo: NaN }).length);
  assert.ok(N.validar({ ...ok, legajo: 1.5 }).length);
  assert.ok(N.validar({ ...ok, codigo: '' }).length);
  assert.ok(N.validar({ ...ok, cantidad: -1 }).length);
  assert.ok(N.validar({ ...ok, cantidad: NaN }).length);
  assert.ok(N.validar({ ...ok, observaciones: 'x'.repeat(201) }).length);
});
test('duplicada: mismo legajo, fecha y código', () => {
  const a = { empresa: '4H', fecha: '2030-05-06', legajo: 901, codigo: 'HSENF' };
  assert.ok(N.duplicada(a, [{ ...a, cantidad: 3 }]));
  assert.ok(!N.duplicada(a, [{ ...a, codigo: 'LICART' }, { ...a, legajo: 902 }, { ...a, empresa: '4H_OC' }, { ...a, fecha: '2030-05-07' }]));
});
test('serial: número de serie de Excel, sin depender de la zona horaria', () => {
  assert.strictEqual(N.serial('1900-03-01'), 61);
  assert.strictEqual(N.serial('2030-01-01'), 47484);
  assert.strictEqual(N.serial('2030-03-10') - N.serial('2030-03-09'), 1);                          // cambio de hora no rompe
});
test('filasDelta: encabezado de Delta, orden y sin datos personales', () => {
  const f = N.filasDelta([
    { fecha: '2030-05-07', legajo: 902, codigo: 'VACJOR', cantidad: 8, valor: 0, observaciones: 'x' },
    { fecha: '2030-05-06', legajo: 903, codigo: 'ADELANTO', cantidad: 0, valor: 100, observaciones: null },
    { fecha: '2030-05-06', legajo: 901, codigo: 'HSENF', cantidad: 7.5, valor: 0, observaciones: null }]);
  assert.deepStrictEqual(f[0], ['Fecha', 'Número de legajo', 'Código de novedad', 'Cantidad', 'Valor', 'Observaciones']);
  assert.deepStrictEqual(f.slice(1).map(r => r[1]), [901, 903, 902]);
  assert.deepStrictEqual(f[1], [N.serial('2030-05-06'), 901, 'HSENF', 7.5, 0, '']);
  assert.ok(f.every(r => r.length === 6));
});
test('el catálogo no repite códigos y están en mayúsculas', () => {
  const c = N.CODIGOS.map(x => x.codigo);
  assert.strictEqual(new Set(c).size, c.length);
  assert.ok(c.every(x => x === x.toUpperCase()));
});
