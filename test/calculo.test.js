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

test('catálogo oficial (sin hora_productiva): se deduce del tipo de hora', () => {
  const cat4 = [
    cat(1, '4H', { grupo_sistema: 'Haberes', trata: 'costo', es_hora: true, tipo_hora: 'trabajada' }),
    cat(2, '4H', { grupo_sistema: 'Haberes', trata: 'costo', es_hora: true, tipo_hora: 'extra50' }),
    cat(3, '4H', { grupo_sistema: 'Haberes', trata: 'costo', es_hora: true, tipo_hora: 'vacaciones' }),
  ];
  const r = C.calcularPeriodo([f('4H', 1, 1, 100, { cantidad: 8 }), f('4H', 1, 2, 30, { cantidad: 2 }), f('4H', 1, 3, 50, { cantidad: 4 })], cat4).legajos[1];
  assert.equal(r.horasProductivas, 10);
  assert.equal(r.horasPagas, 14);
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

// ---- Líneas propias: aguinaldo y bajas (decisión de administración) ----
const CATL = [
  { nro_concepto: '1', empresa: '4H', grupo_sistema: 'Haberes', trata: 'costo', es_hora: true, tipo_hora: 'trabajada' },
  { nro_concepto: '30', empresa: '4H', grupo_sistema: 'Contribuciones', trata: 'costo' },
  { nro_concepto: '10', empresa: '4H', grupo_sistema: 'Retenciones', trata: 'retencion' },
  { nro_concepto: '50', empresa: '4H', grupo_sistema: 'Haberes', trata: null },                    // p.ej. vacaciones no gozadas: sin tratamiento propio
  { nro_concepto: '20', empresa: '4H', grupo_sistema: 'No Remunerativo', trata: 'excluir' },
  { nro_concepto: '100', empresa: '4H_OC', grupo_sistema: 'No Remunerativo', trata: 'costo' },
  { nro_concepto: '101', empresa: '4H_OC', grupo_sistema: 'No Remunerativo', trata: null, linea: 'bajas' },   // gratificación final, viene por OC
];
const fl = (empresa, nro, importe, tipo, cantidad) => ({ empresa, legajo: 1, tipo_liquidacion: tipo || 'Mensual', nro_concepto: nro, importe, cantidad: cantidad || 0 });

test('liquidación «Bajas»: cuenta como costo y como cobro, va a su línea, no entra al costo corriente y no frena el cierre', () => {
  const r = C.calcularPeriodo([
    fl('4H', '1', 1000, 'Mensual', 100), fl('4H', '30', 300, 'Mensual'),
    fl('4H', '50', 100, 'Bajas'), fl('4H', '10', -10, 'Bajas'), fl('4H', '30', 30, 'Bajas'),
  ], CATL);
  const l = r.legajos[1];
  assert.equal(r.cerrable, true);                       // el concepto 50 no tiene tratamiento, pero va en una liquidación de bajas
  assert.deepEqual(r.alertas.sinTrata, []);
  assert.equal(l.netoAcreditado, 1000 + 100 - 10);      // lo que se acredita incluye la baja
  assert.equal(l.cargas, 10 + 300 + 30);
  assert.equal(l.costo4H, 1300);                        // corriente: sin la baja
  assert.equal(l.lineas.bajas, 130);                    // haberes 100 + contribuciones 30; la retención no es costo
  assert.equal(l.lineas.aguinaldo, 0);
  assert.equal(l.cuesta, 1300);
  assert.equal(l.cuestaConLineas, 1430);
  assert.equal(l.horasPagas, 100);                      // las horas de la baja no se cuentan
});

test('liquidación «Aguinaldo» va a su propia línea', () => {
  const l = C.calcularPeriodo([fl('4H', '1', 1000, 'Mensual', 100), fl('4H', '50', 500, 'Aguinaldo')], CATL).legajos[1];
  assert.equal(l.lineas.aguinaldo, 500);
  assert.equal(l.lineas.bajas, 0);
  assert.equal(l.costo4H, 1000);
});

test('concepto OC con línea en el catálogo (gratificación final) va a su línea aunque venga en una quincena', () => {
  const l = C.calcularPeriodo([fl('4H_OC', '100', 250, 'Segunda Quincena'), fl('4H_OC', '101', 400, 'Segunda Quincena')], CATL).legajos[1];
  assert.equal(l.bono, 250);                            // OC corriente
  assert.equal(l.lineas.bajas, 400);
  assert.equal(l.totalOC, 650);                         // lo cobrado por OC incluye todo
  assert.equal(l.cuestaConLineas, 650);
});

test('en una liquidación de bajas se respeta lo explícito (adelanto excluido) y un concepto sin catalogar sigue frenando', () => {
  const r = C.calcularPeriodo([fl('4H', '20', -50, 'Bajas'), fl('4H', '777', 5, 'Bajas')], CATL);
  assert.equal(r.legajos[1].lineas.bajas, 0);
  assert.deepEqual(r.alertas.sinCatalogar.map(a => a.nro_concepto), ['777']);
  assert.equal(r.cerrable, false);
});

// ---- Control F.931: líneas informativas ----
test('F.931: los aportes (retenciones) y la referencia sin ANSSAL son informativos y no bloquean', () => {
  const cat3 = [
    { nro_concepto: '1', empresa: '4H', grupo_sistema: 'Haberes', trata: 'costo' },
    { nro_concepto: '20000', empresa: '4H', grupo_sistema: 'Retenciones', trata: 'retencion' },
    { nro_concepto: '20010', empresa: '4H', grupo_sistema: 'Retenciones', trata: 'retencion' },
    { nro_concepto: '20030', empresa: '4H', grupo_sistema: 'Retenciones', trata: 'retencion' },
    { nro_concepto: '80000', empresa: '4H', grupo_sistema: 'Contribuciones', trata: 'costo' },
    { nro_concepto: '80040', empresa: '4H', grupo_sistema: 'Contribuciones', trata: 'costo' },
    { nro_concepto: '80050', empresa: '4H', grupo_sistema: 'Contribuciones', trata: 'costo' },
    { nro_concepto: '80100', empresa: '4H', grupo_sistema: 'Contribuciones', trata: 'costo' },
    { nro_concepto: '80200', empresa: '4H', grupo_sistema: 'Contribuciones', trata: 'costo' },
  ];
  const filas = [['1', 1000], ['20000', -80], ['20010', -20], ['20030', -30], ['80000', 200], ['80040', 50], ['80050', 60], ['80100', 40], ['80200', 2]]
    .map(([n, imp]) => ({ empresa: '4H', legajo: 1, tipo_liquidacion: 'Mensual', nro_concepto: n, importe: imp, cantidad: 0 }));
  // F.931 que coincide en lo que importa, pero con aportes distintos y contribuciones S.S. = 200 (sin ANSSAL)
  const r = C.controlF931(filas, cat3, { remuneracion_1: 1000, contrib_ss: 200, contrib_os: 60, lrt: 40, scvo: 2, aportes_ss: 90, aportes_os: 31, empleados: 1 }, { tolerancia: 0.5 });
  const por = Object.fromEntries(r.lineas.map(l => [l.clave, l]));
  assert.equal(por.contrib_ss.ok, false);                // con ANSSAL (250) difiere de 200
  assert.equal(por.contrib_ss_sin_anssal.liquidacion, 200);
  assert.equal(por.contrib_ss_sin_anssal.ok, true);      // sin ANSSAL coincide
  assert.equal(por.contrib_ss_sin_anssal.informativo, true);
  assert.equal(por.aportes_ss.liquidacion, 100);         // 80 + 20, en positivo
  assert.equal(por.aportes_ss.diferencia, 10);
  assert.equal(por.aportes_os.diferencia, -1);
  assert.equal(r.ok, false);                             // bloquea por contrib_ss, no por las informativas
  const sinContrib = C.controlF931(filas, cat3, { remuneracion_1: 1000, contrib_ss: 250, contrib_os: 60, lrt: 40, scvo: 2, aportes_ss: 1, aportes_os: 1, empleados: 1 }, { tolerancia: 0.5 });
  assert.equal(sinContrib.ok, true);                     // aportes muy distintos pero informativos: no bloquean
});

test('bono de proyecto abierto por tipo según la descripción del concepto (montaje, posventa, otro)', () => {
  const C = require('../js/rrhh-calculo.js');
  const cat = [
    { nro_concepto: '9001', empresa: '4H_OC', descripcion: 'Bono Montaje - X', grupo_sistema: 'No Remunerativo', trata: 'directo_proyecto' },
    { nro_concepto: '9002', empresa: '4H_OC', descripcion: 'Bono Posventa - X', grupo_sistema: 'No Remunerativo', trata: 'directo_proyecto' },
    { nro_concepto: '9003', empresa: '4H_OC', descripcion: 'Bono Otro', grupo_sistema: 'No Remunerativo', trata: 'directo_proyecto' },
  ];
  const filas = [['9001', 100], ['9002', 40], ['9003', 7]].map(([n, i]) => ({ empresa: '4H_OC', legajo: 1, tipo_liquidacion: 'Mensual', nro_concepto: n, importe: i, cantidad: 0 }));
  const r = C.calcularPeriodo(filas, cat).legajos[1];
  assert.deepEqual(r.bonoTipo, { montaje: 100, posventa: 40, otro: 7 });
  assert.equal(r.bonoDirecto, 147);
});
