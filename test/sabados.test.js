// Tests del control de sábados / fin de semana pagados por OC. Datos SINTÉTICOS. node --test test/sabados.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../js/rrhh-sabados.js');

// Octubre 2026: sábados 3, 10, 17, 24, 31. Domingos 4, 11, 18, 25. (martes 6)
const nov = (legajo, fecha, cod, empresa) => ({ empresa: empresa || '4H_OC', legajo, fecha, cod_novedad: cod || 'SABADO', cantidad: 1 });

test('sin planificación no se puede comparar: avisa y pide validar (no acusa error)', () => {
  const r = S.controlSabados([nov(1, '2026-10-10'), nov(1, '2026-10-24'), nov(2, '2026-10-10')]);
  assert.equal(r.estado, 'sin_planificacion');
  assert.equal(r.comparable, false);
  assert.equal(r.resumen.diasPagados, 3);
  assert.equal(r.resumen.legajos, 2);
  assert.match(r.mensajes[0], /3 día\(s\).*2 legajo\(s\).*validar/s);
  assert.match(r.mensajes[0], /fichada y la autorización del supervisor/);
});

test('pagado y NO planificado: queda «a validar» con el legajo y las fechas, y aclara que puede estar bien', () => {
  const r = S.controlSabados([nov(1, '2026-10-10'), nov(1, '2026-10-24')], { 1: ['2026-10-10', '2026-10-06'] });
  assert.equal(r.estado, 'a_validar');
  assert.deepEqual(r.porLegajo[1].pagadosSinPlanificar, ['2026-10-24']);
  assert.equal(r.porLegajo[1].estado, 'a_validar');
  assert.equal(r.mensajes.length, 1);
  assert.match(r.mensajes[0], /Legajo 1: 1 día\(s\) pagado\(s\) por OC que NO figuran en la planificación \(2026-10-24\)/);
  assert.match(r.mensajes[0], /Puede estar bien \(manda la fichada y la autorización del supervisor\)/);
});

test('pagado y planificado: ok, sin mensajes', () => {
  const r = S.controlSabados([nov(1, '2026-10-10')], { 1: ['2026-10-10', '2026-10-13'] });
  assert.equal(r.estado, 'ok');
  assert.deepEqual(r.mensajes, []);
  assert.equal(r.porLegajo[1].estado, 'ok');
});

test('fin de semana planificado y NO pagado: a validar (los días hábiles planificados no cuentan)', () => {
  const r = S.controlSabados([], { 5: ['2026-10-17', '2026-10-18', '2026-10-19'] });   // sáb, dom, lun
  assert.deepEqual(r.porLegajo[5].planificadosSinPagar, ['2026-10-17', '2026-10-18']);
  assert.equal(r.estado, 'a_validar');
  assert.match(r.mensajes[0], /Legajo 5: 2 día\(s\) de fin de semana planificado\(s\) que NO figuran pagados/);
});

test('las extras de fin de semana (HRSEX1) también cuentan, y una fecha repetida cuenta una sola vez', () => {
  const r = S.controlSabados([nov(1, '2026-10-17', 'SABADO'), nov(1, '2026-10-17', 'HRSEX1'), nov(1, '2026-10-17', 'HRSEX1')], { 1: [] });
  assert.deepEqual(r.porLegajo[1].pagados, ['2026-10-17']);
  assert.equal(r.resumen.diasPagados, 1);
});

test('novedad SABADO en una fecha que no es sábado: se avisa para revisar la fecha', () => {
  const r = S.controlSabados([nov(1, '2026-10-06')], { 1: ['2026-10-06'] });           // martes
  assert.deepEqual(r.porLegajo[1].fechasQueNoSonSabado, ['2026-10-06']);
  assert.equal(r.estado, 'a_validar');
  assert.match(r.mensajes.join(' '), /no es sábado/);
});

test('se ignoran otra empresa y otros códigos; sin nada pagado ni planificado queda ok', () => {
  const r = S.controlSabados([nov(1, '2026-10-10', 'SABADO', '4H'), nov(1, '2026-10-10', 'HSTRA'), nov(1, '2026-10-10', 'BRUTO')], {});
  assert.equal(r.estado, 'ok');
  assert.equal(r.resumen.diasPagados, 0);
  assert.equal(S.controlSabados([]).estado, 'ok');
});

test('los mensajes hablan de legajos, nunca de nombres', () => {
  const r = S.controlSabados([nov(7, '2026-10-10')], { 7: [] });
  assert.ok(r.mensajes.every(m => /^Legajo \d+/.test(m)));
});
