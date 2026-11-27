/* ==========================================================================
   RRHH · pantalla «Asientos»: genera los asientos contables de los ADICIONALES PAGADOS EN EFECTIVO (para cargar en Tango) desde el «Resumen de conceptos liquidados».
   No es la liquidación formal por sueldos (esa se transfiere por banco y se controla contra el F.931): es un informe adicional y distinto.
   Se monta con RRHHVistaAsientos.montar({ $main, esc, PERM, XLSX, Asientos, Tabla, titulo }).
   TODO se procesa en el navegador: los Excel no se suben ni se guardan en ningún lado (no hay SQL ni llamadas a la base).
   Solo se recuerda en este navegador (localStorage) la configuración por persona: asiento individual, sector y auxiliar de préstamos.
   Del padrón (solapa LEGAJOS) se leen número, apellido y nombre y departamento; C.U.I.L., teléfono y correo se descartan al leer.
   Ver: sección «liquidación».
   ========================================================================== */
(function (root) {
  'use strict';

  const N2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const num = n => (n == null || n === '' || Number.isNaN(n) ? '' : N2.format(n));
  const CLAVE_CFG = 'rrhh-asientos-config';
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = ym => MESES[(ym % 100) - 1] + ' ' + Math.floor(ym / 100);
  const ultimoDia = ym => { const y = Math.floor(ym / 100), m = ym % 100, d = new Date(Date.UTC(y, m, 0)).getUTCDate(); return y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0'); };

  function leerCfg(k) { try { return JSON.parse(localStorage.getItem(CLAVE_CFG) || '{}')[k] || {}; } catch (e) { return {}; } }
  function guardarCfg(personas, proyectos) { try { localStorage.setItem(CLAVE_CFG, JSON.stringify({ personas, proyectos })); } catch (e) { /* sin almacenamiento: no se recuerda */ } }

  async function montar(ctx) {
    const { $main, esc, PERM, XLSX, Asientos, Tabla, titulo } = ctx;
    titulo('Asientos', 'Asientos contables de los adicionales pagados en efectivo, para cargar en Tango');
    if (!PERM.ver.has('liquidacion')) { $main.innerHTML = '<div class="empty">Para generar asientos hace falta permiso de <b>Ver</b> en «Liquidación». Pedíselo a dirección en el portal.</div>'; return; }

    const est = { resumen: null, hojasRes: [], hojaRes: '', legajos: null, copar: null, cfg: leerCfg('personas'), proy: leerCfg('proyectos'), datos: [], novedades: [], res: null, personas: [], vista: 'asientos', grid: null, columnas: [] };
    $main.innerHTML = `
      <div class="card" id="as-carga">
        <div class="card-h"><h3>1 · Archivos</h3></div>
        <div class="card-b">
          <p class="nota" style="margin-top:0">Los archivos se leen en tu navegador: <b>no se suben ni se guardan</b>. Del padrón solo se usan número, apellido y nombre y departamento.</p>
          <div class="barra">
            <label>Resumen de conceptos liquidados (.xlsx)<input type="file" id="as-f-res" accept=".xlsx,.xls"></label>
            <label>Legajos (solapa LEGAJOS, .xlsx)<input type="file" id="as-f-leg" accept=".xlsx,.xls"></label>
            <label>Planilla COPAR (opcional, .xlsx)<input type="file" id="as-f-cop" accept=".xlsx,.xls"></label>
            <label>Informe de planificación del mes (formato DATOS, .csv)<input type="file" id="as-f-dat" accept=".csv,.txt"></label>
            <label>Novedades registradas del mes (.xlsx)<input type="file" id="as-f-nov" accept=".xlsx,.xls"></label>
          </div>
          <div class="est" id="as-est-arch"></div>
        </div>
      </div>
      <div class="card" id="as-param" hidden>
        <div class="card-h"><h3>2 · Parámetros</h3></div>
        <div class="card-b">
          <div class="barra">
            <label>Hoja del resumen<select id="as-hoja"></select></label>
            <label>Período<select id="as-periodo"></select></label>
            <label>Fecha del asiento<input type="date" id="as-fecha"></label>
            <label>Cotización del dólar (préstamos)<input type="number" id="as-cot" step="0.01" min="0" placeholder="p. ej. 1550"></label>
            <label>Proyecto del Bono Montaje<input type="text" id="as-bono" placeholder="p. ej. PL0030 VDP"></label>
          </div>
          <div class="barra">
            <label>Proyecto de sábados, horas extra y feriados<input type="text" id="as-sab-proy" placeholder="p. ej. IF4417 VICUÑA"></label>
            <label>Motivo por el que se trabajaron<input type="text" id="as-sab-motivo" size="46" placeholder="p. ej. Entrega adelantada del proyecto"></label>
          </div>
          <div class="barra" id="as-meses-box" hidden><fieldset class="bonos-sel"><legend>Meses de la planilla COPAR para repartir la coparticipación de operarios entre proyectos</legend><span id="as-meses"></span></fieldset></div>
          <button class="btn" id="as-generar" type="button">Generar asientos</button>
        </div>
      </div>
      <div id="as-personas-box" hidden>
        <div class="card" style="max-width:none"><div class="card-h"><h3>3 · Personas</h3></div>
          <div class="card-b"><p class="nota" style="margin-top:0">Quién va en un <b>asiento individual</b> (el resto va al asiento de coparticipación), el <b>sector</b> para el auxiliar de Sueldos (por defecto sale del departamento del padrón) y el <b>auxiliar de préstamos</b> de quien tenga adelanto. Se recuerda en este navegador.</p>
          <div id="as-personas"></div></div></div>
      </div>
      <div id="as-proy-box" hidden>
        <div class="card" style="max-width:none"><div class="card-h"><h3>Proyectos de la planificación → auxiliar de Tango</h3></div>
          <div class="card-b"><p class="nota" style="margin-top:0">La planificación llama «4417 VICUÑA» al proyecto que en Tango es «IF4417 VICUÑA». Si no lo configurás, se <b>supone</b> el prefijo <b>IF</b> para los códigos numéricos. Confirmá o corregí el código y la descripción del auxiliar. Se recuerda en este navegador.</p>
          <div id="as-proy"></div></div></div>
      </div>
      <div id="as-res-box" hidden>
        <div id="as-avisos"></div>
        <div class="barra" id="as-tabs" role="tablist"></div>
        <div id="as-tabla"></div>
        <p class="nota" id="as-nota"></p>
      </div>`;
    const $ = id => document.getElementById(id);

    async function leerLibro(file) { return XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: true }); }
    const filasDe = (wb, hoja) => XLSX.utils.sheet_to_json(wb.Sheets[hoja], { defval: null, raw: true });
    const cabecera = (wb, hoja) => (XLSX.utils.sheet_to_json(wb.Sheets[hoja], { header: 1, defval: null, raw: true })[0] || []).map(x => String(x == null ? '' : x).trim());
    const estado = (t, cls) => { $('as-est-arch').className = 'est ' + (cls || ''); $('as-est-arch').innerHTML = t; };

    function resumenListo() {
      if (!est.resumen || !est.legajos) { $('as-param').hidden = true; return; }
      $('as-param').hidden = false;
      $('as-hoja').innerHTML = est.hojasRes.map(h => '<option value="' + esc(h) + '"' + (h === est.hojaRes ? ' selected' : '') + '>' + esc(h) + '</option>').join('');
      cargarPeriodos();
    }
    function cargarPeriodos() {
      const ps = Asientos.periodos(filasDe(est.resumen, est.hojaRes));
      $('as-periodo').innerHTML = ps.map(p => '<option value="' + p + '">' + esc(nombreMes(p)) + '</option>').join('');
      if (ps.length) { $('as-periodo').value = String(ps[ps.length - 1]); alCambiarPeriodo(); }
    }
    function alCambiarPeriodo() {
      const p = Number($('as-periodo').value);
      if (p) $('as-fecha').value = ultimoDia(p);
      pintarMeses();
    }
    function pintarMeses() {
      if (!est.copar) { $('as-meses-box').hidden = true; return; }
      const p = Number($('as-periodo').value), ms = Asientos.leerCopar(est.copar, []).meses;
      $('as-meses-box').hidden = false;
      $('as-meses').innerHTML = ms.map(m => '<label><input type="checkbox" class="as-mes" value="' + m + '"' + (m === p ? ' checked' : '') + '> ' + esc(nombreMes(m)) + '</label>').join('') || 'La planilla no tiene columnas de meses.';
    }

    $('as-f-res').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const wb = await leerLibro(f);
        const hojas = wb.SheetNames.filter(h => cabecera(wb, h).includes('Nro. de concepto'));
        if (!hojas.length) throw new Error('no encontré una solapa con la columna «Nro. de concepto»');
        est.resumen = wb; est.hojasRes = hojas; est.hojaRes = hojas.find(h => /resumen de conceptos/i.test(h)) || hojas[0];
        // si es el mismo libro que trae LEGAJOS, lo aprovecha
        const hl = wb.SheetNames.find(h => cabecera(wb, h).includes('Apellido y nombre'));
        if (hl && !est.legajos) { est.legajos = Asientos.leerLegajos(filasDe(wb, hl)); }
        const hc = wb.SheetNames.find(h => cabecera(wb, h)[0] === 'PROYECTO');
        if (hc && !est.copar) est.copar = XLSX.utils.sheet_to_json(wb.Sheets[hc], { header: 1, defval: null, raw: true });
        estado('Resumen leído (' + hojas.length + ' solapa/s con conceptos).' + (est.legajos ? ' Padrón: ' + est.legajos.size + ' personas.' : ' Falta el padrón.') + (est.copar ? ' Planilla COPAR leída.' : ''), 'ok');
        resumenListo();
      } catch (e) { est.resumen = null; estado('No pude leer el resumen: ' + esc(e.message), 'mal'); resumenListo(); }
    });
    $('as-f-leg').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const wb = await leerLibro(f), h = wb.SheetNames.find(x => cabecera(wb, x).includes('Apellido y nombre'));
        if (!h) throw new Error('no encontré una solapa con «Apellido y nombre»');
        est.legajos = Asientos.leerLegajos(filasDe(wb, h));
        estado('Padrón leído: ' + est.legajos.size + ' personas.', 'ok'); resumenListo();
      } catch (e) { est.legajos = null; estado('No pude leer el padrón: ' + esc(e.message), 'mal'); resumenListo(); }
    });
    $('as-f-cop').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const wb = await leerLibro(f), h = wb.SheetNames.find(x => cabecera(wb, x)[0] === 'PROYECTO');
        if (!h) throw new Error('no encontré la solapa COPAR (primera columna «PROYECTO»)');
        est.copar = XLSX.utils.sheet_to_json(wb.Sheets[h], { header: 1, defval: null, raw: true });
        estado('Planilla COPAR leída.', 'ok'); pintarMeses();
      } catch (e) { est.copar = null; estado('No pude leer la planilla COPAR: ' + esc(e.message), 'mal'); pintarMeses(); }
    });
    $('as-f-dat').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        est.datos = Asientos.leerDatos(await f.text());
        if (!est.datos.length) throw new Error('no encontré filas (legajo, fecha AAAA-MM-DD…); usá «Descargar CSV» del informe «formato DATOS»');
        estado('Informe de planificación leído: ' + est.datos.length + ' filas, ' + est.datos.filter(r => r.dia === 'sabado').length + ' de sábado.', 'ok');
      } catch (e) { est.datos = []; estado('No pude leer el informe de planificación: ' + esc(e.message), 'mal'); }
    });
    $('as-f-nov').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const wb = await leerLibro(f), h = wb.SheetNames.find(x => cabecera(wb, x).some(c => /^c[oó]d\. novedad$/i.test(c)));
        if (!h) throw new Error('no encontré una solapa con la columna «Cód. novedad»');
        est.novedades = Asientos.leerNovedades(filasDe(wb, h));
        const n = c => est.novedades.filter(x => x.cod === c).length;
        estado('Novedades leídas: ' + n('SABADO') + ' días SABADO y ' + n('HRSEX1') + ' de horas extra (HRSEX1). Los demás códigos se ignoran.', 'ok');
      } catch (e) { est.novedades = []; estado('No pude leer las novedades: ' + esc(e.message), 'mal'); }
    });
    $('as-hoja').addEventListener('change', ev => { est.hojaRes = ev.target.value; cargarPeriodos(); });
    $('as-periodo').addEventListener('change', alCambiarPeriodo);

    function entrada() {
      const periodo = Number($('as-periodo').value);
      const filas = Asientos.leerResumen(filasDe(est.resumen, est.hojaRes), periodo);
      const meses = [...document.querySelectorAll('.as-mes:checked')].map(x => Number(x.value));
      const copar = est.copar && meses.length ? Asientos.leerCopar(est.copar, meses).proyectos : [];
      return { filas, legajos: est.legajos, config: { personas: est.cfg, proyectos: est.proy }, periodo: String(periodo), fecha: $('as-fecha').value,
        cotizacion: Number($('as-cot').value) || null, bono: { proyecto: $('as-bono').value }, sabados: { proyecto: $('as-sab-proy').value, motivo: $('as-sab-motivo').value }, datos: est.datos, novedades: est.novedades, copar };
    }
    function calcular() { est.res = Asientos.generar(entrada()); }

    /* ---------- tabla de personas ---------- */
    function pintarPersonas() {
      const opSec = sel => '<option value="">(según padrón)</option>' + Object.entries(Asientos.SECTORES).map(([c, n]) => '<option value="' + c + '"' + (sel === c ? ' selected' : '') + '>' + c + ' · ' + esc(n) + '</option>').join('');
      est.personas = est.res.personas.map(p => { const c = est.cfg[p.clave] || {}; return { ...p, asiento: c.asiento === 'ind' ? 'ind' : 'pool', sectorCfg: c.sector || '', prestamoCfg: c.prestamo || '' }; });
      const cols = [
        { k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', min: 70, texto: f => String(f.legajo == null ? '' : f.legajo) },
        { k: 'nombre', titulo: 'Persona', cls: 'izq', sticky: true, min: 200 },
        { k: 'depto', titulo: 'Departamento (padrón)', cls: 'izq', texto: f => f.depto || '— sin padrón —', valor: f => f.depto || '' },
        { k: 'total', titulo: 'Total liquidado', tipo: 'n', texto: f => num(f.total) },
        { k: 'asiento', titulo: 'Asiento', cls: 'izq', texto: f => (f.asiento === 'ind' ? 'Individual' : 'Con el resto'),
          html: f => '<select data-c="' + esc(f.clave) + '" data-k="asiento"><option value="pool"' + (f.asiento === 'pool' ? ' selected' : '') + '>Con el resto</option><option value="ind"' + (f.asiento === 'ind' ? ' selected' : '') + '>Individual</option></select>' },
        { k: 'sectorCfg', titulo: 'Sector (auxiliar Sueldos)', cls: 'izq', min: 170, texto: f => (f.sectorCfg ? Asientos.SECTORES[f.sectorCfg] : (f.sector ? Asientos.SECTORES[f.sector] + ' (padrón)' : '— sin sector —')),
          html: f => '<select data-c="' + esc(f.clave) + '" data-k="sector">' + opSec(f.sectorCfg) + '</select>' },
        { k: 'prestamoCfg', titulo: 'Auxiliar préstamos', cls: 'izq', texto: f => (f.tienePrestamo ? (f.prestamoCfg || '— falta —') : ''),
          html: f => (f.tienePrestamo ? '<input type="text" size="8" data-c="' + esc(f.clave) + '" data-k="prestamo" value="' + esc(f.prestamoCfg) + '" placeholder="código">' : '') },
      ];
      est.gridPers = Tabla.crear({ el: $('as-personas'), id: 'asientos-personas', columnas: cols, esc,
        pie: rows => ['', 'TOTAL · ' + rows.length + ' personas', '', num(rows.reduce((s, f) => s + f.total, 0)), '', '', ''] });
      est.gridPers.render(est.personas);
      $('as-personas-box').hidden = false;
    }
    $('as-personas').addEventListener('change', ev => {
      const el = ev.target.closest('[data-c]'); if (!el) return;
      const c = el.dataset.c, k = el.dataset.k, f = est.personas.find(x => x.clave === c); if (!f) return;
      const cur = est.cfg[c] || (est.cfg[c] = {});
      if (k === 'asiento') { cur.asiento = el.value; f.asiento = el.value; }
      if (k === 'sector') { cur.sector = el.value || undefined; f.sectorCfg = el.value; }
      if (k === 'prestamo') { cur.prestamo = el.value.trim() || undefined; f.prestamoCfg = el.value.trim(); }
      guardarCfg(est.cfg, est.proy); calcular(); pintarResultados();
    });

    function pintarProyectos() {
      const lista = est.res.proyectosPlan || [];
      $('as-proy-box').hidden = !lista.length; if (!lista.length) return;
      est.proyFilas = lista.map(plan => { const x = Asientos.auxProyecto(plan, est.proy); return { plan, cod: x.cod, desc: x.desc, supuesto: x.supuesto }; });
      const cols = [{ k: 'plan', titulo: 'Proyecto en la planificación', cls: 'izq', min: 220 },
        { k: 'cod', titulo: 'Auxiliar de Tango (código)', cls: 'izq', html: f => '<input type="text" size="10" data-p="' + esc(f.plan) + '" data-k="cod" value="' + esc(f.cod) + '">' },
        { k: 'desc', titulo: 'Descripción del auxiliar', cls: 'izq', min: 220, html: f => '<input type="text" size="28" data-p="' + esc(f.plan) + '" data-k="desc" value="' + esc(f.desc) + '">' },
        { k: 'supuesto', titulo: 'Estado', cls: 'izq', texto: f => (f.supuesto ? 'Supuesto (prefijo IF)' : 'Confirmado') }];
      Tabla.crear({ el: $('as-proy'), id: 'asientos-proyectos', columnas: cols, esc }).render(est.proyFilas);
    }
    $('as-proy').addEventListener('change', ev => {
      const el = ev.target.closest('[data-p]'); if (!el) return;
      const plan = el.dataset.p, cur = est.proy[plan] || (est.proy[plan] = { cod: '', desc: '' });
      const f = est.proyFilas.find(x => x.plan === plan); if (!f) return;
      cur.cod = f.cod; cur.desc = f.desc; cur[el.dataset.k] = el.value.trim(); f[el.dataset.k] = el.value.trim();
      guardarCfg(est.cfg, est.proy); calcular(); pintarResultados(); pintarProyectos();
    });

    /* ---------- resultados ---------- */
    const colTxt = (k, titulo, o) => Object.assign({ k, titulo, cls: 'izq' }, o || {});
    const colNum = (k, titulo, o) => Object.assign({ k, titulo, tipo: 'n', texto: f => num(f[k]) }, o || {});
    function pintarResultados() {
      const r = est.res; $('as-res-box').hidden = false;
      const c = r.control;
      $('as-avisos').innerHTML = '<div class="est ' + (c.diferencia === 0 && !r.avisos.length ? 'ok' : 'av') + '" style="margin-bottom:10px">Total del informe ' + num(c.totalInforme) + ' = gasto asentado ' + num(c.gastoNeto)
        + ' + préstamos ' + num(c.prestamos) + ' + sin destino ' + num(c.sinDestino) + ' · diferencia ' + num(c.diferencia) + (c.diferencia === 0 ? ' ✓' : ' ⚠')
        + (r.avisos.length ? '<ul style="margin:6px 0 0 18px;padding:0">' + r.avisos.map(t => '<li>' + esc(t) + '</li>').join('') + '</ul>' : '') + '</div>';
      const tabs = [['asientos', 'Asientos contables'], ['renglones', 'Renglones'], ['aux', 'Auxiliares a cargar'], ['sab', 'Sábados y extras por día (' + r.sabados.length + ')'], ['sin', 'Sin destino (' + r.sinDestino.length + ')']];
      $('as-tabs').innerHTML = tabs.map(([k, t]) => '<button type="button" class="btn' + (est.vista === k ? '' : ' sec') + '" data-v="' + k + '">' + esc(t) + '</button>').join('')
        + '<span class="sp"></span><button type="button" class="btn sec" id="as-export">Exportar a Excel (todas las solapas)</button>';
      const arm = (id, columnas, filas, pie) => { est.columnas = columnas; est.grid = Tabla.crear({ el: $('as-tabla'), id, columnas, esc, pie }); est.grid.render(filas); };
      const flat = (fn) => r.asientos.flatMap(a => fn(a));
      if (est.vista === 'asientos') {
        arm('asientos-asientos', [colTxt('concepto', 'Concepto', { sticky: true, min: 260 }), colTxt('moneda', 'Moneda'), colNum('cotizacion', 'Cotización'), colNum('debe', 'Debe'), colNum('haber', 'Haber'), colNum('n', 'Renglones', { texto: f => String(f.n) })],
          r.asientos.map(a => ({ concepto: a.concepto, moneda: a.moneda, cotizacion: a.cotizacion, debe: a.debe, haber: a.haber, n: a.renglones.length })),
          rows => ['TOTAL · ' + rows.length + ' asientos', '', '', num(rows.filter(f => f.moneda === 'PES').reduce((s, f) => s + f.debe, 0)), num(rows.filter(f => f.moneda === 'PES').reduce((s, f) => s + f.haber, 0)), '']);
        $('as-nota').textContent = 'Un asiento por concepto. El total del pie suma solo los asientos en pesos. Cada asiento balancea (debe = haber).';
      } else if (est.vista === 'renglones') {
        arm('asientos-renglones', [colTxt('asiento', 'Asiento', { sticky: true, min: 220 }), colNum('nro', 'Nro.', { texto: f => String(f.nro) }), colTxt('cuenta', 'Cuenta'), colNum('debe', 'Debe'), colNum('haber', 'Haber'), colTxt('leyenda', 'Leyenda', { min: 260 })],
          flat(a => a.renglones.map(x => ({ asiento: a.concepto, ...x }))), rows => ['TOTAL · ' + rows.length + ' renglones', '', '', num(rows.reduce((s, f) => s + (f.debe || 0), 0)), num(rows.reduce((s, f) => s + (f.haber || 0), 0)), '']);
        $('as-nota').textContent = 'Cuentas: 11110071 Caja pesos 2 · 21400001 Remuneraciones a pagar (Neuquén) · 55000014 Comisiones mandos medios · 56000001 Sueldos.';
      } else if (est.vista === 'aux') {
        arm('asientos-aux', [colTxt('asiento', 'Asiento', { sticky: true, min: 220 }), colNum('renglon', 'Renglón', { texto: f => String(f.renglon) }), colTxt('cuenta', 'Cuenta'), colTxt('tipo', 'Tipo de auxiliar', { min: 190 }),
          colTxt('cod', 'Auxiliar'), colTxt('desc', 'Descripción', { min: 180 }), colNum('pct', 'Porcentaje'), colNum('importe', 'Importe'), colNum('importeUSD', 'Importe USD')],
          flat(a => a.auxiliares.map(x => ({ asiento: a.concepto, ...x }))), rows => ['TOTAL · ' + rows.length + ' líneas', '', '', '', '', '', '', '', '']);
        $('as-nota').textContent = 'Para cargar a mano en Tango (botón Auxiliares de cada renglón de gasto): por renglón, tipo de auxiliar, auxiliar, porcentaje e importe. El porcentaje tiene 2 decimales y cada reparto suma 100.';
      } else if (est.vista === 'sab') {
        arm('asientos-sab', [colTxt('persona', 'Persona', { sticky: true, min: 200 }), colNum('legajo', 'Legajo', { cls: 'izq', texto: f => String(f.legajo == null ? '' : f.legajo) }), colTxt('concepto', 'Concepto'),
          colTxt('fecha', 'Fecha', { texto: f => f.fecha || '— sin día —', valor: f => f.fecha || '' }), colTxt('proyecto', 'Proyecto', { min: 200 }), colTxt('tarea', 'Tarea / motivo', { min: 240 }), colNum('importe', 'Importe'), colTxt('origen', 'Origen', { min: 200 })],
          r.sabados, rows => ['TOTAL · ' + rows.length + ' líneas', '', '', '', '', '', num(rows.reduce((s, f) => s + f.importe, 0)), '']);
        $('as-nota').textContent = 'Reparto por día: los días pagados salen de las novedades (SABADO: partes iguales por día; HRSEX1: proporcional a las horas) y el proyecto y la tarea de cada día, del informe de planificación. Lo que no se puede ubicar por día va al proyecto y motivo indicados arriba.';
      } else {
        arm('asientos-sin', [colTxt('persona', 'Persona', { sticky: true, min: 200 }), colTxt('concepto', 'Concepto'), colNum('nro', 'Nro.', { texto: f => String(f.nro) }), colNum('importe', 'Importe'), colTxt('motivo', 'Motivo', { min: 240 })],
          r.sinDestino, rows => ['TOTAL', '', '', num(rows.reduce((s, f) => s + f.importe, 0)), '']);
        $('as-nota').textContent = 'Lo liquidado que todavía no tiene regla de asiento. No se asienta ni se descarta: acá se ve para decidir su tratamiento.';
      }
    }
    $('as-tabs').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'as-export') return exportar();
      if (b.dataset.v) { est.vista = b.dataset.v; pintarResultados(); }
    });
    function exportar() {
      const h = Asientos.hojas(est.res, { fecha: $('as-fecha').value }), wb = XLSX.utils.book_new();
      for (const [n, aoa] of Object.entries(h)) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa, { cellDates: true }), n);
      XLSX.writeFile(wb, 'asientos_sueldos_' + $('as-periodo').value + '.xlsx');
    }

    $('as-generar').addEventListener('click', () => {
      if (!$('as-fecha').value) { estado('Indicá la fecha del asiento.', 'mal'); return; }
      try { calcular(); } catch (e) { estado('No pude generar los asientos: ' + esc(e.message), 'mal'); return; }
      if (!est.res.personas.length) { estado('El período elegido no tiene filas en el resumen.', 'mal'); return; }
      pintarPersonas(); pintarProyectos(); pintarResultados();
    });
  }

  root.RRHHVistaAsientos = { montar };
})(typeof self !== 'undefined' ? self : this);
