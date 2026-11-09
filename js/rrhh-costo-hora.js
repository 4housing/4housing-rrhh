/* ==========================================================================
   RRHH · costo por tipo de hora (handoff §9.0 y §9.1). Sin dependencias ni DOM.
   Reparte el COSTO de cada persona entre sus tipos de hora (trabajada, vacaciones,
   feriado, ausencias) para obtener el valor hora que se imputa a proyectos.

   Reglas (todas salen de las banderas del catálogo; la app no decide por el nombre):
   · Solo entra lo que tiene trata = 'costo'. El Bono Montaje (directo_proyecto), el Combo Hogar
     (cuenta_rrhh), los adelantos (excluir) y las retenciones quedan afuera.
   · es_hora            → pago DIRECTO de su tipo de hora (1000 trabajada, 1490 vacaciones, 1010 feriado, ...).
   · por_horas_pagas    → 1100, 1102, 1600, 1550: se reparte por HORAS entre todos los tipos MENOS las horas extra.
                          Verificado con los 20 operarios de octubre: la cantidad del 1100 = horas de todos los tipos
                          sin las extras (trabajadas + vacaciones + feriado + ausencias).
   · por_pago_tipo      → 1500 antigüedad (4% sobre 1000 + 1010 + 1490): se reparte por el PAGO de trabajada,
                          feriado y vacaciones (sin extras ni ausencias).
   · fijo_mensual       → pagos fijos (compensación/gratificación no remunerativa, coparticipación, seguro sindical):
                          van con las horas TRABAJADAS (variante i, decidida por administración).
   · cargas             → contribuciones patronales: proporcionales a lo REMUNERATIVO asignado a cada tipo de hora.
   · prorrateo 'directo' sin hora (Sábado Taller, extras OC) → NO entra al valor hora: se informa aparte, se imputa
                          por lo realmente liquidado (opción A).
   · trata = 'costo' sin prorrateo → «sin regla»: se reparte como por_horas_pagas y se LISTA para que se decida.
   · Lo que no tiene horas donde repartirse (mensualizados, mes entero de ART, pagos fijos sin horas trabajadas)
     queda en «sinHoras»: es costo real sin valor hora.
   Siempre: Σ costo por tipo + sinHoras + directoFinDeSemana = costo total de la persona (control exacto en centavos).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rrhh-calculo.js'));
  else root.RRHHCostoHora = factory(root.RRHHCalculo);
})(typeof self !== 'undefined' ? self : this, function (Calc) {
  'use strict';

  const cents = x => Math.round((Number(x) || 0) * 100);
  const pesos = c => c / 100;
  const TIPOS = ['trabajada', 'extra50', 'vacaciones', 'feriado', 'enfermedad', 'art', 'justificada', 'otra'];
  // Tipos de hora que se valorizan para proyectos (las extras se suman a la trabajada al informar).
  const BASE_ANTIGUEDAD = ['trabajada', 'feriado', 'vacaciones'];

  function indexar(catalogo) {
    if (catalogo instanceof Map) return catalogo;
    const m = new Map();
    for (const c of catalogo || []) m.set(String(c.nro_concepto) + '|' + c.empresa, c);
    return m;
  }

  /** Reparte `pool` (centavos) en proporción a `pesos` {clave: número}. Devuelve {clave: centavos (float)} o null si no hay base. */
  function repartir(pool, pesosPorClave) {
    const claves = Object.keys(pesosPorClave).filter(k => pesosPorClave[k] > 0);
    const total = claves.reduce((s, k) => s + pesosPorClave[k], 0);
    if (!pool || !total) return null;
    const out = {};
    for (const k of claves) out[k] = pool * pesosPorClave[k] / total;
    return out;
  }

  /** Redondea a centavos enteros que SUMAN exactamente `total` (resto mayor). `valores`: {clave: centavos float}. */
  function redondearSuma(valores, total) {
    const claves = Object.keys(valores);
    const base = {}; let usado = 0;
    for (const k of claves) { base[k] = Math.floor(valores[k] + 1e-9); usado += base[k]; }
    let falta = total - usado;
    const orden = claves.slice().sort((a, b) => (valores[b] - base[b]) - (valores[a] - base[a]));
    for (let i = 0; falta > 0 && orden.length; i = (i + 1) % orden.length, falta--) base[orden[i]] += 1;
    for (let i = 0; falta < 0 && orden.length; i = (i + 1) % orden.length) { if (base[orden[orden.length - 1 - i]] > 0) { base[orden[orden.length - 1 - i]] -= 1; falta++; } }
    return base;
  }

  function costoLegajo(rows, cat) {
    const horas = {}, pagoDir = {};
    const lineasPropias = { aguinaldo: 0, bajas: 0 };   // Aguinaldo y bajas: costo real que NO entra al valor hora
    let P1 = 0, P2 = 0, F = 0, C = 0, S = 0, SHab = 0, D = 0;
    const sinRegla = new Map();
    for (const f of rows) {
      const c = cat.get(String(f.nro_concepto) + '|' + f.empresa);
      if (!c) continue;                                       // sin catalogar: afuera
      const linea = Calc.lineaDeFila(f, c);
      const trata = c.trata || (linea ? 'costo' : null);
      if (trata !== 'costo') continue;                        // pendiente o no es costo: afuera
      const imp = cents(f.importe);
      if (linea) { lineasPropias[linea] += imp; continue; }   // línea propia: se informa aparte, no entra al reparto
      if (f.empresa === '4H' && c.es_hora) {
        const t = TIPOS.includes(c.tipo_hora) ? c.tipo_hora : 'otra';
        horas[t] = (horas[t] || 0) + (Number(f.cantidad) || 0);
        pagoDir[t] = (pagoDir[t] || 0) + imp;
        continue;
      }
      const pro = c.prorrateo;
      if (pro === 'por_horas_pagas') P1 += imp;
      else if (pro === 'por_pago_tipo') P2 += imp;
      else if (pro === 'cargas') C += imp;
      else if (pro === 'fijo_mensual') F += imp;
      else if (pro === 'directo' && f.empresa === '4H_OC') D += imp;
      else {                                                  // sin regla de reparto
        S += imp;
        if (c.grupo_sistema === 'Haberes') SHab += imp;
        const k = f.empresa + ':' + f.nro_concepto;
        sinRegla.set(k, (sinRegla.get(k) || 0) + imp);
      }
    }

    const total = Object.values(pagoDir).reduce((a, b) => a + b, 0) + P1 + P2 + F + C + S + D;
    const tiposConHoras = TIPOS.filter(t => (horas[t] || 0) > 0 || (pagoDir[t] || 0) > 0);
    const asign = Object.fromEntries(TIPOS.map(t => [t, pagoDir[t] || 0]));   // centavos (float)
    let sinHoras = 0;          // costo que no tiene horas donde repartirse (centavos, float)
    let habSinHoras = 0;       // la parte REMUNERATIVA de ese costo: también recibe su parte de cargas
    const sumar = (reparto, pool, haberes, hab) => {
      if (!pool) return;
      if (!reparto) { sinHoras += pool; if (haberes) habSinHoras += pool; return; }
      for (const [t, v] of Object.entries(reparto)) { asign[t] += v; if (haberes) hab[t] = (hab[t] || 0) + v; }
    };

    // Lo REMUNERATIVO asignado a cada tipo (base de las cargas): pago directo de horas + P1 + P2 + sin regla de haberes
    const hab = Object.fromEntries(TIPOS.map(t => [t, pagoDir[t] || 0]));
    const horasPagas = Object.fromEntries(TIPOS.filter(t => t !== 'extra50').map(t => [t, horas[t] || 0]));
    sumar(repartir(P1, horasPagas), P1, true, hab);
    sumar(repartir(P2, Object.fromEntries(BASE_ANTIGUEDAD.map(t => [t, pagoDir[t] || 0]))), P2, true, hab);
    if (S) {
      const rS = repartir(S, horasPagas);
      if (!rS) { sinHoras += S; habSinHoras += SHab; }
      else for (const [t, v] of Object.entries(rS)) { asign[t] += v; hab[t] += SHab * v / S; }
    }
    // Cargas: proporcionales a lo remunerativo de cada tipo de hora Y de lo que quedó sin horas (mensualizados, etc.)
    if (C) {
      const rC = repartir(C, { ...hab, __sinHoras: habSinHoras });
      if (!rC) sinHoras += C;
      else for (const [t, v] of Object.entries(rC)) { if (t === '__sinHoras') sinHoras += v; else asign[t] += v; }
    }
    // Pagos fijos: con las horas trabajadas. Las extras solas (sin horas base, p.ej. mensualizados) no forman un valor hora.
    const hBase = horas.trabajada || 0;
    sumar(repartir(F, { trabajada: hBase, extra50: hBase > 0 ? (horas.extra50 || 0) : 0 }), F, false, hab);

    // Centavos exactos: Σ por tipo + sinHoras + D = total
    const aRedondear = Object.fromEntries(tiposConHoras.map(t => [t, asign[t]]));
    aRedondear.__sinHoras = sinHoras;
    const redT = redondearSuma(aRedondear, total - D);
    const sinHorasFinal = redT.__sinHoras;
    const red = { ...redT }; delete red.__sinHoras;

    const hTrab = (horas.trabajada || 0) + (horas.extra50 || 0);
    const costo = {}, h = {};
    for (const t of TIPOS.filter(x => x !== 'extra50')) {
      const horasT = t === 'trabajada' ? hTrab : (horas[t] || 0);
      const costoT = (red[t] || 0) + (t === 'trabajada' ? (red.extra50 || 0) : 0);
      if (horasT > 0 || costoT > 0) { h[t] = Math.round(horasT * 100) / 100; costo[t] = pesos(costoT); }
    }
    const valorHora = {};
    for (const t of Object.keys(costo)) valorHora[t] = h[t] > 0 ? costo[t] / h[t] : null;
    // Solo horas extra y ninguna hora base (mensualizados): no hay valor hora de la hora trabajada.
    const sinHorasBase = !(horas.trabajada > 0) && (horas.extra50 || 0) > 0;
    if (sinHorasBase && 'trabajada' in valorHora) valorHora.trabajada = null;
    const sumaTipos = Object.values(red).reduce((a, b) => a + b, 0);
    return {
      horas: h, costo, valorHora, sinHorasBase,
      directoFinDeSemana: pesos(D), sinHoras: pesos(sinHorasFinal), total: pesos(total),
      lineasPropias: { aguinaldo: pesos(lineasPropias.aguinaldo), bajas: pesos(lineasPropias.bajas) },
      sinRegla: [...sinRegla].map(([k, v]) => ({ concepto: k, importe: pesos(v) })),
      control: pesos(sumaTipos + sinHorasFinal + D - total),   // siempre 0
    };
  }

  /**
   * filas: [{empresa, legajo, nro_concepto, importe, cantidad}]; catalogo: lista de rrhh_conceptos.
   * Devuelve { legajos: {legajo: {...}} }.
   */
  function calcular(filas, catalogo) {
    const cat = indexar(catalogo);
    const porLegajo = new Map();
    for (const f of filas || []) { if (!porLegajo.has(f.legajo)) porLegajo.set(f.legajo, []); porLegajo.get(f.legajo).push(f); }
    const legajos = {};
    for (const [l, rows] of porLegajo) legajos[l] = Object.assign({ legajo: l }, costoLegajo(rows, cat));
    return { legajos };
  }

  return { calcular, repartir, redondearSuma, TIPOS };
});
