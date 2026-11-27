/* ==========================================================================
   RRHH · pantalla «Novedades»: renglones para el Excel de importación de Delta (justificaciones, licencias, vacaciones, adelantos y descuentos).
   Se monta con RRHHVistaNovedades.montar({ sb, $main, esc, PERM, XLSX, Novedades, Tabla, titulo }).
   Los renglones se guardan en rrhh_novedades (sql/rrhh_07_novedades.sql); el Excel sale de lo pendiente y lo marca como exportado.
   Las horas extra NO se cargan acá: las calcula Delta desde las fichadas depuradas.
   Ver y editar: sección «liquidación».
   ========================================================================== */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const dmy = iso => (iso ? iso.split('-').reverse().join('/') : '');
  const hoyIso = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  async function traerTodo(sb, tabla, columnas, orden) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {                       // la base entrega máx. 1000 filas por pedido
      const q = orden.reduce((x, c) => x.order(c), sb.from(tabla).select(columnas));
      const { data, error } = await q.range(desde, desde + 999);
      if (error) throw new Error(tabla + ': ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Novedades: N, Tabla, titulo } = ctx;
    titulo('Novedades', 'Novedades para importar en Delta: justificaciones, licencias, vacaciones, adelantos y descuentos');
    if (!PERM.ver.has('liquidacion')) { $main.innerHTML = '<div class="empty">Para ver las novedades hace falta permiso de <b>Ver</b> en «Liquidación». Pedíselo a dirección en el portal.</div>'; return; }
    const puedeEditar = PERM.editar.has('liquidacion');
    const est = { filas: [], nombres: new Map(), uid: null, filtro: 'pend', grid: null };
    const desc = new Map(N.CODIGOS.map(c => [c.codigo, c.descripcion]));
    const $ = id => document.getElementById(id);

    $main.innerHTML = `
      ${puedeEditar ? `<div class="card"><div class="card-h"><h3>Agregar una novedad</h3></div><div class="card-b">
        <div class="barra">
          <label>Fecha<input type="date" id="nv-fecha" value="${hoyIso()}"></label>
          <label>Legajo<input type="number" id="nv-legajo" min="1" step="1" style="width:90px"></label>
          <label>Código<input type="text" id="nv-codigo" list="nv-codigos" style="width:130px" autocomplete="off"></label>
          <datalist id="nv-codigos">${N.CODIGOS.map(c => '<option value="' + esc(c.codigo) + '">' + esc(c.descripcion) + '</option>').join('')}</datalist>
          <label>Cantidad<input type="text" id="nv-cant" inputmode="decimal" style="width:80px" placeholder="p. ej. 7,5"></label>
          <label>Valor<input type="text" id="nv-valor" inputmode="decimal" style="width:110px" placeholder="importe"></label>
          <label>Observaciones<input type="text" id="nv-obs" maxlength="200" size="30"></label>
          <button type="button" class="btn" id="nv-agregar">Agregar</button>
        </div>
        <div class="est" id="nv-msg" style="margin-top:8px"></div>
        <p class="nota" style="margin-bottom:0">Cantidad = horas (o lo que use ese código en Delta); Valor = importe, para adelantos y descuentos. Cargá una de las dos. El código puede ser cualquiera de Delta, no solo los de la lista.
        Las <b>horas extra no se cargan acá</b>: las calcula Delta desde las fichadas depuradas.</p></div></div>` : '<div class="est av">Tu usuario puede ver las novedades pero no cargarlas.</div>'}
      <div class="barra">
        <label>Mostrar<select id="nv-filtro"><option value="pend">Pendientes de exportar</option><option value="todas">Todas</option></select></label>
        <span class="sp"></span>
        <button type="button" class="btn" id="nv-exportar" ${puedeEditar ? '' : 'disabled'} title="Baja el Excel de lo pendiente y lo marca como exportado">Exportar pendientes para Delta</button>
        <button type="button" class="btn sec" id="nv-xlsx" title="Lo que se ve en la tabla, con filtros y orden, sin marcar nada">Exportar la tabla a Excel</button>
      </div>
      <div class="est" id="nv-est" style="margin-bottom:8px"></div>
      <div id="nv-tabla"></div>`;

    const msg = (t, c) => { const e = $('nv-msg'); if (e) { e.className = 'est ' + (c || ''); e.textContent = t || ''; } };
    const visibles = () => (est.filtro === 'pend' ? est.filas.filter(f => !f.exportado_en) : est.filas);

    async function cargar() {
      $('nv-tabla').innerHTML = '<div class="empty">Cargando…</div>';
      try {
        if (!est.uid && sb.auth && sb.auth.getUser) { const u = await sb.auth.getUser(); est.uid = u && u.data && u.data.user ? u.data.user.id : null; }
        const [nov, emp] = await Promise.all([traerTodo(sb, 'rrhh_novedades', '*', ['fecha', 'legajo', 'id']), traerTodo(sb, 'rrhh_empleados', 'legajo,nombre', ['legajo'])]);
        est.nombres = new Map(emp.map(e => [e.legajo, e.nombre])); est.filas = nov; pintar();
      } catch (e) {
        $('nv-tabla').innerHTML = '<div class="empty">No pude cargar las novedades: ' + esc(e.message) + '<br>¿Se corrió <code>sql/rrhh_07_novedades.sql</code> en Supabase?</div>';
      }
    }
    function pintar() {
      const pend = est.filas.filter(f => !f.exportado_en).length;
      $('nv-est').className = 'est ' + (pend ? 'av' : 'ok');
      $('nv-est').innerHTML = pend ? '<b>' + pend + '</b> novedades pendientes de exportar a Delta.' : 'No hay novedades pendientes de exportar.';
      const cols = [
        { k: 'fecha', titulo: 'Fecha', cls: 'izq', sticky: true, min: 90, texto: f => dmy(f.fecha), valor: f => f.fecha },
        { k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', min: 60, texto: f => String(f.legajo) },
        { k: 'persona', titulo: 'Persona', cls: 'izq', min: 190, texto: f => est.nombres.get(f.legajo) || '(sin padrón)' },
        { k: 'codigo', titulo: 'Código', cls: 'izq', min: 100 },
        { k: 'descripcion', titulo: 'Descripción', cls: 'izq', min: 140, texto: f => desc.get(f.codigo) || '' },
        { k: 'cantidad', titulo: 'Cantidad', tipo: 'n', texto: f => (Number(f.cantidad) ? String(Number(f.cantidad)).replace('.', ',') : ''), valor: f => Number(f.cantidad) },
        { k: 'valor', titulo: 'Valor', tipo: 'n', texto: f => (Number(f.valor) ? Number(f.valor).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''), valor: f => Number(f.valor) },
        { k: 'observaciones', titulo: 'Observaciones', cls: 'izq', min: 200, texto: f => f.observaciones || '' },
        { k: 'origen', titulo: 'Origen', cls: 'izq', texto: f => (f.origen === 'fichadas' ? 'Desde Fichadas' : f.origen === 'vacaciones' ? 'Vacaciones' : 'Manual') },
        { k: 'estado', titulo: 'Estado', cls: 'izq', min: 130, texto: f => (f.exportado_en ? 'Exportada ' + dmy(f.exportado_en.slice(0, 10)) : 'Pendiente'), valor: f => (f.exportado_en ? 1 : 0) },
        { k: 'acc', titulo: '', cls: 'izq', min: 70, texto: () => '', html: f => (puedeEditar && !f.exportado_en ? '<button type="button" class="minib" data-del="' + esc(f.id) + '">Borrar</button>' : '') }];
      est.grid = Tabla.crear({ el: $('nv-tabla'), id: 'novedades-v1', columnas: cols, esc,
        pie: rows => ['', '', 'TOTAL · ' + rows.length + ' renglones', '', '', String(rows.reduce((s, f) => s + Number(f.cantidad), 0)).replace('.', ','), rows.reduce((s, f) => s + Number(f.valor), 0).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), '', '', '', ''] });
      est.grid.render(visibles());
    }
    $('nv-filtro').addEventListener('change', ev => { est.filtro = ev.target.value; pintar(); });

    $('nv-tabla').addEventListener('click', async ev => {
      const b = ev.target.closest('button[data-del]'); if (!b) return;
      const f = est.filas.find(x => x.id === b.dataset.del); if (!f || f.exportado_en) return;
      if (!window.confirm('¿Borrar la novedad ' + f.codigo + ' del legajo ' + f.legajo + ' (' + dmy(f.fecha) + ')?')) return;
      const { error } = await sb.from('rrhh_novedades').delete().eq('id', f.id);
      if (error) { alert('No se pudo borrar: ' + error.message); return; }
      est.filas = est.filas.filter(x => x.id !== f.id); pintar();
    });

    const agregar = $('nv-agregar');
    if (agregar) agregar.addEventListener('click', async () => {
      const n = N.normalizar({ fecha: $('nv-fecha').value, legajo: $('nv-legajo').value, codigo: $('nv-codigo').value, cantidad: $('nv-cant').value, valor: $('nv-valor').value, observaciones: $('nv-obs').value, origen: 'manual' });
      const errs = N.validar(n); if (errs.length) { msg(errs.join(' '), 'mal'); return; }
      if (!est.nombres.has(n.legajo) && !window.confirm('El legajo ' + n.legajo + ' no figura en el padrón. ¿Cargarla igual?')) return;
      if (N.duplicada(n, est.filas) && !window.confirm('Ya hay una novedad ' + n.codigo + ' para el legajo ' + n.legajo + ' el ' + dmy(n.fecha) + '. ¿Cargar otra igual?')) return;
      agregar.disabled = true;
      try {
        const { data, error } = await sb.from('rrhh_novedades').insert(n).select(); if (error) throw new Error(error.message);
        est.filas.push(data[0]); est.filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.legajo - b.legajo);
        ['nv-cant', 'nv-valor', 'nv-obs'].forEach(i => { $(i).value = ''; }); msg('Cargada: ' + n.codigo + ' · legajo ' + n.legajo + ' · ' + dmy(n.fecha) + '.', 'ok'); pintar();
      } catch (e) { msg('No se pudo guardar: ' + e.message, 'mal'); } finally { agregar.disabled = false; }
    });

    function bajar(filas, hoja, archivo) {
      const aoa = N.filasDelta(filas), ws = XLSX.utils.aoa_to_sheet(aoa);
      for (let r = 1; r < aoa.length; r++) { const c = ws[XLSX.utils.encode_cell({ r, c: 0 })]; if (c) { c.t = 'n'; c.z = 'dd/mm/yyyy'; } }   // número de serie con formato: con Date, la zona horaria corre el día
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, hoja); XLSX.writeFile(wb, archivo);
    }
    $('nv-exportar').addEventListener('click', async () => {
      const pend = est.filas.filter(f => !f.exportado_en);
      if (!pend.length) { alert('No hay novedades pendientes.'); return; }
      if (!window.confirm('Se baja el Excel con ' + pend.length + ' novedades y quedan marcadas como exportadas (no se pueden borrar). ¿Seguir?')) return;
      bajar(pend, 'Novedades', 'novedades_delta_' + hoyIso() + '.xlsx');
      if (!window.confirm('¿Se bajó bien el archivo? Si aceptás, se marcan como exportadas. Si cancelás quedan pendientes.')) return;
      const ids = pend.map(f => f.id), ahora = new Date().toISOString();
      try {
        for (let i = 0; i < ids.length; i += 200) {
          const { error } = await sb.from('rrhh_novedades').update({ exportado_en: ahora, exportado_por: est.uid }).in('id', ids.slice(i, i + 200)).is('exportado_en', null);
          if (error) throw new Error(error.message);
        }
        await cargar();
      } catch (e) { alert('El archivo se bajó pero no pude marcarlo como exportado: ' + e.message + '. Revisá antes de volver a exportar para no duplicar.'); await cargar(); }
    });
    $('nv-xlsx').addEventListener('click', () => {
      const filas = est.grid ? est.grid.filtradas() : visibles();
      const aoa = [['Fecha', 'Legajo', 'Persona', 'Código', 'Cantidad', 'Valor', 'Observaciones', 'Estado']].concat(filas.map(f => [dmy(f.fecha), f.legajo, est.nombres.get(f.legajo) || '', f.codigo, Number(f.cantidad), Number(f.valor), f.observaciones || '', f.exportado_en ? 'Exportada' : 'Pendiente']));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Novedades'); XLSX.writeFile(wb, 'novedades.xlsx');
    });
    await cargar();
  }
  const api = { montar };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RRHHVistaNovedades = api;
})(typeof self !== 'undefined' ? self : this);
