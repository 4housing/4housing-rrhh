// Tests con datos SINTÉTICOS. Ejecutar: node --test test/importador.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/rrhh-importador.js');

const H_RES = ['Legajo', 'Apellidos', 'Nombre', 'C.U.I.L.', 'Departamento', 'Tipo de liquidación - Dato fijo',
  'Período liquidado', 'Nro. de concepto', 'Desc. de concepto', 'Grupo de concepto', 'Importe liquidado',
  'Cantidad liquidada', 'Valor liquidado'];
const res = (leg, tipo, per, nro, imp, cant, val) =>
  [leg, 'Apellido', 'Nombre', '20-00000000-0', 'DEPTO X', tipo, per, nro, 'desc', 'Haberes', imp, cant, val];
const serial = (y, m, d) => Date.UTC(y, m - 1, d) / 86400000 + 25569;

test('resumen: mapea columnas por encabezado y descarta datos personales', () => {
  const r = I.parseResumen([H_RES, res(1, 'Mensual', '2026-10-01', 1000, 100.5, 8, 12.5)]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.periodo, '2026-10');
  assert.deepEqual(r.filas, [{ legajo: 1, tipo_liquidacion: 'Mensual', nro_concepto: 1000, descripcion: 'desc', grupo: 'Haberes',
                               importe: 100.5, cantidad: 8, valor: 12.5 }]);
  const claves = Object.keys(r.filas[0]).join(',');
  assert.ok(!/cuil|nombre|apellido|telefono|correo/i.test(claves));
});

test('resumen: período desde fecha Date, serial de Excel y texto dd/mm/aaaa', () => {
  const filas = [H_RES,
    res(1, 'Mensual', new Date(2026, 9, 1), 1000, 1, 0, 0),
    res(2, 'Mensual', serial(2026, 10, 1), 1000, 1, 0, 0),
    res(3, 'Mensual', '01/10/2026', 1000, 1, 0, 0)];
  const r = I.parseResumen(filas);
  assert.equal(r.periodo, '2026-10');
  assert.deepEqual(r.advertencias, []);
  assert.equal(r.filas.length, 3);
});

test('resumen: filas con período distinto generan advertencia y se usa el más frecuente', () => {
  const r = I.parseResumen([H_RES, res(1, 'Mensual', '2026-10-01', 1, 1, 0, 0), res(2, 'Mensual', '2026-10-01', 1, 1, 0, 0),
    res(3, 'Mensual', '2026-09-01', 1, 1, 0, 0)]);
  assert.equal(r.periodo, '2026-10');
  assert.equal(r.advertencias.length, 1);
});

test('resumen: datos inválidos se reportan con número de fila y no entran', () => {
  const r = I.parseResumen([H_RES,
    res(1, 'Mensual', '2026-10-01', 1000, 'abc', 0, 0),
    res('x', 'Mensual', '2026-10-01', 1000, 1, 0, 0),
    res(2, '', '2026-10-01', 1000, 1, 0, 0),
    res(3, 'Mensual', '2026-10-01', 1000, 5, 0, 0)]);
  assert.equal(r.filas.length, 1);
  assert.equal(r.errores.length, 3);
  assert.match(r.errores[0], /Fila 2.*importe/);
  assert.match(r.errores[1], /Fila 3.*legajo/);
  assert.match(r.errores[2], /Fila 4.*tipo de liquidación/);
});

test('resumen: columnas faltantes y archivo vacío son errores explícitos', () => {
  assert.match(I.parseResumen([['Legajo', 'Otra']]).errores[0], /Faltan columnas.*nro_concepto/);
  assert.match(I.parseResumen([H_RES]).errores[0], /no tiene filas/);
  assert.match(I.parseResumen([]).errores[0], /Faltan columnas/);
});

test('resumen: no redondea ni pierde centavos y respeta negativos', () => {
  const r = I.parseResumen([H_RES, res(1, 'Mensual', '2026-10-01', 20000, -1234.56, null, null)]);
  assert.equal(r.filas[0].importe, -1234.56);
  assert.equal(r.filas[0].cantidad, null);
});

const H_NOV = ['Fecha', 'C.U.I.L.', 'Legajo', 'Apellido y nombre', 'Cód. novedad', 'Novedad', 'Cantidad', 'Expresión', 'Valor', 'Origen', 'Departamento'];

test('novedades: fecha, código y cantidad; sin CUIL ni nombre', () => {
  const r = I.parseNovedades([H_NOV,
    [serial(2026, 10, 14), '20-0-0', 5, 'Ap Nom', 'HSTRA', 'Horas trabajadas', 8, 'H', 8, 'Manual', 'D'],
    ['2026-10-15', '20-0-0', 5, 'Ap Nom', 'VACJOR', 'Vacaciones', 8, null, null, null, 'D']]);
  assert.deepEqual(r.errores, []);
  assert.equal(r.periodo, '2026-10');
  assert.equal(r.filas[0].fecha, '2026-10-14');
  assert.equal(r.filas[0].cod_novedad, 'HSTRA');
  assert.ok(!('cuil' in r.filas[0]) && !('nombre' in r.filas[0]));
  assert.equal(r.filas[1].valor, null);
  assert.equal(r.filas[0].departamento, 'D');
});

test('resumen: descripción y grupo se limpian (espacios sobrantes) y son opcionales', () => {
  const fila = res(1, 'Mensual', '2026-10-01', 20000, -5, null, null); fila[8] = '  Jubilación '; fila[9] = 'Retenciones';
  const r = I.parseResumen([H_RES, fila]);
  assert.equal(r.filas[0].descripcion, 'Jubilación');
  assert.equal(r.filas[0].grupo, 'Retenciones');
  const sinOpc = I.parseResumen([H_RES.filter((_, i) => i !== 8 && i !== 9), res(1, 'Mensual', '2026-10-01', 1, 1, 0, 0).filter((_, i) => i !== 8 && i !== 9)]);
  assert.deepEqual(sinOpc.errores, []);
  assert.equal(sinOpc.filas[0].descripcion, null);
  assert.equal(sinOpc.filas[0].grupo, null);
});

test('períodos del histórico: «05/2026», «2026-08», fecha completa y dd/mm/aaaa', () => {
  const casos = [['05/2026', '2026-05'], ['5/2026', '2026-05'], ['2026-08', '2026-08'], ['2026-08-01', '2026-08'],
                 ['01/10/2026', '2026-10'], [new Date(2026, 5, 1), '2026-06'], [serial(2026, 7, 1), '2026-07']];
  for (const [entrada, esperado] of casos) {
    const r = I.parseResumen([H_RES, res(1, 'Mensual', entrada, 1000, 1, 0, 0)]);
    assert.deepEqual(r.errores, [], String(entrada));
    assert.equal(r.periodo, esperado, String(entrada));
  }
  for (const malo of ['13/2026', '2026-13', 'octubre', '2026']) {
    assert.equal(I.aFechaISO(malo), null, malo);
  }
});

test('padrón: solo legajo, nombre y departamento; ignora teléfono, CUIL y correo', () => {
  const H = ['Legajo', 'Apellido y nombre', 'Departamento', 'Teléfono', 'C.U.I.L.', 'Correo electrónico'];
  const r = I.parsePadron([H, [1, 'Pérez, Ana', 'ADMIN', '11-1111', '27-0-0', 'a@x.com'], [2, 'Gómez, Luis', null, '1', '2', '3'],
    [1, 'Repetido', 'X', '', '', '']]);
  assert.deepEqual(r.filas, [{ legajo: 1, nombre: 'Pérez, Ana', departamento: 'ADMIN' },
                             { legajo: 2, nombre: 'Gómez, Luis', departamento: null }]);
  assert.equal(r.advertencias.length, 1);
  assert.ok(!JSON.stringify(r.filas).match(/11-1111|27-0-0|a@x\.com/));
});

test('legajos liquidados sin padrón (§7.3)', () => {
  const padron = [{ legajo: 1 }, { legajo: 2 }];
  assert.deepEqual(I.legajosSinPadron([{ legajo: 2 }, { legajo: 9 }, { legajo: 9 }, { legajo: 7 }], padron), [7, 9]);
});

test('pareceInforme elige la hoja correcta aunque haya otras (HABILITADO, _metadata)', () => {
  assert.equal(I.pareceInforme([H_RES], 'resumen'), true);
  assert.equal(I.pareceInforme([['Key', 'Value']], 'resumen'), false);
  assert.equal(I.pareceInforme([H_NOV], 'novedades'), true);
  assert.equal(I.pareceInforme([H_NOV], 'resumen'), false);
  assert.equal(I.pareceInforme([['Legajo', 'Apellido y nombre', 'Departamento']], 'padron'), true);
});

test('Excel de control: hojas derivadas se ignoran y se ubican las 3 hojas de datos', () => {
  const R = require('../js/rrhh-importador.js');
  assert.equal(R.esHojaDerivada('Project'), true);
  assert.equal(R.esHojaDerivada(' SUSS '), true);
  assert.equal(R.esHojaDerivada('Liquidacion Mensual'), false);
  const h = R.hojasDeControl(['Project', 'Resumen', 'Liquidacion Mensual', 'Liquidacion Mensual (2)', 'Legajos', 'td']);
  assert.deepEqual(h, { cuatroH: 'Liquidacion Mensual', oc: 'Liquidacion Mensual (2)', padron: 'Legajos' });
  assert.equal(R.hojasDeControl(['Otra']).cuatroH, null);
});

test('padrón del Excel de control: «Número» y «Descripción de departamento»; sin datos personales', () => {
  const R = require('../js/rrhh-importador.js');
  const m = [['Número', 'Apellido y nombre', 'Descripción de departamento', 'Teléfono 1', 'CUIL', 'Correo electrónico'],
             [7, 'Ejemplo Siete', 'OPERACIONES', '000', '00-00000000-0', 'x@example.com']];
  assert.equal(R.pareceInforme(m, 'padron'), true);
  const r = R.parsePadron(m);
  assert.equal(r.filas.length, 1);
  assert.deepEqual(Object.keys(r.filas[0]).sort(), ['departamento', 'legajo', 'nombre']);
  assert.equal(r.filas[0].departamento, 'OPERACIONES');
});
