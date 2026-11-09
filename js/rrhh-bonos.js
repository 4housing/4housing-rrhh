/* ==========================================================================
   RRHH · bonos de proyecto: lectura del libro histórico (BONOS_AAAA-AAAA.xlsx) y resúmenes. Sin DOM.
   Hojas que se leen: PROYECTOS (un renglón por bono: n°, nombre, proyecto base «VENTA», monto, caja, planilla cerrada) y
   PERSONAL (legajo × bono: el importe de cada persona en cada bono; la fila 2 trae el período del bono, p. ej. 202504/202505).
   Las demás hojas (Contabilidad, Caja, Bonos…) no se leen. El nombre de la persona NO se toma del libro: sale del padrón.
   Tipo: lo discriminable por el nombre (Post Venta / PV → posventa); el resto queda «sin_discriminar» (hasta ahora todo se
   llamaba Producción; a futuro se discriminan).
   Control: la suma de las personas de cada bono tiene que coincidir con el monto de PROYECTOS (si no, queda advertido).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHBonos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const cent = x => Math.round((Number(x) || 0) * 100);
  const num = x => (typeof x === 'number' && Number.isFinite(x) ? x : (typeof x === 'string' && x.trim() !== '' && Number.isFinite(Number(x)) ? Number(x) : null));

  const TIPOS = { montaje: 'Montaje', posventa: 'Posventa', produccion: 'Producción', sin_discriminar: 'Sin discriminar' };

  function tipoDe(nombre) {
    return /post\s*venta|posventa|\bpv\b/i.test(String(nombre || '')) ? 'posventa' : 'sin_discriminar';
  }

  /** '202504' → '2026-04'-style; '202504/202505' → {desde,hasta}. Algo que no es un período válido → null (se avisa). */
  function periodoDe(etiqueta) {
    const t = String(etiqueta == null ? '' : etiqueta).trim();
    const ms = t.split('/').map(x => x.trim());
    const val = x => { const m = /^(20\d{2})(0[1-9]|1[0-2])$/.exec(x); return m ? m[1] + '-' + m[2] : null; };
    const a = val(ms[0]), b = ms.length > 1 ? val(ms[1]) : a;
    return a && b ? { desde: a, hasta: b } : null;
  }

  /**
   * matrices: { PROYECTOS: [[…]], PERSONAL: [[…]] } (filas de cada hoja, como las da SheetJS con header:1)
   * → { bonos:[…], personas:[{num_bono,legajo,importe}], errores:[], advertencias:[] }
   */
  function parseLibro(matrices) {
    const out = { bonos: [], personas: [], errores: [], advertencias: [] };
    const Q = (matrices && matrices.PROYECTOS) || [], P = (matrices && matrices.PERSONAL) || [];
    if (!Q.length) out.errores.push('No encontré la hoja PROYECTOS.');
    if (!P.length) out.errores.push('No encontré la hoja PERSONAL.');
    if (out.errores.length) return out;

    // PROYECTOS: encabezado con Num Bono / PROYECTO / VENTA / BONOS / Caja GP / Planilla Cerrada
    const h = (Q[0] || []).map(norm);
    const col = (...c) => h.findIndex(x => c.some(y => x === y || x.startsWith(y)));
    const iN = col('num bono'), iP = col('proyecto'), iV = col('venta'), iB = col('bonos'), iC = col('caja'), iPl = col('planilla cerrada');
    if (iN < 0 || iP < 0 || iB < 0) { out.errores.push('PROYECTOS: faltan las columnas Num Bono, PROYECTO y BONOS.'); return out; }
    const porNombre = new Map();
    for (const r of Q.slice(1)) {
      const n = num(r[iN]); if (n == null || !r[iP]) continue;                // los renglones de totales no tienen número de bono
      const nombre = String(r[iP]).trim();
      const b = { num_bono: Math.trunc(n), nombre, proyecto: String(iV >= 0 && r[iV] ? r[iV] : nombre).trim(), tipo: tipoDe(nombre),
                  etiqueta_periodo: null, periodo_desde: null, periodo_hasta: null,
                  monto: num(r[iB]) || 0, caja: iC >= 0 ? num(r[iC]) : null, planilla_cerrada: iPl >= 0 ? num(r[iPl]) : null };
      if (porNombre.has(norm(nombre))) { out.advertencias.push('PROYECTOS: «' + nombre + '» está repetido; se usa la primera.'); continue; }
      porNombre.set(norm(nombre), b); out.bonos.push(b);
    }

    // PERSONAL: fila 1 = nombres de bono, fila 2 = períodos; desde la tercera columna hasta «Total» o un hueco
    const enc = P[0] || [], per = P[1] || [], cols = [];
    for (let c = 2; c < enc.length; c++) { if (enc[c] == null || enc[c] === '' || /^total/i.test(String(enc[c]))) break; cols.push(c); }
    const colDe = new Map();
    for (const c of cols) {
      const b = porNombre.get(norm(enc[c]));
      if (!b) { out.advertencias.push('PERSONAL: la columna «' + enc[c] + '» no está en PROYECTOS; no se importa.'); continue; }
      colDe.set(c, b);
      b.etiqueta_periodo = per[c] == null ? null : String(per[c]);
      const pd = periodoDe(per[c]);
      if (pd) { b.periodo_desde = pd.desde; b.periodo_hasta = pd.hasta; }
      else out.advertencias.push('PERSONAL: el período «' + per[c] + '» de «' + b.nombre + '» no es válido (AAAAMM): queda sin período.');
    }
    for (const b of out.bonos) if (![...colDe.values()].includes(b)) out.advertencias.push('PROYECTOS: «' + b.nombre + '» no tiene columna en PERSONAL: queda sin personas.');
    const vistos = new Set();
    for (const r of P.slice(2)) {
      const leg = num(r[0]); if (leg == null || !Number.isInteger(leg)) continue;
      if (vistos.has(leg)) { out.advertencias.push('PERSONAL: el legajo ' + leg + ' está repetido; se usa la primera fila.'); continue; }
      vistos.add(leg);
      for (const [c, b] of colDe) { const imp = num(r[c]); if (imp != null && imp !== 0) out.personas.push({ num_bono: b.num_bono, legajo: leg, importe: imp }); }
    }

    // Control: personas vs monto del bono
    const suma = new Map();
    for (const p of out.personas) suma.set(p.num_bono, (suma.get(p.num_bono) || 0) + cent(p.importe));
    const dif = out.bonos.filter(b => colDe.size && [...colDe.values()].includes(b) && Math.abs((suma.get(b.num_bono) || 0) - cent(b.monto)) > 100);
    if (dif.length) out.advertencias.push('La suma de las personas no coincide con el monto de PROYECTOS en ' + dif.length + ' bono(s): ' + dif.slice(0, 5).map(b => b.nombre).join(', ') + (dif.length > 5 ? '…' : '') + '.');
    out.control = { bonos: out.bonos.length, personas: new Set(out.personas.map(p => p.legajo)).size, renglones: out.personas.length, diferencias: dif.length };
    return out;
  }

  /** Une personas con su bono y con el padrón: una fila por persona × bono. */
  function detallePersonas(bonos, personas, empleados) {
    const b = new Map((bonos || []).map(x => [x.num_bono, x])), e = new Map((empleados || []).map(x => [Number(x.legajo), x]));
    return (personas || []).map(p => {
      const bo = b.get(p.num_bono) || {}, em = e.get(Number(p.legajo)) || {};
      return { legajo: p.legajo, nombre: em.nombre || null, departamento: em.departamento || null, num_bono: p.num_bono, bono: bo.nombre || '', proyecto: bo.proyecto || '',
               tipo: bo.tipo || 'sin_discriminar', etiqueta: bo.etiqueta_periodo || '', importe: Number(p.importe) || 0 };
    });
  }

  /** Resumen por proyecto base: bonos, personas distintas y total (suma exacta en centavos). */
  function resumenProyectos(bonos, personas) {
    const porBono = new Map(); const pp = new Map();
    for (const p of personas || []) {
      porBono.set(p.num_bono, (porBono.get(p.num_bono) || 0) + cent(p.importe));
      if (!pp.has(p.num_bono)) pp.set(p.num_bono, new Set()); pp.get(p.num_bono).add(p.legajo);
    }
    const m = new Map();
    for (const b of bonos || []) {
      const r = m.get(b.proyecto) || { proyecto: b.proyecto, bonos: 0, personas: new Set(), total: 0, planilla: 0, caja: 0, desde: null, hasta: null, tipos: new Set() };
      r.bonos++; r.total += porBono.get(b.num_bono) || 0; r.planilla += cent(b.planilla_cerrada); r.caja += cent(b.caja);
      (pp.get(b.num_bono) || new Set()).forEach(l => r.personas.add(l));
      if (b.periodo_desde && (!r.desde || b.periodo_desde < r.desde)) r.desde = b.periodo_desde;
      if (b.periodo_hasta && (!r.hasta || b.periodo_hasta > r.hasta)) r.hasta = b.periodo_hasta;
      r.tipos.add(b.tipo); m.set(b.proyecto, r);
    }
    return [...m.values()].map(r => ({ proyecto: r.proyecto, bonos: r.bonos, personas: r.personas.size, total: r.total / 100, planilla: r.planilla / 100, caja: r.caja / 100,
      desde: r.desde, hasta: r.hasta, tipo: r.tipos.size === 1 ? [...r.tipos][0] : 'mixto' })).sort((a, b) => a.proyecto.localeCompare(b.proyecto, 'es'));
  }

  /**
   * Lo liquidado por mes en los conceptos de bono de proyecto (trata directo_proyecto, OC): filas de rrhh_liquidacion_filas + catálogo.
   * tipoBono(concepto) viene de rrhh-calculo.js. → [{periodo, montaje, posventa, otro, total, personas}]
   */
  function liquidadoPorMes(filas, catalogo, tipoBono) {
    const cat = new Map((catalogo || []).map(c => [String(c.nro_concepto) + '|' + c.empresa, c]));
    const m = new Map();
    for (const f of filas || []) {
      const c = cat.get(String(f.nro_concepto) + '|' + f.empresa);
      if (!c || f.empresa !== '4H_OC' || c.trata !== 'directo_proyecto') continue;
      const r = m.get(f.periodo) || { periodo: f.periodo, montaje: 0, posventa: 0, otro: 0, personas: new Set() };
      r[tipoBono(c)] += cent(f.importe); r.personas.add(f.legajo); m.set(f.periodo, r);
    }
    return [...m.values()].sort((a, b) => (a.periodo < b.periodo ? -1 : 1)).map(r => ({ periodo: r.periodo, montaje: r.montaje / 100, posventa: r.posventa / 100, otro: r.otro / 100,
      total: (r.montaje + r.posventa + r.otro) / 100, personas: r.personas.size }));
  }

  return { parseLibro, detallePersonas, resumenProyectos, liquidadoPorMes, tipoDe, periodoDe, TIPOS };
});
