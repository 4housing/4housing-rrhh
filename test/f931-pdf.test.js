// Tests del extractor del F.931 con datos SINTÉTICOS (inventados) que imitan la estructura del PDF real.
// node --test test/f931-pdf.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../js/rrhh-f931-pdf.js');

// item(texto, x, y): un fragmento de texto del PDF
const it = (str, x, y, p) => ({ str, x, y, p: p || 1 });
function pdfSintetico(o) {
  const v = Object.assign({ periodo: '03/2027', emp: '12', rem1: '1.000.000,50', ss: '300.000,00', os: '150.000,25',
                            aSS: '90.000,10', aOS: '45.000,05', lrt: '20.000,00', scvo: '1.234,56' }, o || {});
  return [
    it('Mes - Año', 372, 795), it('Orig. (0) - Rect. (1/9):', 459, 795), it('0', 521, 795),
    it(v.periodo, 374, 784), it('Servicios Eventuales:', 459, 784), it('No', 517, 784),
    it('Empleados en nómina:', 355, 774), it(v.emp, 559, 774),
    it('Suma de Rem. 1:', 355, 764), it(v.rem1, 520, 763),                              // el valor está 1 punto más abajo
    it('Suma de Rem. 10:', 355, 665), it('55.555.555,55', 520, 664),                    // distractor: NO es la Rem. 1
    it('a1 -', 20, 643), it('Total de aportes S.S.', 60, 643), it(v.aSS, 230, 643),
    it('a1 -', 300, 643), it('Total de aportes O.S.', 340, 643), it(v.aOS, 500, 643),
    it('b1 -', 20, 599), it('Total de contribuciones', 60, 599), it(v.ss, 230, 599),
    it('b1 -', 300, 599), it('Total de contribuciones', 340, 599), it(v.os, 500, 599),
    it('L.R.T. total a pagar', 20, 429), it(v.lrt, 150, 429), it('S.C.V.O. a Pagar:', 300, 429), it(v.scvo, 460, 429),
  ];
}
const leer = o => F.extraer(F.agruparLineas(pdfSintetico(o)));

test('extrae todos los datos del F.931 (período, empleados, Rem. 1, contribuciones, aportes, LRT, SCVO)', () => {
  const r = leer();
  assert.deepEqual(r, { periodo: '2027-03', empleados: 12, rem1: 1000000.5, contrib_ss: 300000, contrib_os: 150000.25,
                        lrt: 20000, scvo: 1234.56, aportes_ss: 90000.1, aportes_os: 45000.05, faltan: [] });
});

test('el valor de una etiqueta 1 punto más abajo cuenta como la misma línea; «Rem. 10» no se confunde con «Rem. 1»', () => {
  assert.equal(leer().rem1, 1000000.5);
  assert.ok(F.agruparLineas(pdfSintetico()).some(l => l === 'Suma de Rem. 1: 1.000.000,50'));
});

test('el período «MM/AAAA» sale de la línea siguiente a «Mes - Año»', () => {
  assert.equal(leer({ periodo: '12/2026' }).periodo, '2026-12');
});

test('si falta un dato NO se inventa: queda null y se lista en «faltan»', () => {
  const sinLrt = pdfSintetico().filter(i => !/L\.R\.T\.|^20\.000,00$/.test(i.str));
  const r = F.extraer(F.agruparLineas(sinLrt));
  assert.equal(r.lrt, null);
  assert.deepEqual(r.faltan, ['lrt']);
  const vacio = F.extraer(F.agruparLineas([]));
  assert.equal(vacio.faltan.length, 9);
});

test('contribuciones: la primera es S.S. y la segunda O.S.; con una sola, O.S. queda null', () => {
  const una = pdfSintetico().filter(i => !(i.y === 599 && i.x >= 300));
  const r = F.extraer(F.agruparLineas(una));
  assert.equal(r.contrib_ss, 300000);
  assert.equal(r.contrib_os, null);
});

test('numeroAR: formato argentino; rechaza lo que no es un número', () => {
  assert.equal(F.numeroAR('1.234.567,89'), 1234567.89);
  assert.equal(F.numeroAR('0,00'), 0);
  assert.equal(F.numeroAR('12'), 12);
  assert.equal(F.numeroAR('-1.500,50'), -1500.5);
  assert.equal(F.numeroAR('1,234.56'), null);       // formato estadounidense: no se acepta
  assert.equal(F.numeroAR('abc'), null);
  assert.equal(F.numeroAR(null), null);
});

test('agruparLineas: de arriba hacia abajo, de izquierda a derecha, por página', () => {
  const l = F.agruparLineas([it('segunda', 50, 100), it('primera', 10, 200), it('a', 10, 100), it('  ', 5, 100), it('pág 2', 10, 300, 2)]);
  assert.deepEqual(l, ['primera', 'a segunda', 'pág 2']);
});
