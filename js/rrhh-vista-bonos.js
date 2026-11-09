/* ==========================================================================
   RRHH · pantalla «Bonos»: bonos de proyecto (histórico) por bono, por proyecto y por persona, y lo liquidado por mes.
   Se monta con RRHHVistaBonos.montar({ sb, $main, esc, PERM, XLSX, Bonos, Calc, Tabla, titulo }).
   El libro (BONOS_AAAA-AAAA.xlsx) se lee en el navegador; solo se envían bonos e importes por legajo (sin nombres de personas).
   Ver: sección «costos». Cargar el libro: Editar en «costos». «Liquidado por mes» además pide Ver en «liquidación».
   ========================================================================== */
(function (root) {
  'use strict';

  const N0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const num = n => (n == null || Number.isNaN(n) ? '—' : N0.format(n));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = p => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? MESES[+m[2] - 1] + ' ' + m[1] : (p || '—'); };

  const ORDEN = { rrhh_conceptos: ['nro_concepto', 'empresa'], rrhh_empleados: ['legajo'], rrhh_bonos: ['num_bono'], rrhh_bonos_persona: ['num_bono', 'legajo'] };
  async function traerTodo(sb, tabla, columnas, filtrar) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {                       // la base entrega máx. 1000 filas por pedido
      let q = sb.from(tabla).select(columnas); if (filtrar) q = filtrar(q);
      q = (ORDEN[tabla] || ['id']).reduce((x, c) => x.order(c), q);
      const { data, error } = await q.range(desde, desde + 999);
      if (error) throw new Error(tabla + ': ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Bonos, Calc, Tabla, titulo } = ctx;
    titulo('Bonos', 'Bonos de proyecto: histórico por bono, proyecto y persona, y lo liquidado por mes');
    if (!PERM.ver.has('costos')) { $main.innerHTML = '<div class="empty">Para ver los bonos hace falta permiso de <b>Ver</b> en «Costos». Pedíselo a dirección en el portal.</div>'; return; }
    const puedeEditar = PERM.editar.has('costos'), verLiq = PERM.ver.has('liquidacion');
    const est = { vista: 'bono', bonos: [], personas: [], empleados: [], catalogo: [], liq: null, archivo: null, lectura: null };

    $main.innerHTML = `
      <div class="card" id="bn-carga">
        <div class="card-h"><h3>Cargar el libro de bonos</h3></div>
        <div class="card-b">
          <p class="nota" style="margin-top:0">Elegí <b>BONOS_AAAA-AAAA.xlsx</b>. Se lee en tu navegador (hojas PROYECTOS y PERSONAL) y solo se envían bonos e importes por legajo. Cargarlo de nuevo <b>reemplaza</b> el histórico anterior.</p>
          ${puedeEditar ? '<input type="file" id="bn-archivo" accept=".xlsx,.xls"> <button class="btn" id="bn-importar" type="button" disabled>Importar</button>' : '<div class="est av">Tu usuario puede ver los bonos pero no cargarlos (hace falta Editar en «Costos»).</div>'}
          <div class="est" id="bn-estado" style="margin-top:8px"></div>
        </div>
      </div>
      <div class="barra" id="bn-tabs" role="tablist"></div>
      <div id="bn-alertas"></div>
      <div id="bn-tabla"><div class="empty">Cargando…</div></div>
      <p class="nota" id="bn-nota"></p>`;
    const $ = id => document.getElementById(id);

    async function cargar() {
      $('bn-tabla').innerHTML = '<div class="empty">Cargando…</div>';
      try {
        est.bonos = await traerTodo(sb, 'rrhh_bonos', '*');
        est.personas = await traerTodo(sb, 'rrhh_bonos_persona', 'num_bono,legajo,importe');
        est.empleados = await traerTodo(sb, 'rrhh_empleados', 'legajo,nombre,departamento');
        if (verLiq) {
          est.catalogo = await traerTodo(sb, 'rrhh_conceptos', '*');
          const nros = est.catalogo.filter(c => c.empresa === '4H_OC' && c.trata === 'directo_proyecto').map(c => c.nro_concepto);
          est.liq = nros.length ? await traerTodo(sb, 'rrhh_liquidacion_filas', 'periodo,empresa,legajo,nro_concepto,importe', q => q.eq('empresa', '4H_OC').in('nro_concepto', nros)) : [];
        }
      } catch (e) { $('bn-tabla').innerHTML = '<div class="empty">No pude cargar los datos: ' + esc(e.message) + '. Si dice que la tabla no existe, falta correr <code>rrhh_05_bonos.sql</code>.</div>'; return; }
      pintarTabs(); pintar();
    }

    function pintarTabs() {
      const tabs = [['bono', 'Por bono'], ['proyecto', 'Por proyecto'], ['persona', 'Por persona'], ['periodo', 'Histórico por período']].concat(verLiq ? [['liq', 'Liquidado por mes']] : []);
      $('bn-tabs').innerHTML = tabs.map(([k, t]) => '<button type="button" class="btn' + (est.vista === k ? '' : ' sec') + '" data-v="' + k + '">' + esc(t) + '</button>').join('') + '<span class="sp"></span><button type="button" class="btn" id="bn-export">Exportar a Excel</button>';
    }

    let grid = null, columnasActuales = [];
    function armar(id, columnas, opts) {
      columnasActuales = columnas;
      grid = Tabla.crear(Object.assign({ el: $('bn-tabla'), id, columnas, esc }, opts || {}));
    }
    const colTxt = (k, titulo, o) => Object.assign({ k, titulo, cls: 'izq' }, o || {});
    const colNum = (k, titulo, o) => Object.assign({ k, titulo, tipo: 'n', texto: f => num(f[k]) }, o || {});
    const tipoTxt = t => (Bonos.TIPOS[t] || (t === 'mixto' ? 'Varios' : t));

    function pintar() {
      $('bn-alertas').innerHTML = '';
      if (est.vista !== 'liq' && !est.bonos.length) {
        $('bn-tabla').innerHTML = '<div class="empty">Todavía no hay bonos cargados. ' + (puedeEditar ? 'Elegí el libro BONOS arriba y apretá Importar.' : 'Pedile a quien tenga permiso de edición que lo cargue.') + '</div>'; $('bn-nota').textContent = ''; return;
      }
      if (est.vista === 'bono') {
        const tot = new Map(), cant = new Map();
        for (const p of est.personas) { tot.set(p.num_bono, (tot.get(p.num_bono) || 0) + Math.round(p.importe * 100)); cant.set(p.num_bono, (cant.get(p.num_bono) || 0) + 1); }
        const filas = est.bonos.map(b => ({ ...b, personas: cant.get(b.num_bono) || 0, total: (tot.get(b.num_bono) || 0) / 100 }));
        armar('bonos-bono', [
          colNum('num_bono', 'N°', { cls: 'izq', texto: f => String(f.num_bono) }), colTxt('nombre', 'Bono', { sticky: true }), colTxt('proyecto', 'Proyecto'),
          colTxt('tipo', 'Tipo', { texto: f => tipoTxt(f.tipo) }), colTxt('etiqueta_periodo', 'Período', { texto: f => f.etiqueta_periodo || '—' }),
          colNum('personas', 'Personas'), colNum('total', 'Total personas'), colNum('monto', 'Monto planilla'), colNum('caja', 'Caja pagada'),
        ], { pie: rows => ['', 'TOTAL · ' + rows.length + ' bonos', '', '', '', '', num(rows.reduce((s, f) => s + f.total, 0)), num(rows.reduce((s, f) => s + (f.monto || 0), 0)), num(rows.reduce((s, f) => s + (f.caja || 0), 0))] });
        grid.render(filas);
        $('bn-nota').textContent = 'Un renglón por bono. «Total personas» es la suma de lo asignado a cada persona; tiene que coincidir con el «Monto planilla». «Sin discriminar»: hasta ahora todo se llamaba Producción; a futuro se discrimina Montaje, Posventa y Producción.';
      } else if (est.vista === 'proyecto') {
        const filas = Bonos.resumenProyectos(est.bonos, est.personas);
        armar('bonos-proyecto', [
          colTxt('proyecto', 'Proyecto', { sticky: true, min: 200 }), colTxt('tipo', 'Tipo', { texto: f => tipoTxt(f.tipo) }),
          colNum('bonos', 'Bonos'), colNum('personas', 'Personas'), colNum('total', 'Total'), colNum('caja', 'Caja pagada'),
          colTxt('desde', 'Desde', { texto: f => nombreMes(f.desde) , valor: f => f.desde }), colTxt('hasta', 'Hasta', { texto: f => nombreMes(f.hasta), valor: f => f.hasta }),
        ], { pie: rows => ['TOTAL · ' + rows.length + ' proyectos', '', num(rows.reduce((s, f) => s + f.bonos, 0)), '', num(rows.reduce((s, f) => s + f.total, 0)), num(rows.reduce((s, f) => s + f.caja, 0)), '', ''] });
        grid.render(filas);
        $('bn-nota').textContent = 'Los bonos de un mismo proyecto se suman (p. ej. «COMARCA RESTO - 1», «- 2»…). «Personas» cuenta personas distintas.';
      } else if (est.vista === 'periodo') {
        const filas = Bonos.resumenPorPeriodo(est.bonos, est.personas);
        armar('bonos-periodo', [
          colTxt('etiqueta', 'Período (como en la planilla)', { sticky: true, min: 210, valor: f => f.desde || '9999' + f.etiqueta }),
          colNum('bonos', 'Bonos'), colNum('personas', 'Personas'), colNum('montaje', 'Montaje'), colNum('posventa', 'Posventa'),
          colNum('produccion', 'Producción'), colNum('sin_discriminar', 'Sin discriminar'), colNum('total', 'Total'),
        ], { pie: rows => ['TOTAL · ' + rows.length + ' períodos', num(rows.reduce((s, f) => s + f.bonos, 0)), '', num(rows.reduce((s, f) => s + f.montaje, 0)), num(rows.reduce((s, f) => s + f.posventa, 0)),
          num(rows.reduce((s, f) => s + f.produccion, 0)), num(rows.reduce((s, f) => s + f.sin_discriminar, 0)), num(rows.reduce((s, f) => s + f.total, 0))] });
        grid.render(filas);
        $('bn-nota').textContent = 'Histórico del libro de bonos agrupado por el período que trae la planilla. Un período como «202504/202505» es un bono pagado en dos meses: no se parte por mes porque la planilla no indica cuánto corresponde a cada uno. Lo que se liquidó por recibo (desde el sistema) está en «Liquidado por mes».';
      } else if (est.vista === 'persona') {
        const filas = Bonos.detallePersonas(est.bonos, est.personas, est.empleados);
        armar('bonos-persona', [
          colNum('legajo', 'Legajo', { cls: 'izq', sticky: true, min: 70, texto: f => String(f.legajo) }),
          colTxt('nombre', 'Empleado', { sticky: true, min: 200, texto: f => f.nombre || '(sin padrón)', valor: f => f.nombre || '(sin padrón)' }),
          colTxt('departamento', 'Departamento', { texto: f => f.departamento || '—', valor: f => f.departamento || '' }),
          colTxt('bono', 'Bono'), colTxt('proyecto', 'Proyecto'), colTxt('tipo', 'Tipo', { texto: f => tipoTxt(f.tipo) }), colTxt('etiqueta', 'Período'),
          colNum('importe', 'Importe'),
        ], { pie: rows => ['', 'TOTAL · ' + new Set(rows.map(r => r.legajo)).size + ' personas', '', '', '', '', '', num(rows.reduce((s, f) => s + f.importe, 0))] });
        grid.render(filas);
        $('bn-nota').textContent = 'Una fila por persona y bono. Los nombres y departamentos salen del padrón: si una persona figura «(sin padrón)», falta cargarla.';
      } else {
        const filas = Bonos.liquidadoPorMes(est.liq || [], est.catalogo, Calc.tipoBono);
        armar('bonos-liq', [
          colTxt('periodo', 'Mes', { sticky: true, min: 150, texto: f => nombreMes(f.periodo), valor: f => f.periodo }),
          colNum('montaje', 'Montaje'), colNum('posventa', 'Posventa'), colNum('otro', 'Otros (sin discriminar)'), colNum('total', 'Total liquidado'), colNum('personas', 'Personas'),
        ], { pie: rows => ['TOTAL', num(rows.reduce((s, f) => s + f.montaje, 0)), num(rows.reduce((s, f) => s + f.posventa, 0)), num(rows.reduce((s, f) => s + f.otro, 0)), num(rows.reduce((s, f) => s + f.total, 0)), ''] });
        grid.render(filas);
        $('bn-nota').textContent = 'Lo liquidado en la liquidación OC por conceptos de bono de proyecto (Montaje, Posventa y otros), mes por mes. Solo aparecen los meses que importaste con esos conceptos en la liquidación; el histórico anterior (planilla) está en «Histórico por período». Todavía no se asigna a proyecto: eso se agrega en el próximo paso.';
      }
    }

    function exportar() {
      if (!grid) return;
      const filas = grid.filtradas();
      const aoa = [columnasActuales.map(c => c.titulo), ...filas.map(f => columnasActuales.map(c => { const v = c.valor ? c.valor(f) : f[c.k]; return v == null ? '' : v; }))];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Bonos');
      XLSX.writeFile(wb, 'bonos_' + est.vista + '.xlsx');
    }

    // ---- cargar el libro ----
    async function alElegir(ev) {
      const file = ev.target.files[0], $e = $('bn-estado'), $b = $('bn-importar');
      est.lectura = null; $b.disabled = true;
      if (!file) { $e.className = 'est'; $e.textContent = ''; return; }
      $e.className = 'est'; $e.textContent = 'Leyendo…';
      try {
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const hoja = n => { const k = wb.SheetNames.find(x => x.trim().toLowerCase() === n.toLowerCase()); return k ? XLSX.utils.sheet_to_json(wb.Sheets[k], { header: 1, raw: true, defval: null }) : []; };
        const r = Bonos.parseLibro({ PROYECTOS: hoja('PROYECTOS'), PERSONAL: hoja('PERSONAL') });
        if (r.errores.length) { $e.className = 'est mal'; $e.textContent = r.errores.join(' '); return; }
        est.lectura = r; est.archivo = file.name;
        $e.className = 'est ' + (r.advertencias.length ? 'av' : 'ok');
        $e.innerHTML = esc(r.control.bonos + ' bonos · ' + r.control.personas + ' personas · ' + r.control.renglones + ' importes') + (r.advertencias.length ? '<ul class="lista">' + r.advertencias.slice(0, 8).map(a => '<li>' + esc(a) + '</li>').join('') + '</ul>' : '');
        $b.disabled = false;
      } catch (e) { $e.className = 'est mal'; $e.textContent = 'No pude leer el archivo: ' + e.message; }
    }
    async function importar() {
      const $e = $('bn-estado'), $b = $('bn-importar'); if (!est.lectura) return;
      if (!confirm('Esto reemplaza el histórico de bonos cargado hasta ahora. ¿Seguimos?')) return;
      $b.disabled = true; $e.className = 'est'; $e.textContent = 'Importando…';
      const { data, error } = await sb.rpc('rrhh_importar_bonos', { p_bonos: est.lectura.bonos, p_personas: est.lectura.personas });
      if (error) { $e.className = 'est mal'; $e.textContent = 'No se pudo importar: ' + error.message; $b.disabled = false; return; }
      $e.className = 'est ok'; $e.textContent = 'Importado: ' + est.lectura.bonos.length + ' bonos y ' + data + ' importes por persona.';
      await cargar();
    }

    $('bn-tabs').addEventListener('click', ev => {
      const t = ev.target.closest('[data-v]'); if (t) { est.vista = t.dataset.v; pintarTabs(); pintar(); return; }
      if (ev.target.closest('#bn-export')) exportar();
    });
    if (puedeEditar) { $('bn-archivo').addEventListener('change', alElegir); $('bn-importar').addEventListener('click', importar); }
    await cargar();
  }

  root.RRHHVistaBonos = { montar };
})(typeof window !== 'undefined' ? window : this);
