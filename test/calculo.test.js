// Tests con datos SINTÉTICOS (inventados). Nunca pegar acá datos reales de sueldos.
// Ejecutar: node --test test/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const C = require('../js/rrhh-calculo.js');

const cat = (nro, empresa, o) => ({ nro_concepto: nro, empresa, es_hora: false, ...o });
const CATALOGO = [
  cat(1, '4H', { grupo_sistema: 'Haberes', trata: 'costo', es_hora: true, hora_productiva: true, tipo_hora: 'trabajada' }),
  cat(2, '4H', { grupo_sistema: 'Haberes', trata: 'costo', es_hora: true, hora_productiva: false, tipo_hora: 'vacaciones' }),
  cat(3, '4H', { grupo_sistema: 'Haberes', trata: 'costo' }),
  cat(10, '4H', { grupo_sistema: 'Retenciones', trata: 'retencion' }),
  cat(20, '4H', { grupo_sistema: 'No Remunerativo', trata: 'costo' }),
  cat(21, '4H', { grupo_sistema: 'No Remunerativo', trata: 'excluir' }),        // adelanto
  cat(30, '4H', { grupo_sistema: 'Contribuciones', trata: 'costo' }),
  cat(100, '4H_OC', { trata: 'costo', prorrateo: 'directo' }),                 // sábado
  cat(101, '4H_OC', { trata: 'costo' }),
  cat(102, '4H_OC', { trata: 'directo_proyecto' }),                            // bono montaje
  cat(103, '4H_OC', { trata: 'cuenta_rrhh' }),                                 // combo
  cat(104, '4H_OC', { trata: 'excluir' }),                                     // adelanto copart.
  cat(105, '4H_OC', { trata: null }),                                          // sin definir
];
const f = (empresa, legajo, nro, importe, extra) =>
  ({ empresa, legajo, tipo_liquidacion: 'Mensual', nro_concepto: nro, importe, cantidad: 0, ...extra });

test('§5: neto, cargas y costo 4H con adelantos excluidos', () => {
  const r = C.calcularPeriodo([
    f('4H', 1, 1, 1000, { cantidad: 80 }), f('4H', 1, 10, -170), f('4H', 1, 20, 100),
    f('4H', 1, 21, -50), f('4H', 1, 30, 300),
  ], CATALOGO).legajos[1];
  assert.equal(r.netoAcreditado, 880);   // 1000 - 170 + (100 - 50): incluye el adelanto
  assert.equal(r.cargas, 470);           // 170 + 300
  assert.equal(r.costo4H, 1400);         // 1000 + 100 + 300 (sin adelanto)
  // identidad del handoff: costo = neto sin adelantos + cargas
  assert.equal(r.costo4H, r.netoAcreditado + 50 + r.cargas);
  assert.equal(r.noRemTotal - r.noRem, -50);
});

test('la clave incluye el tipo de liquidación: mismo concepto en dos quincenas se suma', () => {
  const r = C.calcularPeriodo([
    f('4H', 1, 21, -125, { tipo_liquidacion: 'Primera Quincena' }),
    f('4H', 1, 21, -125, { tipo_liquidacion: 'Segunda Quincena' }),
  ], CATALOGO).legajos[1];
  assert.equal(r.noRemTotal, -250);
  assert.equal(r.noRem, 0);
});

test('OC: bono, directo a proyecto, cuenta RRHH y excluidos quedan separados', () => {
  const res = C.calcularPeriodo([
    f('4H', 1, 1, 1000), f('4H', 1, 30, 300),
    f('4H_OC', 1, 100, 200), f('4H_OC', 1, 101, 50), f('4H_OC', 1, 102, 70),
    f('4H_OC', 1, 103, -25), f('4H_OC', 1, 104, -10),
  ], CATALOGO);
  const r = res.legajos[1];
  assert.equal(r.bono, 250);
  assert.equal(r.directoOC, 200);        // sábados: se imputan directo (opción A)
  assert.equal(r.bonoDirecto, 70);
  assert.equal(r.cuentaRRHH, -25);
  assert.equal(r.excluidosOC, -10);
  assert.equal(r.cuesta, 1300 + 250);    // sin bono montaje, sin combo, sin adelanto
  assert.equal(r.cobra, 1000 + 250);     // fórmula literal §5 (A DEFINIR si incluye montaje)
  assert.deepEqual(C.controlBono(r), { diferencia: 0, ok: true });
  assert.ok(res.cerrable);
});

test('concepto sin catalogar o sin trata bloquea el cierre y rompe el control de bono', () => {
  const res = C.calcularPeriodo([
    f('4H_OC', 1, 101, 50), f('4H_OC', 1, 999, 40), f('4H_OC', 1, 105, 30),
    f('4H', 1, 888, 5),
  ], CATALOGO);
  assert.equal(res.cerrable, false);
  assert.deepEqual(res.alertas.sinCatalogar.map(a => a.nro_concepto).sort(), [888, 999]);
  assert.deepEqual(res.alertas.sinTrata.map(a => a.nro_concepto), [105]);
  const b = C.controlBono(res.legajos[1]);
  assert.equal(b.ok, false);
  assert.equal(b.diferencia, 70);        // 40 sin catalogar + 30 sin trata
});

test('catálogo con la misma clave nro en otra empresa no se confunde', () => {
  const cat2 = [cat(99999, '4H', { grupo_sistema: 'No Remunerativo', trata: 'costo' }),
                cat(99999, '4H_OC', { trata: 'costo' })];
  const r = C.calcularPeriodo([f('4H', 1, 99999, 1), f('4H_OC', 1, 99999, 2)], cat2).legajos[1];
  assert.equal(r.noRem, 1);
  assert.equal(r.bono, 2);
});

test('§6: horas por tipo, valor hora de producción y por hora paga', () => {
  const r = C.calcularPeriodo([
    f('4H', 1, 1, 1000, { cantidad: 80 }), f('4H', 1, 2, 500, { cantidad: 40 }), f('4H', 1, 30, 100),
  ], CATALOGO).legajos[1];
  assert.deepEqual(r.horasPorTipo, { trabajada: 80, vacaciones: 40 });
  assert.equal(r.horasPagas, 120);
  assert.equal(r.horasProductivas, 80);
  assert.equal(r.cuesta, 1600);
  assert.equal(r.valorHoraProduccion, 20);                 // se dispara con ausencias
  assert.ok(Math.abs(r.valorHoraPaga - 1600 / 120) < 1e-9);
  assert.deepEqual(C.controlHoras(r, 120), { diferencia: 0, ok: true });
  assert.equal(C.controlHoras(r, 125).ok, false);
});

test('cero horas productivas: valor hora de producción no existe (null), no Infinity', () => {
  const r = C.calcularPeriodo([f('4H', 1, 2, 500, { cantidad: 40 })], CATALOGO).legajos[1];
  assert.equal(r.valorHoraProduccion, null);
  assert.ok(r.valorHoraPaga > 0);
});

test('importes en centavos: sin deriva de punto flotante', () => {
  const r = C.calcularPeriodo([f('4H', 1, 3, 0.1), f('4H', 1, 3, 0.2)], CATALOGO).legajos[1];
  assert.equal(r.haberes, 0.3);
});

test('porcentaje de cargas: null si el denominador es 0', () => {
  const r = C.calcularPeriodo([f('4H', 1, 30, 10)], CATALOGO).legajos[1];
  assert.equal(r.pctCcssCosto, 1);      // cargas 10 / costo 10
  assert.equal(r.pctCcssNeto, null);    // neto 0
});

test('§7.4 período: faltan informes o períodos distintos', () => {
  const ok = [['4H', 'resumen'], ['4H_OC', 'resumen'], ['4H', 'novedades'], ['4H_OC', 'novedades']]
    .map(([empresa, tipo]) => ({ empresa, tipo, periodo: new Date(Date.UTC(2026, 9, 1)) }));
  assert.equal(C.controlPeriodo(ok).ok, true);
  assert.deepEqual(C.controlPeriodo(ok.slice(1)).faltan, ['4H resumen']);
  const mezcla = ok.map((i, n) => (n === 0 ? { ...i, periodo: '2026-09-01' } : i));
  assert.equal(C.controlPeriodo(mezcla).ok, false);
  assert.equal(C.periodoDe('2026-10'), '2026-10');
});

test('§7.5 F.931: coincide, difiere y tolerancia configurable', () => {
  const cat3 = [
    cat(1, '4H', { grupo_sistema: 'Haberes', trata: 'costo' }),
    cat(80050, '4H', { grupo_sistema: 'Contribuciones', trata: 'costo' }),
    cat(80200, '4H', { grupo_sistema: 'Contribuciones', trata: 'costo' }),
    cat(80100, '4H', { grupo_sistema: 'Contribuciones', trata: 'costo' }),
    cat(80000, '4H', { grupo_sistema: 'Contribuciones', trata: 'costo' }),
  ];
  const filas = [
    f('4H', 1, 1, 1000), f('4H', 2, 1, 500),
    f('4H', 1, 80050, 60), f('4H', 1, 80200, 2), f('4H', 1, 80100, 30),
    f('4H', 1, 80000, 100.5), f('4H', 2, 80000, 50),
  ];
  const f931 = { remuneracion_1: 1500, contrib_os: 60.02, scvo: 2, lrt: 31, contrib_ss: 150.5, empleados: 2 };
  const r = C.controlF931(filas, cat3, f931, { tolerancia: 0.05 });
  const por = Object.fromEntries(r.lineas.map(l => [l.clave, l]));
  assert.equal(por.remuneracion_1.ok, true);
  assert.equal(por.contrib_os.ok, true);          // 0,02 dentro de tolerancia
  assert.equal(por.lrt.ok, false);
  assert.equal(por.lrt.diferencia, -1);
  assert.equal(r.empleados.ok, true);
  assert.equal(r.ok, false);
  assert.deepEqual(r.sinCatalogar, []);
  assert.equal(C.controlF931(filas, cat3, f931, { tolerancia: 5 }).ok, true);
  // un concepto sin catalogar invalida el control aunque las sumas parezcan cerrar
  const conHueco = C.controlF931([...filas, f('4H', 1, 777, 10)], cat3, f931, { tolerancia: 5 });
  assert.deepEqual(conHueco.sinCatalogar, [777]);
  assert.equal(conHueco.ok, false);
  assert.equal(C.controlF931(filas, cat3, { ...f931, empleados: 3 }, { tolerancia: 5 }).ok, false);
});

test('seed del catálogo: sin claves duplicadas y con valores válidos', () => {
  const sql = fs.readFileSync(path.join(__dirname, '../sql/03_rrhh_catalogo_seed.sql'), 'utf8');
  const filas = [...sql.matchAll(/^\s*\((\d+),'(4H|4H_OC)',([^)]*)\)/gm)];
  assert.ok(filas.length > 40);
  const claves = new Set();
  for (const m of filas) {
    const k = m[1] + '|' + m[2];
    assert.ok(!claves.has(k), 'duplicado ' + k);
    claves.add(k);
    const tratas = m[3].match(/'(costo|excluir|directo_proyecto|cuenta_rrhh|retencion)'/g) || [];
    assert.ok(tratas.length <= 1, 'trata ambigua en ' + k);
  }
  // 1602 y 6501 deben seguir sin catalogar (la app tiene que frenar el cierre)
  assert.ok(!claves.has('1602|4H') && !claves.has('6501|4H'));
});
