/* ==========================================================================
   RRHH · pantalla «Controles» — F.931 del mes contra la liquidación (handoff §7.5 y §7.6).
   Se monta con RRHHVistaControles.montar({ sb, $main, esc, PERM, Calc, F931Pdf, cargarPdfJs, titulo }).

   Se sube el PDF del F.931 apenas se recibe: se lee EN EL NAVEGADOR (no se sube a ningún lado), se muestran los valores
   leídos para confirmarlos o corregirlos y se guardan solo esos números (tabla rrhh_f931). El control compara contra lo
   liquidado en el recibo 4H; la diferencia de contribuciones S.S. se muestra también sin ANSSAL para hablarlo con el contador.
   ========================================================================== */
(function (root) {
  'use strict';

  const N2 = new Intl.NumberFormat('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmt = n => (n == null || Number.isNaN(n) ? '—' : N2.format(n));
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const nombreMes = p => { const m = /^(\d{4})-(\d{2})$/.exec(p || ''); return m ? MESES[+m[2] - 1] + ' ' + m[1] : (p || ''); };

  const CAMPOS = [
    ['rem1', 'Suma de Rem. 1'], ['contrib_ss', 'Contribuciones S.S.'], ['contrib_os', 'Contribuciones O.S.'], ['lrt', 'L.R.T. total'],
    ['scvo', 'Seguro colectivo de vida (SCVO)'], ['aportes_ss', 'Aportes S.S.'], ['aportes_os', 'Aportes O.S.'], ['empleados', 'Empleados en nómina'],
  ];

  async function traerTodo(sb, tabla, columnas, filtros) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {                           // la base entrega máx. 1000 filas por pedido
      let q = sb.from(tabla).select(columnas);
      for (const [k, v] of Object.entries(filtros || {})) q = q.eq(k, v);
      const { data, error } = await q.order('id').range(desde, desde + 999);
      if (error) throw new Error(tabla + ': ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, Calc, F931Pdf, cargarPdfJs, titulo } = ctx;
    titulo('Controles', 'F.931 de cada mes contra lo liquidado en el recibo');
    if (!PERM.ver.has('liquidacion')) { $main.innerHTML = '<div class="empty">Para ver los controles hace falta permiso de <b>Ver</b> en «Liquidación».</div>'; return; }
    const puedeEditar = PERM.editar.has('liquidacion');
    $main.innerHTML = '<div class="empty">Cargando…</div>';
    let periodos, catalogo;
    try {
      const rp = await sb.from('rrhh_periodos').select('periodo,estado').order('periodo', { ascending: false });
      if (rp.error) throw new Error('períodos: ' + rp.error.message);
      periodos = rp.data || [];
      catalogo = await traerTodo(sb, 'rrhh_conceptos', '*');
    } catch (e) { $main.innerHTML = '<div class="empty">No pude cargar los datos: ' + esc(e.message) + '</div>'; return; }
    if (!periodos.length) { $main.innerHTML = '<div class="empty">Todavía no hay meses importados. Importá los informes del mes en «Importar informes».</div>'; return; }

    const est = { periodo: periodos[0].periodo, filas: [], guardado: null, pdf: null, valores: {} };
    $main.innerHTML = `
      <div class="barra">
        <label>Mes<select id="ct-periodo">${periodos.map(p => '<option value="' + esc(p.periodo) + '">' + esc(nombreMes(p.periodo)) + '</option>').join('')}</select></label>
        <label>Tolerancia ($)<input type="text" id="ct-tol" value="1,00" inputmode="decimal" style="width:90px"></label>
      </div>
      <div class="card"><div class="card-h"><h3>F.931 del mes</h3><span id="ct-estado" class="est"></span></div>
        <div class="card-b">
          <p class="nota">Subí el PDF del F.931 apenas lo recibas. Se lee en tu navegador y <b>no se guarda el archivo</b>: solo los valores que confirmes acá.</p>
          <div class="fila"><label for="ct-pdf">PDF del F.931</label><div><input type="file" id="ct-pdf" accept="application/pdf,.pdf"><div class="est" id="ct-pdf-est"></div></div></div>
          <div id="ct-form"></div>
        </div></div>
      <div class="card"><div class="card-h"><h3>Control contra la liquidación (recibo 4H)</h3><span id="ct-veredicto" class="est"></span></div>
        <div class="card-b" id="ct-tabla"></div></div>`;
    const $ = id => document.getElementById(id);
    $('ct-periodo').value = est.periodo;
    const tolerancia = () => { const n = F931Pdf.numeroAR($('ct-tol').value.trim()); return n == null ? 1 : n; };

    function valoresDe(fila) {
      const v = {};
      for (const [k] of CAMPOS) v[k] = fila && fila[k] != null ? Number(fila[k]) : null;
      return v;
    }

    function pintarForm() {
      $('ct-form').innerHTML = '<div class="f931-campos">' + CAMPOS.map(([k, t]) =>
        '<label>' + esc(t) + '<input type="text" data-k="' + k + '" inputmode="decimal" value="' + (est.valores[k] == null ? '' : esc(k === 'empleados' ? String(est.valores[k]) : N2.format(est.valores[k]))) + '"' + (puedeEditar ? '' : ' disabled') + '></label>').join('') + '</div>'
        + (puedeEditar ? '<div style="margin-top:10px"><button class="btn" id="ct-guardar" type="button">Guardar F.931</button> <span class="est" id="ct-guardado"></span></div>'
                       : '<p class="nota">Para guardar el F.931 hace falta permiso de <b>Editar</b> en «Liquidación».</p>');
      $('ct-form').querySelectorAll('input[data-k]').forEach(i => i.addEventListener('input', () => {
        const k = i.dataset.k, n = F931Pdf.numeroAR(i.value.trim());
        est.valores[k] = i.value.trim() === '' ? null : n;
        i.style.borderColor = i.value.trim() !== '' && n == null ? 'var(--mal)' : '';
        pintarControl();
      }));
      const g = $('ct-guardar'); if (g) g.addEventListener('click', guardar);
    }

    function pintarEstado() {
      $('ct-estado').className = 'est ' + (est.guardado ? 'ok' : 'av');
      $('ct-estado').textContent = est.guardado ? 'Guardado' : 'Todavía no cargado';
    }

    function f931ParaControl() {
      const v = est.valores;
      return { remuneracion_1: v.rem1 == null ? NaN : v.rem1, contrib_ss: v.contrib_ss == null ? NaN : v.contrib_ss, contrib_os: v.contrib_os == null ? NaN : v.contrib_os,
               lrt: v.lrt == null ? NaN : v.lrt, scvo: v.scvo == null ? NaN : v.scvo, aportes_ss: v.aportes_ss == null ? NaN : v.aportes_ss,
               aportes_os: v.aportes_os == null ? NaN : v.aportes_os, empleados: v.empleados };
    }

    function pintarControl() {
      const faltan = CAMPOS.filter(([k]) => est.valores[k] == null).map(([, t]) => t);
      const r = Calc.controlF931(est.filas, catalogo, f931ParaControl(), { tolerancia: tolerancia() });
      const fila = l => '<tr class="' + (l.informativo ? 'inf' : '') + '"><td class="izq">' + esc(l.etiqueta) + (l.informativo ? ' <i>(informativa)</i>' : '') + '</td><td>' + fmt(l.liquidacion) + '</td><td>' + fmt(l.f931)
        + '</td><td class="' + (Number.isFinite(l.f931) && !l.ok && !l.informativo ? 'neg' : '') + '">' + (Number.isFinite(l.f931) ? fmt(l.diferencia) : '—') + '</td><td>'
        + (!Number.isFinite(l.f931) ? '—' : l.ok ? '<span class="est ok">✓ coincide</span>' : l.informativo ? '<span class="est">diferencia</span>' : '<span class="est mal">✗ difiere</span>') + '</td></tr>';
      const e = r.empleados;
      const filaEmp = '<tr><td class="izq">Empleados (legajos liquidados en el recibo)</td><td>' + e.liquidados + '</td><td>' + (e.f931 == null ? '—' : e.f931) + '</td><td>' + (e.f931 == null ? '—' : e.liquidados - e.f931)
        + '</td><td>' + (e.f931 == null ? '—' : e.ok ? '<span class="est ok">✓ coincide</span>' : '<span class="est mal">✗ difiere</span>') + '</td></tr>';
      $('ct-tabla').innerHTML = '<div class="tblwrap chico"><table class="tbl"><thead><tr><th class="izq">Concepto</th><th>Liquidación</th><th>F.931</th><th>Diferencia</th><th>Estado</th></tr></thead><tbody>'
        + r.lineas.map(fila).join('') + filaEmp + '</tbody></table></div>'
        + (r.sinCatalogar.length ? '<div class="est mal">Hay conceptos sin catalogar (' + esc(r.sinCatalogar.join(', ')) + '): las sumas de la liquidación pueden estar incompletas.</div>' : '')
        + '<p class="nota">Diferencia = liquidación − F.931. Las líneas informativas no bloquean el control. «Aportes» son las retenciones al empleado, no costo de la empresa.</p>';
      const v = $('ct-veredicto');
      if (faltan.length) { v.className = 'est av'; v.textContent = 'Falta cargar: ' + faltan.join(', '); }
      else if (r.ok) { v.className = 'est ok'; v.textContent = 'Sin diferencias (tolerancia $ ' + fmt(tolerancia()) + ')'; }
      else { v.className = 'est mal'; v.textContent = 'Hay diferencias para revisar con el contador'; }
    }

    async function cargarPeriodo() {
      $('ct-tabla').innerHTML = '<div class="empty">Cargando…</div>'; $('ct-pdf-est').textContent = ''; est.pdf = null;
      try {
        est.filas = await traerTodo(sb, 'rrhh_liquidacion_filas', 'legajo,empresa,tipo_liquidacion,nro_concepto,importe,cantidad', { periodo: est.periodo, empresa: '4H' });
        const r = await sb.from('rrhh_f931').select('*').eq('periodo', est.periodo);
        if (r.error) throw new Error('F.931: ' + r.error.message);
        est.guardado = (r.data || [])[0] || null;
      } catch (e) { $('ct-tabla').innerHTML = '<div class="empty">No pude cargar el mes: ' + esc(e.message) + '</div>'; return; }
      est.valores = valoresDe(est.guardado);
      pintarEstado(); pintarForm(); pintarControl();
    }

    async function alElegirPdf(ev) {
      const file = ev.target.files[0]; const $e = $('ct-pdf-est'); if (!file) return;
      $e.className = 'est'; $e.textContent = 'Leyendo el PDF…';
      try {
        const pdfjs = await cargarPdfJs();
        const r = await F931Pdf.leerPdf(file, pdfjs);
        est.pdf = r;
        const msgs = [];
        if (r.periodo && r.periodo !== est.periodo) {
          $e.className = 'est mal';
          $e.textContent = 'Este PDF es del período ' + nombreMes(r.periodo) + ', no de ' + nombreMes(est.periodo) + '. Elegí el mes correcto arriba o el archivo correcto. No se cargó nada.';
          ev.target.value = ''; return;
        }
        for (const [k] of CAMPOS) if (r[k] != null) est.valores[k] = r[k];
        pintarForm(); pintarControl();
        if (r.faltan.length) { $e.className = 'est av'; $e.textContent = 'Leí el PDF pero no encontré: ' + r.faltan.join(', ') + '. Completalos a mano.'; }
        else { $e.className = 'est ok'; $e.textContent = 'PDF leído (' + nombreMes(r.periodo) + '). Revisá los valores y guardalos.'; }
      } catch (e) {
        $e.className = 'est mal';
        $e.textContent = 'No pude leer el PDF (' + (e && e.message ? e.message : e) + '). Podés cargar los valores a mano.';
      }
    }

    async function guardar() {
      const $g = $('ct-guardado'); $g.className = 'est'; $g.textContent = 'Guardando…';
      const v = est.valores;
      const falta = CAMPOS.filter(([k]) => v[k] == null).map(([, t]) => t);
      if (falta.length) { $g.className = 'est mal'; $g.textContent = 'Faltan valores: ' + falta.join(', ') + '.'; return; }
      if (est.pdf && est.pdf.periodo && est.pdf.periodo !== est.periodo) { $g.className = 'est mal'; $g.textContent = 'El PDF leído es de otro período.'; return; }
      const fila = { periodo: est.periodo }; for (const [k] of CAMPOS) fila[k] = v[k];
      const { error } = await sb.from('rrhh_f931').upsert(fila, { onConflict: 'periodo' });
      if (error) { $g.className = 'est mal'; $g.textContent = 'No se guardó: ' + error.message; return; }
      est.guardado = fila; pintarEstado(); $g.className = 'est ok'; $g.textContent = '✓ F.931 guardado.';
    }

    $('ct-periodo').addEventListener('change', ev => { est.periodo = ev.target.value; $('ct-pdf').value = ''; cargarPeriodo(); });
    $('ct-tol').addEventListener('input', () => pintarControl());
    $('ct-pdf').addEventListener('change', alElegirPdf);
    await cargarPeriodo();
  }

  root.RRHHVistaControles = { montar };
})(typeof window !== 'undefined' ? window : this);
