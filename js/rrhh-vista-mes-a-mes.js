/* ==========================================================================
   RRHH · pantalla «Costo por mes»: empleado en filas, mes/año en columnas, con total.
   Se monta con RRHHVistaMesAMes.montar({ sb, $main, esc, PERM, XLSX, Informe, MesAMes, titulo }).
   Solo lee (los mismos permisos que «Costo por empleado»). Nada se guarda ni se envía: «Exportar a Excel» arma el archivo
   en el navegador. El cálculo de cada mes es el mismo de «Costo por empleado» (Informe.construir).
   ========================================================================== */
(function (root) {
  'use strict';

  const N0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const corto = p => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? MESES[+m[2] - 1] + '-' + m[1].slice(2) : (p || ''); };
  const largo = p => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][+m[2] - 1] + ' ' + m[1] : (p || ''); };
  const num = n => (n == null || Number.isNaN(n) ? '—' : N0.format(n));

  const ORDEN = { rrhh_conceptos: ['nro_concepto', 'empresa'], rrhh_empleados: ['legajo'] };
  const ordenar = (q, tabla) => (ORDEN[tabla] || ['id']).reduce((x, c) => x.order(c), q);
  async function traerTodo(sb, tabla, columnas, periodo) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {                       // la base entrega máx. 1000 filas por pedido
      let q = sb.from(tabla).select(columnas);
      if (periodo) q = q.eq('periodo', periodo);
      const { data, error } = await ordenar(q, tabla).range(desde, desde + 999);
      if (error) throw new Error(tabla + ': ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Informe, MesAMes, Tabla, titulo } = ctx;
    titulo('Costo por mes', 'Cada persona mes a mes, con el total del período elegido');
    if (!PERM.ver.has('costos') || !PERM.ver.has('liquidacion')) {
      $main.innerHTML = '<div class="empty">Para ver el costo por mes hace falta permiso de <b>Ver</b> en «Costos» y en «Liquidación». Pedíselo a dirección en el portal.</div>';
      return;
    }
    $main.innerHTML = '<div class="empty">Cargando…</div>';
    let periodos, catalogo, empleados;
    try {
      const rp = await sb.from('rrhh_periodos').select('periodo,estado,oc_completo,novedades_completas').order('periodo', { ascending: true });
      if (rp.error) throw new Error('períodos: ' + rp.error.message);
      periodos = (rp.data || []).slice().sort((x, y) => (x.periodo < y.periodo ? -1 : 1));      // de más viejo a más nuevo, sin depender del orden de la base
      catalogo = await traerTodo(sb, 'rrhh_conceptos', '*');
      empleados = await traerTodo(sb, 'rrhh_empleados', 'legajo,nombre,departamento');
    } catch (e) { $main.innerHTML = '<div class="empty">No pude cargar los datos: ' + esc(e.message) + '</div>'; return; }
    if (!periodos.length) { $main.innerHTML = '<div class="empty">Todavía no hay meses importados. Importá los informes del mes en «Importar informes».</div>'; return; }

    const opts = periodos.map(p => '<option value="' + esc(p.periodo) + '">' + esc(largo(p.periodo)) + '</option>').join('');
    const est = { sinBonos: [], desde: periodos[0].periodo, hasta: periodos[periodos.length - 1].periodo, medida: 'costo', porDepto: false, depto: '', texto: '', informes: {}, lista: [] };
    $main.innerHTML = `
      <div class="barra">
        <label>Ver<select id="mm-medida">${Object.entries(MesAMes.MEDIDAS).map(([k, m]) => '<option value="' + k + '">' + esc(m.titulo) + '</option>').join('')}</select></label>
        <label>Desde<select id="mm-desde">${opts}</select></label>
        <label>Hasta<select id="mm-hasta">${opts}</select></label>
        <label>Departamento<select id="mm-depto"><option value="">Todos</option></select></label>
        <label>Agrupar<select id="mm-agrupar"><option value="">Por empleado</option><option value="1">Por departamento</option></select></label>
        <label>Buscar<input type="search" id="mm-buscar" placeholder="Legajo o nombre" autocomplete="off"></label>
        <fieldset class="bonos-sel"><legend>Incluir bonos de proyecto</legend>
          <label><input type="checkbox" data-bono="montaje" checked> Montaje</label>
          <label><input type="checkbox" data-bono="posventa" checked> Posventa</label>
          <label><input type="checkbox" data-bono="otro" checked> Otros (sin discriminar)</label>
        </fieldset>
        <span class="sp"></span>
        <button class="btn" id="mm-export" type="button">Exportar a Excel</button>
      </div>
      <div id="mm-alertas"></div>
      <div id="mm-tabla"><div class="empty">Cargando…</div></div>
      <p class="nota" id="mm-nota"></p>`;
    const $ = id => document.getElementById(id);
    $('mm-desde').value = est.desde; $('mm-hasta').value = est.hasta;

    async function cargar() {
      est.lista = periodos.map(p => p.periodo).filter(p => p >= est.desde && p <= est.hasta);
      try {
        for (const p of est.lista) {
          if (est.informes[p]) continue;
          $('mm-tabla').innerHTML = '<div class="empty">Cargando ' + esc(largo(p)) + '…</div>';
          const filas = await traerTodo(sb, 'rrhh_liquidacion_filas', 'legajo,empresa,tipo_liquidacion,nro_concepto,importe,cantidad', p);
          est.informes[p] = Informe.construir({ filas, catalogo, empleados });
        }
      } catch (e) { $('mm-tabla').innerHTML = '<div class="empty">No pude cargar los meses: ' + esc(e.message) + '</div>'; return; }
      const deps = MesAMes.departamentos(est.informes, est.lista);
      $('mm-depto').innerHTML = '<option value="">Todos</option>' + deps.map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('');
      if (!deps.includes(est.depto)) est.depto = '';
      $('mm-depto').value = est.depto;
      pintarAlertas(); pintar();
    }

    function pintarAlertas() {
      const msgs = [];
      const inc = est.lista.filter(p => (periodos.find(x => x.periodo === p) || {}).oc_completo === false);
      if (inc.length) msgs.push(['av', 'Meses con la liquidación OC INCOMPLETA (marcados con *): ' + inc.map(largo).join(', ') + '. Su costo puede estar subestimado y no es comparable con meses completos.']);
      const pend = est.lista.filter(p => { const a = est.informes[p].alertas; return a.sinCatalogar.length || a.sinTrata.length; });
      if (pend.length) msgs.push(['mal', 'Meses con conceptos sin catalogar o sin tratamiento (su costo está incompleto): ' + pend.map(largo).join(', ') + '. Revisalos en «Costo por empleado».']);
      $('mm-alertas').innerHTML = msgs.length ? '<div class="alertas">' + msgs.map(([k, t]) => '<div class="est ' + k + '">' + esc(t) + '</div>').join('') + '</div>' : '';
    }

    const calcular = () => MesAMes.matriz(est.informes, est.lista, { medida: est.medida, porDepto: false, depto: est.depto, texto: est.texto, sinBonos: est.sinBonos });
    const marca = p => ((periodos.find(x => x.periodo === p) || {}).oc_completo === false ? '*' : '');
    const sinDepto = f => f.departamento || MesAMes.SIN_DEPTO;

    // Tabla estándar (ordenar, filtrar con selección múltiple, ajustar anchos): ver rrhh-tabla.js. Las columnas de meses cambian con el rango.
    let grid = null, ultimoRango = '';
    function armarGrid() {
      const cols = [
        { k: 'legajo', titulo: 'Legajo', sticky: true, cls: 'izq', min: 70 },
        { k: 'nombre', titulo: 'Empleado', sticky: true, cls: 'izq', min: 200, texto: f => f.nombre || '(sin padrón)', valor: f => f.nombre || '(sin padrón)' },
        { k: 'departamento', titulo: 'Departamento', cls: 'izq', texto: sinDepto, valor: sinDepto },
        ...est.lista.map(p => ({ k: 'm' + p, titulo: corto(p) + marca(p), tipo: 'n', valor: f => f.meses[p], texto: f => (f.presentes.includes(p) ? num(f.meses[p]) : '—') })),
        { k: 'total', titulo: 'Total', tipo: 'n', valor: f => f.total, texto: f => num(f.total) },
      ];
      const celdasSuma = (filas, etiqueta) => { const t = MesAMes.sumar(filas, est.lista);
        return ['', etiqueta, '', ...est.lista.map(p => num(t.meses[p])), num(t.total)]; };
      grid = Tabla.crear({
        el: $('mm-tabla'), id: 'mesames', columnas: cols, esc,
        pie: filas => celdasSuma(filas, 'TOTAL · ' + filas.length + ' persona' + (filas.length === 1 ? '' : 's')),
        agrupar: { clave: sinDepto, orden: (a, b) => (a === MesAMes.SIN_DEPTO) - (b === MesAMes.SIN_DEPTO) || a.localeCompare(b, 'es'),
                   fila: (d, filas) => celdasSuma(filas, d + ' · ' + filas.length) },
      });
    }

    function pintar() {
      const r = calcular();
      const rango = r.periodos.join(',');
      if (!grid || rango !== ultimoRango) { ultimoRango = rango; armarGrid(); }      // distinto rango de meses = columnas distintas
      grid.render(r.filas, { agrupar: est.porDepto });
      $('mm-nota').innerHTML = '<b>' + esc(r.titulo) + '.</b> Importes sin centavos (el Excel exportado trae los completos); «—» = la persona no figura ese mes. '
        + 'Costo = 4H + OC + aguinaldo + bajas + bono de proyecto (no incluye el Combo Hogar, que va a la cuenta de RRHH). '
        + (est.sinBonos.length ? '<b>Sin bonos de: ' + est.sinBonos.join(', ') + '.</b> ' : '') + 'Cobrado = neto del recibo 4H + todo lo liquidado por OC (incluye bono y descuentos). Cobrado 4H = neto del recibo. Cobrado 4H OC = todo lo liquidado por OC. '
        + 'Ordená con un clic en el título, filtrá con ▾ (varios valores a la vez) y ajustá el ancho arrastrando el borde de la columna.';
    }

    function exportar() {
      const r = calcular(), filas = grid ? grid.filtradas() : r.filas, t = MesAMes.sumar(filas, r.periodos);     // respeta filtros y orden de la tabla
      const aoa = [['Legajo', 'Empleado', 'Departamento', ...r.periodos.map(corto), 'Total']];
      const fila = f => [f.legajo, f.nombre || '(sin padrón)', f.departamento || '', ...r.periodos.map(p => f.meses[p]), f.total];
      if (est.porDepto) {
        const mapa = new Map(); filas.forEach(f => { const d = sinDepto(f); if (!mapa.has(d)) mapa.set(d, []); mapa.get(d).push(f); });
        [...mapa.keys()].sort((a, b) => (a === MesAMes.SIN_DEPTO) - (b === MesAMes.SIN_DEPTO) || a.localeCompare(b, 'es')).forEach(d => {
          const g = MesAMes.sumar(mapa.get(d), r.periodos); aoa.push(['', d, '', ...r.periodos.map(p => g.meses[p]), g.total]); mapa.get(d).forEach(f => aoa.push(fila(f))); });
      } else filas.forEach(f => aoa.push(fila(f)));
      aoa.push(['', 'TOTAL', '', ...r.periodos.map(p => t.meses[p]), t.total]);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Costo por mes');
      XLSX.writeFile(wb, 'costo_por_mes_' + est.medida + '_' + est.desde + '_a_' + est.hasta + '.xlsx');
    }

    const rango = () => { if (est.desde > est.hasta) { est.hasta = est.desde; $('mm-hasta').value = est.hasta; } cargar(); };
    $('mm-medida').addEventListener('change', ev => { est.medida = ev.target.value; pintar(); });
    $('mm-desde').addEventListener('change', ev => { est.desde = ev.target.value; rango(); });
    $('mm-hasta').addEventListener('change', ev => { est.hasta = ev.target.value; if (est.desde > est.hasta) { est.desde = est.hasta; $('mm-desde').value = est.desde; } cargar(); });
    $('mm-depto').addEventListener('change', ev => { est.depto = ev.target.value; pintar(); });
    $('mm-agrupar').addEventListener('change', ev => { est.porDepto = !!ev.target.value; pintar(); });
    $('mm-buscar').addEventListener('input', ev => { est.texto = ev.target.value; pintar(); });
    document.querySelectorAll('input[data-bono]').forEach(i => i.addEventListener('change', () => {
      est.sinBonos = [...document.querySelectorAll('input[data-bono]')].filter(x => !x.checked).map(x => x.dataset.bono); pintar();
    }));
    $('mm-export').addEventListener('click', exportar);
    await cargar();
  }

  root.RRHHVistaMesAMes = { montar };
})(typeof window !== 'undefined' ? window : this);
