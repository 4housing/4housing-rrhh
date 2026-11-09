/* ==========================================================================
   RRHH · pantalla «Costo por empleado» — Vista 1: Mes (el detalle del Excel de control, mes por mes).
   Se monta con RRHHVistaCostos.montar({ sb, $main, esc, PERM, XLSX, Informe, titulo }).
   Solo lee. Los importes de sueldos se muestran únicamente a quien tiene Ver en «costos» y en «liquidación»;
   igual la base lo hace cumplir con RLS. Nada de esto se guarda ni se envía a ningún lado: «Exportar a Excel»
   arma el archivo en el navegador.
   ========================================================================== */
(function (root) {
  'use strict';

  const N0 = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });
  const N2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const P1 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const bad = n => n == null || Number.isNaN(n);
  const num = (n, dec) => (bad(n) ? '—' : (dec ? N2 : N0).format(n));
  const pct = n => (bad(n) ? '—' : P1.format(n * 100) + '%');
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = p => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? MESES[+m[2] - 1] + ' ' + m[1] : (p || ''); };

  const TRATA = { costo: 'Costo', excluir: 'Excluido (adelanto)', directo_proyecto: 'Bono de proyecto', cuenta_rrhh: 'Cuenta RRHH', retencion: 'Retención' };
  const TIPOS = { trabajada: 'Trabajadas', extra50: 'Extras 50%', vacaciones: 'Vacaciones', feriado: 'Feriado', enfermedad: 'Enfermedad',
                  art: 'ART', justificada: 'Justificadas', otra: 'Otras' };

  // Columnas de la tabla: [clave, título, grupo, formato]
  const COLS = [
    ['legajo', 'Legajo', '', 'txt'], ['nombre', 'Empleado', '', 'txt'], ['departamento', 'Departamento', '', 'txt'],
    ['neto4H', 'Neto', '4H · recibo', 'n'], ['cargas', 'Cargas', '4H · recibo', 'n'], ['costo4H', 'Costo 4H', '4H · recibo', 'n'],
    ['oc', 'OC (costo)', '4H OC', 'n'],
    ['bono', 'Bono proyecto', 'Bono', 'n'],
    ['cuestaSinBono', 'Cuesta sin bono', 'Cuánto cuesta', 'n'], ['cuestaTotal', 'Cuesta total', 'Cuánto cuesta', 'n'],
    ['cobra', 'Cobra en el bolsillo', 'Cuánto cobra', 'n'],
    ['costoExcel', 'Costo total Excel', 'Como el Excel', 'n'],
    ['pctCcssCosto', '% CCSS', 'Cargas', 'p'], ['pctCcssNeto', '% s/neto', 'Cargas', 'p'], ['pctCcssCobrado', '% s/cobrado', 'Cargas', 'p'],
    ['horasPagas', 'Horas pagas', 'Horas', 'h'], ['valorHoraTrabajada', '$/hora trabajada', 'Horas', 'n'],
  ];

  async function traerTodo(sb, tabla, columnas, periodo) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {                       // la base entrega máx. 1000 filas por pedido
      let q = sb.from(tabla).select(columnas);
      if (periodo) q = q.eq('periodo', periodo);
      const { data, error } = await q.order('id').range(desde, desde + 999);
      if (error) throw new Error(tabla + ': ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Informe, titulo } = ctx;
    titulo('Costo por empleado', 'Cuánto cuesta cada persona a la empresa y cuánto cobra en el bolsillo, mes por mes');
    if (!PERM.ver.has('costos') || !PERM.ver.has('liquidacion')) {
      $main.innerHTML = '<div class="empty">Para ver el costo por empleado hace falta permiso de <b>Ver</b> en «Costos» y en «Liquidación». Pedíselo a dirección en el portal.</div>';
      return;
    }
    $main.innerHTML = '<div class="empty">Cargando…</div>';
    let periodos, catalogo, empleados;
    try {
      const rp = await sb.from('rrhh_periodos').select('periodo,estado,oc_completo,novedades_completas').order('periodo', { ascending: false });
      if (rp.error) throw new Error('períodos: ' + rp.error.message);
      periodos = rp.data || [];
      catalogo = await traerTodo(sb, 'rrhh_conceptos', '*');
      empleados = await traerTodo(sb, 'rrhh_empleados', 'legajo,nombre,departamento');
    } catch (e) { $main.innerHTML = '<div class="empty">No pude cargar los datos: ' + esc(e.message) + '</div>'; return; }
    if (!periodos.length) { $main.innerHTML = '<div class="empty">Todavía no hay meses importados. Importá los informes del mes en «Importar informes».</div>'; return; }

    const cache = {};
    const est = { periodo: periodos[0].periodo, depto: '', texto: '', informe: null, filas: null };

    $main.innerHTML = `
      <div class="barra">
        <label>Mes<select id="cs-periodo">${periodos.map(p => '<option value="' + esc(p.periodo) + '">' + esc(nombreMes(p.periodo)) + '</option>').join('')}</select></label>
        <label>Departamento<select id="cs-depto"><option value="">Todos</option></select></label>
        <label>Buscar<input type="search" id="cs-buscar" placeholder="Legajo o nombre" autocomplete="off"></label>
        <span class="sp"></span>
        <button class="btn" id="cs-export" type="button">Exportar a Excel</button>
      </div>
      <div id="cs-alertas"></div>
      <div id="cs-tabla"><div class="empty">Cargando…</div></div>
      <div id="cs-modal"></div>`;
    const $ = id => document.getElementById(id);
    $('cs-periodo').value = est.periodo;

    async function cargarPeriodo() {
      $('cs-tabla').innerHTML = '<div class="empty">Cargando…</div>';
      if (!cache[est.periodo]) {
        try {
          const filas = (await traerTodo(sb, 'rrhh_liquidacion_filas', 'legajo,empresa,tipo_liquidacion,nro_concepto,importe,cantidad', est.periodo));
          cache[est.periodo] = { filas, informe: Informe.construir({ filas, catalogo, empleados }) };
        } catch (e) { $('cs-tabla').innerHTML = '<div class="empty">No pude cargar el mes: ' + esc(e.message) + '</div>'; return; }
      }
      est.informe = cache[est.periodo].informe; est.filas = cache[est.periodo].filas;
      const dep = $('cs-depto');
      dep.innerHTML = '<option value="">Todos</option>' + est.informe.departamentos.map(d => '<option value="' + esc(d) + '">' + esc(d) + '</option>').join('');
      est.depto = ''; pintarAlertas(); pintarTabla();
    }

    function pintarAlertas() {
      const a = est.informe.alertas, p = periodos.find(x => x.periodo === est.periodo), msgs = [];
      if (a.sinCatalogar.length) msgs.push(['mal', 'Conceptos sin catalogar (frenan el cierre): ' + a.sinCatalogar.map(x => x.empresa + ':' + x.nro_concepto).join(', ') + '. Sus importes no están en el costo.']);
      if (a.sinTrata.length) msgs.push(['mal', 'Conceptos sin tratamiento definido (frenan el cierre): ' + a.sinTrata.map(x => x.empresa + ':' + x.nro_concepto).join(', ') + '. Sus importes no están en el costo.']);
      if (a.legajosSinPadron.length) msgs.push(['av', 'Legajos liquidados que no están en el padrón: ' + a.legajosSinPadron.join(', ') + '.']);
      if (p && p.oc_completo === false) msgs.push(['av', 'Este mes está marcado con la liquidación OC INCOMPLETA: el costo puede estar subestimado y no es comparable con meses completos.']);
      $('cs-alertas').innerHTML = msgs.length ? '<div class="alertas">' + msgs.map(([k, t]) => '<div class="est ' + k + '">' + esc(t) + '</div>').join('') + '</div>' : '';
    }

    function filtradas() {
      const t = est.texto.trim().toLowerCase();
      return est.informe.filas.filter(f => (!est.depto || f.departamento === est.depto)
        && (!t || String(f.legajo).includes(t) || (f.nombre || '').toLowerCase().includes(t)));
    }

    function celda(f, [k, , , tipo]) {
      const v = f[k];
      if (tipo === 'txt') return '<td class="' + (k === 'legajo' ? 'c1' : k === 'nombre' ? 'c2 izq' : 'izq') + '">' + esc(v == null ? (k === 'nombre' ? '(sin padrón)' : '') : v) + '</td>';
      const txt = tipo === 'p' ? pct(v) : num(v, false);
      return '<td class="' + (tipo !== 'p' && v < 0 ? 'neg' : '') + '">' + txt + '</td>';
    }

    function pintarTabla() {
      const rows = filtradas(), tot = Informe.totalizar(rows);
      const grupos = []; COLS.forEach(c => { const g = grupos[grupos.length - 1]; if (g && g.t === c[2]) g.n++; else grupos.push({ t: c[2], n: 1 }); });
      const head1 = grupos.map(g => '<th class="g" colspan="' + g.n + '">' + esc(g.t) + '</th>').join('');
      const head2 = COLS.map(c => '<th class="' + (c[0] === 'legajo' ? 'c1' : c[0] === 'nombre' ? 'c2 izq' : c[3] === 'txt' ? 'izq' : '') + '">' + esc(c[1]) + '</th>').join('');
      const body = rows.map(f => '<tr data-legajo="' + f.legajo + '">' + COLS.map(c => celda(f, c)).join('') + '</tr>').join('');
      const foot = COLS.map(c => {
        if (c[0] === 'legajo') return '<td class="c1"></td>';
        if (c[0] === 'nombre') return '<td class="c2 izq">TOTAL · ' + tot.personas + ' persona' + (tot.personas === 1 ? '' : 's') + '</td>';
        if (c[3] === 'txt') return '<td></td>';
        const v = c[0] === 'valorHoraTrabajada' ? null : tot[c[0]];
        return '<td>' + (c[3] === 'p' ? pct(v) : num(v, false)) + '</td>';
      }).join('');
      $('cs-tabla').innerHTML = rows.length
        ? '<div class="tblwrap"><table class="tbl"><thead><tr>' + head1 + '</tr><tr class="h2">' + head2 + '</tr></thead><tbody>' + body + '</tbody><tfoot><tr>' + foot + '</tr></tfoot></table></div>'
          + '<p class="nota">Los importes se muestran sin centavos; en el detalle de cada persona y en el Excel exportado van completos. «Cobra en el bolsillo» = neto del recibo + todo lo liquidado por OC (incluye bono y descuentos, p. ej. Combo Hogar). «Cuesta» no incluye el Combo Hogar, que va a la cuenta de RRHH.</p>'
        : '<div class="empty">No hay personas que coincidan con el filtro.</div>';
    }

    function abrirDetalle(legajo) {
      const f = est.informe.filas.find(x => x.legajo === legajo); if (!f) return;
      const d = Informe.detalle({ filas: est.filas, catalogo, legajo });
      const filaConc = l => '<tr><td class="izq">' + esc(l.nro) + '</td><td class="izq">' + esc(l.descripcion) + '</td><td class="izq">' + esc(l.grupo || '') + '</td>'
        + '<td class="izq">' + esc(l.trata ? (TRATA[l.trata] || l.trata) : 'PENDIENTE') + '</td><td class="' + (l.importe < 0 ? 'neg' : '') + '">' + num(l.importe, true) + '</td><td>' + (l.cantidad ? num(l.cantidad, true) : '') + '</td></tr>';
      const tabla = emp => { const ls = d.lineas.filter(l => l.empresa === emp); return ls.length
        ? '<h4>' + (emp === '4H' ? '4H · recibo' : '4H OC · fuera del recibo') + '</h4><div class="tblwrap chico"><table class="tbl"><thead><tr><th class="izq">N°</th><th class="izq">Concepto</th><th class="izq">Grupo</th><th class="izq">Tratamiento</th><th>Importe</th><th>Cantidad</th></tr></thead><tbody>' + ls.map(filaConc).join('') + '</tbody></table></div>' : ''; };
      const h = d.horas, tipos = h ? Object.keys(h.costo) : [];
      const horasHtml = tipos.length
        ? '<h4>Costo por tipo de hora</h4><div class="tblwrap chico"><table class="tbl"><thead><tr><th class="izq">Tipo</th><th>Horas</th><th>Costo</th><th>$/hora</th></tr></thead><tbody>'
          + tipos.map(t => '<tr><td class="izq">' + esc(TIPOS[t] || t) + '</td><td>' + num(h.horas[t], true) + '</td><td>' + num(h.costo[t], true) + '</td><td>' + (h.valorHora[t] == null ? '—' : num(h.valorHora[t], true)) + '</td></tr>').join('')
          + '</tbody></table></div>'
          + (h.sinHoras ? '<p class="nota">Sin horas donde repartir (sin valor hora): $ ' + num(h.sinHoras, true) + '</p>' : '')
          + (h.directoFinDeSemana ? '<p class="nota">Sábados y extras de fin de semana (se imputan por lo liquidado, no entran al valor hora): $ ' + num(h.directoFinDeSemana, true) + '</p>' : '')
        : '<p class="nota">Sin horas por tipo en este mes: todo el costo queda sin valor hora.</p>';
      $('cs-modal').innerHTML = '<div class="modal" id="cs-overlay"><div class="modal-card" role="dialog" aria-modal="true" aria-label="Detalle de ' + esc(f.nombre || 'legajo ' + f.legajo) + '">'
        + '<button class="cerrar" id="cs-cerrar" type="button" aria-label="Cerrar">×</button>'
        + '<h3>' + esc(f.nombre || '(sin padrón)') + ' <span class="sub">· legajo ' + esc(f.legajo) + (f.departamento ? ' · ' + esc(f.departamento) : '') + ' · ' + esc(nombreMes(est.periodo)) + '</span></h3>'
        + '<div class="kpis">'
        + '<div><span>Cuesta total</span><b>$ ' + num(f.cuestaTotal, true) + '</b></div><div><span>Cobra en el bolsillo</span><b>$ ' + num(f.cobra, true) + '</b></div>'
        + '<div><span>4H · recibo</span><b>$ ' + num(f.costo4H, true) + '</b></div><div><span>4H OC</span><b>$ ' + num(f.oc, true) + '</b></div><div><span>Bono proyecto</span><b>$ ' + num(f.bono, true) + '</b></div>'
        + '</div>' + tabla('4H') + tabla('4H_OC') + horasHtml + '</div></div>';
      const cerrar = () => { $('cs-modal').innerHTML = ''; document.removeEventListener('keydown', esc_); };
      const esc_ = ev => { if (ev.key === 'Escape') cerrar(); };
      document.addEventListener('keydown', esc_);
      $('cs-cerrar').addEventListener('click', cerrar);
      $('cs-overlay').addEventListener('click', ev => { if (ev.target.id === 'cs-overlay') cerrar(); });
      $('cs-cerrar').focus();
    }

    function exportar() {
      const rows = filtradas(), tot = Informe.totalizar(rows);
      const aoa = [COLS.map(c => (c[2] ? c[2] + ' · ' : '') + c[1])];
      rows.forEach(f => aoa.push(COLS.map(c => (f[c[0]] == null ? '' : f[c[0]]))));
      aoa.push(COLS.map((c, i) => (i === 1 ? 'TOTAL' : c[3] === 'txt' || c[0] === 'valorHoraTrabajada' ? '' : (tot[c[0]] == null ? '' : tot[c[0]]))));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Costo por empleado');
      XLSX.writeFile(wb, 'costo_por_empleado_' + est.periodo + '.xlsx');
    }

    $('cs-periodo').addEventListener('change', ev => { est.periodo = ev.target.value; cargarPeriodo(); });
    $('cs-depto').addEventListener('change', ev => { est.depto = ev.target.value; pintarTabla(); });
    $('cs-buscar').addEventListener('input', ev => { est.texto = ev.target.value; pintarTabla(); });
    $('cs-export').addEventListener('click', exportar);
    $('cs-tabla').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-legajo]'); if (tr) abrirDetalle(Number(tr.dataset.legajo)); });
    await cargarPeriodo();
  }

  root.RRHHVistaCostos = { montar };
})(typeof window !== 'undefined' ? window : this);
