/* ==========================================================================
   RRHH · lectura del F.931 (declaración jurada) desde el PDF. Sin DOM propio: el PDF se lee en el navegador
   y NO se sube a ningún lado; solo se guardan los valores que se confirman en pantalla (tabla rrhh_f931).

   Pasos: items de texto del PDF (pdf.js) → líneas (agrupando por altura con tolerancia: el valor de una etiqueta suele
   estar 1 punto más abajo) → regex por etiqueta. Si falta algún dato, la pantalla deja completarlo a mano: el extractor
   nunca inventa un valor.

   Datos (handoff §3.4): período, empleados en nómina, Suma de Rem. 1, contribuciones S.S. y O.S., L.R.T. total,
   seguro colectivo de vida (SCVO), aportes S.S. y O.S.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHF931Pdf = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TOLERANCIA_Y = 3;     // puntos del PDF

  /** [{str, x, y, p?}] → líneas de texto, de arriba hacia abajo (por página) y de izquierda a derecha. */
  function agruparLineas(items) {
    const utiles = (items || []).filter(i => i && String(i.str).trim() !== '');
    const porPagina = new Map();
    for (const i of utiles) { const p = i.p || 1; if (!porPagina.has(p)) porPagina.set(p, []); porPagina.get(p).push(i); }
    const lineas = [];
    for (const p of [...porPagina.keys()].sort((a, b) => a - b)) {
      const orden = porPagina.get(p).slice().sort((a, b) => b.y - a.y || a.x - b.x);
      let actual = null;
      for (const i of orden) {
        if (actual && Math.abs(actual.y - i.y) <= TOLERANCIA_Y) actual.items.push(i);
        else { actual = { y: i.y, items: [i] }; lineas.push(actual); }
      }
    }
    return lineas.map(l => l.items.sort((a, b) => a.x - b.x).map(i => String(i.str).trim()).join(' ').replace(/\s+/g, ' '));
  }

  /** '1.234.567,89' → 1234567.89 (formato argentino). null si no es un número válido. */
  function numeroAR(s) {
    if (s == null) return null;
    const t = String(s).trim();
    if (!/^-?\d{1,3}(\.\d{3})*(,\d+)?$|^-?\d+(,\d+)?$/.test(t)) return null;
    const n = Number(t.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }

  const NUM = '(-?[\\d.]+(?:,\\d+)?)';
  const un = (texto, re) => { const m = re.exec(texto); return m ? numeroAR(m[1]) : null; };

  /** líneas → { periodo:'AAAA-MM', empleados, rem1, contrib_ss, contrib_os, lrt, scvo, aportes_ss, aportes_os, faltan:[…] } */
  function extraer(lineas) {
    const texto = (lineas || []).join('\n');
    // Período: el valor «MM/AAAA» está en la misma línea de «Mes - Año» o en la siguiente
    let periodo = null;
    const i = (lineas || []).findIndex(l => /Mes\s*-\s*A.o/i.test(l));
    if (i >= 0) {
      for (const l of lineas.slice(i, i + 3)) {
        const m = /\b(0[1-9]|1[0-2])\/(20\d{2})\b/.exec(l);
        if (m) { periodo = m[2] + '-' + m[1]; break; }
      }
    }
    const contrib = [...texto.matchAll(new RegExp('b1\\s*-\\s*Total de contribuciones\\s+' + NUM, 'g'))].map(m => numeroAR(m[1]));
    const out = {
      periodo,
      empleados: un(texto, /Empleados en n.mina:\s+(\d+)/),
      rem1: un(texto, new RegExp('Suma de Rem\\. 1:\\s+' + NUM)),
      contrib_ss: contrib.length > 0 ? contrib[0] : null,        // el bloque I (Seguridad Social) está primero…
      contrib_os: contrib.length > 1 ? contrib[1] : null,        // …y el II (Obras Sociales) después, en la misma fila
      lrt: un(texto, new RegExp('L\\.R\\.T\\. total a pagar\\s+' + NUM)),
      scvo: un(texto, new RegExp('S\\.C\\.V\\.O\\. a Pagar:\\s+' + NUM)),
      aportes_ss: un(texto, new RegExp('a1\\s*-\\s*Total de aportes S\\.S\\.\\s+' + NUM)),
      aportes_os: un(texto, new RegExp('a1\\s*-\\s*Total de aportes O\\.S\\.\\s+' + NUM)),
    };
    out.faltan = ['periodo', 'empleados', 'rem1', 'contrib_ss', 'contrib_os', 'lrt', 'scvo', 'aportes_ss', 'aportes_os'].filter(k => out[k] == null);
    return out;
  }

  /** Lee un PDF con pdf.js (pdfjsLib) y devuelve lo extraído. `file` puede ser File/Blob o ArrayBuffer. */
  async function leerPdf(file, pdfjsLib) {
    const buf = file.arrayBuffer ? await file.arrayBuffer() : file;
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    const items = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const tc = await (await doc.getPage(p)).getTextContent();
      for (const it of tc.items) items.push({ p, str: it.str, x: it.transform[4], y: it.transform[5] });
    }
    return extraer(agruparLineas(items));
  }

  return { agruparLineas, extraer, numeroAR, leerPdf };
});
