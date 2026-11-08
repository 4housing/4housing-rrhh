// Verifica el SQL del catálogo oficial (configuración; sin importes ni datos personales).
// Ejecutar: node --test test/catalogo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const sql = fs.readFileSync(path.join(__dirname, '../sql/rrhh_02_catalogo_conceptos.sql'), 'utf8');
const tok = /'(?:[^']|'')*'|null|true|false/g;
const filas = sql.split('\n').filter(l => /^  \('/.test(l)).map(l => {
  const t = l.match(tok).map(x => (x === 'null' ? null : x === 'true' ? true : x === 'false' ? false : x.slice(1, -1).replace(/''/g, "'")));
  return { nro: t[0], empresa: t[1], descripcion: t[2], grupo: t[3], agrupador: t[4], trata: t[5], es_hora: t[6], tipo_hora: t[7], prorrateo: t[8] };
});
const clave = f => f.nro + '|' + f.empresa;
const por = n => filas.filter(f => f.nro === n);

test('catálogo: 109 conceptos, sin claves (nro, empresa) repetidas', () => {
  assert.equal(filas.length, 109);
  assert.equal(new Set(filas.map(clave)).size, filas.length);
});

test('catálogo: valores permitidos por el esquema oficial', () => {
  for (const f of filas) {
    assert.ok(['4H', '4H_OC'].includes(f.empresa), clave(f));
    assert.ok(f.trata === null || ['costo', 'excluir', 'directo_proyecto', 'cuenta_rrhh', 'retencion'].includes(f.trata), clave(f));
    assert.ok(f.prorrateo === null || ['directo', 'por_horas_pagas', 'por_pago_tipo', 'fijo_mensual', 'cargas'].includes(f.prorrateo), clave(f));
    assert.ok(f.descripcion.trim().length > 0, clave(f));
    if (f.es_hora) {
      assert.equal(f.empresa, '4H', clave(f));
      assert.ok(['trabajada', 'extra50', 'vacaciones', 'feriado', 'enfermedad', 'art', 'justificada', 'otra'].includes(f.tipo_hora), clave(f));
    } else assert.equal(f.tipo_hora, null, clave(f));
  }
});

test('catálogo: 1602 y 6501 NO están (la app debe avisar que faltan)', () => {
  assert.equal(por('1602').length, 0);
  assert.equal(por('6501').length, 0);
});

test('catálogo: tratamientos acordados del handoff §4', () => {
  const trata = (n, e) => filas.find(f => f.nro === n && f.empresa === e).trata;
  for (const n of ['40000', '40001', '40002']) assert.equal(trata(n, '4H'), 'excluir', n);
  assert.equal(trata('55041', '4H_OC'), 'excluir');
  for (const n of ['55015', '55016', '55025']) assert.equal(trata(n, '4H_OC'), 'directo_proyecto', n);
  for (const n of ['55035', '55300', '55302']) assert.equal(trata(n, '4H_OC'), 'cuenta_rrhh', n);
  for (const n of ['20000', '20010', '20030', '20300', '20350', '29800', '29810', '90000']) assert.equal(trata(n, '4H'), 'retencion', n);
  for (const n of ['80000', '80010', '80020', '80030', '80040', '80050', '80100', '80200', '80300']) assert.equal(trata(n, '4H'), 'costo', n);
  assert.equal(trata('99999', '4H'), 'costo');
  assert.equal(trata('99999', '4H_OC'), 'costo');
});

test('catálogo: SAC, bajas y posventa quedan PENDIENTES (trata nula: bloquean el cierre)', () => {
  for (const n of ['10000', '10010', '50000', '50150', '55020', '55029']) assert.equal(por(n)[0].trata, null, n);
});

test('catálogo: prorrateos de §9.1 y sábados por lo liquidado (opción A)', () => {
  const pro = (n, e) => filas.find(f => f.nro === n && f.empresa === e).prorrateo;
  for (const n of ['1100', '1102', '1550', '1600']) assert.equal(pro(n, '4H'), 'por_horas_pagas', n);
  assert.equal(pro('1500', '4H'), 'por_pago_tipo');
  assert.equal(pro('1000', '4H'), 'directo');
  assert.equal(pro('55013', '4H_OC'), 'directo');
  assert.equal(pro('55014', '4H_OC'), 'directo');
  assert.equal(pro('80300', '4H'), 'fijo_mensual');
  assert.equal(pro('80000', '4H'), 'cargas');
});
