/* ==========================================================================
   RRHH · control de sábados y fines de semana pagados por OC (decisión de administración, opción A).
   Los sábados y las extras de fin de semana se pagan por la liquidación OC y se imputan por lo realmente liquidado.

   Este control NO acusa un error: avisa que un día se PAGÓ y NO figura en la planificación (o al revés) para que
   administración VALIDE que esté bien. Puede estar perfectamente bien: la planificación puede no reflejarlo y lo que
   manda es la FICHADA y la AUTORIZACIÓN DEL SUPERVISOR para el pago. Cuando se trabaje con fichadas y autorización de
   horas extra (etapa futura), esa validación se hará contra ellas.

   Sin dependencias ni DOM. No usa nombres: solo legajos.

   Entrada
     novedades    [{empresa, legajo, fecha:'AAAA-MM-DD', cod_novedad, cantidad}] (novedades registradas)
     planificados {legajo: ['AAAA-MM-DD', ...]} fechas en que la planificación tenía a la persona trabajando
                  (cualquier tarea). Si NO se pasa, no se puede comparar: estado 'sin_planificacion'.
   Los días pagados salen de las novedades de OC con código SABADO (sábado pagado) y HRSEX1 (extras de fin de semana
   o feriado). Fechas repetidas para el mismo legajo cuentan una sola vez.
   Estados: 'ok' | 'a_validar' | 'sin_planificacion'.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHSabados = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CODIGOS_PAGADOS = ['SABADO', 'HRSEX1'];
  const diaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay();   // 0 domingo … 6 sábado
  const unicos = a => [...new Set(a)].sort();
  const NOTA = 'Puede estar bien (manda la fichada y la autorización del supervisor): validar que esté autorizado.';

  function controlSabados(novedades, planificados, opciones) {
    const o = Object.assign({ empresa: '4H_OC', codigos: CODIGOS_PAGADOS }, opciones || {});
    const pagados = new Map();       // legajo -> Set de fechas pagadas
    const noSabado = new Map();      // legajo -> fechas con código SABADO que no caen en sábado
    for (const n of novedades || []) {
      if (n.empresa !== o.empresa || !o.codigos.includes(n.cod_novedad) || !n.fecha) continue;
      if (!pagados.has(n.legajo)) pagados.set(n.legajo, new Set());
      pagados.get(n.legajo).add(n.fecha);
      if (n.cod_novedad === 'SABADO' && diaSemana(n.fecha) !== 6) {
        if (!noSabado.has(n.legajo)) noSabado.set(n.legajo, new Set());
        noSabado.get(n.legajo).add(n.fecha);
      }
    }
    const comparable = planificados != null;
    const legajos = new Set([...pagados.keys(), ...(comparable ? Object.keys(planificados).map(Number) : [])]);
    const porLegajo = {}, mensajes = [];
    let diasPagados = 0, sinPlanificar = 0, sinPagar = 0;

    for (const l of [...legajos].sort((a, b) => a - b)) {
      const pag = unicos([...(pagados.get(l) || [])]);
      const plan = comparable ? unicos(planificados[l] || []) : [];
      const pagadosSinPlanificar = comparable ? pag.filter(d => !plan.includes(d)) : [];
      // «planificado y no pagado»: solo fines de semana (sábado/domingo) que la planificación tenía trabajando
      const planificadosSinPagar = comparable ? plan.filter(d => [0, 6].includes(diaSemana(d)) && !pag.includes(d)) : [];
      const fechasMal = unicos([...(noSabado.get(l) || [])]);
      diasPagados += pag.length; sinPlanificar += pagadosSinPlanificar.length; sinPagar += planificadosSinPagar.length;
      const estado = !comparable ? (pag.length ? 'sin_planificacion' : 'ok')
        : (pagadosSinPlanificar.length || planificadosSinPagar.length || fechasMal.length ? 'a_validar' : 'ok');
      porLegajo[l] = { pagados: pag, pagadosSinPlanificar, planificadosSinPagar, fechasQueNoSonSabado: fechasMal, estado };
      if (pagadosSinPlanificar.length) mensajes.push('Legajo ' + l + ': ' + pagadosSinPlanificar.length + ' día(s) pagado(s) por OC que NO figuran en la planificación (' + pagadosSinPlanificar.join(', ') + '). ' + NOTA);
      if (planificadosSinPagar.length) mensajes.push('Legajo ' + l + ': ' + planificadosSinPagar.length + ' día(s) de fin de semana planificado(s) que NO figuran pagados (' + planificadosSinPagar.join(', ') + '). Validar que esté bien.');
      if (fechasMal.length) mensajes.push('Legajo ' + l + ': novedad «SABADO» en una fecha que no es sábado (' + fechasMal.join(', ') + '). Revisar la fecha.');
    }
    const estado = !comparable ? (diasPagados ? 'sin_planificacion' : 'ok') : (mensajes.length ? 'a_validar' : 'ok');
    if (!comparable && diasPagados) {
      mensajes.unshift('Hay ' + diasPagados + ' día(s) de fin de semana pagado(s) por OC en ' + Object.keys(porLegajo).length +
        ' legajo(s) y todavía no se pudo comparar con la planificación. ' + NOTA);
    }
    return { estado, comparable, porLegajo, mensajes,
             resumen: { legajos: Object.keys(porLegajo).length, diasPagados, pagadosSinPlanificar: sinPlanificar, planificadosSinPagar: sinPagar } };
  }

  return { controlSabados, CODIGOS_PAGADOS };
});
