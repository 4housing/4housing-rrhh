// Tests del informe de costo por empleado. Datos SINTÉTICOS (inventados). node --test test/informe-costo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../js/rrhh-informe-costo.js');

const c = (nro, empresa, o) => ({ nro_concepto: nro, empresa, trata: 'costo', es_hora: false, descripcion: 'Concepto ' + nro, ...o });
const CAT = [
  c('1', '4H', { grupo_sistema: 'Haberes', es_hora: true, tipo_hora: 'trabajada', prorrateo: 'directo' }),
  c('10', '4H', { grupo_sistema: 'Retenciones', trata: 'retencion' }),
  c('20', '4H', { grupo_sistema: 'No Remunerativo', trata: 'excluir' }),                 // adelanto
  c('30', '4H', { grupo_sistema: 'Contribuciones', prorrateo: 'cargas' }),
  c('100', '4H_OC', { grupo_sistema: 'No Remunerativo', prorrateo: 'fijo_mensual' }),   // coparticipación
  c('102', '4H_OC', { grupo_sistema: 'No Remunerativo', trata: 'directo_proyecto' }),   // bono montaje
  c('103', '4H_OC', { grupo_sistema: 'No Remunerativo', trata: 'cuenta_rrhh' }),        // combo
  c('104', '4H_OC', { grupo_sistema: 'No Remunerativo', trata: 'excluir' }),            // adelanto de copart.
];
const f = (empresa, legajo, nro, importe, cantidad, tipo) => ({ empresa, legajo, tipo_liquidacion: tipo || 'Mensual', nro_concepto: nro, importe, cantidad: cantidad || 0 });
const FILAS1 = [
  f('4H', 1, '1', 1000, 100), f('4H', 1, '10', -170), f('4H', 1, '30', 300), f('4H', 1, '20', -50),
  f('4H_OC', 1, '100', 250), f('4H_OC', 1, '102', 70), f('4H_OC', 1, '103', -25), f('4H_OC', 1, '104', -10),
];
const EMP = [{ legajo: 1, nombre: 'Ejemplo Uno', departamento: 'OPERACIONES' }, { legajo: 2, nombre: 'Ejemplo Dos', departamento: 'ADMIN' }];
const una = (filas, emp) => I.construir({ filas, catalogo: CAT, empleados: emp || EMP }).filas[0];
const cerca = (a, b, tol) => assert.ok(Math.abs(a - b) <= (tol == null ? 1e-9 : tol), a + ' ≉ ' + b);

test('4H, 4H OC y bono por separado; cuesta con y sin bono; cuánto cobra en el bolsillo', () => {
  const r = una(FILAS1);
  assert.equal(r.neto4H, 780);            // 1000 − 170 − 50 (los adelantos entran en lo que se acredita)
  assert.equal(r.cargas, 470);            // 170 de retenciones + 300 de contribuciones
  assert.equal(r.costo4H, 1300);          // 1000 + 300 (sin el adelanto)
  assert.equal(r.oc, 250);
  assert.equal(r.bono, 70);
  assert.equal(r.cuentaRRHH, -25);
  assert.equal(r.ocTotal, 285);           // 250 + 70 − 25 − 10
  assert.equal(r.cuestaSinBono, 1550);
  assert.equal(r.cuestaTotal, 1620);
  assert.equal(r.cobra, 1065);            // 780 + 285
});

test('columnas del Excel de control: total cobrado, costo total y los tres porcentajes', () => {
  const r = una(FILAS1);
  assert.equal(r.totalCobradoExcel, 1065);            // neto + «bono» (todo lo OC)
  assert.equal(r.costoExcel, 1535);                   // neto + cargas + OC
  cerca(r.pctCcssCosto, 470 / 1250);                  // cargas / (neto + cargas)
  cerca(r.pctCcssNeto, 470 / 780);                    // cargas / neto
  cerca(r.pctCcssCobrado, 470 / 1065);                // cargas / total cobrado
});

test('las fórmulas del Excel de control, con números inventados que cumplen las mismas relaciones', () => {
  // La hoja Resumen del Excel cumple: Total cobrado = Neto + Bono; Costo total = Neto + Cargas + Bono;
  // %CCSS = Cargas / (Neto + Cargas); %CCSS s/Neto = Cargas / Neto; %CCSS s/Neto Total = Cargas / Total cobrado.
  const filas = [f('4H', 5, '1', 1000, 100), f('4H', 5, '30', 600), f('4H_OC', 5, '100', 1600)];
  const r = una(filas, [{ legajo: 5, nombre: 'Ejemplo', departamento: 'X' }]);
  assert.equal(r.neto4H, 1000);
  assert.equal(r.cargas, 600);
  assert.equal(r.ocTotal, 1600);
  assert.equal(r.totalCobradoExcel, 2600);                 // 1000 + 1600
  assert.equal(r.costoExcel, 3200);                        // 1000 + 600 + 1600
  cerca(r.pctCcssCosto, 600 / 1600);                       // 37,5%
  cerca(r.pctCcssNeto, 600 / 1000);                        // 60%
  cerca(r.pctCcssCobrado, 600 / 2600);
});

test('padrón: nombre y departamento; legajo sin padrón queda marcado y el período no es cerrable', () => {
  const r = I.construir({ filas: [...FILAS1, f('4H', 9, '1', 100, 8)], catalogo: CAT, empleados: EMP });
  assert.equal(r.filas[0].nombre, 'Ejemplo Uno');
  assert.equal(r.filas[0].departamento, 'OPERACIONES');
  assert.equal(r.filas[1].enPadron, false);
  assert.deepEqual(r.alertas.legajosSinPadron, [9]);
  assert.equal(r.cerrable, false);
  assert.deepEqual(r.departamentos, ['OPERACIONES']);
});

test('totales: suma de las personas; los porcentajes se recalculan sobre los totales', () => {
  const filas = [...FILAS1, f('4H', 2, '1', 500, 50), f('4H', 2, '10', -80), f('4H', 2, '30', 120)];
  const r = I.construir({ filas, catalogo: CAT, empleados: EMP });
  assert.equal(r.totales.personas, 2);
  assert.equal(r.totales.neto4H, 780 + 420);
  assert.equal(r.totales.cargas, 470 + 200);
  assert.equal(r.totales.cobra, r.filas[0].cobra + r.filas[1].cobra);
  cerca(r.totales.pctCcssNeto, (470 + 200) / (780 + 420));
});

test('concepto sin catalogar: alerta y no cerrable; los porcentajes con denominador 0 son null', () => {
  const r = I.construir({ filas: [f('4H', 1, '777', 50)], catalogo: CAT, empleados: EMP });
  assert.deepEqual(r.alertas.sinCatalogar.map(a => a.nro_concepto), ['777']);
  assert.equal(r.cerrable, false);
  assert.equal(r.filas[0].pctCcssNeto, null);
  assert.equal(r.filas[0].pctCcssCosto, null);
});

test('detalle de una persona: conceptos sumando quincenas, descripción, tratamiento y horas', () => {
  const filas = [f('4H', 1, '1', 600, 60, 'Primera Quincena'), f('4H', 1, '1', 400, 40, 'Segunda Quincena'),
                 f('4H', 1, '30', 300), f('4H_OC', 1, '102', 70), f('4H', 1, '999', 5), f('4H', 2, '1', 999, 9)];
  const d = I.detalle({ filas, catalogo: CAT, legajo: 1 });
  const hora = d.lineas.find(l => l.nro === '1');
  assert.equal(hora.importe, 1000);
  assert.equal(hora.cantidad, 100);
  assert.equal(hora.descripcion, 'Concepto 1');
  assert.equal(d.lineas.find(l => l.nro === '999').descripcion, '(sin catalogar)');
  assert.equal(d.lineas.find(l => l.nro === '102').trata, 'directo_proyecto');
  assert.ok(d.lineas.every(l => l.empresa === '4H' || l.empresa === '4H_OC'));
  assert.equal(d.lineas.filter(l => l.empresa === '4H')[0].empresa, '4H');          // primero 4H, después OC
  assert.equal(d.horas.horas.trabajada, 100);
  const grupos4H = d.lineas.filter(l => l.empresa === '4H').map(l => l.grupo);
  assert.deepEqual(grupos4H, ['Haberes', 'Contribuciones', null]);                    // haberes primero, contribuciones después, sin catalogar al final
  assert.equal(d.lineas.reduce((s, l) => s + (l.nro === '1' ? 1 : 0), 0), 1);        // el legajo 2 no se mezcla
});

test('el valor hora de la hora trabajada sale del motor por tipo de hora; sin horas queda null', () => {
  const con = una([f('4H', 1, '1', 1000, 100), f('4H', 1, '30', 300)]);
  cerca(con.valorHoraTrabajada, 13);        // (1000 + 300 de cargas) / 100 horas
  const sin = una([f('4H', 1, '30', 300)]);
  assert.equal(sin.valorHoraTrabajada, null);
  assert.equal(sin.sinHoras, 300);
});
