/* ==========================================================================
   RRHH · fichadas: lectura del .txt de Tango Fichadas, cálculo del parte diario y archivo depurado para Delta.
   Lógica PURA (sin DOM ni red). Probada con datos sintéticos en test/fichadas.test.js.

   Formato del .txt (42 caracteres por línea, sin salto final): ddmmaaaa + HHMM + código de fichador (20, con espacios a la derecha)
   + código de reloj (10, con espacios a la derecha). El código de fichador es el legajo con ceros a la izquierda (0102 = legajo 102).

   Cálculo del parte (verificado contra el «Informe resumen de partes» de Delta de la 1Q de noviembre 2026; lo marcado «hipótesis» tiene pocos casos):
     · Entrada = primera fichada y salida = última. Una sola fichada → el día queda a revisar y no se paga nada.
     · Llegar antes del inicio NO es hora extra: queda como «fuera de horario» (SIN_HORA) y no se paga.
     · Tramo normal: si la entrada está dentro de la tolerancia de inicio y la salida dentro de la tolerancia de fin, se paga el día completo;
       si no, se paga lo trabajado (menos el descanso: la hora desde el inicio de la ventana de descanso), en bloques de la unidad (hipótesis).
     · Tramos extra (después del horario, sábado, domingo): se cuentan los minutos dentro del tramo (si la entrada está dentro de la tolerancia del inicio
       se cuenta desde el inicio) y se redondean al múltiplo de la unidad más cercano (la mitad hacia arriba): con unidad 30, 14 min = 0 y 15 min = 30.
       Con unidad 1 se pagan los minutos exactos, sin mínimo (verificado).
     · Feriados: se calculan con el horario de feriados pero SIEMPRE quedan marcados para revisar (Delta no los trató igual en noviembre).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHFichadas = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const hm = s => { const [h, m] = String(s).split(':').map(Number); return h * 60 + m; };
  const fmt = min => String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
  const solape = (a1, a2, b1, b2) => Math.max(0, Math.min(a2, b2) - Math.max(a1, b1));
  const redondear = (min, unidad) => (unidad > 1 ? Math.floor(min / unidad + 0.5) * unidad : min);
  const diaSemana = iso => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).getDay(); };   // 0 domingo … 6 sábado
  const NOMBRE_DIA = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

  /* ------------------------------ archivo .txt ------------------------------ */
  const codigoFichador = legajo => String(legajo).padStart(4, '0');
  const legajoDe = codigo => parseInt(String(codigo).trim(), 10);

  /** Lee el .txt de Tango. Devuelve { fichadas:[{fecha,hora,codigo,legajo,reloj}], errores:[{linea,texto,motivo}] }. */
  function leerTxt(texto) {
    const fichadas = [], errores = [];
    String(texto == null ? '' : texto).replace(/^﻿/, '').split(/\r?\n/).forEach((l, i) => {
      if (!l.trim()) return;
      const m = /^(\d{2})(\d{2})(\d{4})(\d{2})(\d{2})(.{20})(.{0,10})$/.exec(l.padEnd(42, ' '));
      if (!m) { errores.push({ linea: i + 1, texto: l, motivo: 'formato' }); return; }
      const [, dd, mm, yyyy, HH, MM, cod, reloj] = m;
      const fecha = yyyy + '-' + mm + '-' + dd, hora = HH + ':' + MM;
      const d = new Date(+yyyy, +mm - 1, +dd);
      if (d.getMonth() !== +mm - 1 || +HH > 23 || +MM > 59 || !/^\d+$/.test(cod.trim())) { errores.push({ linea: i + 1, texto: l, motivo: 'fecha, hora o fichador inválidos' }); return; }
      fichadas.push({ fecha, hora, codigo: cod.trim(), legajo: legajoDe(cod), reloj: reloj.trim() });
    });
    return { fichadas, errores };
  }
  /** Arma el .txt depurado: ordenado por fecha y hora (Delta corta la lectura si no lo está), sin salto de línea final como el original de Tango. */
  function armarTxt(fichadas) {
    return fichadas.slice().sort((a, b) => (a.fecha + a.hora + a.codigo).localeCompare(b.fecha + b.hora + b.codigo))
      .map(f => f.fecha.slice(8, 10) + f.fecha.slice(5, 7) + f.fecha.slice(0, 4) + f.hora.slice(0, 2) + f.hora.slice(3, 5) + String(f.codigo).padEnd(20, ' ') + String(f.reloj || '').padEnd(10, ' ')).join('\n');
  }

  /* ------------------------------ parte diario ------------------------------ */
  /**
   * op: { fecha:'AAAA-MM-DD', horas:['06:55','16:20'], horario: definición|null, unidad:30|1, feriado:boolean }
   * horario: { dias:{ '1':[{desde,hasta,tolDesde,tolHasta,tipo}], … '6':[…], '0':[…] }, feriados:{…}, descanso:{desde:'12:00',minutos:60}, salidaSugerida?, entradaSugerida? }
   * → { entrada, salida, n, esperadoMin, pagado:{tipo:min}, sinHoraMin, marcas:[…], sugerencias:[{accion,hora,de?,motivo}] }
   */
  function calcularDia(op) {
    const horas = (op.horas || []).slice().sort(), unidad = op.unidad || 30, h = op.horario || null;
    const dow = diaSemana(op.fecha);
    const res = { entrada: horas[0] || null, salida: horas.length > 1 ? horas[horas.length - 1] : null, n: horas.length, esperadoMin: 0, pagado: {}, sinHoraMin: 0, marcas: [], sugerencias: [] };
    if (op.feriado) res.marcas.push('feriado');
    if (!h) { if (horas.length) res.marcas.push('sin_horario'); return res; }
    const tramos = ((op.feriado && h.feriados) ? h.feriados[dow] : h.dias[dow]) || [];
    const normales = tramos.filter(t => /^NORMAL/i.test(t.tipo)), extras = tramos.filter(t => !/^NORMAL/i.test(t.tipo));
    const base = normales[0] || null;
    const desc = h.descanso ? [hm(h.descanso.desde), hm(h.descanso.desde) + (h.descanso.minutos || 60)] : null;
    const descEn = (a, b) => (desc ? solape(a, b, desc[0], desc[1]) : 0);
    if (base && !op.feriado) res.esperadoMin = (hm(base.hasta) - hm(base.desde)) - descEn(hm(base.desde), hm(base.hasta));

    if (!horas.length) { if (res.esperadoMin > 0 && !op.feriado) res.marcas.push('ausente'); return res; }
    if (horas.length === 1) {
      res.marcas.push('fichada_unica');
      const t = hm(horas[0]);
      if (base) {
        if (t < 12 * 60) res.sugerencias.push({ accion: 'agregar', hora: h.salidaSugerida || base.hasta, motivo: 'Falta la salida' });
        else res.sugerencias.push({ accion: 'agregar', hora: h.entradaSugerida || base.desde, motivo: 'Falta la entrada' });
      }
      return res;
    }
    if (horas.length > 2) res.marcas.push('mas_de_dos');
    const e = hm(res.entrada), s = hm(res.salida), pag = res.pagado;
    const sumar = (tipo, min) => { if (min > 0) pag[tipo] = (pag[tipo] || 0) + min; };

    if (!tramos.length) { res.marcas.push('dia_sin_horario'); res.sinHoraMin = s - e; return res; }
    // fuera de horario: antes del primer tramo y después del último (no se paga)
    const ini = Math.min(...tramos.map(t => hm(t.desde))), fin = Math.max(...tramos.map(t => hm(t.hasta)));
    res.sinHoraMin = Math.max(0, ini - e) + Math.max(0, s - fin);

    if (base) {
      const bd = hm(base.desde), bh = hm(base.hasta), tH = base.tolHasta || 0, tolD = base.tolDesde || 0;
      const real = solape(e, s, bd, bh) - (descEn(Math.max(e, bd), Math.min(s, bh)));
      const completo = e <= bd + tolD && s >= bh - tH;
      sumar(base.tipo, completo ? res.esperadoMin || real : redondearAbajo(real, unidad));
      if (e > bd + tolD) { res.marcas.push('tarde'); res.sugerencias.push({ accion: 'reemplazar', de: res.entrada, hora: base.desde, motivo: 'Llegada tarde perdonada' }); }
      if (s < bh - tH) res.marcas.push('salida_temprana');
    }
    // tramos extra y tramos «normal» adicionales: minutos dentro del tramo (con la tolerancia de inicio) redondeados a la unidad
    for (const t of tramos.filter(x => x !== base)) {
      const td = hm(t.desde), th = hm(t.hasta), tolD = t.tolDesde || 0;
      let real = solape(e, s, td, th);
      if (e > td && e <= td + tolD && s > td) real += e - td;                       // entró dentro de la tolerancia del inicio: cuenta desde el inicio
      const min = redondear(real, unidad);                                           // unidad 1: minutos exactos, sin mínimo (verificado con Delta)
      sumar(t.tipo, min);
      if (min > 0 && /^EXTRA/i.test(t.tipo)) res.marcas.push('extra');
    }
    if (op.feriado && Object.keys(pag).length) res.marcas.push('revisar_feriado');
    if (!op.feriado && !base && Object.keys(pag).length) res.marcas.push('fin_de_semana');
    res.marcas = [...new Set(res.marcas)];
    return res;
  }
  function redondearAbajo(min, unidad) { return unidad > 1 ? Math.floor(min / unidad) * unidad : min; }

  /**
   * Parte de un conjunto de fichadas: agrupa por legajo y fecha y aplica el horario de cada legajo.
   * entrada: { fichadas:[{legajo,fecha,hora}], legajos: Map(legajo → {horario, unidad, habilitado}), horarios: Map(código → definición), feriados:Set('AAAA-MM-DD'), desde, hasta }
   * Incluye los días sin fichadas de quienes están habilitados y tienen horario (ausentes).
   */
  function armarPartes(o) {
    const porDia = new Map();
    for (const f of o.fichadas) { const k = f.legajo + '|' + f.fecha; if (!porDia.has(k)) porDia.set(k, []); porDia.get(k).push(f.hora); }
    const fechas = [];
    if (o.desde && o.hasta) for (let d = new Date(o.desde + 'T12:00:00'); d <= new Date(o.hasta + 'T12:00:00'); d.setDate(d.getDate() + 1)) fechas.push(d.toISOString().slice(0, 10));
    else [...new Set(o.fichadas.map(f => f.fecha))].sort().forEach(x => fechas.push(x));
    const out = [];
    for (const [legajo, cfg] of o.legajos) {
      if (cfg.habilitado === false) continue;
      const horario = cfg.horario ? o.horarios.get(cfg.horario) : null;
      for (const fecha of fechas) {
        const horas = porDia.get(legajo + '|' + fecha) || [];
        const feriado = !!(o.feriados && o.feriados.has(fecha));
        const dow = diaSemana(fecha);
        if (!horas.length) {
          const hay = horario && (((feriado && horario.feriados ? horario.feriados[dow] : horario.dias[dow]) || []).some(t => /^NORMAL/i.test(t.tipo)));
          if (!hay || feriado) continue;                                   // sin fichadas y sin obligación de trabajar: no hay parte
        }
        out.push({ legajo, fecha, dia: NOMBRE_DIA[dow], horario: cfg.horario || null, unidad: cfg.unidad || 30, ...calcularDia({ fecha, horas, horario, unidad: cfg.unidad || 30, feriado }), horas: horas.slice().sort() });
      }
    }
    return out.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.legajo - b.legajo);
  }

  return { leerTxt, armarTxt, calcularDia, armarPartes, codigoFichador, legajoDe, hm, fmt, redondear, diaSemana, NOMBRE_DIA };
});
