/* ==========================================================================
   RRHH · pantalla «Fichadas»: carga del .txt de Tango Fichadas, parte diario por persona y día, correcciones de RRHH y archivo depurado para Delta.
   Se monta con RRHHVistaFichadas.montar({ sb, $main, esc, PERM, XLSX, Fichadas, Tabla, titulo }).
   El .txt se lee en el navegador; se guardan en la base las fichadas (legajo, fecha, hora), las correcciones con motivo y usuario, y la revisión de cada día.
   Ver y corregir: sección «liquidación». Necesita correr sql/rrhh_06_fichadas.sql y cargar horarios, legajos y feriados (semilla aparte).
   ========================================================================== */
(function (root) {
  'use strict';

  const MARCAS = { ausente: 'Ausente', fichada_unica: 'Una sola fichada', tarde: 'Llegó tarde', salida_temprana: 'Salió temprano', extra: 'Horas extra', fin_de_semana: 'Fin de semana',
    feriado: 'Feriado', revisar_feriado: 'Revisar feriado', mas_de_dos: 'Más de 2 fichadas', sin_horario: 'Sin horario', dia_sin_horario: 'Día sin horario' };
  const GRAVES = ['ausente', 'fichada_unica', 'mas_de_dos', 'sin_horario', 'revisar_feriado', 'tarde', 'salida_temprana', 'extra', 'fin_de_semana'];
  const horasTxt = min => (min ? (min / 60).toFixed(2).replace('.', ',') : '');
  const ORDEN = { rrhh_fichadas: ['fecha', 'legajo', 'hora'], rrhh_partes_dia: ['fecha', 'legajo'], rrhh_empleados: ['legajo'], rrhh_legajo_fichadas: ['legajo'], rrhh_horarios: ['codigo'], rrhh_feriados: ['fecha'] };
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
  const pad = n => String(n).padStart(2, '0');
  const finMes = (y, m) => new Date(y, m, 0).getDate();
  function rangoDe(mes, q) { const [y, m] = mes.split('-').map(Number); return q === '1' ? [mes + '-01', mes + '-15'] : q === '2' ? [mes + '-16', mes + '-' + pad(finMes(y, m))] : [mes + '-01', mes + '-' + pad(finMes(y, m))]; }

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Fichadas: F, Tabla, titulo } = ctx;
    titulo('Fichadas', 'Fichadas de Tango Fichadas: parte diario, correcciones de RRHH y archivo depurado para Delta');
    if (!PERM.ver.has('liquidacion')) { $main.innerHTML = '<div class="empty">Para ver las fichadas hace falta permiso de <b>Ver</b> en «Liquidación». Pedíselo a dirección en el portal.</div>'; return; }
    const puedeEditar = PERM.editar.has('liquidacion');
    const hoy = new Date(), mesHoy = hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1);
    const est = { mes: mesHoy, q: hoy.getDate() <= 15 ? '1' : '2', fichadas: [], legajos: new Map(), horarios: new Map(), feriados: new Set(), nombres: new Map(), dias: new Map(), partes: [], filtro: 'todos', abierto: null, lectura: null, uid: null, grid: null };

    $main.innerHTML = `
      <div class="card" id="fi-carga">
        <div class="card-h"><h3>Cargar fichadas</h3></div>
        <div class="card-b">
          <p class="nota" style="margin-top:0">Elegí el <b>.txt</b> que genera Tango Fichadas (se pueden elegir varios). Se lee en tu navegador y se guardan las fichadas; las que ya estaban se ignoran.</p>
          ${puedeEditar ? '<input type="file" id="fi-archivo" accept=".txt" multiple> <button class="btn" id="fi-guardar" type="button" disabled>Guardar fichadas</button>' : '<div class="est av">Tu usuario puede ver las fichadas pero no cargarlas.</div>'}
          <div class="est" id="fi-estado" style="margin-top:8px"></div>
        </div>
      </div>
      <div class="barra">
        <label>Mes<input type="month" id="fi-mes" value="${est.mes}"></label>
        <label>Período<select id="fi-q"><option value="1">1ª quincena (1 al 15)</option><option value="2">2ª quincena (16 al fin)</option><option value="m">Mes completo</option></select></label>
        <label>Mostrar<select id="fi-filtro"><option value="todos">Todos los días</option><option value="anormal">Solo con anormalidades</option><option value="pendiente">Pendientes de revisión</option></select></label>
        <span class="sp"></span>
        <button type="button" class="btn sec" id="fi-xlsx">Exportar a Excel</button>
        <button type="button" class="btn" id="fi-txt">Descargar .txt depurado</button>
      </div>
      <div id="fi-resumen"></div>
      <div id="fi-tabla"><div class="empty">Cargando…</div></div>
      <div id="fi-panel"></div>
      <p class="nota" id="fi-nota"></p>`;
    const $ = id => document.getElementById(id);
    $('fi-q').value = est.q;
    const estado = (t, cls) => { $('fi-estado').className = 'est ' + (cls || ''); $('fi-estado').textContent = t; };

    /* ---------------- datos ---------------- */
    const rango = () => rangoDe($('fi-mes').value || mesHoy, $('fi-q').value);
    async function cargar() {
      $('fi-tabla').innerHTML = '<div class="empty">Cargando…</div>';
      const [desde, hasta] = rango();
      try {
        if (!est.uid && sb.auth && sb.auth.getUser) { const u = await sb.auth.getUser(); est.uid = u && u.data && u.data.user ? u.data.user.id : null; }
        const [hor, leg, fer, emp, fich, dias] = await Promise.all([
          traerTodo(sb, 'rrhh_horarios', '*'), traerTodo(sb, 'rrhh_legajo_fichadas', '*'), traerTodo(sb, 'rrhh_feriados', '*'), traerTodo(sb, 'rrhh_empleados', 'legajo,nombre'),
          traerTodo(sb, 'rrhh_fichadas', '*', q => q.gte('fecha', desde).lte('fecha', hasta)), traerTodo(sb, 'rrhh_partes_dia', '*', q => q.gte('fecha', desde).lte('fecha', hasta))]);
        est.horarios = new Map(hor.map(h => [h.codigo, h.definicion]));
        est.legajos = new Map(leg.map(l => [l.legajo, { horario: l.horario, unidad: l.unidad, habilitado: l.habilitado }]));
        est.feriados = new Set(fer.map(f => f.fecha));
        est.nombres = new Map(emp.map(e => [e.legajo, e.nombre]));
        est.fichadas = fich; est.dias = new Map(dias.map(d => [d.legajo + '|' + d.fecha, d]));
      } catch (e) { $('fi-tabla').innerHTML = '<div class="empty">No pude cargar los datos: ' + esc(e.message) + '. Si dice que una tabla no existe, falta correr <code>rrhh_06_fichadas.sql</code>.</div>'; return; }
      recalcular();
    }
    function recalcular() {
      const [desde, hasta] = rango();
      const efectivas = est.fichadas.filter(f => !f.anulada);
      const legajos = new Map(est.legajos);
      for (const f of efectivas) if (!legajos.has(f.legajo)) legajos.set(f.legajo, { horario: null, unidad: 30, habilitado: true });   // con fichadas pero sin configurar: se ve como «sin horario»
      est.partes = F.armarPartes({ fichadas: efectivas, legajos, horarios: est.horarios, feriados: est.feriados, desde, hasta }).map(p => {
        const rev = est.dias.get(p.legajo + '|' + p.fecha);
        return { ...p, persona: est.nombres.get(p.legajo) || '(sin padrón)', id: p.legajo + '|' + p.fecha, revisado: !!(rev && rev.estado === 'revisado'), aprob50: rev ? rev.extra50_aprobada_min : null, aprob100: rev ? rev.extra100_aprobada_min : null,
          graves: p.marcas.filter(m => GRAVES.includes(m)) };
      });
      pintar();
    }

    /* ---------------- tabla ---------------- */
    function filas() {
      return est.partes.filter(p => est.filtro === 'todos' || (est.filtro === 'anormal' ? p.graves.length : !p.revisado));
    }
    function pintar() {
      const todas = est.partes, anorm = todas.filter(p => p.graves.length), pend = todas.filter(p => !p.revisado);
      $('fi-resumen').innerHTML = '<div class="est ' + (anorm.length ? 'av' : 'ok') + '" style="margin-bottom:10px">' + todas.length + ' partes · <b>' + anorm.length + '</b> con anormalidades · <b>' + pend.length + '</b> pendientes de revisión · '
        + todas.filter(p => p.marcas.includes('ausente')).length + ' ausentes · ' + todas.filter(p => p.marcas.includes('fichada_unica')).length + ' con una sola fichada</div>';
      const num = k => ({ k, tipo: 'n', texto: f => horasTxt((f.pagado || {})[k]), valor: f => (f.pagado || {})[k] || 0 });
      const cols = [
        { k: 'fecha', titulo: 'Fecha', cls: 'izq', sticky: true, min: 90, texto: f => f.fecha.split('-').reverse().join('/') }, { k: 'dia', titulo: 'Día', cls: 'izq', min: 50 },
        { k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', min: 60, texto: f => String(f.legajo) }, { k: 'persona', titulo: 'Persona', cls: 'izq', min: 190 },
        { k: 'horario', titulo: 'Horario', cls: 'izq', texto: f => f.horario || '— sin horario —' },
        { k: 'horas', titulo: 'Fichadas', cls: 'izq', min: 140, texto: f => (f.horas || []).join(' · '), valor: f => (f.horas || []).join(' ') },
        Object.assign(num('NORMAL 1'), { titulo: 'Normal (h)' }), Object.assign(num('EXTRA 50%'), { titulo: 'Extra 50 % (h)' }), Object.assign(num('EXTRA 100%'), { titulo: 'Extra 100 % (h)' }),
        { k: 'sinHoraMin', titulo: 'Fuera de horario (min)', tipo: 'n', texto: f => (f.sinHoraMin ? String(f.sinHoraMin) : '') },
        { k: 'aprob', titulo: 'Extra aprobada (h)', cls: 'izq', texto: f => (f.aprob50 == null && f.aprob100 == null ? '' : [f.aprob50 ? horasTxt(f.aprob50) + ' al 50 %' : '', f.aprob100 ? horasTxt(f.aprob100) + ' al 100 %' : ''].filter(Boolean).join(' + ') || '0') },
        { k: 'anorm', titulo: 'Anormalidades', cls: 'izq', min: 230, texto: f => f.marcas.map(m => MARCAS[m] || m).join(' · '), valor: f => f.marcas.join(' ') },
        { k: 'estado', titulo: 'Estado', cls: 'izq', texto: f => (f.revisado ? 'Revisado' : 'Pendiente') }];
      est.columnas = cols;
      est.grid = Tabla.crear({ el: $('fi-tabla'), id: 'fichadas-partes', columnas: cols, esc, filaAttrs: f => 'data-pk="' + esc(f.id) + '" style="cursor:pointer' + (f.graves.length && !f.revisado ? ';background:#fbf6e6' : '') + '"',
        pie: rows => ['TOTAL · ' + rows.length + ' partes', '', '', '', '', '', horasTxt(rows.reduce((s, f) => s + (f.pagado['NORMAL 1'] || 0), 0)), horasTxt(rows.reduce((s, f) => s + (f.pagado['EXTRA 50%'] || 0), 0)), horasTxt(rows.reduce((s, f) => s + (f.pagado['EXTRA 100%'] || 0), 0)), '', '', '', ''] });
      est.grid.render(filas());
      $('fi-nota').textContent = 'Tocá una fila para ver y corregir ese día. Las filas amarillas tienen anormalidades sin revisar. Las horas son las que calcula la app con el horario de cada legajo; las extras no valen hasta que RRHH las aprueba.';
      if (est.abierto) abrir(est.abierto);
    }

    /* ---------------- panel de corrección ---------------- */
    function abrir(id) {
      est.abierto = id; const p = est.partes.find(x => x.id === id); if (!p) { $('fi-panel').innerHTML = ''; return; }
      const dia = est.fichadas.filter(f => f.legajo === p.legajo && f.fecha === p.fecha).sort((a, b) => a.hora.localeCompare(b.hora));
      const a50 = p.aprob50 != null ? p.aprob50 : (p.pagado['EXTRA 50%'] || 0), a100 = p.aprob100 != null ? p.aprob100 : (p.pagado['EXTRA 100%'] || 0);
      const ed = puedeEditar ? '' : ' disabled';
      $('fi-panel').innerHTML = `<div class="card" style="max-width:none;margin-top:14px"><div class="card-h"><h3>${esc(p.persona)} · legajo ${p.legajo} · ${esc(p.fecha.split('-').reverse().join('/'))} (${esc(p.dia)})</h3><button type="button" class="btn sec" id="fp-cerrar">Cerrar</button></div><div class="card-b">
        <p class="nota" style="margin-top:0">Horario <b>${esc(p.horario || 'sin horario')}</b> · ${p.marcas.length ? esc(p.marcas.map(m => MARCAS[m] || m).join(' · ')) : 'sin anormalidades'}</p>
        <table class="tbl" style="width:auto"><thead><tr><th>Hora</th><th>Origen</th><th>Estado</th><th>Motivo</th><th></th></tr></thead><tbody>${dia.map(f => `<tr><td>${esc(f.hora)}</td><td>${f.origen === 'tango' ? 'Tango' : 'Agregada por RRHH'}</td><td>${f.anulada ? '<s>Anulada</s>' : 'Vigente'}</td><td>${esc(f.motivo || '')}</td><td>${puedeEditar ? (f.anulada ? '<button class="btn sec" type="button" data-acc="reactivar" data-id="' + esc(f.id) + '">Reactivar</button>' : '<button class="btn sec" type="button" data-acc="anular" data-id="' + esc(f.id) + '">Anular</button>') : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin fichadas</td></tr>'}</tbody></table>
        ${puedeEditar ? `<div class="barra" style="margin-top:12px"><label>Agregar fichada (HH:MM)<input type="time" id="fp-hora"></label><label>Motivo (obligatorio)<input type="text" id="fp-motivo" size="34" placeholder="p. ej. Olvidó fichar la salida"></label><button type="button" class="btn" id="fp-agregar">Agregar</button></div>
        ${p.sugerencias.length ? '<div class="est av">Sugerencias: ' + p.sugerencias.map((s, i) => `<button type="button" class="btn sec" data-sug="${i}">${esc(s.accion === 'agregar' ? 'Agregar ' + s.hora : 'Cambiar ' + s.de + ' por ' + s.hora)} · ${esc(s.motivo)}</button>`).join(' ') + '</div>' : ''}` : ''}
        <div class="barra" style="margin-top:14px"><label>Extra 50 % aprobada (min)<input type="number" min="0" step="1" id="fp-a50" value="${a50}"${ed}></label><label>Extra 100 % aprobada (min)<input type="number" min="0" step="1" id="fp-a100" value="${a100}"${ed}></label>
          <label>Nota<input type="text" id="fp-nota" size="34" value="${esc((est.dias.get(p.id) || {}).nota || '')}"${ed}></label>${puedeEditar ? '<button type="button" class="btn" id="fp-revisar">Guardar y marcar revisado</button>' : ''}</div>
        <p class="nota">Calculado por la app: ${esc(Object.entries(p.pagado).map(([k, v]) => k + ' ' + horasTxt(v) + ' h').join(' · ') || 'nada para pagar')}. Las extras aprobadas se cargan en minutos (30 = media hora).</p></div></div>`;
      $('fi-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    async function guardarFichada(fila) {
      const { data, error } = await sb.from('rrhh_fichadas').upsert(fila, { onConflict: 'legajo,fecha,hora,origen' }).select();
      if (error) throw new Error(error.message);
      const f = data[0], i = est.fichadas.findIndex(x => x.id === f.id); if (i >= 0) est.fichadas[i] = f; else est.fichadas.push(f);
    }
    async function agregar(p, hora, motivo) {
      if (!hora) throw new Error('Indicá la hora.'); if (!motivo || !motivo.trim()) throw new Error('El motivo es obligatorio.');
      const reloj = (est.fichadas.find(f => f.reloj) || {}).reloj || 'NEXOF';
      await guardarFichada({ legajo: p.legajo, fecha: p.fecha, hora, codigo: F.codigoFichador(p.legajo), reloj, origen: 'manual', motivo: motivo.trim(), anulada: false });
    }
    async function cambiarAnulada(id, anulada, motivo) {
      const upd = anulada ? { anulada: true, motivo, anulada_por: est.uid, anulada_en: new Date().toISOString() } : { anulada: false, anulada_por: null, anulada_en: null };
      const { data, error } = await sb.from('rrhh_fichadas').update(upd).eq('id', id).select();
      if (error) throw new Error(error.message);
      const i = est.fichadas.findIndex(x => x.id === id); if (i >= 0 && data[0]) est.fichadas[i] = data[0];
    }
    $('fi-panel').addEventListener('click', async ev => {
      const b = ev.target.closest('button'); if (!b || !est.abierto) return;
      const p = est.partes.find(x => x.id === est.abierto);
      try {
        if (b.id === 'fp-cerrar') { est.abierto = null; $('fi-panel').innerHTML = ''; return; }
        if (b.id === 'fp-agregar') { await agregar(p, $('fp-hora').value, $('fp-motivo').value); }
        else if (b.dataset.sug != null) { const s = p.sugerencias[+b.dataset.sug];
          if (s.accion === 'reemplazar') { const o = est.fichadas.find(f => f.legajo === p.legajo && f.fecha === p.fecha && f.hora === s.de && !f.anulada); if (o) await cambiarAnulada(o.id, true, s.motivo); }
          await agregar(p, s.hora, s.motivo); }
        else if (b.dataset.acc === 'anular') { const m = window.prompt('Motivo para anular esta fichada (obligatorio):'); if (!m || !m.trim()) return; await cambiarAnulada(b.dataset.id, true, m.trim()); }
        else if (b.dataset.acc === 'reactivar') await cambiarAnulada(b.dataset.id, false);
        else if (b.id === 'fp-revisar') {
          const fila = { legajo: p.legajo, fecha: p.fecha, estado: 'revisado', extra50_aprobada_min: Math.max(0, parseInt($('fp-a50').value, 10) || 0), extra100_aprobada_min: Math.max(0, parseInt($('fp-a100').value, 10) || 0), nota: $('fp-nota').value.trim() || null, revisado_por: est.uid, revisado_en: new Date().toISOString() };
          const { data, error } = await sb.from('rrhh_partes_dia').upsert(fila, { onConflict: 'legajo,fecha' }).select(); if (error) throw new Error(error.message);
          est.dias.set(p.id, data[0]); est.abierto = null; $('fi-panel').innerHTML = '';
        } else return;
        recalcular();
      } catch (e) { alert('No se pudo guardar: ' + e.message); }
    });
    $('fi-tabla').addEventListener('click', ev => { const tr = ev.target.closest('tr[data-pk]'); if (tr && !ev.target.closest('.th-t,.th-f,.minib')) abrir(tr.dataset.pk); });

    /* ---------------- carga del .txt ---------------- */
    const fa = $('fi-archivo');
    if (fa) {
      fa.addEventListener('change', async () => {
        est.lectura = null; $('fi-guardar').disabled = true;
        const todas = [], errores = [];
        for (const f of fa.files) { const r = F.leerTxt(await f.text()); r.fichadas.forEach(x => todas.push({ ...x, lote: f.name })); r.errores.forEach(e => errores.push(f.name + ' línea ' + e.linea)); }
        if (!todas.length) { estado('No encontré fichadas válidas' + (errores.length ? ' (' + errores.length + ' líneas con error)' : '') + '.', 'mal'); return; }
        const fs = todas.map(x => x.fecha).sort(), legs = new Set(todas.map(x => x.legajo));
        est.lectura = todas; $('fi-guardar').disabled = false;
        estado('Leí ' + todas.length + ' fichadas de ' + legs.size + ' personas, del ' + fs[0].split('-').reverse().join('/') + ' al ' + fs[fs.length - 1].split('-').reverse().join('/') + (errores.length ? ' · ' + errores.length + ' líneas con error (se ignoran)' : '') + '. Apretá «Guardar fichadas».', errores.length ? 'av' : 'ok');
      });
      $('fi-guardar').addEventListener('click', async () => {
        if (!est.lectura) return; $('fi-guardar').disabled = true; estado('Guardando…');
        try {
          let nuevas = 0;
          for (let i = 0; i < est.lectura.length; i += 500) {
            const lote = est.lectura.slice(i, i + 500).map(x => ({ legajo: x.legajo, fecha: x.fecha, hora: x.hora, codigo: x.codigo, reloj: x.reloj || 'NEXOF', origen: 'tango', lote: x.lote }));
            const { data, error } = await sb.from('rrhh_fichadas').upsert(lote, { onConflict: 'legajo,fecha,hora,origen', ignoreDuplicates: true }).select('id');
            if (error) throw new Error(error.message); nuevas += (data || []).length;
          }
          estado('Listo: ' + nuevas + ' fichadas nuevas guardadas, ' + (est.lectura.length - nuevas) + ' ya estaban.', 'ok');
          const fs = est.lectura.map(x => x.fecha).sort(); est.lectura = null; fa.value = '';
          $('fi-mes').value = fs[fs.length - 1].slice(0, 7); $('fi-q').value = Number(fs[fs.length - 1].slice(8, 10)) <= 15 ? '1' : '2'; cargar();
        } catch (e) { estado('No pude guardar: ' + e.message, 'mal'); $('fi-guardar').disabled = false; }
      });
    }

    /* ---------------- exportar ---------------- */
    function descargar(nombre, contenido, tipo) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: tipo })); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    $('fi-txt').addEventListener('click', () => {
      const ef = est.fichadas.filter(f => !f.anulada).map(f => ({ fecha: f.fecha, hora: f.hora, codigo: f.codigo, reloj: f.reloj }));
      if (!ef.length) { alert('No hay fichadas en este período.'); return; }
      const pend = est.partes.filter(p => p.graves.length && !p.revisado).length;
      if (pend && !window.confirm('Hay ' + pend + ' partes con anormalidades sin revisar. ¿Descargar igual?')) return;
      const [d, h] = rango(); descargar('fichadas_depuradas_' + d.replace(/-/g, '') + '_' + h.replace(/-/g, '') + '.txt', F.armarTxt(ef), 'text/plain;charset=utf-8');
    });
    $('fi-xlsx').addEventListener('click', () => {
      if (!est.grid) return; const fl = est.grid.filtradas(), cols = est.columnas;
      const aoa = [cols.map(c => c.titulo), ...fl.map(f => cols.map(c => { const v = c.texto ? c.texto(f) : f[c.k]; return v == null ? '' : v; }))];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Partes'); XLSX.writeFile(wb, 'partes_diarios.xlsx');
    });
    ['fi-mes', 'fi-q'].forEach(id => $(id).addEventListener('change', () => { est.abierto = null; $('fi-panel').innerHTML = ''; cargar(); }));
    $('fi-filtro').addEventListener('change', ev => { est.filtro = ev.target.value; if (est.grid) est.grid.render(filas()); });
    cargar();
  }

  root.RRHHVistaFichadas = { montar };
})(typeof self !== 'undefined' ? self : this);
