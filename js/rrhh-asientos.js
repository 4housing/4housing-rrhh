/* ==========================================================================
   RRHH · asientos contables de los ADICIONALES PAGADOS EN EFECTIVO (Tango, caja en pesos) a partir del «Resumen de conceptos liquidados».
   No es la liquidación formal por sueldos (la que sale por banco y se controla contra el F.931): es un informe adicional y distinto.
   Lógica PURA (sin DOM, sin red): recibe filas del informe + padrón de legajos + configuración y devuelve los asientos
   (con sus renglones y los auxiliares a cargar), lo que quedó sin destino y un control contra el total del informe.
   Probada con datos sintéticos en test/asientos.test.js.

   Reglas (deducidas de agosto y septiembre 2026 y confirmadas por administración; lo no confirmado se avisa):
     · Adicional Socios (55303)  → «SUELDOS»: Debe Sueldos, sector 08 Gerencia.
     · Personas con asiento individual (Ventas / Administración / Técnica): suma de sus conceptos (Copart., OSDE, Adicional, Monotributo)
       → «SUELDOS <SECTOR>», una línea por persona.
     · Copart. Adm. (55000) del resto → «COMISION COPART ADM»: Debe Comisiones Mandos Medios; el auxiliar Sueldos se reparte por el
       departamento de cada persona en el padrón (porcentaje = importe del sector / total, 2 decimales, suma 100).
       Descuento Hogar (55035) → RRHH, Cochera y Viáticos (55300/55302) → Movilidad, ambos en el mismo asiento. Vacaciones (55200) → línea propia.
     · Comisión Rental (55050/55051) → «COMISION VENTA ALQUILER Y DTM» (cada importe al múltiplo de $500 más cercano).
     · Recategorización y ajuste UOM (55012/55550) → «Dif. de categoria» (sector Operarios).
     · Neuquén: todo lo de las personas con Copar. Neuquén (55011) en UN asiento al cierre (no por quincena), contra Remuneraciones a pagar.
       La gratificación por liquidación final (55500) va a Indemnizaciones.
     · Bono Montaje (55015/55016/55025) → un asiento con el proyecto elegido.
     · Coparticipación Operarios (55010) → se reparte entre proyectos según la base de la planilla COPAR (auxiliar Instructivo de fabricación).
     · Adelanto de coparticipación (55041) → préstamo al personal en dólares a la cotización indicada.
     · Redondeo (99999): acompaña a la línea de la persona que trae decimales.
     · Sábado Taller (55013) y horas extra / feriado (55014/55030/55551) de quienes no son de Neuquén → se reparten POR DÍA: los días pagados salen de las novedades
       registradas (SABADO: partes iguales por día; HRSEX1: proporcional a las horas) y el proyecto y la tarea de cada día, del informe «formato DATOS» de la app de
       planificación. Lo que no se pueda ubicar por día → un asiento que se computa al PROYECTO indicado
       (EERR «A) CMV VENTA», Instructivo = proyecto, Sueldos = «NO APLICA») con el MOTIVO de por qué se trabajaron. Más adelante el reparto por proyecto saldrá
       del informe de la app de planificación; por ahora va todo a un solo proyecto.
     · Todo lo demás NO se asienta: queda en «Sin destino» para que se vea.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHAsientos = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const to2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const sinTildes = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  /** Clave de persona: apellido + nombre sin tildes ni signos ni espacios dobles (el legajo cambia entre meses; el nombre no). */
  const clave = (apellidos, nombre) => sinTildes((apellidos || '') + ' ' + (nombre || '')).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  const limpio = s => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  const pad2 = n => String(n == null ? '' : n).padStart(2, '0');

  const CUENTA = { sueldos: '56000001', copart: '55000014', movilidad: '52000002', rrhh: '56000009', alquileres: '55000004', dtm: '55000010',
    bono: '55000016', indem: '56000008', caja: '11110071', pagar: '21400001', prestamos: '11220002' };
  const TIPO_AUX = { EERR: { cod: '02', nom: '02 - EERR' }, INSTR: { cod: '03', nom: '03 - INSTRUCTIVO DE FABRICACION' },
    SUELDOS: { cod: '10', nom: '10 - SUELDOS' }, PREST: { cod: '30', nom: '30 - PRESTAMOS PERSONAL' } };
  const E = { sueldos: { cod: '23', desc: 'N) SUELDOS' }, estructura: { cod: '20', desc: 'K) ESTRUCTURA' }, alquiler: { cod: '04', desc: 'B) COSTO ALQUILER MODULO' },
    terceros: { cod: '08', desc: 'G) COSTO SERV TERCERIZADOS' }, cmv: { cod: '02', desc: 'A) CMV VENTA' } };
  const I = { suepro: { cod: '4)', desc: 'SUEPRO SUE PRO' }, na: { cod: '1)', desc: 'NA NO APLICA' } };
  const SECTORES = { '01': 'Operarios', '04': 'Técnica', '05': 'Compras', '06': 'Ventas', '07': 'Administracion', '08': 'Gerencia', '20': 'Neuquén' };
  const SECTOR_DE_DEPTO = { 'gerencia operaciones': '01', 'gerencia tecnica': '04', 'gerencia compras y logistica': '05', 'gerencia comercial': '06', 'gerencia admin y finanzas': '07' };
  const sectorDeDepto = d => SECTOR_DE_DEPTO[sinTildes(limpio(d))] || null;
  const tituloIndividual = cod => 'SUELDOS ' + sinTildes(SECTORES[cod] || cod).toUpperCase();

  /** Porcentajes con 2 decimales que suman exactamente 100,00 (método del mayor resto). */
  function porcentajes(importes) {
    const tot = importes.reduce((s, x) => s + x, 0);
    if (!tot) return importes.map(() => 0);
    const c = importes.map(x => x / tot * 10000), fl = c.map(Math.floor);
    let faltan = 10000 - fl.reduce((s, x) => s + x, 0);
    c.map((x, i) => [x - fl[i], i]).sort((a, b) => b[0] - a[0]).forEach(([, i]) => { if (faltan > 0) { fl[i]++; faltan--; } });
    return fl.map(x => x / 100);
  }
  /** Reparte `total` en partes proporcionales a `pesos` con 2 decimales y que sumen exactamente `total`. */
  function repartir(total, pesos) {
    const s = pesos.reduce((a, x) => a + x, 0);
    if (!s) return pesos.map(() => 0);
    const out = pesos.map(x => to2(total * x / s));
    out[out.length - 1] = to2(out[out.length - 1] + (total - out.reduce((a, x) => a + x, 0)));
    return out;
  }

  /** Padrón: de la solapa LEGAJOS solo se toman Número, Apellido y nombre y Departamento (el resto —C.U.I.L., teléfono, correo— se descarta). */
  function leerLegajos(filas) {
    const m = new Map();
    for (const f of filas || []) {
      const num = f['Número'] != null ? f['Número'] : f['Numero'], an = f['Apellido y nombre'], dep = f['Descripción de departamento'] != null ? f['Descripción de departamento'] : f['Descripcion de departamento'];
      if (num == null || !an) continue;
      const i = String(an).indexOf(',');
      const ap = i < 0 ? String(an) : String(an).slice(0, i), no = i < 0 ? '' : String(an).slice(i + 1);
      m.set(clave(ap, no), { legajo: num, depto: limpio(dep), nombre: limpio(ap) + ', ' + limpio(no) });
    }
    return m;
  }
  /** Informe «Resumen de conceptos liquidados»: solo se toman legajo, apellidos, nombre, concepto e importe (nunca C.U.I.L.). */
  function leerResumen(filas, periodo) {
    const out = [];
    for (const f of filas || []) {
      const nro = Number(f['Nro. de concepto']), imp = Number(f['Importe liquidado']);
      if (!Number.isFinite(nro) || !Number.isFinite(imp) || f['Legajo'] == null) continue;
      const p = f['Período liquidado'] instanceof Date ? f['Período liquidado'].getFullYear() * 100 + f['Período liquidado'].getMonth() + 1 : f['Período liquidado'];
      if (periodo && String(p) !== String(periodo)) continue;
      out.push({ legajo: f['Legajo'], apellidos: limpio(f['Apellidos']), nombre: limpio(f['Nombre']), nro, desc: limpio(f['Desc. de concepto']), importe: imp, periodo: p });
    }
    return out;
  }
  /** Períodos (AAAAMM) presentes en el informe. */
  function periodos(filas) {
    const s = new Set();
    for (const f of filas || []) { const d = f['Período liquidado']; if (d instanceof Date) s.add(d.getFullYear() * 100 + d.getMonth() + 1); else if (d != null) s.add(Number(d)); }
    return [...s].sort();
  }

  /** Informe «formato DATOS» de la app de planificación (CSV con «;» o columnas pegadas con tabulación; con o sin encabezado). Se usan solo posiciones:
   *  0 Legajo · 3 Fecha (AAAA-MM-DD) · 4 Día · 6 Proyecto · 10 TAREAS · 11 Desc Tarea. */
  function leerDatos(texto) {
    const t = String(texto == null ? '' : texto).replace(/^\uFEFF/, '');
    const sep = t.split(/\r?\n/, 1)[0].includes('\t') ? '\t' : ';';
    const filas = []; let fila = [], cel = '', q = false;
    for (let i = 0; i < t.length; i++) {
      const c = t[i];
      if (q) { if (c === '"') { if (t[i + 1] === '"') { cel += '"'; i++; } else q = false; } else cel += c; }
      else if (c === '"') q = true;
      else if (c === sep) { fila.push(cel); cel = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; fila.push(cel); cel = ''; if (fila.some(x => x !== '')) filas.push(fila); fila = []; }
      else cel += c;
    }
    if (cel !== '' || fila.length) { fila.push(cel); if (fila.some(x => x !== '')) filas.push(fila); }
    return filas.filter(f => /^\d+$/.test(limpio(f[0])) && /^\d{4}-\d{2}-\d{2}$/.test(limpio(f[3])))
      .map(f => ({ legajo: limpio(f[0]), fecha: limpio(f[3]), dia: sinTildes(limpio(f[4])), proyecto: limpio(f[6]), tarea: limpio(f[10]), desc: limpio(f[11]) }));
  }
  const esProyecto = txt => /\d/.test(limpio(txt).split(' ')[0]);                       // «4417 VICUÑA», «PL0096 ANDY»; no «Mantenimiento», «Ausente»…
  /** Auxiliar de Tango de un proyecto de la planificación: el que se configuró; si no, «4417 VICUÑA» → «IF4417 VICUÑA» (IF = Instructivo de Fabricación, la clasificación que usan
   *  todas las apps; la planificación la resume con el número); «PL0096 ANDY» queda igual. */
  function auxProyecto(txt, cfg) {
    const m = cfg && cfg[txt]; if (m && m.cod) return { cod: m.cod, desc: m.desc || txt, supuesto: false };
    const tok = txt.split(' ')[0];
    return /^\d+$/.test(tok) ? { cod: 'IF' + tok, desc: 'IF' + txt, supuesto: false } : { cod: tok, desc: txt, supuesto: false };
  }

  /** Novedades registradas (Tango): solo se toman fecha, legajo, código y cantidad (nunca C.U.I.L. ni nombre). Interesan SABADO (días) y HRSEX1 (horas). */
  function leerNovedades(filas) {
    const out = [];
    for (const f of filas || []) {
      const cod = limpio(f['Cód. novedad'] != null ? f['Cód. novedad'] : f['Cod. novedad']).toUpperCase(), leg = f['Legajo'];
      const d = f['Fecha'], fecha = d instanceof Date ? d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0') : limpio(d).slice(0, 10);
      if (!cod || leg == null || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
      out.push({ fecha, legajo: String(leg).trim(), cod, cantidad: Number(f['Cantidad']) || 0 });
    }
    return out;
  }
  const CANDIDATOS_REDONDEO = ['socios', 'individual', 'copart', 'neuquen', 'vac', 'bonoAdm', 'bonoOpe', 'copeOpe', 'difcat', 'sab'];
  const PRIORIDAD_REDONDEO = ['bonoAdm', 'bonoOpe', 'vac', 'copeOpe', 'neuquen', 'difcat', 'sab', 'individual', 'socios', 'copart'];
  const tipoDe = nro => ({ 55303: 'socios', 55035: 'hogar', 55300: 'movilidad', 55302: 'movilidad', 55041: 'prestamo', 55050: 'rentalAlq', 55051: 'rentalSrv',
    55200: 'vac', 55015: 'bonoAdm', 55016: 'bonoAdm', 55025: 'bonoOpe', 55010: 'copeOpe', 55500: 'indemn', 55012: 'difcat', 55550: 'difcat', 55013: 'sab', 55014: 'sab', 55030: 'sab', 55551: 'sab' }[nro] || null);

  /**
   * o: { filas: leerResumen(...), legajos: Map, config: { personas: { [clave]: { asiento:'pool'|'ind', sector?:'06', prestamo?:'46' } } },
   *      periodo:'AAAAMM', fecha:'AAAA-MM-DD', cotizacion?:number, bono?:{ proyecto:'PL0030 VDP' }, sabados?:{ proyecto:'IF4417 VICUÑA', motivo:'…' }, copar?:[{ codigo, nombre, importe }] }
   */
  function generar(o) {
    const cfg = (o.config && o.config.personas) || {};
    const avisos = [], sinDestino = [], periodo = String(o.periodo || '');
    const pers = new Map();
    for (const f of o.filas) {
      const k = clave(f.apellidos, f.nombre);
      if (!pers.has(k)) {
        const lg = o.legajos && o.legajos.get(k), c = cfg[k] || {};
        const base = c.asiento === 'ind' ? 'ind' : 'pool';
        const sector = c.sector || sectorDeDepto(lg && lg.depto);
        pers.set(k, { fueraCfg: typeof c.fueraPlan === 'boolean' ? c.fueraPlan : null, clave: k, nombre: limpio(f.apellidos + ', ' + f.nombre), legajo: lg ? lg.legajo : f.legajo, legajoInforme: f.legajo, depto: lg ? lg.depto : '', nombreLegajo: lg ? lg.nombre : '',
          sector, ind: base === 'ind', prestamo: c.prestamo || '', lineas: [], enPadron: !!lg });
      }
      pers.get(k).lineas.push(f);
    }

    const sabPorLegajo = new Map();                  // legajo → sábados trabajados con proyecto, según el informe de planificación
    const legDatos = new Set((o.datos || []).map(r => r.legajo));   // legajos que figuran en el informe de planificación (con o sin proyecto)
    const datosDia = new Map();                      // legajo → fecha → fila del informe de planificación (cualquier día con proyecto)
    const novPor = new Map();                        // legajo → { SABADO:[{fecha,cant}], HRSEX1:[…] }: días PAGADOS según las novedades registradas
    for (const n of o.novedades || []) {
      if (n.cod !== 'SABADO' && n.cod !== 'HRSEX1') continue;
      if (!novPor.has(n.legajo)) novPor.set(n.legajo, { SABADO: [], HRSEX1: [] });
      novPor.get(n.legajo)[n.cod].push({ fecha: n.fecha, cant: n.cantidad });
    }
    for (const r of o.datos || []) {
      if (!esProyecto(r.proyecto)) continue;
      if (!datosDia.has(r.legajo)) datosDia.set(r.legajo, new Map());
      if (!datosDia.get(r.legajo).has(r.fecha)) datosDia.get(r.legajo).set(r.fecha, r);
      if (r.dia !== 'sabado') continue;
      if (!sabPorLegajo.has(r.legajo)) sabPorLegajo.set(r.legajo, new Map());
      if (!sabPorLegajo.get(r.legajo).has(r.fecha)) sabPorLegajo.get(r.legajo).set(r.fecha, r);
    }
    const D = { socios: 0, ind: new Map(), pool: [], hogar: 0, movilidad: 0, rentalAlq: 0, rentalSrv: 0, difcat: 0, neuquen: 0, indemn: 0, bonoAdm: 0, bonoOpe: 0, sab: 0, sabList: [],
      vac: [], prestamos: [], copeOpe: 0 };
    const sd = (p, l, motivo) => sinDestino.push({ persona: p.nombre, nro: l.nro, concepto: l.desc, importe: l.importe, motivo });

    for (const p of pers.values()) {
      const g = {};                                    // grupos de la persona por tipo
      const sumar = (t, imp) => { g[t] = (g[t] || 0) + imp; };
      let redondeo = 0, sabParte = 0, heParte = 0;
      const esNeu = p.lineas.some(l => l.nro === 55011);
      const sin0 = sinDestino.length;
      for (const l of p.lineas) {
        if (l.nro === 99999) { redondeo += l.importe; continue; }
        let t = tipoDe(l.nro);
        if (esNeu && t === 'sab') t = 'neuquen';                    // el sábado/hs extra de Neuquén va en su asiento
        if (!t) {
          if (esNeu) t = 'neuquen';
          else if (l.nro === 55000) t = p.ind ? 'individual' : 'copart';
          else if ([55301, 55304, 55305].includes(l.nro)) { if (p.ind) t = 'individual'; else { sd(p, l, 'Concepto de una persona sin asiento individual'); continue; } }
          else { sd(p, l, 'Sin regla de asiento todavía'); continue; }
        }
        if (t === 'sab') { if (l.nro === 55013) sabParte += l.importe; else heParte += l.importe; }
        sumar(t, l.importe);
      }
      // comisión rental: cada importe al múltiplo de $500 más cercano; consume parte del redondeo de la persona
      if (g.rentalAlq != null || g.rentalSrv != null) {
        const r500 = x => Math.round(x / 500) * 500;
        const a = g.rentalAlq || 0, s = g.rentalSrv || 0;
        const a2 = g.rentalAlq != null ? r500(a) : 0, s2 = g.rentalSrv != null ? r500(s) : 0;
        const consumido = to2(a2 + s2 - a - s);
        if (Math.abs(consumido - redondeo) > 1000) avisos.push(p.nombre + ': el redondeo de la comisión rental (' + consumido + ') difiere del redondeo liquidado (' + to2(redondeo) + ')');
        if (g.rentalAlq != null) g.rentalAlq = a2;
        if (g.rentalSrv != null) g.rentalSrv = s2;
        redondeo = to2(redondeo - consumido);
      }
      if (Math.abs(redondeo) > 0.005) {                // el resto del redondeo va a la línea con decimales (o, si no hay, a la mayor)
        const cand = CANDIDATOS_REDONDEO.filter(t => g[t] != null);
        const dec = cand.filter(t => Math.abs(g[t] - Math.round(g[t])) > 0.005).sort((x, y) => Math.abs(g[y]) - Math.abs(g[x]));
        const sinDec = sinDestino.slice(sin0).some(x => Math.abs(x.importe - Math.round(x.importe)) > 0.005);   // el redondeo es de un concepto que no se asienta
        const destino = dec[0] || (sinDec ? null : PRIORIDAD_REDONDEO.find(t => g[t] != null));       // sin decimales: primero las líneas «de cálculo» (bonos, vacaciones…), la coparticipación al final
        if (destino) g[destino] = to2(g[destino] + redondeo);
        else sinDestino.push({ persona: p.nombre, nro: 99999, concepto: 'Redondeo', importe: to2(redondeo), motivo: sinDec ? 'Acompaña a un concepto sin destino' : 'La persona no tiene otra línea asentada' });
      }
      for (const t of Object.keys(g)) {
        const imp = to2(g[t]);
        if (t === 'socios') D.socios += imp;
        else if (t === 'individual') { const k = p.sector || '??'; if (!D.ind.has(k)) D.ind.set(k, []); D.ind.get(k).push({ p, imp }); }
        else if (t === 'copart') D.pool.push({ p, imp });
        else if (t === 'vac') D.vac.push({ p, imp });
        else if (t === 'prestamo') D.prestamos.push({ p, imp });
        else if (t === 'sab') { D.sab += imp; D.sabList.push({ p, imp, sabado: to2(sabParte), he: to2(heParte) }); }
        else D[t] += imp;
      }
      if (g.copart != null && !p.sector) avisos.push(p.nombre + ': sin departamento en LEGAJOS; su coparticipación queda en «SIN SECTOR». Asignale un sector en la tabla de personas.');
      if (g.individual != null && !p.sector) avisos.push(p.nombre + ': asiento individual sin sector; elegí el sector en la tabla de personas.');
    }

    /* ---------------- armado de asientos ---------------- */
    const asientos = [];
    const mesTxt = periodo;
    const nuevo = (concepto, extra) => { const a = Object.assign({ concepto, moneda: 'PES', cotizacion: null, renglones: [], auxiliares: [], observaciones: '' }, extra || {}); asientos.push(a); return a; };
    const reng = (a, cuenta, debe, haber, leyenda) => { a.renglones.push({ nro: a.renglones.length + 1, cuenta, debe: debe || null, haber: haber || null, leyenda }); return a.renglones.length; };
    /** Gasto (o ingreso si es negativo) contra caja/otra cuenta, con el mismo texto. Devuelve el nro del renglón de gasto. */
    const gasto = (a, cuenta, importe, leyenda, contra) => {
      const n = Math.abs(importe), pos = importe >= 0;
      const r = reng(a, cuenta, pos ? n : 0, pos ? 0 : n, leyenda);
      reng(a, contra || CUENTA.caja, pos ? 0 : n, pos ? n : 0, leyenda);
      return r;
    };
    const aux = (a, nro, tipo, items) => {                       // items: [{ cod, desc, imp }]
      const ps = porcentajes(items.map(i => i.imp));
      items.forEach((it, i) => a.auxiliares.push({ renglon: nro, cuenta: a.renglones[nro - 1].cuenta, tipo: TIPO_AUX[tipo].nom, tipoCod: TIPO_AUX[tipo].cod,
        cod: it.cod, desc: it.desc, pct: ps[i], importe: to2(it.imp), importeUSD: it.usd }));
    };
    const sec = (cod, imp) => ({ cod, desc: SECTORES[cod] || 'SIN SECTOR', imp });
    const auxSueldo = (a, nro, importe, cod) => { aux(a, nro, 'EERR', [{ cod: E.sueldos.cod, desc: E.sueldos.desc, imp: importe }]); aux(a, nro, 'INSTR', [{ cod: I.suepro.cod, desc: I.suepro.desc, imp: importe }]); aux(a, nro, 'SUELDOS', [sec(cod, importe)]); };
    const nom = p => p.nombre.replace(/,/g, '');

    if (Math.abs(D.socios) > 0.005) {
      const a = nuevo('SUELDOS ' + mesTxt), n = gasto(a, CUENTA.sueldos, to2(D.socios), 'Aumento de sueldo de Dirección - ' + mesTxt);
      auxSueldo(a, n, to2(D.socios), '08');
    }
    for (const [cod, lista] of [...D.ind.entries()].sort()) {
      const a = nuevo(tituloIndividual(cod) + ' ' + mesTxt);
      for (const { p, imp } of lista) { const n = gasto(a, CUENTA.sueldos, imp, tituloIndividual(cod) + ' - ' + nom(p) + ' - ' + mesTxt); auxSueldo(a, n, imp, cod); }
    }
    const totPool = to2(D.pool.reduce((s, x) => s + x.imp, 0));
    if (D.pool.length || Math.abs(D.hogar) > 0.005 || Math.abs(D.movilidad) > 0.005 || D.vac.length) {
      const a = nuevo('COMISION COPART ADM ' + mesTxt), ley = 'COMISION COPART ADM ' + mesTxt;
      if (D.pool.length) {
        const n = gasto(a, CUENTA.copart, totPool, ley);
        const porSec = new Map();
        for (const { p, imp } of D.pool) porSec.set(p.sector || '??', to2((porSec.get(p.sector || '??') || 0) + imp));
        aux(a, n, 'EERR', [{ cod: E.sueldos.cod, desc: E.sueldos.desc, imp: totPool }]);
        aux(a, n, 'INSTR', [{ cod: I.na.cod, desc: I.na.desc, imp: totPool }]);
        aux(a, n, 'SUELDOS', [...porSec.entries()].sort().map(([c, v]) => sec(c, v)));
      }
      if (Math.abs(D.hogar) > 0.005) { const n = gasto(a, CUENTA.rrhh, to2(D.hogar), 'Descuento beneficio Hogar ' + mesTxt + ' - Admin'); aux(a, n, 'EERR', [{ cod: E.estructura.cod, desc: E.estructura.desc, imp: Math.abs(D.hogar) }]); }
      if (Math.abs(D.movilidad) > 0.005) { const n = gasto(a, CUENTA.movilidad, to2(D.movilidad), 'Beneficio Movilidad - Cochera/Viaticos ' + mesTxt); aux(a, n, 'EERR', [{ cod: E.estructura.cod, desc: E.estructura.desc, imp: D.movilidad }]); }
      for (const { p, imp } of D.vac) { const n = gasto(a, CUENTA.sueldos, imp, 'VACACIONES TRABAJADAS ' + nom(p).toUpperCase()); auxSueldo(a, n, imp, p.sector || '07'); }
    }
    if (Math.abs(D.rentalAlq) > 0.005 || Math.abs(D.rentalSrv) > 0.005) {
      const a = nuevo('COMISION VENTA ALQUILER Y DTM ' + mesTxt), ley = 'COMISION VENTA ALQUILER Y DTM ' + mesTxt;
      if (Math.abs(D.rentalAlq) > 0.005) { const n = gasto(a, CUENTA.alquileres, to2(D.rentalAlq), ley); aux(a, n, 'EERR', [{ cod: E.alquiler.cod, desc: E.alquiler.desc, imp: D.rentalAlq }]); aux(a, n, 'INSTR', [{ cod: I.na.cod, desc: I.na.desc, imp: D.rentalAlq }]); }
      if (Math.abs(D.rentalSrv) > 0.005) { const n = gasto(a, CUENTA.dtm, to2(D.rentalSrv), ley); aux(a, n, 'EERR', [{ cod: E.terceros.cod, desc: E.terceros.desc, imp: D.rentalSrv }]); }
    }
    if (Math.abs(D.difcat) > 0.005) {
      const a = nuevo('Sueldos - Dif. de categoria ' + mesTxt), n = gasto(a, CUENTA.sueldos, to2(D.difcat), 'Sueldos - Dif. de categoria ' + mesTxt);
      auxSueldo(a, n, to2(D.difcat), '01');
    }
    if (Math.abs(D.neuquen) > 0.005 || Math.abs(D.indemn) > 0.005) {
      const a = nuevo('COMISION COPART NEUQUEN ' + mesTxt), ley = 'COMISION COPART NEUQUEN ' + mesTxt;
      if (Math.abs(D.neuquen) > 0.005) { const n = gasto(a, CUENTA.copart, to2(D.neuquen), ley, CUENTA.pagar); auxSueldo(a, n, to2(D.neuquen), '20'); }
      if (Math.abs(D.indemn) > 0.005) { const n = gasto(a, CUENTA.indem, to2(D.indemn), 'RENDICION FINAL ' + mesTxt, CUENTA.pagar); auxSueldo(a, n, to2(D.indemn), '20'); }
    }
    if (Math.abs(D.bonoAdm) > 0.005 || Math.abs(D.bonoOpe) > 0.005) {
      const proy = limpio(o.bono && o.bono.proyecto), cod = proy.split(' ')[0];
      if (!proy) avisos.push('Bono Montaje: falta indicar el proyecto (p. ej. «PL0030 VDP»).');
      const a = nuevo('BONOS MONTAJE ' + (proy || 'PROYECTO A DEFINIR') + ' ' + mesTxt), ley = a.concepto;
      for (const imp of [to2(D.bonoAdm), to2(D.bonoOpe)]) if (Math.abs(imp) > 0.005) {
        const n = gasto(a, CUENTA.bono, imp, ley);
        aux(a, n, 'EERR', [{ cod: E.cmv.cod, desc: E.cmv.desc, imp }]);
        aux(a, n, 'INSTR', [{ cod: cod || '', desc: proy || 'A DEFINIR', imp }]);
      }
    }
    const sabados = [];                               // detalle para revisar: persona, concepto, fecha, proyecto, tarea, importe
    const conPago = new Set(D.sabList.filter(e => e.sabado > 0.005).flatMap(e => [String(e.p.legajo), String(e.p.legajoInforme)]));
    const sinPago = [...sabPorLegajo.entries()].filter(([l]) => !conPago.has(l));
    if (sinPago.length) avisos.push('Sábados trabajados en la planificación SIN «Sábado Taller» en el informe: legajo ' + sinPago.map(([l, m]) => l + ' (' + m.size + ')').join(', ') + '.');
    const proyUsados = new Set();
    if (Math.abs(D.sab) > 0.005) {
      const proyBase = limpio(o.sabados && o.sabados.proyecto), motivo = limpio(o.sabados && o.sabados.motivo);
      const porProy = new Map(), tareas = new Map(), auxDe = new Map();
      const cfgProy = (o.config && o.config.proyectos) || {};
      const hayNov = (o.novedades || []).length > 0;
      const sumaProy = (proy0, imp, tarea) => { let proy = proy0; if (proy0 !== proyBase && proy0 !== 'PROYECTO A DEFINIR') { const x = auxProyecto(proy0, cfgProy); proy = x.desc; auxDe.set(proy, x); proyUsados.add(proy0); if (x.supuesto) avisos.push('Proyecto «' + proy0 + '»: se usó el auxiliar «' + x.desc + '» (se supone el prefijo IF); confirmalo en la tabla de proyectos.'); }
        porProy.set(proy, to2((porProy.get(proy) || 0) + imp)); if (tarea) { if (!tareas.has(proy)) tareas.set(proy, new Set()); tareas.get(proy).add(tarea); } };
      let resto = 0;
      const ids = p => [...new Set([String(p.legajo), String(p.legajoInforme)])];
      /** Personal que no está en la planificación de producción (administrativos, Neuquén…): sus días van al proyecto indicado SIN aviso. Lo configurado manda; si no, se deduce de que no figure en el informe. */
      const fuera = p => (p.fueraCfg != null ? p.fueraCfg : (o.datos || []).length > 0 && !ids(p).some(l => legDatos.has(l)));
      const TAREA_FUERA = 'Personal fuera de la planificación de producción';
      const buscar = (mapa, p) => { for (const k of ids(p)) if (mapa.has(k)) return mapa.get(k); return null; };
      const aBase = (e, concepto, imp, tarea) => { if (Math.abs(imp) < 0.005) return; resto = to2(resto + imp); sabados.push({ persona: e.p.nombre, legajo: e.p.legajo, concepto, fecha: '', proyecto: proyBase || 'A DEFINIR', tarea: fuera(e.p) ? TAREA_FUERA : tarea, importe: imp, origen: fuera(e.p) ? 'proyecto indicado (fuera de la planificación)' : 'proyecto indicado' }); };
      /** Reparte `monto` entre días [{fecha, peso}]: el proyecto de cada día sale del informe de planificación (si ese día no figura, va al proyecto indicado). */
      const porDias = (e, concepto, monto, dias, origen) => {
        const partes = repartir(monto, dias.map(d => d.peso));
        dias.forEach((d, i) => {
          const fila = (buscar(datosDia, e.p) || new Map()).get(d.fecha);
          if (fila) { sumaProy(fila.proyecto, partes[i], fila.tarea); sabados.push({ persona: e.p.nombre, legajo: e.p.legajo, concepto, fecha: d.fecha, proyecto: fila.proyecto, tarea: fila.tarea, importe: partes[i], origen }); }
          else { const f0 = fuera(e.p); if ((o.datos || []).length && !f0) avisos.push(e.p.nombre + ': el ' + d.fecha + ' no figura con proyecto en el informe de planificación; va al proyecto indicado.'); resto = to2(resto + partes[i]); sabados.push({ persona: e.p.nombre, legajo: e.p.legajo, concepto, fecha: d.fecha, proyecto: proyBase || 'A DEFINIR', tarea: f0 ? TAREA_FUERA : 'Sin planificación ese día', importe: partes[i], origen: f0 ? 'proyecto indicado (fuera de la planificación)' : 'proyecto indicado' }); }
        });
      };
      for (const e of D.sabList) {
        let sab = e.sabado, he = e.he;
        const redondeo = to2(e.imp - sab - he);
        if (Math.abs(sab) >= Math.abs(he)) sab = to2(sab + redondeo); else he = to2(he + redondeo);    // el redondeo acompaña a la parte mayor
        const nov = buscar(novPor, e.p);
        if (Math.abs(sab) > 0.005) {
          const dNov = nov && nov.SABADO.length ? [...new Map(nov.SABADO.map(x => [x.fecha, x])).values()].map(x => ({ fecha: x.fecha, peso: 1 })) : [];
          if (dNov.length) porDias(e, 'Sábado Taller', sab, dNov, 'novedad SABADO + planificación');
          else {
            const dPlan = [...(buscar(sabPorLegajo, e.p) || new Map()).values()].map(x => ({ fecha: x.fecha, peso: 1 }));
            if (hayNov) avisos.push(e.p.nombre + ': tiene «Sábado Taller» pero ninguna novedad SABADO en el archivo de novedades.');
            if (dPlan.length) porDias(e, 'Sábado Taller', sab, dPlan, 'sábados planificados (sin novedad)');
            else { const f0 = fuera(e.p); if ((o.datos || []).length && !f0) avisos.push(e.p.nombre + ': sin sábado planificado con proyecto en el informe de planificación; su sábado va al proyecto indicado.'); aBase(e, 'Sábado Taller', sab, f0 ? TAREA_FUERA : 'Sin sábado planificado con proyecto'); }
          }
        }
        if (Math.abs(he) > 0.005) {
          const dHe = nov && nov.HRSEX1.length ? [...new Map(nov.HRSEX1.map(x => [x.fecha, x])).values()].map(x => ({ fecha: x.fecha, peso: Math.max(Number(x.cant) || 0, 0.0001) })) : [];
          if (dHe.length) porDias(e, 'Horas extra / feriado', he, dHe, 'novedad HRSEX1 + planificación');
          else { if (hayNov) avisos.push(e.p.nombre + ': tiene horas extra o feriado pagados pero ninguna novedad HRSEX1 en el archivo de novedades.'); aBase(e, 'Horas extra / feriado', he, 'Sin novedad HRSEX1: horas extra / feriado'); }
        }
      }
      if (Math.abs(resto) > 0.005) {
        sumaProy(proyBase || 'PROYECTO A DEFINIR', resto);
        if (!proyBase) avisos.push('Sábados, horas extra y feriados: falta indicar el proyecto al que se computa lo que no se pudo ubicar por día.');
        if (!motivo) avisos.push('Sábados, horas extra y feriados: falta el motivo por el que se trabajaron (lo que no se pudo ubicar por día).');
      }
      const items = [...porProy.entries()].map(([proy, imp]) => ({ cod: auxDe.has(proy) ? auxDe.get(proy).cod : proy.split(' ')[0], desc: proy, imp }));
      const total = to2(items.reduce((x, i) => x + i.imp, 0)), unico = items.length === 1 ? items[0].desc : '';
      const obs = [motivo].concat(items.map(it => it.desc + ': ' + [...(tareas.get(it.desc) || [])].join('; '))).filter(x => x && !/: $/.test(x)).join(' | ');
      const a = nuevo('SABADOS, HS EXTRA Y FERIADOS ' + (unico || 'VARIOS PROYECTOS') + ' ' + mesTxt, { observaciones: obs });
      const n = gasto(a, CUENTA.sueldos, total, (motivo || 'Sábados y horas extra trabajados según planificación') + ' - ' + (unico || 'varios proyectos') + ' ' + mesTxt);
      aux(a, n, 'EERR', [{ cod: E.cmv.cod, desc: E.cmv.desc, imp: total }]);
      aux(a, n, 'INSTR', items);
      aux(a, n, 'SUELDOS', [{ cod: '10', desc: 'NO APLICA', imp: total }]);
    }
    if (Math.abs(D.copeOpe) > 0.005) {
      const a = nuevo('COMISION COPART OPERARIOS ' + mesTxt), total = to2(D.copeOpe), n = gasto(a, CUENTA.copart, total, a.concepto);
      aux(a, n, 'EERR', [{ cod: E.sueldos.cod, desc: E.sueldos.desc, imp: total }]);
      aux(a, n, 'SUELDOS', [sec('01', total)]);
      const pj = (o.copar || []).filter(x => x.importe > 0);
      if (!pj.length) { avisos.push('Coparticipación Operarios: falta cargar la planilla COPAR para repartir entre proyectos.'); aux(a, n, 'INSTR', [{ cod: '', desc: 'A DEFINIR (falta COPAR)', imp: total }]); }
      else { const ps = repartir(total, pj.map(x => x.importe)); aux(a, n, 'INSTR', pj.map((x, i) => ({ cod: x.codigo, desc: x.nombre, imp: ps[i] }))); }
    }
    for (const { p, imp } of D.prestamos) {
      if (!o.cotizacion) { sinDestino.push({ persona: p.nombre, nro: 55041, concepto: 'Adelanto de coparticipación', importe: imp, motivo: 'Falta la cotización del dólar' }); continue; }
      const usd = to2(Math.abs(imp) / o.cotizacion), ape = p.nombre.split(',')[0].toUpperCase();
      const a = nuevo('PRESTAMO ' + ape + ' ' + mesTxt, { moneda: 'DOL', cotizacion: o.cotizacion }), ley = pad2(p.legajo) + ' - PRESTAMO ' + ape + ' ' + mesTxt;
      const cobro = imp < 0;                                  // descuento al empleado: baja el préstamo (haber) y entra a caja (debe)
      const n = reng(a, CUENTA.prestamos, cobro ? 0 : usd, cobro ? usd : 0, ley);
      reng(a, CUENTA.caja, cobro ? usd : 0, cobro ? 0 : usd, ley);
      if (!p.prestamo) avisos.push(p.nombre + ': falta el código de auxiliar de préstamos (tipo 30).');
      a.auxiliares.push({ renglon: n, cuenta: CUENTA.prestamos, tipo: TIPO_AUX.PREST.nom, tipoCod: TIPO_AUX.PREST.cod, cod: p.prestamo || '', desc: pad2(p.legajo) + ' ' + (p.nombreLegajo || p.nombre), pct: 100, importe: to2(Math.abs(imp)), importeUSD: usd });
    }
    D.prestamosPesos = to2(D.prestamos.filter(x => o.cotizacion).reduce((s, x) => s + x.imp, 0));

    /* ---------------- control ---------------- */
    const esGasto = r => /^5/.test(String(r.cuenta));
    const gastoNeto = to2(asientos.filter(a => a.moneda === 'PES').reduce((s, a) => s + a.renglones.filter(esGasto).reduce((t, r) => t + (r.debe || 0) - (r.haber || 0), 0), 0));
    const totalInforme = to2(o.filas.reduce((s, f) => s + f.importe, 0));
    const sinDestinoTotal = to2(sinDestino.reduce((s, x) => s + x.importe, 0));
    const control = { totalInforme, gastoNeto, prestamos: D.prestamosPesos, sinDestino: sinDestinoTotal, diferencia: to2(totalInforme - gastoNeto - D.prestamosPesos - sinDestinoTotal) };
    for (const a of asientos) {
      const d = to2(a.renglones.reduce((s, r) => s + (r.debe || 0), 0)), h = to2(a.renglones.reduce((s, r) => s + (r.haber || 0), 0));
      a.debe = d; a.haber = h;
      if (Math.abs(d - h) > 0.005) avisos.push('El asiento «' + a.concepto + '» no balancea (debe ' + d + ' / haber ' + h + ').');
    }
    const personas = [...pers.values()].map(p => ({ fueraCfg: p.fueraCfg, fueraAuto: !(o.datos || []).length ? false : ![...new Set([String(p.legajo), String(p.legajoInforme)])].some(l => legDatos.has(l)), clave: p.clave, nombre: p.nombre, legajo: p.legajo, depto: p.depto, sector: p.sector, ind: p.ind, prestamo: p.prestamo,
      tienePrestamo: p.lineas.some(l => l.nro === 55041), total: to2(p.lineas.reduce((s, l) => s + l.importe, 0)) }));
    const proyectosPlan = [...new Set([...proyUsados, ...[...sabPorLegajo.values()].flatMap(m => [...m.values()].map(r => r.proyecto))])].sort();
    return { asientos, sinDestino, sabados, proyectosPlan, avisos: [...new Set(avisos)], control, personas };
  }

  /** Hojas para el Excel de salida (columnas como las del Excel de Tango). Identificador PROVISORIO: lo asigna Tango al importar/cargar. */
  function hojas(res, o) {
    const [y, m, d] = String(o.fecha).split('-').map(Number), fecha = new Date(Date.UTC(y, m - 1, d));
    const A = [['Identificador', 'Fecha de asiento', 'Clase de asiento', 'Código de tipo de asiento', 'Estado', 'Código de moneda', 'Concepto', 'Observaciones', 'Eliminar']];
    const R = [['Identificador', 'Nro.', 'Código de cuenta', 'Debe', 'Haber', 'Fecha de origen', 'Leyenda', 'Eliminar']];
    const C = [['Identificador', 'Código de moneda', 'Código de tipo de cotización', 'Cotización', 'Eliminar']];
    const X = [['Asiento', 'Renglón', 'Cód. cuenta', 'Tipo de auxiliar', 'Auxiliar', 'Descripción', 'Porcentaje', 'Importe', 'Importe en USD']];
    res.asientos.forEach((a, i) => {
      const id = i + 1;
      A.push([id, fecha, 'Básico', 'CN', 'Ingresado', a.moneda, a.concepto, a.observaciones || '', 'No']);
      a.renglones.forEach(r => R.push([id, r.nro, r.cuenta, r.debe, r.haber, fecha, r.leyenda, 'No']));
      if (a.moneda === 'DOL') C.push([id, 'DOL', 'COTIZACIÓN', a.cotizacion, 'No']);
      a.auxiliares.forEach(x => X.push([a.concepto, x.renglon, x.cuenta, x.tipo, x.cod, x.desc, x.pct, x.importe, x.importeUSD == null ? '' : x.importeUSD]));
    });
    const Z = [['Persona', 'Legajo', 'Concepto', 'Fecha', 'Proyecto', 'Tarea', 'Importe', 'Origen']].concat((res.sabados || []).map(x => [x.persona, x.legajo, x.concepto, x.fecha, x.proyecto, x.tarea, x.importe, x.origen]));
    const S = [['Persona', 'Concepto', 'Nro.', 'Importe', 'Motivo']].concat(res.sinDestino.map(x => [x.persona, x.concepto, x.nro, x.importe, x.motivo]));
    const K = [['Control', 'Importe'], ['Total del informe', res.control.totalInforme], ['Gasto asentado', res.control.gastoNeto], ['Préstamos (adelantos descontados)', res.control.prestamos],
      ['Sin destino', res.control.sinDestino], ['Diferencia (debe ser 0)', res.control.diferencia]].concat(res.avisos.map(t => ['Aviso: ' + t, '']));
    return { 'Asientos contables': A, 'Renglones': R, 'Cotizaciones': C, 'Auxiliares a cargar': X, 'Sábados y extras por día': Z, 'Sin destino': S, 'Control': K };
  }

  /** Planilla COPAR (hoja «COPAR»): importe por proyecto de las columnas de mes elegidas. Agrupa por código (primer término del nombre). */
  function leerCopar(aoa, meses) {
    if (!aoa || !aoa.length) return { meses: [], proyectos: [] };
    const cab = aoa[0], cols = [];
    cab.forEach((c, i) => { if (c instanceof Date) cols.push({ i, ym: c.getFullYear() * 100 + c.getMonth() + 1 }); });
    const usar = cols.filter(c => (meses || []).includes(c.ym));
    const por = new Map();
    for (const fila of aoa.slice(1)) {
      const nombre = limpio(fila[0]);
      if (!nombre || nombre === '-') continue;
      const imp = usar.reduce((s, c) => s + (Number(fila[c.i]) || 0), 0);
      if (!imp) continue;
      const nom0 = nombre.replace(/\s+-\s+.*$/, ''), codigo = nom0.split(' ')[0];
      const x = por.get(codigo) || { codigo, nombre: nom0, importe: 0 };
      x.importe += imp; por.set(codigo, x);
    }
    return { meses: cols.map(c => c.ym), proyectos: [...por.values()] };
  }

  return { generar, hojas, leerDatos, leerNovedades, auxProyecto, leerLegajos, leerResumen, periodos, leerCopar, porcentajes, repartir, clave, sectorDeDepto, SECTORES, CUENTA };
});
