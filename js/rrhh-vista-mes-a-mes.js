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
    const { sb, $main, esc, PERM, XLSX, Informe, MesAMes, titulo } = ctx;
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
    const est = { desde: periodos[0].periodo, hasta: periodos[periodos.length - 1].periodo, medida: 'costo', porDepto: false, depto: '', texto: '', informes: {}, lista: [] };
    $main.innerHTML = `
      <div class="barra">
        <label>Ver<select id="mm-medida">${Object.entries(MesAMes.MEDIDAS).map(([k, m]) => '<option value="' + k + '">' + esc(m.titulo) + '</option>').join('')}</select></label>
        <label>Desde<select id="mm-desde">${opts}</select></label>
        <label>Hasta<select id="mm-hasta">${opts}</select></label>
        <label>Departamento<select id="mm-depto"><option value="">Todos</option></select></label>
        <label>Agrupar<select id="mm-agrupar"><option value="">Por empleado</option><option value="1">Por departamento</option></select></label>
        <label>Buscar<input type="search" id="mm-buscar" placeholder="Legajo o nombre" autocomplete="off"></label>
        <span class="sp"></span>
        <button class="btn" id="mm-export" type="button">Exportar a Excel</button>
      </div>
      <div id="mm-alertas"></div>
      <div id="mm-tabla"><div class="empty">Cargando…</div></div>`;
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

    const calcular = () => MesAMes.matriz(est.informes, est.lista, { medida: est.medida, porDepto: est.porDepto, depto: est.depto, texto: est.texto });
    const marca = p => ((periodos.find(x => x.periodo === p) || {}).oc_completo === false ? '*' : '');

    function pintar() {
      const r = calcular();
      const celdas = x => r.periodos.map(p => '<td class="' + (x.meses[p] < 0 ? 'neg' : '') + '">' + (x.meses[p] === 0 && x.presentes && !x.presentes.includes(p) ? '—' : num(x.meses[p])) + '</td>').join('')
        + '<td class="' + (x.total < 0 ? 'neg' : '') + '"><b>' + num(x.total) + '</b></td>';
      const filaP = f => '<tr><td class="c1">' + esc(f.legajo) + '</td><td class="c2 izq">' + esc(f.nombre || '(sin padrón)') + '</td>' + celdas(f) + '</tr>';
      const head = '<th class="c1">Legajo</th><th class="c2 izq">Empleado</th>' + r.periodos.map(p => '<th>' + esc(corto(p)) + marca(p) + '</th>').join('') + '<th>Total</th>';
      const body = r.grupos
        ? r.grupos.map(g => '<tr class="grupo"><td class="c1"></td><td class="c2 izq">' + esc(g.departamento) + ' · ' + g.filas.length + '</td>' + celdas(g) + '</tr>' + g.filas.map(filaP).join('')).join('')
        : r.filas.map(filaP).join('');
      const foot = '<td class="c1"></td><td class="c2 izq">TOTAL · ' + r.totales.personas + ' persona' + (r.totales.personas === 1 ? '' : 's') + '</td>'
        + r.periodos.map(p => '<td>' + num(r.totales.meses[p]) + '</td>').join('') + '<td>' + num(r.totales.total) + '</td>';
      $('mm-tabla').innerHTML = r.filas.length
        ? '<div class="tblwrap"><table class="tbl"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody><tfoot><tr>' + foot + '</tr></tfoot></table></div>'
          + '<p class="nota"><b>' + esc(r.titulo) + '.</b> Importes sin centavos (el Excel exportado trae los completos); «—» = la persona no figura ese mes. '
          + 'Costo = 4H + OC + aguinaldo + bajas + bono de proyecto (no incluye el Combo Hogar, que va a la cuenta de RRHH). '
          + 'Cobrado = neto del recibo 4H + todo lo liquidado por OC (incluye bono y descuentos). Cobrado 4H = neto del recibo. Cobrado 4H OC = todo lo liquidado por OC.</p>'
        : '<div class="empty">No hay personas que coincidan con el filtro.</div>';
    }

    function exportar() {
      const r = calcular();
      const aoa = [['Legajo', 'Empleado', 'Departamento', ...r.periodos.map(corto), 'Total']];
      const fila = f => [f.legajo, f.nombre || '(sin padrón)', f.departamento || '', ...r.periodos.map(p => f.meses[p]), f.total];
      if (r.grupos) r.grupos.forEach(g => { aoa.push(['', g.departamento, '', ...r.periodos.map(p => g.meses[p]), g.total]); g.filas.forEach(f => aoa.push(fila(f))); });
      else r.filas.forEach(f => aoa.push(fila(f)));
      aoa.push(['', 'TOTAL', '', ...r.periodos.map(p => r.totales.meses[p]), r.totales.total]);
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
    $('mm-export').addEventListener('click', exportar);
    await cargar();
  }

  root.RRHHVistaMesAMes = { montar };
})(typeof window !== 'undefined' ? window : this);
