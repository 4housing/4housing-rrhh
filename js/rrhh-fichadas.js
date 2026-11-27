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
    const res = { horas, entrada: horas[0] || null, salida: horas.length > 1 ? horas[horas.length - 1] : null, n: horas.length, esperadoMin: 0, pagado: {}, sinHoraMin: 0, marcas: [], sugerencias: [] };
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

  /* ------------------------ qué amerita una decisión ------------------------ */
  // Códigos de novedad que justifican (o ya resuelven) un día sin fichadas.
  const JUSTIFICACION = { HSENF: 'Enfermedad', LICART: 'Licencia por ART', HSJUS: 'Horas justificadas', HSJUSVA: 'Horas justificadas', VACJOR: 'Vacaciones', VACM: 'Vacaciones',
    HSINJ: 'Ausencia injustificada (ya cargada)', LICSSDO: 'Licencia sin goce', LICCUIFAM: 'Licencia por cuidado familiar', MATERNIDAD: 'Maternidad', MATRIMONIO: 'Matrimonio', MATRIM: 'Matrimonio',
    NACIMIENTO: 'Nacimiento', FALLECIM: 'Fallecimiento', EXAMEN: 'Examen', 'MÉDICO': 'Médico', TRAMITE: 'Trámite', SANGRE: 'Donación de sangre', MUDANZA: 'Mudanza', TEMPORAL: 'Temporal', EXCEDENCIA: 'Excedencia' };
  const ACCION = ['ausente', 'fichada_unica', 'mas_de_dos', 'sin_horario', 'dia_sin_horario', 'revisar_feriado', 'salida_temprana', 'tarde'];
  const EXTRAS_ALTAS_MIN = 1800;                                    // más de 30 h de extras en el período = llamativo (se puede cambiar en la pantalla)
  /** 'revisar' = pide una decisión (falta algo, llegó tarde, feriado…) · 'extra' = solo hay horas extra por aprobar · 'ok' = no hace falta mirarlo.
   *  Una ausencia con novedad ese día (enfermedad, ART, vacaciones…) ya está resuelta. */
  function clasificar(parte, codigos) {
    const cod = (codigos || []).find(c => JUSTIFICACION[c]), justificacion = cod ? JUSTIFICACION[cod] : null;
    const accion = parte.marcas.some(m => ACCION.includes(m) && !(m === 'ausente' && justificacion));
    const extra = ['EXTRA 50%', 'EXTRA 100%'].some(k => (parte.pagado[k] || 0) > 0);
    return { clase: accion ? 'revisar' : extra ? 'extra' : 'ok', justificacion };
  }
  /** Resumen del período por persona. Cada parte trae: pagado, marcas, n, clase, justificacion, revisado, aprob50, aprob100. */
  function resumenPersonas(partes, opciones) {
    const lim = opciones && opciones.extrasAltasMin != null ? opciones.extrasAltasMin : EXTRAS_ALTAS_MIN, m = new Map();
    for (const p of partes) {
      let r = m.get(p.legajo);
      if (!r) m.set(p.legajo, r = { legajo: p.legajo, horario: p.horario, dias: 0, normalMin: 0, extra50Min: 0, extra100Min: 0, aprob50Min: 0, aprob100Min: 0, extraPorAprobar: 0, porRevisar: 0, ausentesSinAviso: 0, justificados: 0, tardes: 0, fichadasUnicas: 0 });
      if (p.n >= 2) r.dias++;
      r.normalMin += p.pagado['NORMAL 1'] || 0; r.extra50Min += p.pagado['EXTRA 50%'] || 0; r.extra100Min += p.pagado['EXTRA 100%'] || 0;
      if (p.revisado) { r.aprob50Min += p.aprob50 || 0; r.aprob100Min += p.aprob100 || 0; }
      else if (p.clase === 'extra') r.extraPorAprobar++; else if (p.clase === 'revisar') r.porRevisar++;
      if (p.marcas.includes('ausente')) { if (p.justificacion) r.justificados++; else r.ausentesSinAviso++; }
      if (p.marcas.includes('tarde')) r.tardes++;
      if (p.marcas.includes('fichada_unica')) r.fichadasUnicas++;
    }
    return [...m.values()].map(r => {
      const ll = [];
      if (r.extra50Min + r.extra100Min > lim) ll.push('Extras altas');
      if (r.ausentesSinAviso) ll.push('Ausente sin aviso');
      if (r.tardes >= 3) ll.push('Llegadas tarde reiteradas');
      if (r.fichadasUnicas) ll.push('Fichadas por completar');
      return { ...r, llamativo: ll };
    }).sort((a, b) => a.legajo - b.legajo);
  }

  /* ------------------------ qué se modificó y qué había antes ------------------------ */
  const horasFmt = min => (min / 60).toFixed(2).replace('.', ',');
  const TIPOS_HORA = [['NORMAL 1', 'Normal'], ['EXTRA 50%', 'Extra 50 %'], ['EXTRA 100%', 'Extra 100 %']];
  /**
   * Compara lo que vino de Tango con lo que quedó. op: { fichadasDia:[{hora,origen,anulada,motivo,creado_por,creado_en,anulada_por,anulada_en}], antes:{horas,pagado}, ahora:{horas,pagado},
   * aprobacion:{extra50_aprobada_min,extra100_aprobada_min,revisado_por,revisado_en}|null, quien:uid→nombre, cuando:iso→texto }
   * → { modificado:boolean, lineas:[texto] }  («antes» = solo las fichadas de Tango, tal como llegaron).
   */
  function describirCambios(op) {
    const quien = op.quien || (u => (u ? 'un usuario' : '')), cuando = op.cuando || (x => x || ''), lineas = [];
    const firma = (u, t) => { const q = u ? quien(u) : '', c = t ? cuando(t) : ''; return (q || c) ? ' — ' + [q, c].filter(Boolean).join(', ') : ''; };
    const dia = op.fichadasDia || [], manuales = dia.filter(f => f.origen === 'manual' && !f.anulada), anuladas = dia.filter(f => f.origen === 'tango' && f.anulada);
    for (const f of manuales) lineas.push('+ ' + f.hora + ' agregada por RRHH' + (f.motivo ? ' (' + f.motivo + ')' : '') + firma(f.creado_por, f.creado_en));
    for (const f of anuladas) lineas.push('− ' + f.hora + ' anulada' + (f.motivo ? ' (' + f.motivo + ')' : '') + firma(f.anulada_por, f.anulada_en));
    if (manuales.length || anuladas.length) {
      const antes = (op.antes.horas || []).join(' · ') || 'sin fichadas', ahora = (op.ahora.horas || []).join(' · ') || 'sin fichadas';
      lineas.unshift('Fichadas — antes: ' + antes + ' → ahora: ' + ahora);
      for (const [k, n] of TIPOS_HORA) { const a = op.antes.pagado[k] || 0, b = op.ahora.pagado[k] || 0; if (a !== b) lineas.push(n + ': ' + horasFmt(a) + ' h → ' + horasFmt(b) + ' h'); }
    }
    const ap = op.aprobacion;
    if (ap) for (const [campo, k, n] of [['extra50_aprobada_min', 'EXTRA 50%', 'Extra 50 %'], ['extra100_aprobada_min', 'EXTRA 100%', 'Extra 100 %']]) {
      const calc = op.ahora.pagado[k] || 0;
      if (ap[campo] != null && ap[campo] !== calc) lineas.push(n + ' aprobada: calculada ' + horasFmt(calc) + ' h → aprobada ' + horasFmt(ap[campo]) + ' h' + firma(ap.revisado_por, ap.revisado_en));
    }
    return { modificado: lineas.length > 0, lineas };
  }

  /* ------------------------ calendario visual ------------------------ */
  const horasCal = min => (Math.round(min / 60 * 100) / 100).toString().replace('.', ',');
  /** Duración legible: múltiplos de 30 minutos en horas («1,5 h»); el resto en horas y minutos («17 min», «1 h 8 min»). */
  const duracion = min => (min % 30 === 0 ? horasCal(min) + ' h' : (min >= 60 ? Math.floor(min / 60) + ' h ' + (min % 60) + ' min' : min + ' min'));
  /**
   * Qué se ve en la celda de una persona y un día del calendario. p: parte con { pagado, marcas, n, esperadoMin, justificacion, codigos }.
   * → { texto, clase: 'ok'|'vac'|'justificada'|'injustificada'|'unica'|'fer'|'vacio', extras:'+1,5 h 50 % · +2 h 100 %', menos:'−1 h' }
   */
  function celdaCalendario(p) {
    const cods = p.codigos || [], normal = p.pagado['NORMAL 1'] || 0, e50 = p.pagado['EXTRA 50%'] || 0, e100 = p.pagado['EXTRA 100%'] || 0;
    const extras = [e50 ? '+' + duracion(e50) + ' 50 %' : '', e100 ? '+' + duracion(e100) + ' 100 %' : ''].filter(Boolean).join(' · ');
    if (p.marcas.includes('ausente')) {
      if (cods.some(c => c === 'VACJOR' || c === 'VACM')) return { texto: 'Vac.', clase: 'vac', extras: '', menos: '' };
      if (cods.includes('HSENF')) return { texto: 'Enf.', clase: 'justificada', extras: '', menos: '' };
      if (cods.includes('LICART')) return { texto: 'ART', clase: 'justificada', extras: '', menos: '' };
      if (!cods.includes('HSINJ') && p.justificacion) return { texto: 'Aus J.', clase: 'justificada', extras: '', menos: '' };
      return { texto: 'Aus. Inj.', clase: 'injustificada', extras: '', menos: '' };            // sin novedad (sin aviso) o ya cargada como injustificada
    }
    if (p.n === 1) return { texto: '?', clase: 'unica', extras: '', menos: '' };                  // una sola fichada: falta completar
    if (p.marcas.includes('sin_horario')) return { texto: '·', clase: 'ok', extras: '', menos: '' };
    const feriado = p.marcas.includes('feriado');
    const menos = p.esperadoMin && normal < p.esperadoMin ? '−' + duracion(p.esperadoMin - normal) : '';
    return { texto: feriado ? 'Fer.' : normal ? horasCal(normal) : '', clase: feriado ? 'fer' : (normal || extras ? 'ok' : 'vacio'), extras, menos };
  }

  return { leerTxt, armarTxt, calcularDia, armarPartes, clasificar, resumenPersonas, describirCambios, celdaCalendario, JUSTIFICACION, EXTRAS_ALTAS_MIN, codigoFichador, legajoDe, hm, fmt, redondear, diaSemana, NOMBRE_DIA };
});
