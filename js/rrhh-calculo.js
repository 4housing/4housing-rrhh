/* ==========================================================================
   RRHH · motor de cálculo (handoff §5, §6, §7). Sin dependencias, sin DOM.
   Se usa igual en el navegador (window.RRHHCalculo) y en node (tests).
   Importes en centavos enteros internamente para no acumular error de float.
   La app NO decide por el nombre del concepto: todo sale de las banderas
   del catálogo (rrhh_conceptos): grupo_sistema, trata, es_hora, hora_productiva,
   tipo_hora, prorrateo.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHCalculo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const cents = x => Math.round((Number(x) || 0) * 100);
  const pesos = c => c / 100;
  const r2 = x => Math.round(x * 100) / 100;

  const TRATA_VALIDAS = ['costo', 'excluir', 'directo_proyecto', 'cuenta_rrhh', 'retencion'];
  const GRUPOS = ['Haberes', 'Retenciones', 'Contribuciones', 'No Remunerativo'];
  // tipo_hora productivos (catálogo oficial: trabajada, extra50; el provisorio usaba extra_50 y extra_50_mensualizado)
  const HORAS_PRODUCTIVAS = ['trabajada', 'jornalizada', 'extra50', 'extra_50', 'extra_50_mensualizado'];

  /** Date | 'AAAA-MM-DD' | 'AAAA-MM' -> 'AAAA-MM' (o null). */
  function periodoDe(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) {
      return v.getUTCFullYear() + '-' + String(v.getUTCMonth() + 1).padStart(2, '0');
    }
    const m = /^(\d{4})-(\d{2})/.exec(String(v));
    return m ? m[1] + '-' + m[2] : null;
  }

  function indexarCatalogo(lista) {
    const mapa = new Map();
    for (const c of lista || []) mapa.set(c.nro_concepto + '|' + c.empresa, c);
    return mapa;
  }

  function vacio() {
    return {
      haberes: 0, retenciones: 0, noRem: 0, noRemTotal: 0, contrib: 0,
      bono: 0, bonoDirecto: 0, cuentaRRHH: 0, excluidosOC: 0, directoOC: 0,
      totalOC: 0, horasPorTipo: {}, horasPagas: 0, horasProductivas: 0,
    };
  }

  /**
   * filas: [{empresa:'4H'|'4H_OC', legajo, tipo_liquidacion, nro_concepto, importe, cantidad}]
   * catalogo: lista de rrhh_conceptos (o Map ya indexado)
   * Devuelve { legajos, alertas, cerrable }.
   */
  function calcularPeriodo(filas, catalogo) {
    const cat = catalogo instanceof Map ? catalogo : indexarCatalogo(catalogo);
    const acc = new Map();           // legajo -> acumulado en centavos
    const sinCatalogar = new Map();  // 'nro|empresa' -> {empresa, nro_concepto, importe}
    const sinTrata = new Map();
    const noSoportada = new Map();
    const get = l => { if (!acc.has(l)) acc.set(l, vacio()); return acc.get(l); };
    const anotar = (m, f, extra) => {
      const k = f.nro_concepto + '|' + f.empresa;
      const e = m.get(k) || { empresa: f.empresa, nro_concepto: f.nro_concepto, importe: 0, ...extra };
      e.importe += cents(f.importe);
      m.set(k, e);
    };

    for (const f of filas || []) {
      const a = get(f.legajo);
      const imp = cents(f.importe);
      if (f.empresa === '4H_OC') a.totalOC += imp;
      const c = cat.get(f.nro_concepto + '|' + f.empresa);
      if (!c) { anotar(sinCatalogar, f); continue; }
      if (!c.trata) { anotar(sinTrata, f); continue; }

      if (f.empresa === '4H') {
        if (!GRUPOS.includes(c.grupo_sistema)) { anotar(noSoportada, f, { motivo: 'grupo_sistema inválido' }); continue; }
        if (c.trata === 'directo_proyecto' || c.trata === 'cuenta_rrhh') {
          anotar(noSoportada, f, { motivo: 'trata ' + c.trata + ' en 4H no está definido en el handoff' });
          continue;
        }
        if (c.grupo_sistema === 'Haberes') a.haberes += imp;
        else if (c.grupo_sistema === 'Retenciones') a.retenciones += imp;
        else if (c.grupo_sistema === 'Contribuciones') a.contrib += imp;
        else { // No Remunerativo
          a.noRemTotal += imp;
          if (c.trata !== 'excluir') a.noRem += imp;
        }
        if (c.es_hora && c.trata === 'costo') {
          const h = Number(f.cantidad) || 0;
          const tipo = c.tipo_hora || 'sin_tipo';
          a.horasPorTipo[tipo] = (a.horasPorTipo[tipo] || 0) + h;
          a.horasPagas += h;
          // El catálogo oficial no trae 'hora_productiva': se deduce del tipo de hora (trabajada y extra 50%).
          const productiva = c.hora_productiva != null ? !!c.hora_productiva : HORAS_PRODUCTIVAS.includes(c.tipo_hora);
          if (productiva) a.horasProductivas += h;
        }
      } else { // 4H_OC: se decide solo por trata
        if (c.trata === 'costo') {
          a.bono += imp;
          if (c.prorrateo === 'directo') a.directoOC += imp;
        } else if (c.trata === 'directo_proyecto') a.bonoDirecto += imp;
        else if (c.trata === 'cuenta_rrhh') a.cuentaRRHH += imp;
        else if (c.trata === 'excluir') a.excluidosOC += imp;
        else anotar(noSoportada, f, { motivo: 'trata ' + c.trata + ' en OC no está definido en el handoff' });
      }
    }

    const legajos = {};
    for (const [leg, a] of acc) {
      const neto = a.haberes + a.retenciones + a.noRemTotal;
      const cargas = -a.retenciones + a.contrib;
      const costo4H = a.haberes + a.noRem + a.contrib;
      const cuesta = costo4H + a.bono;
      const horasHoras = x => Object.fromEntries(Object.entries(x).map(([k, v]) => [k, r2(v)]));
      legajos[leg] = {
        legajo: leg,
        haberes: pesos(a.haberes), retenciones: pesos(a.retenciones),
        noRem: pesos(a.noRem), noRemTotal: pesos(a.noRemTotal), contrib: pesos(a.contrib),
        netoAcreditado: pesos(neto), cargas: pesos(cargas), costo4H: pesos(costo4H),
        bono: pesos(a.bono), bonoDirecto: pesos(a.bonoDirecto), cuentaRRHH: pesos(a.cuentaRRHH),
        excluidosOC: pesos(a.excluidosOC),
        directoOC: pesos(a.directoOC),   // p.ej. sábados/extras OC: se imputan directo (opción A)
        totalOC: pesos(a.totalOC),
        // [A DEFINIR en el handoff] si "cobra" incluye Bono Montaje y descuento del combo.
        // Acá va la fórmula literal de §5; bonoDirecto y cuentaRRHH quedan aparte.
        cobra: pesos(neto + a.bono),
        cuesta: pesos(cuesta),
        pctCcssNeto: neto ? cargas / neto : null,
        pctCcssCosto: costo4H ? cargas / costo4H : null,
        horasPorTipo: horasHoras(a.horasPorTipo),
        horasPagas: r2(a.horasPagas), horasProductivas: r2(a.horasProductivas),
        // Indicadores (§6). null cuando no hay horas: el costo es 100% improductivo.
        valorHoraProduccion: a.horasProductivas > 0 ? pesos(cuesta) / a.horasProductivas : null,
        valorHoraPaga: a.horasPagas > 0 ? pesos(cuesta) / a.horasPagas : null,
      };
    }

    const lista = m => [...m.values()].map(e => ({ ...e, importe: pesos(e.importe) }));
    const alertas = {
      sinCatalogar: lista(sinCatalogar),
      sinTrata: lista(sinTrata),
      trataNoSoportada: lista(noSoportada),
    };
    const cerrable = !alertas.sinCatalogar.length && !alertas.sinTrata.length && !alertas.trataNoSoportada.length;
    return { legajos, alertas, cerrable };
  }

  /* ---------------------------- Controles §7 ---------------------------- */

  /**
   * §7.1 Horas de la liquidación vs Σ horas por tipo, por legajo.
   * horasLiquidacion se recibe de afuera: en el Excel sale de la fila "1 · Acreditación
   * de Haberes" (grupo Pago) y NO verifiqué cómo se deriva esa cantidad; no está en el
   * informe exportado de 4H. Usar el concepto 1100 como referencia NO sirve (da diferencias).
   */
  function controlHoras(res, horasLiquidacion, tol) {
    const t = tol == null ? 0.01 : tol;
    const dif = r2(horasLiquidacion - res.horasPagas);
    return { diferencia: dif, ok: Math.abs(dif) <= t };
  }

  /** §7.2 Σ OC = costo + directo + cuenta RRHH + excluidos (lo que sobra es lo no catalogado). */
  function controlBono(res, tol) {
    const t = tol == null ? 0.005 : tol;
    const dif = r2(res.totalOC - (res.bono + res.bonoDirecto + res.cuentaRRHH + res.excluidosOC));
    return { diferencia: dif, ok: Math.abs(dif) <= t };
  }

  /** §7.4 Los informes del mes tienen el mismo período y están todos. */
  function controlPeriodo(informes, esperados) {
    const faltan = [];
    const req = esperados || [['4H', 'resumen'], ['4H_OC', 'resumen'], ['4H', 'novedades'], ['4H_OC', 'novedades']];
    for (const [e, t] of req) {
      if (!informes.some(i => i.empresa === e && i.tipo === t)) faltan.push(e + ' ' + t);
    }
    const periodos = [...new Set(informes.map(i => periodoDe(i.periodo)))];
    return { faltan, periodos, ok: !faltan.length && periodos.length === 1 && periodos[0] != null };
  }

  /**
   * Mapa de F.931 -> conceptos de la liquidación (handoff §7.5). Configurable.
   * informativo:true no bloquea (son retenciones, no costo de la empresa).
   * ESTOY SUPONIENDO que ANSSAL (80040) va en el bloque de contribuciones S.S.
   */
  const MAPA_F931 = [
    { clave: 'remuneracion_1', etiqueta: 'Remuneraciones (Haberes)', grupo: 'Haberes' },
    { clave: 'contrib_os', etiqueta: 'Contribuciones O.S.', conceptos: [80050] },
    { clave: 'scvo', etiqueta: 'Seguro de vida obligatorio', conceptos: [80200] },
    { clave: 'lrt', etiqueta: 'ART / LRT', conceptos: [80100] },
    { clave: 'contrib_ss', etiqueta: 'Contribuciones S.S.', conceptos: [80000, 80010, 80020, 80030, 80040] },
  ];

  /**
   * §7.5 y §7.6. filas: TODAS las filas 4H del mes (no solo operarios).
   * f931: {remuneracion_1, contrib_ss, contrib_os, lrt, scvo, empleados}
   * tolerancia: en pesos, configurable. El default (1) es una suposición mía.
   */
  function controlF931(filas4H, catalogo, f931, opciones) {
    const o = Object.assign({ tolerancia: 1, mapa: MAPA_F931 }, opciones || {});
    const cat = catalogo instanceof Map ? catalogo : indexarCatalogo(catalogo);
    const filas = (filas4H || []).filter(f => f.empresa === '4H');
    const lineas = o.mapa.map(m => {
      let suma = 0;
      for (const f of filas) {
        if (m.grupo) {
          const c = cat.get(f.nro_concepto + '|4H');
          if (c && c.grupo_sistema === m.grupo) suma += cents(f.importe);
        } else if (m.conceptos.includes(f.nro_concepto)) suma += cents(f.importe);
      }
      const liq = pesos(suma);
      const ref = Number(f931[m.clave]);
      const dif = r2(liq - ref);
      return { clave: m.clave, etiqueta: m.etiqueta, liquidacion: liq, f931: ref, diferencia: dif,
               ok: Number.isFinite(ref) && Math.abs(dif) <= o.tolerancia };
    });
    const legs = new Set(filas.map(f => f.legajo)).size;
    const empleados = { liquidados: legs, f931: f931.empleados, ok: legs === Number(f931.empleados) };
    // Si hay conceptos sin catalogar, las sumas por grupo/concepto quedan incompletas
    // (octubre: 1602 + 6501 explican exacto la diferencia de Remuneraciones).
    const sinCatalogar = [...new Set(filas.filter(x => !cat.has(x.nro_concepto + '|4H')).map(x => x.nro_concepto))];
    return { lineas, empleados, sinCatalogar,
             ok: lineas.every(l => l.ok) && empleados.ok && !sinCatalogar.length };
  }

  return { calcularPeriodo, indexarCatalogo, controlHoras, controlBono, controlPeriodo,
           controlF931, periodoDe, MAPA_F931, TRATA_VALIDAS, GRUPOS };
});
