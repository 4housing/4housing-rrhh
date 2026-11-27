/* ==========================================================================
   RRHH · vacaciones (etapa 3a). Lógica pura: validar saldos y pedidos, circuito de estados, fechas sugeridas, novedades de un pedido y control de integridad.
   Los días de cada pedido los escribe RRHH (la app no calcula cuántos corresponden ni cuántos son). La app solo SUGIERE las fechas al generar las novedades
   (lunes a viernes sin feriados cargados) y RRHH las confirma; el control avisa si no coinciden con los días escritos.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RRHHVacaciones = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ESTADOS = { pedido: 'Pedido', aprobado_jefe: 'Aprobado por el jefe', aprobado: 'Aprobado', rechazado: 'Rechazado', cancelado: 'Cancelado' };
  /** A qué estados se puede pasar desde cada uno. Un pedido aprobado con novedades ya generadas no se cancela desde acá (hay que borrar primero las novedades pendientes). */
  const TRANSICIONES = { pedido: ['aprobado_jefe', 'rechazado', 'cancelado'], aprobado_jefe: ['aprobado', 'rechazado', 'cancelado'], aprobado: ['cancelado'], rechazado: [], cancelado: [] };
  const puedePasar = (p, a) => (TRANSICIONES[p.estado] || []).includes(a) && !(p.estado === 'aprobado' && a === 'cancelado' && p.novedades_generadas_en);
  const num = x => (x === '' || x == null ? NaN : typeof x === 'number' ? x : Number(String(x).trim().replace(',', '.')));
  const fechaOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00')) && new Date(s + 'T12:00:00').toISOString().slice(0, 10) === s;
  const medio = n => Math.abs(n * 2 - Math.round(n * 2)) < 1e-9;       // múltiplos de 0,5

  function normalizarSaldo(s) { return { empresa: String(s.empresa || '').trim(), legajo: Number(s.legajo), anio: Number(s.anio), dias: num(s.dias), nota: s.nota == null ? null : (String(s.nota).trim() || null) }; }
  function validarSaldo(s) {
    const e = [];
    if (s.empresa !== '4H' && s.empresa !== '4H_OC') e.push('Elegí la empresa.');
    if (!Number.isInteger(s.legajo) || s.legajo <= 0) e.push('El legajo tiene que ser un número.');
    if (!Number.isInteger(s.anio) || s.anio < 2000 || s.anio > 2100) e.push('El año no es válido.');
    if (!(s.dias >= 0) || s.dias > 366) e.push('Los días tienen que estar entre 0 y 366.'); else if (!medio(s.dias)) e.push('Los días se cargan de a medio día (0,5).');
    if (s.nota && s.nota.length > 200) e.push('La nota pasa los 200 caracteres.');
    return e;
  }
  function normalizarPedido(p) {
    const desde = String(p.desde || '').trim();
    return { empresa: String(p.empresa || '').trim(), legajo: Number(p.legajo), anio: p.anio === '' || p.anio == null ? Number(desde.slice(0, 4)) : Number(p.anio), desde, hasta: String(p.hasta || '').trim(), dias: num(p.dias),
      codigo: String(p.codigo || '').trim().toUpperCase(), cantidad: num(p.cantidad), observaciones: p.observaciones == null ? null : (String(p.observaciones).trim() || null) };
  }
  function validarPedido(p) {
    const e = [];
    if (p.empresa !== '4H' && p.empresa !== '4H_OC') e.push('Elegí la empresa.');
    if (!Number.isInteger(p.legajo) || p.legajo <= 0) e.push('El legajo tiene que ser un número.');
    if (!fechaOk(p.desde) || !fechaOk(p.hasta)) e.push('Las fechas no son válidas.'); else if (p.hasta < p.desde) e.push('«Hasta» no puede ser anterior a «Desde».');
    if (!Number.isInteger(p.anio) || p.anio < 2000 || p.anio > 2100) e.push('El año del saldo no es válido.');
    if (!(p.dias > 0) || p.dias > 366) e.push('Escribí cuántos días son (más de 0).'); else if (!medio(p.dias)) e.push('Los días se cargan de a medio día (0,5).');
    if (!p.codigo) e.push('Falta el código (VACJOR o VACM).'); else if (p.codigo.length > 30) e.push('El código es demasiado largo.');
    if (!(p.cantidad > 0)) e.push('Escribí la cantidad de cada novedad diaria (lo que lleva cada día de vacaciones en Delta).');
    if (p.observaciones && p.observaciones.length > 200) e.push('Las observaciones pasan los 200 caracteres.');
    return e;
  }
  /** Fechas ISO entre dos fechas, ambas incluidas (sin pasar por la zona horaria local). */
  function rango(desde, hasta) {
    const out = [], a = desde.split('-').map(Number), b = hasta.split('-').map(Number);
    for (let t = Date.UTC(a[0], a[1] - 1, a[2]), fin = Date.UTC(b[0], b[1] - 1, b[2]); t <= fin; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
    return out;
  }
  const diaSemana = iso => new Date(iso + 'T12:00:00Z').getUTCDay();          // 0 domingo … 6 sábado
  /** SUGERENCIA de fechas: lunes a viernes que no estén en los feriados cargados. La confirma RRHH: no es la regla de Tango. */
  function sugerirFechas(desde, hasta, feriados) {
    const fer = feriados instanceof Set ? feriados : new Set(feriados || []);
    return rango(desde, hasta).filter(f => { const d = diaSemana(f); return d >= 1 && d <= 5 && !fer.has(f); });
  }
  /** Novedades diarias (una por fecha) para Delta. Devuelve { novedades, errores }. */
  function novedadesDePedido(ped, fechas) {
    const errores = [], u = [...new Set(fechas)].sort();
    if (!u.length) errores.push('No hay fechas elegidas.');
    if (u.some(f => f < ped.desde || f > ped.hasta)) errores.push('Hay fechas fuera del período del pedido.');
    if (ped.estado !== 'aprobado') errores.push('El pedido tiene que estar aprobado.');
    if (ped.novedades_generadas_en) errores.push('Las novedades de este pedido ya se generaron.');
    return { errores, novedades: errores.length ? [] : u.map(f => ({ empresa: ped.empresa, fecha: f, legajo: ped.legajo, codigo: ped.codigo, cantidad: Number(ped.cantidad), valor: 0, observaciones: 'Vacaciones' + (ped.observaciones ? ' · ' + ped.observaciones : ''), origen: 'vacaciones', vac_pedido: ped.id })) };
  }
  /**
   * Saldo y control de integridad por legajo y año.
   *  restante = días que le corresponden − días aprobados · conPendientes = restante − días de pedidos sin decidir.
   *  control = avisos: sin saldo cargado, saldo negativo, aprobado sin novedades generadas, novedades que no coinciden con los días del pedido.
   */
  function resumen(saldos, pedidos, novedades) {
    const m = new Map(), k = (e, l, a) => e + '|' + l + '|' + a;
    const get = (e, l, a) => { const x = k(e, l, a); if (!m.has(x)) m.set(x, { empresa: e, legajo: l, anio: a, dias: null, nota: null, aprobados: 0, pendientes: 0, control: [] }); return m.get(x); };
    for (const s of saldos) { const r = get(s.empresa, s.legajo, s.anio); r.dias = Number(s.dias); r.nota = s.nota || null; }
    const nPorPedido = new Map();
    for (const n of novedades || []) if (n.vac_pedido) nPorPedido.set(n.vac_pedido, (nPorPedido.get(n.vac_pedido) || 0) + 1);
    for (const p of pedidos) {
      const r = get(p.empresa, p.legajo, p.anio);
      if (p.estado === 'aprobado') {
        r.aprobados += Number(p.dias);
        if (!p.novedades_generadas_en) r.control.push('Aprobado sin novedades generadas (' + p.desde.split('-').reverse().join('/') + ')');
        else { const n = nPorPedido.get(p.id) || 0; if (n !== Number(p.dias)) r.control.push('Novedades (' + n + ') ≠ días del pedido (' + String(Number(p.dias)).replace('.', ',') + ') del ' + p.desde.split('-').reverse().join('/')); }
      } else if (p.estado === 'pedido' || p.estado === 'aprobado_jefe') r.pendientes += Number(p.dias);
    }
    return [...m.values()].map(r => {
      const restante = r.dias == null ? null : r.dias - r.aprobados, control = r.control.slice();
      if (r.dias == null) control.unshift('Sin saldo cargado'); else if (restante < 0) control.unshift('Saldo negativo');
      return { ...r, restante, conPendientes: r.dias == null ? null : r.dias - r.aprobados - r.pendientes, control };
    }).sort((a, b) => b.anio - a.anio || a.empresa.localeCompare(b.empresa) || a.legajo - b.legajo);
  }
  return { ESTADOS, TRANSICIONES, puedePasar, normalizarSaldo, validarSaldo, normalizarPedido, validarPedido, rango, sugerirFechas, novedadesDePedido, resumen };
});
