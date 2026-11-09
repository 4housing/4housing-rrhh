/* ==========================================================================
   RRHH · informe de costo por empleado (la «Vista 1: Mes», estilo del Excel de control).
   Sin DOM. Combina el motor de cálculo (rrhh-calculo.js) y el de costo por tipo de hora (rrhh-costo-hora.js).

   Por persona y mes:
     neto4H            lo que se acredita por el recibo (haberes + retenciones + no rem. con adelantos). Es el «Neto» del Excel.
     cargas            retenciones al empleado + contribuciones patronales. Es el «Cargas» del Excel.
     costo4H           haberes + no remunerativo (sin adelantos) + contribuciones patronales   [4H] (corriente: sin aguinaldo ni bajas)
     aguinaldo, bajas  líneas propias: lo liquidado como «Aguinaldo» o «Bajas» (con sus contribuciones). Cuenta como costo y como cobro,
                       pero va aparte y NO entra al valor hora
     oc                lo de la liquidación OC que es costo (coparticipación, sábados, extras, comisiones, adicionales)   [4H OC]
     bono              bonos de proyecto (Bono Montaje y similares, trata = directo_proyecto): se imputan directo al proyecto
     cuentaRRHH        Combo Hogar, cochera, viáticos: van a la cuenta Recursos Humanos, no son costo del operario
     ocTotal           TODO lo liquidado por OC, con signo (es la columna «Bono» del Excel de control)
     cuestaSinBono     costo4H + oc + aguinaldo + bajas
     cuestaTotal       cuestaSinBono + bono
     cobra             lo que la persona recibe en el bolsillo = neto4H + ocTotal (incluye bono y los descuentos OC, p.ej. Combo Hogar)
   Como el Excel (para comparar):
     totalCobradoExcel = neto + OC total      costoExcel = neto + cargas + OC total
     %CCSS = cargas / (neto + cargas)   %CCSS s/neto = cargas / neto   %CCSS s/cobrado = cargas / (neto + OC total)
   Las fórmulas del Excel se verificaron con los números de su propia hoja Resumen (septiembre).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./rrhh-calculo.js'), require('./rrhh-costo-hora.js'));
  else root.RRHHInformeCosto = factory(root.RRHHCalculo, root.RRHHCostoHora);
})(typeof self !== 'undefined' ? self : this, function (C, H) {
  'use strict';

  const r2 = x => Math.round(x * 100) / 100;
  const CAMPOS = ['neto4H', 'cargas', 'costo4H', 'oc', 'aguinaldo', 'bajas', 'bono', 'bonoMontaje', 'bonoPosventa', 'bonoOtro', 'cuentaRRHH', 'ocTotal',
                  'cuestaSinBono', 'cuestaTotal', 'cobra', 'costoExcel', 'totalCobradoExcel'];
  const div = (a, b) => (b ? a / b : null);

  function porcentajes(f) {
    return {
      pctCcssCosto: div(f.cargas, f.neto4H + f.cargas),
      pctCcssNeto: div(f.cargas, f.neto4H),
      pctCcssCobrado: div(f.cargas, f.neto4H + f.ocTotal),
    };
  }

  /** Suma de una lista de filas del informe (todas o solo las filtradas); los porcentajes se recalculan sobre la suma. */
  function totalizar(lista) {
    const t = { personas: lista.length, horasPagas: r2(lista.reduce((s, f) => s + f.horasPagas, 0)) };
    for (const k of CAMPOS) t[k] = r2(lista.reduce((s, f) => s + f[k], 0));
    return Object.assign(t, porcentajes(t));
  }

  /**
   * filas: [{empresa, legajo, tipo_liquidacion, nro_concepto, importe, cantidad}] del período
   * catalogo: rrhh_conceptos · empleados: [{legajo, nombre, departamento}] (padrón)
   */
  function construir({ filas, catalogo, empleados }) {
    const A = C.calcularPeriodo(filas, catalogo);
    const B = H.calcular(filas, catalogo);
    const padron = new Map((empleados || []).map(e => [Number(e.legajo), e]));
    const lista = Object.values(A.legajos).map(a => {
      const p = padron.get(Number(a.legajo));
      const b = B.legajos[a.legajo] || {};
      const f = {
        legajo: a.legajo,
        nombre: p ? p.nombre : null,
        departamento: p ? p.departamento : null,
        enPadron: !!p,
        neto4H: a.netoAcreditado, cargas: a.cargas, costo4H: a.costo4H,
        oc: a.bono, aguinaldo: a.lineas.aguinaldo, bajas: a.lineas.bajas,
        bono: a.bonoDirecto, bonoMontaje: a.bonoTipo.montaje, bonoPosventa: a.bonoTipo.posventa, bonoOtro: a.bonoTipo.otro,
        cuentaRRHH: a.cuentaRRHH, ocTotal: a.totalOC,
        cuestaSinBono: a.cuestaConLineas, cuestaTotal: r2(a.cuestaConLineas + a.bonoDirecto),
        cobra: r2(a.netoAcreditado + a.totalOC),
        costoExcel: r2(a.netoAcreditado + a.cargas + a.totalOC),
        totalCobradoExcel: r2(a.netoAcreditado + a.totalOC),
        horasPagas: a.horasPagas,
        valorHoraTrabajada: b.valorHora && b.valorHora.trabajada != null ? b.valorHora.trabajada : null,
        sinHoras: b.sinHoras || 0,
        directoFinDeSemana: b.directoFinDeSemana || 0,
      };
      return Object.assign(f, porcentajes(f));
    }).sort((x, y) => x.legajo - y.legajo);

    const sinPadron = lista.filter(f => !f.enPadron).map(f => f.legajo);
    return {
      filas: lista, totales: totalizar(lista),
      departamentos: [...new Set(lista.map(f => f.departamento).filter(Boolean))].sort(),
      alertas: { sinCatalogar: A.alertas.sinCatalogar, sinTrata: A.alertas.sinTrata, trataNoSoportada: A.alertas.trataNoSoportada, legajosSinPadron: sinPadron },
      cerrable: A.cerrable && !sinPadron.length,
    };
  }

  /** Detalle de UNA persona: cada concepto liquidado (sumando quincenas) más las horas y el valor hora por tipo. */
  function detalle({ filas, catalogo, legajo }) {
    const cat = catalogo instanceof Map ? catalogo : C.indexarCatalogo(catalogo);
    const mios = (filas || []).filter(f => Number(f.legajo) === Number(legajo));
    const lineas = new Map();
    for (const f of mios) {
      const c = cat.get(String(f.nro_concepto) + '|' + f.empresa);
      const linea = c ? C.lineaDeFila(f, c) : null;
      const k = f.empresa + '|' + f.nro_concepto + '|' + (linea || '');
      const l = lineas.get(k) || { empresa: f.empresa, nro: String(f.nro_concepto), descripcion: c ? c.descripcion : '(sin catalogar)', linea,
                                  grupo: c ? c.grupo_sistema : null, trata: c ? (c.trata || (linea ? 'costo' : null)) : null, prorrateo: c ? c.prorrateo : null, importe: 0, cantidad: 0 };
      l.importe += Math.round((Number(f.importe) || 0) * 100);
      l.cantidad += Number(f.cantidad) || 0;
      lineas.set(k, l);
    }
    const orden = { '4H': 0, '4H_OC': 1 };
    const grupos = { 'Haberes': 0, 'No Remunerativo': 1, 'Retenciones': 2, 'Contribuciones': 3 };   // como en el recibo
    const og = g => (g in grupos ? grupos[g] : 9);
    const out = [...lineas.values()].map(l => ({ ...l, importe: l.importe / 100, cantidad: r2(l.cantidad) }))
      .sort((a, b) => (orden[a.empresa] - orden[b.empresa]) || (og(a.grupo) - og(b.grupo)) || Number(a.nro) - Number(b.nro) || String(a.linea || '').localeCompare(String(b.linea || '')));
    const horas = (H.calcular(mios, cat).legajos[legajo]) || null;
    return { lineas: out, horas };
  }

  return { construir, detalle, totalizar, CAMPOS };
});
