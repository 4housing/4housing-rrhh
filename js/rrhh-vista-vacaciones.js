/* ==========================================================================
   RRHH · pantalla «Vacaciones» (etapa 3a): saldos y pedidos cargados por RRHH, circuito pedido → jefe → RRHH, generación de las novedades VACJOR / VACM
   y control de integridad. Los días los escribe RRHH; la app no calcula cuántos corresponden.
   Se monta con RRHHVistaVacaciones.montar({ sb, $main, esc, PERM, XLSX, Vacaciones, Novedades, Tabla, titulo }).
   Necesita sql/rrhh_07_novedades.sql y sql/rrhh_08_vacaciones.sql. Ver y editar: sección «liquidación».
   ========================================================================== */
(function (root) {
  'use strict';
  const pad = n => String(n).padStart(2, '0');
  const dmy = iso => (iso ? String(iso).slice(0, 10).split('-').reverse().join('/') : '');
  const dec = n => (n == null ? '' : String(Number(n)).replace('.', ','));
  const hoy = new Date();
  async function traerTodo(sb, tabla, columnas, orden, filtrar) {
    const out = [];
    for (let desde = 0; ; desde += 1000) {                       // la base entrega máx. 1000 filas por pedido
      let q = sb.from(tabla).select(columnas); if (filtrar) q = filtrar(q);
      const { data, error } = await orden.reduce((x, c) => x.order(c), q).range(desde, desde + 999);
      if (error) throw new Error(tabla + ': ' + error.message);
      out.push(...(data || []));
      if (!data || data.length < 1000) break;
    }
    return out;
  }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Vacaciones: V, Novedades: N, Tabla, titulo } = ctx;
    titulo('Vacaciones', 'Saldos y pedidos de vacaciones, aprobación y novedades para Delta');
    if (!PERM.ver.has('liquidacion')) { $main.innerHTML = '<div class="empty">Para ver las vacaciones hace falta permiso de <b>Ver</b> en «Liquidación». Pedíselo a dirección en el portal.</div>'; return; }
    const puedeEditar = PERM.editar.has('liquidacion');
    const est = { saldos: [], pedidos: [], novVac: [], nombres: new Map(), feriados: new Set(), uid: null, vista: 'pedidos', anio: hoy.getFullYear(), grid: null, gen: null };
    const $ = id => document.getElementById(id);
    const nombre = l => est.nombres.get(l) || '(sin padrón)';

    $main.innerHTML = `
      <div class="barra">
        <button type="button" class="btn" data-tab="pedidos">Pedidos</button> <button type="button" class="btn sec" data-tab="saldos">Saldos y control</button>
        <span class="sp"></span><button type="button" class="btn sec" id="va-xlsx">Exportar la tabla a Excel</button>
      </div>
      <div id="va-form"></div><div class="est" id="va-msg" style="margin:8px 0"></div><div id="va-tabla"></div><div id="va-panel"></div>`;
    const msg = (t, c) => { const e = $('va-msg'); e.className = 'est ' + (c || ''); e.textContent = t || ''; };

    async function cargar() {
      $('va-tabla').innerHTML = '<div class="empty">Cargando…</div>';
      try {
        if (!est.uid && sb.auth && sb.auth.getUser) { const u = await sb.auth.getUser(); est.uid = u && u.data && u.data.user ? u.data.user.id : null; }
        const [sal, ped, nv, emp, fer] = await Promise.all([
          traerTodo(sb, 'rrhh_vac_saldos', '*', ['anio', 'legajo']), traerTodo(sb, 'rrhh_vac_pedidos', '*', ['desde', 'legajo', 'id']),
          traerTodo(sb, 'rrhh_novedades_carga', 'id,vac_pedido', ['id'], q => q.not('vac_pedido', 'is', null)),
          traerTodo(sb, 'rrhh_empleados', 'legajo,nombre', ['legajo']), traerTodo(sb, 'rrhh_feriados', '*', ['fecha'])]);
        Object.assign(est, { saldos: sal, pedidos: ped, novVac: nv, nombres: new Map(emp.map(e => [e.legajo, e.nombre])), feriados: new Set(fer.map(f => f.fecha)) });
      } catch (e) { $('va-tabla').innerHTML = '<div class="empty">No pude cargar las vacaciones: ' + esc(e.message) + '<br>¿Se corrieron <code>sql/rrhh_07_novedades.sql</code> y <code>sql/rrhh_08_vacaciones.sql</code> en Supabase?</div>'; return; }
      pintar();
    }

    /* ---------------- formularios ---------------- */
    function pintarForm() {
      if (!puedeEditar) { $('va-form').innerHTML = '<div class="est av">Tu usuario puede ver las vacaciones pero no cargarlas.</div>'; return; }
      $('va-form').innerHTML = est.vista === 'pedidos'
        ? `<div class="card"><div class="card-h"><h3>Cargar un pedido de vacaciones</h3></div><div class="card-b"><div class="barra">
            <label>Empresa<select id="va-empresa">${Object.entries(N.EMPRESAS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('')}</select></label>
            <label>Legajo<input type="number" id="va-legajo" min="1" step="1" style="width:90px"></label>
            <label>Desde<input type="date" id="va-desde"></label><label>Hasta<input type="date" id="va-hasta"></label>
            <label>Días (los escribís vos)<input type="text" id="va-dias" inputmode="decimal" style="width:70px"></label>
            <label>Código<input type="text" id="va-codigo" list="va-codigos" style="width:100px" autocomplete="off"></label><datalist id="va-codigos"><option value="VACJOR"><option value="VACM"></datalist>
            <label>Cantidad por día<input type="text" id="va-cant" inputmode="decimal" style="width:70px" placeholder="p. ej. 8"></label>
            <label>Observaciones<input type="text" id="va-obs" maxlength="200" size="24"></label><button type="button" class="btn" id="va-agregar">Cargar pedido</button></div>
            <p class="nota" style="margin-bottom:0">El pedido nace en «Pedido». Después se registra la aprobación del jefe y la de RRHH; al aprobar, se generan las novedades en Novedades. «Cantidad por día» es lo que lleva cada día de vacaciones en Delta (para ese código).</p></div></div>`
        : `<div class="card"><div class="card-h"><h3>Cargar o corregir el saldo de un año</h3></div><div class="card-b"><div class="barra">
            <label>Empresa<select id="vs-empresa">${Object.entries(N.EMPRESAS).map(([k, v]) => '<option value="' + k + '">' + esc(v) + '</option>').join('')}</select></label>
            <label>Legajo<input type="number" id="vs-legajo" min="1" step="1" style="width:90px"></label><label>Año<input type="number" id="vs-anio" value="${est.anio}" style="width:80px"></label>
            <label>Días que le corresponden<input type="text" id="vs-dias" inputmode="decimal" style="width:90px"></label><label>Nota<input type="text" id="vs-nota" maxlength="200" size="30"></label>
            <button type="button" class="btn" id="vs-guardar">Guardar saldo</button></div>
            <p class="nota" style="margin-bottom:0">Los días que le corresponden los escribe RRHH (la app no los calcula). Si ya hay un saldo de ese legajo y año, se reemplaza.</p></div></div>`;
    }
    async function accion(fn, ok) { try { await fn(); if (ok) msg(ok, 'ok'); } catch (e) { msg('No se pudo guardar: ' + e.message, 'mal'); } }
    $('va-form').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'va-agregar') accion(async () => {
        const p = V.normalizarPedido({ empresa: $('va-empresa').value, legajo: $('va-legajo').value, desde: $('va-desde').value, hasta: $('va-hasta').value, dias: $('va-dias').value, codigo: $('va-codigo').value, cantidad: $('va-cant').value, observaciones: $('va-obs').value });
        const errs = V.validarPedido(p); if (errs.length) { msg(errs.join(' '), 'mal'); return; }
        if (!est.nombres.has(p.legajo) && !window.confirm('El legajo ' + p.legajo + ' no figura en el padrón. ¿Cargarlo igual?')) return;
        const sup = est.pedidos.find(x => x.empresa === p.empresa && x.legajo === p.legajo && ['pedido', 'aprobado_jefe', 'aprobado'].includes(x.estado) && x.desde <= p.hasta && x.hasta >= p.desde);
        if (sup && !window.confirm('Ya hay un pedido de ese legajo (' + dmy(sup.desde) + ' al ' + dmy(sup.hasta) + ', ' + V.ESTADOS[sup.estado] + ') que se superpone. ¿Cargar igual?')) return;
        const { data, error } = await sb.from('rrhh_vac_pedidos').insert(p).select(); if (error) throw new Error(error.message);
        est.pedidos.push(data[0]); ['va-dias', 'va-obs'].forEach(i => { $(i).value = ''; }); pintar();
      }, 'Pedido cargado.');
      if (b.id === 'vs-guardar') accion(async () => {
        const s = V.normalizarSaldo({ empresa: $('vs-empresa').value, legajo: $('vs-legajo').value, anio: $('vs-anio').value, dias: $('vs-dias').value, nota: $('vs-nota').value });
        const errs = V.validarSaldo(s); if (errs.length) { msg(errs.join(' '), 'mal'); return; }
        const { data, error } = await sb.from('rrhh_vac_saldos').upsert({ ...s, actualizado_por: est.uid, actualizado_en: new Date().toISOString() }, { onConflict: 'empresa,legajo,anio' }).select(); if (error) throw new Error(error.message);
        est.saldos = est.saldos.filter(x => !(x.empresa === s.empresa && x.legajo === s.legajo && x.anio === s.anio)).concat(data); est.anio = s.anio; pintar();
      }, 'Saldo guardado.');
    });

    /* ---------------- tablas ---------------- */
    function botones(f) {
      if (!puedeEditar) return '';
      const b = (a, t) => '<button type="button" class="btn-mini" data-a="' + a + '" data-id="' + esc(f.id) + '">' + t + '</button> ';
      let h = '';
      if (V.puedePasar(f, 'aprobado_jefe')) h += b('jefe', 'Aprobó el jefe');
      if (V.puedePasar(f, 'aprobado') && f.estado === 'aprobado_jefe') h += b('rrhh', 'Aprobar (RRHH)');
      if (f.estado === 'aprobado' && !f.novedades_generadas_en) h += b('gen', 'Generar novedades');
      if (V.puedePasar(f, 'rechazado')) h += b('rech', 'Rechazar');
      if (V.puedePasar(f, 'cancelado')) h += b('canc', 'Cancelar');
      if (f.estado === 'pedido') h += b('borrar', 'Borrar');
      return h;
    }
    function pintar() {
      document.querySelectorAll('[data-tab]').forEach(b => { b.className = 'btn' + (b.dataset.tab === est.vista ? '' : ' sec'); });
      pintarForm(); $('va-panel').innerHTML = '';
      if (est.vista === 'pedidos') {
        const cols = [
          { k: 'desde', titulo: 'Desde', cls: 'izq', sticky: true, min: 90, texto: f => dmy(f.desde), valor: f => f.desde }, { k: 'hasta', titulo: 'Hasta', cls: 'izq', min: 90, texto: f => dmy(f.hasta), valor: f => f.hasta },
          { k: 'empresa', titulo: 'Empresa', cls: 'izq', min: 80, texto: f => (f.empresa === '4H_OC' ? '4H OC' : f.empresa) },
          { k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', min: 60, texto: f => String(f.legajo) }, { k: 'persona', titulo: 'Persona', cls: 'izq', min: 190, texto: f => nombre(f.legajo) },
          { k: 'dias', titulo: 'Días', tipo: 'n', texto: f => dec(f.dias), valor: f => Number(f.dias) }, { k: 'codigo', titulo: 'Código', cls: 'izq', min: 90 },
          { k: 'estado', titulo: 'Estado', cls: 'izq', min: 150, texto: f => V.ESTADOS[f.estado] || f.estado },
          { k: 'jefe', titulo: 'Aprobó el jefe', cls: 'izq', min: 130, texto: f => (f.jefe_nombre ? f.jefe_nombre + (f.jefe_fecha ? ' · ' + dmy(f.jefe_fecha) : '') : '') },
          { k: 'nov', titulo: 'Novedades', cls: 'izq', min: 110, texto: f => (f.novedades_generadas_en ? 'Generadas ' + dmy(f.novedades_generadas_en) : f.estado === 'aprobado' ? 'Falta generar' : '') },
          { k: 'obs', titulo: 'Observaciones', cls: 'izq', min: 180, texto: f => [f.observaciones, f.motivo_rechazo ? 'Rechazo: ' + f.motivo_rechazo : ''].filter(Boolean).join(' · ') },
          { k: 'acc', titulo: '', cls: 'izq', min: 380, anchoMin: 380, texto: () => '', html: botones }];
        est.cols = cols; est.grid = Tabla.crear({ el: $('va-tabla'), id: 'vacaciones-pedidos-v1', columnas: cols, esc, filaAttrs: f => (f.estado === 'aprobado' && !f.novedades_generadas_en ? 'style="background:#fbf6e6"' : ''),
          pie: rows => ['', '', '', '', 'TOTAL · ' + rows.length + ' pedidos', dec(rows.reduce((s, f) => s + Number(f.dias), 0)), '', '', '', '', '', ''] });
        est.grid.render(est.pedidos);
      } else {
        const res = V.resumen(est.saldos, est.pedidos, est.novVac).map(r => ({ ...r, persona: nombre(r.legajo) }));
        const cols = [
          { k: 'anio', titulo: 'Año', tipo: 'n', cls: 'izq', min: 60, texto: f => String(f.anio) }, { k: 'empresa', titulo: 'Empresa', cls: 'izq', min: 80, texto: f => (f.empresa === '4H_OC' ? '4H OC' : f.empresa) }, { k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', sticky: true, min: 60, texto: f => String(f.legajo) },
          { k: 'persona', titulo: 'Persona', cls: 'izq', min: 190 },
          { k: 'dias', titulo: 'Corresponden', tipo: 'n', texto: f => dec(f.dias), valor: f => (f.dias == null ? '' : f.dias) }, { k: 'aprobados', titulo: 'Aprobados', tipo: 'n', texto: f => dec(f.aprobados), valor: f => f.aprobados },
          { k: 'pendientes', titulo: 'Sin decidir', tipo: 'n', texto: f => dec(f.pendientes), valor: f => f.pendientes },
          { k: 'restante', titulo: 'Restan', tipo: 'n', texto: f => dec(f.restante), valor: f => (f.restante == null ? '' : f.restante) },
          { k: 'conPendientes', titulo: 'Restarían si\napruebo todo', tipo: 'n', texto: f => dec(f.conPendientes), valor: f => (f.conPendientes == null ? '' : f.conPendientes) },
          { k: 'control', titulo: 'Control de integridad', cls: 'izq', min: 280, texto: f => f.control.join(' · ') || 'OK' }, { k: 'nota', titulo: 'Nota', cls: 'izq', min: 160 }];
        est.cols = cols; est.grid = Tabla.crear({ el: $('va-tabla'), id: 'vacaciones-saldos-v1', columnas: cols, esc, filaAttrs: f => (f.control.length ? 'style="background:#fbf6e6"' : ''),
          pie: rows => ['', '', '', 'TOTAL · ' + rows.length + ' filas', dec(rows.reduce((s, f) => s + (f.dias || 0), 0)), dec(rows.reduce((s, f) => s + f.aprobados, 0)), dec(rows.reduce((s, f) => s + f.pendientes, 0)), '', '', '', ''] });
        est.grid.render(res);
      }
    }
    document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { est.vista = b.dataset.tab; msg(''); pintar(); }));

    /* ---------------- acciones sobre un pedido ---------------- */
    async function pasar(p, estado, extra) {
      const upd = { estado, decidido_por: est.uid, decidido_en: new Date().toISOString(), ...(extra || {}) };
      const { data, error } = await sb.from('rrhh_vac_pedidos').update(upd).eq('id', p.id).select(); if (error) throw new Error(error.message);
      const i = est.pedidos.findIndex(x => x.id === p.id); if (i >= 0 && data[0]) est.pedidos[i] = data[0];
    }
    $('va-tabla').addEventListener('click', ev => {
      const b = ev.target.closest('button[data-a]'); if (!b) return;
      const p = est.pedidos.find(x => x.id === b.dataset.id); if (!p) return;
      accion(async () => {
        const a = b.dataset.a;
        if (a === 'jefe') { const j = window.prompt('¿Quién aprobó por el jefe? (nombre, obligatorio)'); if (!j || !j.trim()) return; await pasar(p, 'aprobado_jefe', { jefe_nombre: j.trim().slice(0, 100), jefe_fecha: hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1) + '-' + pad(hoy.getDate()) }); }
        else if (a === 'rrhh') { if (!window.confirm('¿Aprobar el pedido de ' + nombre(p.legajo) + ' (' + dmy(p.desde) + ' al ' + dmy(p.hasta) + ', ' + dec(p.dias) + ' días)?')) return; await pasar(p, 'aprobado'); }
        else if (a === 'rech') { const m = window.prompt('Motivo del rechazo (obligatorio):'); if (!m || !m.trim()) return; await pasar(p, 'rechazado', { motivo_rechazo: m.trim().slice(0, 200) }); }
        else if (a === 'canc') { if (!window.confirm('¿Cancelar este pedido?')) return; await pasar(p, 'cancelado'); }
        else if (a === 'borrar') { if (!window.confirm('¿Borrar este pedido?')) return; const { error } = await sb.from('rrhh_vac_pedidos').delete().eq('id', p.id); if (error) throw new Error(error.message); est.pedidos = est.pedidos.filter(x => x.id !== p.id); }
        else if (a === 'gen') { abrirGenerar(p); return; }
        pintar();
      });
    });

    /* ---------------- generar las novedades de un pedido aprobado ---------------- */
    const DIAS3 = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
    function abrirGenerar(p) {
      const sug = new Set(V.sugerirFechas(p.desde, p.hasta, est.feriados)), todas = V.rango(p.desde, p.hasta);
      est.gen = p.id;
      $('va-panel').innerHTML = `<div class="card" style="max-width:none;margin-top:14px"><div class="card-h"><h3>Generar novedades · ${esc(nombre(p.legajo))} · legajo ${p.legajo}</h3></div><div class="card-b">
        <p class="nota" style="margin-top:0">Se genera una novedad <b>${esc(p.codigo)}</b> de <b>${dec(p.cantidad)}</b> por cada día elegido. Los días tildados son una <b>sugerencia</b> (lunes a viernes sin feriados cargados): corregilos para que coincidan con lo que Tango/Delta toma como día de vacaciones.</p>
        <div class="barra" style="flex-wrap:wrap">${todas.map(f => `<label style="min-width:96px"><input type="checkbox" data-f="${f}" ${sug.has(f) ? 'checked' : ''}> ${DIAS3[new Date(f + 'T12:00:00Z').getUTCDay()]} ${dmy(f).slice(0, 5)}${est.feriados.has(f) ? ' (feriado)' : ''}</label>`).join('')}</div>
        <div class="est" id="va-cuenta" style="margin:8px 0"></div>
        <button type="button" class="btn" id="va-generar">Generar novedades</button> <button type="button" class="btn sec" id="va-gcerrar">Cerrar</button></div></div>`;
      const cuenta = () => { const n = $('va-panel').querySelectorAll('input[data-f]:checked').length; const ok = n === Number(p.dias); $('va-cuenta').className = 'est ' + (ok ? 'ok' : 'av'); $('va-cuenta').textContent = n + ' días elegidos · el pedido dice ' + dec(p.dias) + (ok ? '' : ' → no coinciden: revisá antes de generar'); };
      $('va-panel').addEventListener('change', cuenta); cuenta();
      $('va-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    $('va-panel').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.id === 'va-gcerrar') { est.gen = null; $('va-panel').innerHTML = ''; return; }
      if (b.id !== 'va-generar') return;
      const p = est.pedidos.find(x => x.id === est.gen); if (!p) return;
      accion(async () => {
        const fechas = [...$('va-panel').querySelectorAll('input[data-f]:checked')].map(i => i.dataset.f);
        const r = V.novedadesDePedido(p, fechas); if (r.errores.length) { msg(r.errores.join(' '), 'mal'); return; }
        if (r.novedades.length !== Number(p.dias) && !window.confirm('Elegiste ' + r.novedades.length + ' días y el pedido dice ' + dec(p.dias) + '. ¿Generar igual? El control de integridad lo va a marcar.')) return;
        if (r.novedades.some(n => N.validar(N.normalizar(n)).length)) { msg('Alguna novedad no es válida: revisá código y cantidad del pedido.', 'mal'); return; }
        b.disabled = true;
        const ins = await sb.from('rrhh_novedades_carga').insert(r.novedades).select('id,vac_pedido'); if (ins.error) throw new Error(ins.error.message);
        est.novVac.push(...ins.data);
        try { await pasar(p, 'aprobado', { novedades_generadas_en: new Date().toISOString(), decidido_por: p.decidido_por || est.uid }); }
        catch (e) { msg('Se generaron las novedades pero no pude marcar el pedido: ' + e.message + '. No generes de nuevo: revisá en Novedades.', 'mal'); await cargar(); return; }
        est.gen = null; pintar(); msg('Se generaron ' + r.novedades.length + ' novedades pendientes de exportar (pantalla Novedades).', 'ok');
      });
    });

    $('va-xlsx').addEventListener('click', () => {
      if (!est.grid || !est.cols) return;
      const L = Tabla._logica, cols = est.cols.filter(c => c.titulo);
      const aoa = [cols.map(c => L.tituloPlano(c.titulo))].concat(est.grid.filtradas().map(f => cols.map(c => L.textoDe(c, f))));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), est.vista === 'pedidos' ? 'Pedidos' : 'Saldos'); XLSX.writeFile(wb, est.vista === 'pedidos' ? 'vacaciones_pedidos.xlsx' : 'vacaciones_saldos.xlsx');
    });
    await cargar();
  }
  const api = { montar };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.RRHHVistaVacaciones = api;
})(typeof self !== 'undefined' ? self : this);
