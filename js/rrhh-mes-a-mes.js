/* ==========================================================================
   RRHH · «Costo por mes»: matriz empleado × mes. Sin DOM.
   Toma el informe de cada mes (rrhh-informe-costo.js → construir) y arma una tabla con una persona por fila,
   un mes por columna y el total de la fila. Opcionalmente agrupa por departamento (con subtotal).
   Medidas (de qué columna del informe del mes sale cada número):
     costo      cuestaTotal  = lo que cuesta a la empresa (4H + OC + aguinaldo + bajas + bono de proyecto)
     cobrado    cobra        = lo que la persona recibe en el bolsillo (neto 4H + todo lo liquidado por OC)
     cobrado4h  neto4H       = lo acreditado por el recibo 4H
     cobradooc  ocTotal      = todo lo liquidado por OC (incluye bono y descuentos, p. ej. Combo Hogar)
   Todas las sumas se hacen en centavos enteros para que el total cierre exacto.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHMesAMes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MEDIDAS = {
    costo: { campo: 'cuestaTotal', titulo: 'Total costo' },
    cobrado: { campo: 'cobra', titulo: 'Total cobrado' },
    cobrado4h: { campo: 'neto4H', titulo: 'Cobrado por 4H (recibo)' },
    cobradooc: { campo: 'ocTotal', titulo: 'Cobrado por 4H OC' },
  };
  const SIN_DEPTO = '(sin departamento)';
  const cent = x => Math.round((Number(x) || 0) * 100);

  /**
   * informes: { 'AAAA-MM': informe } (salida de Informe.construir) · periodos: lista de 'AAAA-MM' a mostrar
   * opciones: { medida:'costo'|…, porDepto:bool, depto:'' | nombre, texto:'' }
   * → { periodos, medida, filas:[{legajo,nombre,departamento,meses:{p:$},total}], grupos:[{departamento,filas,meses,total}]|null, totales:{meses,total,personas} }
   */
  function matriz(informes, periodos, opciones) {
    const o = Object.assign({ medida: 'costo', porDepto: false, depto: '', texto: '' }, opciones || {});
    const m = MEDIDAS[o.medida];
    if (!m) throw new Error('medida desconocida: ' + o.medida);
    const ps = (periodos || []).slice().sort();
    const personas = new Map();
    for (const p of ps) {
      const inf = informes[p]; if (!inf) continue;
      for (const f of inf.filas) {
        let x = personas.get(f.legajo);
        if (!x) { x = { legajo: f.legajo, nombre: null, departamento: null, c: {} }; personas.set(f.legajo, x); }
        x.nombre = f.nombre || x.nombre;                               // lo más reciente gana (los períodos van de más viejo a más nuevo)
        x.departamento = f.departamento || x.departamento;
        x.c[p] = (x.c[p] || 0) + cent(f[m.campo]);
      }
    }
    const t = (o.texto || '').trim().toLowerCase();
    const lista = [...personas.values()]
      .filter(x => (!o.depto || (x.departamento || SIN_DEPTO) === o.depto)
        && (!t || String(x.legajo).includes(t) || (x.nombre || '').toLowerCase().includes(t)))
      .sort((a, b) => String(a.nombre || '￿').localeCompare(String(b.nombre || '￿'), 'es') || a.legajo - b.legajo);
    const suma = fs => {
      const meses = {}; let total = 0;
      for (const p of ps) { meses[p] = fs.reduce((s, x) => s + (x.c[p] || 0), 0); total += meses[p]; }
      return { meses, total };
    };
    const aPesos = r => ({ meses: Object.fromEntries(Object.entries(r.meses).map(([k, v]) => [k, v / 100])), total: r.total / 100 });
    const fila = x => Object.assign({ legajo: x.legajo, nombre: x.nombre, departamento: x.departamento },
      aPesos({ meses: Object.fromEntries(ps.map(p => [p, x.c[p] || 0])), total: ps.reduce((s, p) => s + (x.c[p] || 0), 0) }),
      { presentes: ps.filter(p => x.c[p] !== undefined) });
    const filas = lista.map(fila);
    let grupos = null;
    if (o.porDepto) {
      const mapa = new Map();
      for (const x of lista) { const d = x.departamento || SIN_DEPTO; if (!mapa.has(d)) mapa.set(d, []); mapa.get(d).push(x); }
      grupos = [...mapa.keys()].sort((a, b) => (a === SIN_DEPTO) - (b === SIN_DEPTO) || a.localeCompare(b, 'es'))
        .map(d => Object.assign({ departamento: d, filas: mapa.get(d).map(fila) }, aPesos(suma(mapa.get(d)))));
    }
    return { periodos: ps, medida: o.medida, titulo: m.titulo, filas, grupos, totales: Object.assign({ personas: lista.length }, aPesos(suma(lista))) };
  }

  /** Departamentos que aparecen en algún mes (para el filtro). */
  function departamentos(informes, periodos) {
    const s = new Set();
    for (const p of periodos || []) for (const f of ((informes[p] || {}).filas || [])) s.add(f.departamento || SIN_DEPTO);
    return [...s].sort((a, b) => (a === SIN_DEPTO) - (b === SIN_DEPTO) || a.localeCompare(b, 'es'));
  }

  return { matriz, departamentos, MEDIDAS, SIN_DEPTO };
});
