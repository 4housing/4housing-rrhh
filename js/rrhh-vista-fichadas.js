/* ==========================================================================
   RRHH · pantalla «Fichadas»: carga del .txt de Tango Fichadas, parte diario por persona y día, resumen del período, correcciones de RRHH y archivo depurado para Delta.
   Se monta con RRHHVistaFichadas.montar({ sb, $main, esc, PERM, XLSX, Fichadas, Tabla, titulo }).
   El .txt (y el archivo de novedades, que solo sirve para reconocer ausencias ya justificadas) se leen en el navegador: del .txt se guardan las fichadas (legajo, fecha, hora),
   las correcciones con motivo y usuario y la revisión de cada día; las novedades NO se guardan.
   Ver y corregir: sección «liquidación». Necesita sql/rrhh_06_fichadas.sql y la semilla de horarios, legajos y feriados.
   ========================================================================== */
(function (root) {
  'use strict';

  const MARCAS = { ausente: 'Ausente', fichada_unica: 'Una sola fichada', tarde: 'Llegó tarde', salida_temprana: 'Salió temprano', extra: 'Horas extra', fin_de_semana: 'Fin de semana',
    feriado: 'Feriado', revisar_feriado: 'Revisar feriado', mas_de_dos: 'Más de 2 fichadas', sin_horario: 'Sin horario', dia_sin_horario: 'Día sin horario' };
  const ESTADO = { ok: 'Sin novedades', extra: 'Extra por aprobar', revisar: 'Por revisar', revisado: 'Revisado' };
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
  const fechaIso = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());

  async function montar(ctx) {
    const { sb, $main, esc, PERM, XLSX, Fichadas: F, Tabla, titulo } = ctx;
    titulo('Fichadas', 'Fichadas de Tango Fichadas: parte diario, resumen de la quincena, correcciones de RRHH y archivo depurado para Delta');
    if (!PERM.ver.has('liquidacion')) { $main.innerHTML = '<div class="empty">Para ver las fichadas hace falta permiso de <b>Ver</b> en «Liquidación». Pedíselo a dirección en el portal.</div>'; return; }
    const puedeEditar = PERM.editar.has('liquidacion');
    const hoy = new Date(), mesHoy = hoy.getFullYear() + '-' + pad(hoy.getMonth() + 1);
    const est = { mes: mesHoy, q: hoy.getDate() <= 15 ? '1' : '2', fichadas: [], legajos: new Map(), horarios: new Map(), feriados: new Set(), nombres: new Map(), perfiles: new Map(), dias: new Map(), just: new Map(),
      partes: [], filtro: 'decision', vista: 'partes', limExtras: (() => { try { return Number(localStorage.getItem('rrhh-fichadas-extras-altas')) || 30; } catch (e) { return 30; } })(), abierto: null, lectura: null, uid: null, grid: null, gridRes: null, resumen: [] };

    $main.innerHTML = `
      <div class="card" id="fi-carga">
        <div class="card-h"><h3>Cargar fichadas</h3></div>
        <div class="card-b">
          <p class="nota" style="margin-top:0">Elegí el <b>.txt</b> que genera Tango Fichadas (se pueden elegir varios). Se lee en tu navegador y se guardan las fichadas; las que ya estaban se ignoran.</p>
          ${puedeEditar ? '<input type="file" id="fi-archivo" accept=".txt" multiple> <button class="btn" id="fi-guardar" type="button" disabled>Guardar fichadas</button>' : '<div class="est av">Tu usuario puede ver las fichadas pero no cargarlas.</div>'}
          <div class="est" id="fi-estado" style="margin-top:8px"></div>
          <p class="nota" style="margin:12px 0 4px"><b>Opcional:</b> el archivo de <b>Novedades registradas</b> (el de Delta). Sirve para reconocer las ausencias que ya están justificadas (enfermedad, ART, vacaciones…) y no marcarlas. No se guarda.</p>
          <input type="file" id="fi-novedades" accept=".xlsx,.xls"> <span class="est" id="fi-est-nov"></span>
        </div>
      </div>
      <div class="barra">
        <label>Mes<input type="month" id="fi-mes" value="${est.mes}"></label>
        <label>Período<select id="fi-q"><option value="1">1ª quincena (1 al 15)</option><option value="2">2ª quincena (16 al fin)</option><option value="m">Mes completo</option></select></label>
        <label id="fi-lbl-filtro">Mostrar<select id="fi-filtro"><option value="decision">Solo lo que necesita mi decisión</option><option value="revisar">Por revisar</option><option value="extra">Extras por aprobar</option><option value="todos">Todos los días</option><option value="revisados">Ya revisados</option></select></label>
        <span class="sp"></span>
        <button type="button" class="btn sec" id="fi-log" title="Todos los cambios del período: qué había antes, qué quedó, motivo, quién y cuándo">Registro de cambios (Excel)</button>
        <button type="button" class="btn sec" id="fi-xlsx">Exportar a Excel</button>
        <button type="button" class="btn" id="fi-txt">Descargar .txt depurado</button>
      </div>
      <div class="barra" id="fi-tabs"></div>
      <div id="fi-resumen"></div>
      <div id="fi-tabla"><div class="empty">Cargando…</div></div>
      <div id="fi-panel"></div>
      <p class="nota" id="fi-nota"></p>`;
    const $ = id => document.getElementById(id);
    // «Modificado»: marca amarilla; al acercar el cursor se ve qué había antes (recuadro flotante, para no ocupar lugar en la tabla)
    if (!$('fi-css')) { const st = document.createElement('style'); st.id = 'fi-css';
      st.textContent = '.mod{display:inline-block;background:#fff3c4;border:1px solid #e0c36a;color:#6b5200;border-radius:9px;padding:1px 8px;font-size:11.5px;font-weight:600;cursor:help}'
        + '.cal{border-collapse:separate;border-spacing:2px;font-size:12.5px}.cal th{font-weight:600;font-size:11.5px;color:#4b5340;padding:3px 2px;text-align:center;min-width:56px}.cal th.fin{background:#e7e5dc}.cal th.fer{background:#f0d9d3}'
        + '.cal td{text-align:center;vertical-align:middle;height:38px;min-width:56px;border-radius:5px;position:relative;line-height:1.15;padding:1px 3px}.cal td.nom{text-align:left;white-space:nowrap;background:transparent;font-weight:600;padding:0 8px 0 2px;position:sticky;left:0;max-width:210px;overflow:hidden;text-overflow:ellipsis;z-index:1;background:#f3f1e8}'
        + '.cal td.c-ok{background:#d9eed0}.cal td.c-vac{background:#c9e8f7}.cal td.c-justificada{background:#ffb066;font-weight:600}.cal td.c-injustificada{background:#ff8a73;font-weight:600}.cal td.c-unica{background:#fff0b3;font-weight:700}.cal td.c-fer{background:#e5e2d8;color:#6a6a5a}.cal td.fin.c-vacio{background:#ece9df}.cal td.c-vacio{background:transparent}'
        + '.cal td.pen{outline:2px solid #e0a800;outline-offset:-2px}.cal td.mod2::after{content:"";position:absolute;top:0;right:0;border-top:10px solid #d4a017;border-left:10px solid transparent}.cal td[data-pk]{cursor:pointer}'
        + '.cal .ex{display:block;font-size:9.5px;color:#1f5fa8;font-weight:600;line-height:1.1}.cal .me{display:block;font-size:9.5px;color:#c0392b;font-weight:600;line-height:1.1}.cal td.tot{background:transparent;font-weight:600;min-width:64px}'
        + '#fi-tip{position:fixed;display:none;z-index:9999;max-width:470px;white-space:pre-line;background:#2f3a22;color:#fff;padding:9px 12px;border-radius:9px;font-size:12px;line-height:1.5;box-shadow:0 6px 20px rgba(0,0,0,.25);pointer-events:none}';
      document.head.appendChild(st); }
    const viejo = document.getElementById('fi-tip'); if (viejo) viejo.remove();
    const tip = document.createElement('div'); tip.id = 'fi-tip'; document.body.appendChild(tip);
    const ubicar = ev => { const w = tip.offsetWidth, h = tip.offsetHeight; tip.style.left = Math.max(8, Math.min(ev.clientX + 14, window.innerWidth - w - 10)) + 'px'; tip.style.top = (ev.clientY + 18 + h > window.innerHeight ? Math.max(8, ev.clientY - h - 12) : ev.clientY + 18) + 'px'; };
    $main.addEventListener('mouseover', ev => { const m = ev.target.closest('.mod, .tipc'); if (!m) return; tip.textContent = m.dataset.tip || ''; tip.style.display = 'block'; ubicar(ev); });
    $main.addEventListener('mousemove', ev => { if (tip.style.display === 'block') ubicar(ev); });
    $main.addEventListener('mouseout', ev => { if (ev.target.closest && ev.target.closest('.mod, .tipc')) tip.style.display = 'none'; });
    const attr = t => esc(t).replace(/"/g, '&quot;');
    const cuando = iso => { const d = new Date(iso); return isNaN(d) ? '' : pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
    $('fi-q').value = est.q; $('fi-filtro').value = est.filtro;
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
        if (!est.perfiles.size) { try { const pf = await traerTodo(sb, 'perfiles', 'id,nombre,email'); est.perfiles = new Map(pf.map(x => [x.id, x.nombre || x.email || ''])); } catch (e) { /* sin acceso a perfiles: se muestra «RRHH» */ } }
      } catch (e) { $('fi-tabla').innerHTML = '<div class="empty">No pude cargar los datos: ' + esc(e.message) + '. Si dice que una tabla no existe, falta correr <code>rrhh_06_fichadas.sql</code>.</div>'; return; }
      recalcular();
    }
    function recalcular() {
      const [desde, hasta] = rango();
      const efectivas = est.fichadas.filter(f => !f.anulada);
      const legajos = new Map(est.legajos);
      for (const f of efectivas) if (!legajos.has(f.legajo)) legajos.set(f.legajo, { horario: null, unidad: 30, habilitado: true });   // con fichadas pero sin configurar: se ve como «sin horario»
      est.partes = F.armarPartes({ fichadas: efectivas, legajos, horarios: est.horarios, feriados: est.feriados, desde, hasta }).map(p => {
        const rev = est.dias.get(p.legajo + '|' + p.fecha), codigos = est.just.get(p.legajo + '|' + p.fecha), c = F.clasificar(p, codigos);
        const revisado = !!(rev && rev.estado === 'revisado');
        const dia = est.fichadas.filter(f => f.legajo === p.legajo && f.fecha === p.fecha);
        let cambios = { modificado: false, lineas: [] }, antesHoras = [];
        if (dia.some(f => f.origen === 'manual' || f.anulada) || (rev && (rev.extra50_aprobada_min != null || rev.extra100_aprobada_min != null))) {
          const cfg = legajos.get(p.legajo) || {};
          const antes = F.calcularDia({ fecha: p.fecha, horas: dia.filter(f => f.origen === 'tango').map(f => f.hora), horario: cfg.horario ? est.horarios.get(cfg.horario) : null, unidad: cfg.unidad || 30, feriado: est.feriados.has(p.fecha) });
          antesHoras = antes.horas;
          cambios = F.describirCambios({ fichadasDia: dia, antes, ahora: p, aprobacion: rev, quien: uid => est.perfiles.get(uid) || 'RRHH', cuando });
        }
        return { ...p, cambios, antesHoras, persona: est.nombres.get(p.legajo) || '(sin padrón)', id: p.legajo + '|' + p.fecha, revisado, aprob50: rev ? rev.extra50_aprobada_min : null, aprob100: rev ? rev.extra100_aprobada_min : null,
          codigos: codigos || [], clase: c.clase, justificacion: c.justificacion, estadoTxt: revisado ? ESTADO.revisado : ESTADO[c.clase] };
      });
      est.resumen = F.resumenPersonas(est.partes, { extrasAltasMin: est.limExtras * 60 }).map(r => ({ ...r, persona: est.nombres.get(r.legajo) || '(sin padrón)' }));
      pintar();
    }
    const pendientes = () => est.partes.filter(p => !p.revisado && p.clase !== 'ok');
    const OTRAS = ['ausente', 'fichada_unica', 'mas_de_dos', 'sin_horario', 'dia_sin_horario', 'salida_temprana', 'tarde'];
    const soloFeriado = () => pendientes().filter(p => p.marcas.includes('revisar_feriado') && !p.marcas.some(m => OTRAS.includes(m)));

    /* ---------------- vistas ---------------- */
    function filas() {
      const f = est.filtro;
      return est.partes.filter(p => f === 'todos' || (f === 'decision' ? !p.revisado && p.clase !== 'ok' : f === 'revisar' ? !p.revisado && p.clase === 'revisar' : f === 'extra' ? !p.revisado && p.clase === 'extra' : p.revisado));
    }
    function pintarTabs() {
      const pend = pendientes(), ex = pend.filter(p => p.clase === 'extra'), fer = soloFeriado();
      $('fi-tabs').innerHTML = [['partes', 'Partes por día'], ['calendario', 'Calendario'], ['resumen', 'Resumen del período']].map(([k, t]) => '<button type="button" class="btn' + (est.vista === k ? '' : ' sec') + '" data-v="' + k + '">' + t + '</button>').join('')
        + '<span class="sp"></span>' + (est.vista === 'resumen' ? '<label style="flex-direction:row;align-items:center;gap:6px">Extras llamativas desde (h) <input type="number" min="0" step="1" id="fi-lim" value="' + est.limExtras + '" style="width:70px"></label>' : '')
        + (puedeEditar && fer.length ? '<button type="button" class="btn sec" id="fi-bulk-fer" title="Los marca como vistos; no aprueba horas">Marcar como revisados los feriados trabajados (' + fer.length + ' días)</button>' : '') + (puedeEditar ? '<button type="button" class="btn sec" id="fi-bulk"' + (ex.length ? '' : ' disabled') + ' title="Aprueba las horas extra calculadas de los días que no tienen ninguna otra anormalidad">Aprobar en bloque las extras sin otras anormalidades (' + ex.length + ' días, ' + horasTxt(ex.reduce((s, p) => s + (p.pagado['EXTRA 50%'] || 0) + (p.pagado['EXTRA 100%'] || 0), 0)) + ' h)</button>' : '');
      $('fi-lbl-filtro').style.display = est.vista === 'partes' ? '' : 'none';
    }
    function pintar() {
      const t = est.partes, rev = t.filter(p => p.revisado), pen = pendientes();
      $('fi-resumen').innerHTML = '<div class="est ' + (pen.length ? 'av' : 'ok') + '" style="margin-bottom:10px">' + t.length + ' partes · <b>' + t.filter(p => !p.revisado && p.clase === 'ok').length + '</b> sin novedades (no hace falta mirarlos) · <b>'
        + pen.filter(p => p.clase === 'revisar').length + '</b> por revisar · <b>' + pen.filter(p => p.clase === 'extra').length + '</b> con extras por aprobar · <b>' + rev.length + '</b> ya revisados</div>';
      pintarTabs();
      est.abierto && est.vista === 'resumen' ? (est.abierto = null, $('fi-panel').innerHTML = '') : 0;
      est.vista === 'partes' ? pintarPartes() : est.vista === 'calendario' ? pintarCalendario() : pintarResumen();
      if (est.abierto && est.vista !== 'resumen') abrir(est.abierto);
    }
    function pintarPartes() {
      const num = k => ({ k, tipo: 'n', texto: f => horasTxt((f.pagado || {})[k]), valor: f => (f.pagado || {})[k] || 0 });
      const cols = [
        { k: 'fecha', titulo: 'Fecha', cls: 'izq', sticky: true, min: 90, texto: f => f.dia + ' ' + f.fecha.split('-').reverse().join('/'), valor: f => f.fecha },
        { k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', min: 60, texto: f => String(f.legajo) }, { k: 'persona', titulo: 'Persona', cls: 'izq', min: 190 },
        { k: 'horario', titulo: 'Horario', cls: 'izq', texto: f => f.horario || '— sin horario —' },
        { k: 'horas', titulo: 'Fichadas', cls: 'izq', min: 140, texto: f => (f.horas || []).join(' · '), valor: f => (f.horas || []).join(' ') },
        Object.assign(num('NORMAL 1'), { titulo: 'Normal\n(h)' }), Object.assign(num('EXTRA 50%'), { titulo: 'Extra\n50 % (h)' }), Object.assign(num('EXTRA 100%'), { titulo: 'Extra\n100 % (h)' }),
        { k: 'sinHoraMin', titulo: 'Fuera de\nhorario', tipo: 'n', texto: f => (f.sinHoraMin ? f.sinHoraMin + ' min' : ''), valor: f => f.sinHoraMin || 0 },
        { k: 'aprob', titulo: 'Extra\naprobada', cls: 'izq', texto: f => (f.aprob50 == null && f.aprob100 == null ? '' : [f.aprob50 ? horasTxt(f.aprob50) + ' al 50 %' : '', f.aprob100 ? horasTxt(f.aprob100) + ' al 100 %' : ''].filter(Boolean).join(' + ') || '0') },
        { k: 'anorm', titulo: 'Anormalidades', cls: 'izq', min: 230, texto: f => f.marcas.map(m => (m === 'ausente' && f.justificacion ? 'Ausente — ' + f.justificacion : MARCAS[m] || m)).join(' · '), valor: f => f.marcas.join(' ') },
        { k: 'cambios', titulo: 'Cambios', cls: 'izq', min: 100, texto: f => (f.cambios.modificado ? 'Modificado' : ''), valor: f => (f.cambios.modificado ? 1 : 0),
          html: f => (f.cambios.modificado ? '<span class="mod" data-tip="' + attr(f.cambios.lineas.join('\n')) + '">Modificado</span>' : '') },
        { k: 'estadoTxt', titulo: 'Estado', cls: 'izq', min: 120 }];
      est.columnas = cols;
      est.grid = Tabla.crear({ el: $('fi-tabla'), id: 'fichadas-partes-v3', columnas: cols, esc, filaAttrs: f => 'data-pk="' + esc(f.id) + '" style="cursor:pointer' + (f.revisado || f.clase === 'ok' ? '' : f.clase === 'revisar' ? ';background:#fbf6e6' : ';background:#eef3f7') + '"',
        pie: rows => ['', '', 'TOTAL · ' + rows.length + ' partes', '', '', horasTxt(rows.reduce((s, f) => s + (f.pagado['NORMAL 1'] || 0), 0)), horasTxt(rows.reduce((s, f) => s + (f.pagado['EXTRA 50%'] || 0), 0)), horasTxt(rows.reduce((s, f) => s + (f.pagado['EXTRA 100%'] || 0), 0)), '', '', '', '', ''] });
      est.grid.render(filas());
      $('fi-nota').innerHTML = '<b>Cómo leerlo:</b> «Sin novedades» = día normal, no hace falta mirarlo. «Por revisar» (amarillo) = falta algo o es llamativo (fichada única, llegó tarde, ausente sin aviso, feriado…). «Extra por aprobar» (celeste) = solo tiene horas extra para aprobar o no. «Revisado» = RRHH ya lo vio. '
        + 'Tocá una fila para corregir ese día. Las horas son las que calcula la app con el horario de cada legajo; las extras no valen hasta que RRHH las aprueba.';
    }
    const DIAS3 = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    function fechasDelPeriodo() { const [d, h] = rango(), out = []; for (let x = new Date(d + 'T12:00:00'); x <= new Date(h + 'T12:00:00'); x.setDate(x.getDate() + 1)) out.push(fechaIso(x)); return out; }
    function matrizCalendario() {
      const fechas = fechasDelPeriodo(), porId = new Map(est.partes.map(p => [p.id, p])), legajos = [...new Set(est.partes.map(p => p.legajo))].sort((a, b) => a - b);
      const res = new Map(est.resumen.map(r => [r.legajo, r]));
      return { fechas, filas: legajos.map(l => ({ legajo: l, persona: est.nombres.get(l) || '(sin padrón)', resumen: res.get(l), celdas: fechas.map(f => { const p = porId.get(l + '|' + f); return p ? { p, c: F.celdaCalendario(p) } : null; }) })) };
    }
    function pintarCalendario() {
      const { fechas, filas } = matrizCalendario();
      const cab = fechas.map(f => { const d = new Date(f + 'T12:00:00'), g = d.getDay(); return '<th class="' + (g === 0 || g === 6 ? 'fin ' : '') + (est.feriados.has(f) ? 'fer' : '') + '"' + (est.feriados.has(f) ? ' title="Feriado"' : '') + '>' + DIAS3[g] + '<br><span style="font-weight:400">' + d.getDate() + '</span></th>'; }).join('');
      const cuerpo = filas.map(r => '<tr><td class="nom" title="' + attr(r.legajo + ' - ' + r.persona) + '">' + esc(r.legajo + ' - ' + r.persona) + '</td>' + r.celdas.map((x, i) => {
        const g = new Date(fechas[i] + 'T12:00:00').getDay(), fin = g === 0 || g === 6 ? ' fin' : '';
        if (!x) return '<td class="c-vacio' + fin + '"></td>';
        const p = x.p, c = x.c, tip = [r.persona + ' · ' + p.fecha.split('-').reverse().join('/') + ' (' + p.dia + ')', 'Fichadas: ' + (p.horas.length ? p.horas.join(' · ') : 'ninguna'),
          p.marcas.length ? p.marcas.map(m => (m === 'ausente' && p.justificacion ? 'Ausente — ' + p.justificacion : MARCAS[m] || m)).join(' · ') : '', 'Estado: ' + p.estadoTxt].filter(Boolean).concat(p.cambios.modificado ? ['', 'MODIFICADO:'].concat(p.cambios.lineas) : []);
        return '<td class="tipc c-' + c.clase + fin + (!p.revisado && p.clase !== 'ok' ? ' pen' : '') + (p.cambios.modificado ? ' mod2' : '') + '" data-pk="' + esc(p.id) + '" data-tip="' + attr(tip.join('\n')) + '"><b>' + esc(c.texto) + '</b>'
          + (c.extras ? c.extras.split(' · ').map(e => '<span class="ex">' + esc(e) + '</span>').join('') : '') + (c.menos ? '<span class="me">' + esc(c.menos) + '</span>' : '') + '</td>';
      }).join('') + '<td class="tot">' + (r.resumen ? horasTxt(r.resumen.normalMin) : '') + '</td><td class="tot"><span class="ex" style="font-size:11px">' + (r.resumen && r.resumen.extra50Min + r.resumen.extra100Min ? '+' + horasTxt(r.resumen.extra50Min + r.resumen.extra100Min) + ' h' : '') + '</span></td></tr>').join('');
      $('fi-tabla').innerHTML = filas.length ? '<div style="overflow:auto;max-width:100%"><table class="cal"><thead><tr><th></th>' + cab + '<th>Normal<br>(h)</th><th>Extras</th></tr></thead><tbody>' + cuerpo + '</tbody></table></div>' : '<div class="empty">No hay partes en este período.</div>';
      $('fi-nota').innerHTML = '<b>Calendario:</b> una fila por persona y una columna por día. <span style="background:#d9eed0;padding:0 6px;border-radius:4px">verde</span> horas trabajadas · <span style="color:#1f5fa8;font-weight:600">+1,5 h 50 %</span> horas extra · <span style="color:#c0392b;font-weight:600">−1 h</span> horas de menos · '
        + '<span style="background:#c9e8f7;padding:0 6px;border-radius:4px">Vac.</span> vacaciones · <span style="background:#ffb066;padding:0 6px;border-radius:4px">Aus J.</span> ausencia justificada (Enf., ART…) · <span style="background:#ff8a73;padding:0 6px;border-radius:4px">Aus. Inj.</span> ausencia injustificada o sin aviso · '
        + '<b>?</b> una sola fichada · <b>Fer.</b> feriado · contorno amarillo = falta decidir · esquina amarilla = modificado. Pasá el cursor por un día para ver el detalle y tocá para corregirlo.';
    }
    function pintarResumen() {
      const hx = k => ({ k, tipo: 'n', texto: f => horasTxt(f[k]), valor: f => f[k] || 0 }), cnt = k => ({ k, tipo: 'n', texto: f => (f[k] ? String(f[k]) : ''), valor: f => f[k] || 0 });
      const cols = [{ k: 'legajo', titulo: 'Legajo', tipo: 'n', cls: 'izq', sticky: true, min: 60, texto: f => String(f.legajo) }, { k: 'persona', titulo: 'Persona', cls: 'izq', min: 190 }, { k: 'horario', titulo: 'Horario', cls: 'izq', texto: f => f.horario || '— sin horario —' },
        cnt('dias'), Object.assign(hx('normalMin'), { titulo: 'Normal\n(h)' }), Object.assign(hx('extra50Min'), { titulo: 'Extra\n50 % (h)' }), Object.assign(hx('extra100Min'), { titulo: 'Extra\n100 % (h)' }),
        { k: 'aprob', titulo: 'Extra\naprobada', tipo: 'n', texto: f => horasTxt(f.aprob50Min + f.aprob100Min), valor: f => f.aprob50Min + f.aprob100Min },
        Object.assign(cnt('extraPorAprobar'), { titulo: 'Días extra\npor aprobar' }), Object.assign(cnt('porRevisar'), { titulo: 'Días por\nrevisar' }), Object.assign(cnt('ausentesSinAviso'), { titulo: 'Ausentes\nsin aviso' }),
        Object.assign(cnt('justificados'), { titulo: 'Ausentes\njustificados' }), Object.assign(cnt('tardes'), { titulo: 'Llegadas\ntarde' }), Object.assign(cnt('fichadasUnicas'), { titulo: 'Fichadas\núnicas' }),
        { k: 'llamativo', titulo: 'Llamativo', cls: 'izq', min: 220, texto: f => f.llamativo.join(' · '), valor: f => f.llamativo.join(' ') },
        { k: 'accion', titulo: '', cls: 'izq', texto: () => '', html: f => (puedeEditar && f.extraPorAprobar ? '<button type="button" class="btn sec" data-aprobar="' + f.legajo + '">Aprobar sus extras</button>' : '') }];
      cols[3].titulo = 'Días con\nfichadas';
      est.columnas = cols.slice(0, -1);
      est.gridRes = Tabla.crear({ el: $('fi-tabla'), id: 'fichadas-resumen-v3', columnas: cols, esc, filaAttrs: f => (f.llamativo.length ? 'style="background:#fbf6e6"' : ''),
        pie: rows => ['', 'TOTAL · ' + rows.length + ' personas', '', String(rows.reduce((s, f) => s + f.dias, 0)), horasTxt(rows.reduce((s, f) => s + f.normalMin, 0)), horasTxt(rows.reduce((s, f) => s + f.extra50Min, 0)), horasTxt(rows.reduce((s, f) => s + f.extra100Min, 0)),
          horasTxt(rows.reduce((s, f) => s + f.aprob50Min + f.aprob100Min, 0)), String(rows.reduce((s, f) => s + f.extraPorAprobar, 0)), String(rows.reduce((s, f) => s + f.porRevisar, 0)), String(rows.reduce((s, f) => s + f.ausentesSinAviso, 0)), String(rows.reduce((s, f) => s + f.justificados, 0)), String(rows.reduce((s, f) => s + f.tardes, 0)), String(rows.reduce((s, f) => s + f.fichadasUnicas, 0)), '', ''] });
      est.gridRes.render(est.resumen);
      $('fi-nota').innerHTML = '<b>Resumen del período por persona.</b> Las filas amarillas tienen algo llamativo: más de ' + est.limExtras + ' h de extras (se cambia arriba), ausencias sin aviso, 3 o más llegadas tarde o fichadas por completar. «Aprobar sus extras» aprueba las extras calculadas de los días de esa persona que no tienen otras anormalidades.';
    }

    /* ---------------- aprobar en bloque ---------------- */
    async function aprobarEnBloque(legajo) {
      const dias = pendientes().filter(p => p.clase === 'extra' && (legajo == null || p.legajo === legajo));
      if (!dias.length) return;
      const tot = dias.reduce((s, p) => s + (p.pagado['EXTRA 50%'] || 0) + (p.pagado['EXTRA 100%'] || 0), 0);
      if (!window.confirm('Se van a aprobar las extras calculadas de ' + dias.length + ' días' + (legajo != null ? ' (legajo ' + legajo + ')' : '') + ': ' + horasTxt(tot) + ' h en total. ¿Aprobar?')) return;
      try {
        const ahora = new Date().toISOString(), filasDb = dias.map(p => ({ legajo: p.legajo, fecha: p.fecha, estado: 'revisado', extra50_aprobada_min: p.pagado['EXTRA 50%'] || 0, extra100_aprobada_min: p.pagado['EXTRA 100%'] || 0, nota: 'Aprobada en bloque', revisado_por: est.uid, revisado_en: ahora }));
        for (let i = 0; i < filasDb.length; i += 200) {
          const { data, error } = await sb.from('rrhh_partes_dia').upsert(filasDb.slice(i, i + 200), { onConflict: 'legajo,fecha' }).select();
          if (error) throw new Error(error.message);
          (data || []).forEach(d => est.dias.set(d.legajo + '|' + d.fecha, d));
        }
        recalcular();
      } catch (e) { alert('No se pudo aprobar: ' + e.message); }
    }
    async function marcarFeriados() {
      const dias = soloFeriado(); if (!dias.length) return;
      if (!window.confirm('Se van a marcar como revisados ' + dias.length + ' días trabajados en feriado. Esto NO aprueba horas: solo los marca como vistos. ¿Seguir?')) return;
      try {
        const ahora = new Date().toISOString(), filasDb = dias.map(p => ({ legajo: p.legajo, fecha: p.fecha, estado: 'revisado', extra50_aprobada_min: null, extra100_aprobada_min: null, nota: 'Feriado revisado en bloque (no aprueba horas)', revisado_por: est.uid, revisado_en: ahora }));
        for (let i = 0; i < filasDb.length; i += 200) {
          const { data, error } = await sb.from('rrhh_partes_dia').upsert(filasDb.slice(i, i + 200), { onConflict: 'legajo,fecha' }).select();
          if (error) throw new Error(error.message);
          (data || []).forEach(d => est.dias.set(d.legajo + '|' + d.fecha, d));
        }
        recalcular();
      } catch (e) { alert('No se pudo marcar: ' + e.message); }
    }
    $('fi-tabs').addEventListener('change', ev => {
      if (ev.target.id !== 'fi-lim') return;
      est.limExtras = Math.max(0, Number(ev.target.value) || 0); try { localStorage.setItem('rrhh-fichadas-extras-altas', String(est.limExtras)); } catch (e) { /* sin almacenamiento */ }
      recalcular();
    });
    $('fi-tabs').addEventListener('click', ev => {
      const b = ev.target.closest('button'); if (!b) return;
      if (b.dataset.v) { est.vista = b.dataset.v; est.abierto = null; $('fi-panel').innerHTML = ''; pintar(); }
      else if (b.id === 'fi-bulk') aprobarEnBloque(null);
      else if (b.id === 'fi-bulk-fer') marcarFeriados();
    });
    $('fi-tabla').addEventListener('click', ev => {
      const ap = ev.target.closest('button[data-aprobar]'); if (ap) { aprobarEnBloque(Number(ap.dataset.aprobar)); return; }
      const tr = ev.target.closest('tr[data-pk], td[data-pk]'); if (tr && !ev.target.closest('.th-t,.th-f,.minib')) abrir(tr.dataset.pk);
    });

    /* ---------------- panel de corrección ---------------- */
    function abrir(id) {
      est.abierto = id; const p = est.partes.find(x => x.id === id); if (!p) { $('fi-panel').innerHTML = ''; return; }
      const dia = est.fichadas.filter(f => f.legajo === p.legajo && f.fecha === p.fecha).sort((a, b) => a.hora.localeCompare(b.hora));
      const a50 = p.aprob50 != null ? p.aprob50 : (p.pagado['EXTRA 50%'] || 0), a100 = p.aprob100 != null ? p.aprob100 : (p.pagado['EXTRA 100%'] || 0);
      const ed = puedeEditar ? '' : ' disabled';
      $('fi-panel').innerHTML = `<div class="card" style="max-width:none;margin-top:14px"><div class="card-h"><h3>${esc(p.persona)} · legajo ${p.legajo} · ${esc(p.fecha.split('-').reverse().join('/'))} (${esc(p.dia)})</h3><button type="button" class="btn sec" id="fp-cerrar">Cerrar</button></div><div class="card-b">
        <p class="nota" style="margin-top:0">Horario <b>${esc(p.horario || 'sin horario')}</b> · ${p.marcas.length ? esc(p.marcas.map(m => (m === 'ausente' && p.justificacion ? 'Ausente — ' + p.justificacion : MARCAS[m] || m)).join(' · ')) : 'sin anormalidades'}</p>
        <table class="tbl" style="width:auto"><thead><tr><th>Hora</th><th>Origen</th><th>Estado</th><th>Motivo</th><th></th></tr></thead><tbody>${dia.map(f => `<tr><td>${esc(f.hora)}</td><td>${f.origen === 'tango' ? 'Tango' : 'Agregada por RRHH'}</td><td>${f.anulada ? '<s>Anulada</s>' : 'Vigente'}</td><td>${esc(f.motivo || '')}</td><td>${puedeEditar ? (f.anulada ? '<button class="btn sec" type="button" data-acc="reactivar" data-id="' + esc(f.id) + '">Reactivar</button>' : '<button class="btn sec" type="button" data-acc="anular" data-id="' + esc(f.id) + '">Anular</button>') : ''}</td></tr>`).join('') || '<tr><td colspan="5">Sin fichadas</td></tr>'}</tbody></table>
        ${puedeEditar ? `<div class="barra" style="margin-top:12px"><label>Agregar fichada (HH:MM)<input type="time" id="fp-hora"></label><label>Motivo (obligatorio)<input type="text" id="fp-motivo" size="34" placeholder="p. ej. Olvidó fichar la salida"></label><button type="button" class="btn" id="fp-agregar">Agregar</button></div>
        ${p.sugerencias.length ? '<div class="est av">Sugerencias: ' + p.sugerencias.map((s, i) => `<button type="button" class="btn sec" data-sug="${i}">${esc(s.accion === 'agregar' ? 'Agregar ' + s.hora : 'Cambiar ' + s.de + ' por ' + s.hora)} · ${esc(s.motivo)}</button>`).join(' ') + '</div>' : ''}` : ''}
        <div class="barra" style="margin-top:14px"><label>Extra 50 % aprobada (min)<input type="number" min="0" step="1" id="fp-a50" value="${a50}"${ed}></label><label>Extra 100 % aprobada (min)<input type="number" min="0" step="1" id="fp-a100" value="${a100}"${ed}></label>
          <label>Nota<input type="text" id="fp-nota" size="34" value="${esc((est.dias.get(p.id) || {}).nota || '')}"${ed}></label>${puedeEditar ? '<button type="button" class="btn" id="fp-revisar">Guardar y marcar revisado</button>' : ''}</div>
        ${p.cambios.modificado ? '<div class="est av" style="margin-top:12px"><b>Modificado.</b> Qué había antes y qué cambió:<br>' + p.cambios.lineas.map(esc).join('<br>') + '</div>' : ''}
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

    /* ---------------- novedades (solo para reconocer ausencias justificadas) ---------------- */
    $('fi-novedades').addEventListener('change', async ev => {
      const f = ev.target.files[0]; if (!f) return;
      try {
        const wb = XLSX.read(await f.arrayBuffer(), { type: 'array', cellDates: true });
        const h = wb.SheetNames.find(n => /novedades registradas/i.test(n)) || wb.SheetNames[0];
        const filasX = XLSX.utils.sheet_to_json(wb.Sheets[h], { defval: null, raw: true }), m = new Map(); let n = 0;
        for (const r of filasX) {
          const leg = r['Número de legajo'], cod = String(r['Código de novedad'] || '').trim().toUpperCase(), d = r['Fecha'];
          if (leg == null || !cod || !(d instanceof Date)) continue;
          const k = Number(leg) + '|' + fechaIso(d); if (!m.has(k)) m.set(k, []); m.get(k).push(cod); n++;
        }
        if (!n) throw new Error('no encontré filas (Fecha, Número de legajo, Código de novedad)');
        est.just = m; $('fi-est-nov').className = 'est ok'; $('fi-est-nov').textContent = 'Leí ' + n + ' novedades. Las ausencias con una novedad de enfermedad, ART, vacaciones, licencias u horas justificadas ya no se marcan.'; recalcular();
      } catch (e) { est.just = new Map(); $('fi-est-nov').className = 'est mal'; $('fi-est-nov').textContent = 'No pude leer las novedades: ' + e.message; recalcular(); }
    });

    /* ---------------- exportar ---------------- */
    function descargar(nombre, contenido, tipo) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([contenido], { type: tipo })); a.download = nombre; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }
    $('fi-txt').addEventListener('click', () => {
      const ef = est.fichadas.filter(f => !f.anulada).map(f => ({ fecha: f.fecha, hora: f.hora, codigo: f.codigo, reloj: f.reloj }));
      if (!ef.length) { alert('No hay fichadas en este período.'); return; }
      const pend = pendientes().filter(p => p.clase === 'revisar').length;
      if (pend && !window.confirm('Hay ' + pend + ' partes por revisar sin resolver. ¿Descargar igual?')) return;
      const [d, h] = rango(); descargar('fichadas_depuradas_' + d.replace(/-/g, '') + '_' + h.replace(/-/g, '') + '.txt', F.armarTxt(ef), 'text/plain;charset=utf-8');
    });
    $('fi-xlsx').addEventListener('click', () => {
      if (est.vista === 'calendario') {
        const { fechas, filas } = matrizCalendario();
        const aoa = [['Legajo', 'Persona', ...fechas.map(f => { const d = new Date(f + 'T12:00:00'); return DIAS3[d.getDay()] + ' ' + d.getDate(); }), 'Normal (h)', 'Extras (h)']].concat(filas.map(r => [r.legajo, r.persona,
          ...r.celdas.map(x => (x ? [x.c.texto, x.c.extras, x.c.menos].filter(Boolean).join(' ') : '')), r.resumen ? horasTxt(r.resumen.normalMin) : '', r.resumen ? horasTxt(r.resumen.extra50Min + r.resumen.extra100Min) : '']));
        const wbc = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wbc, XLSX.utils.aoa_to_sheet(aoa), 'Calendario'); XLSX.writeFile(wbc, 'calendario_fichadas.xlsx'); return;
      }
      const g = est.vista === 'partes' ? est.grid : est.gridRes; if (!g) return; const fl = g.filtradas(), cols = est.columnas;
      const aoa = [cols.map(c => String(c.titulo).replace(/\n/g, ' ')), ...fl.map(f => cols.map(c => { const v = c.texto ? c.texto(f) : f[c.k]; return v == null ? '' : v; }))];
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), est.vista === 'partes' ? 'Partes' : 'Resumen'); XLSX.writeFile(wb, est.vista === 'partes' ? 'partes_diarios.xlsx' : 'resumen_del_periodo.xlsx');
    });
    $('fi-log').addEventListener('click', () => {
      const m = est.partes.filter(p => p.cambios.modificado);
      if (!m.length) { alert('No hay cambios en este período.'); return; }
      const aoa = [['Fecha', 'Legajo', 'Persona', 'Fichadas de Tango (antes)', 'Fichadas ahora', 'Qué cambió']].concat(m.map(p => [p.fecha.split('-').reverse().join('/'), p.legajo, p.persona, p.antesHoras.join(' · ') || 'sin fichadas', p.horas.join(' · ') || 'sin fichadas', p.cambios.lineas.join('\n')]));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(aoa), 'Cambios'); XLSX.writeFile(wb, 'registro_de_cambios_fichadas.xlsx');
    });
    ['fi-mes', 'fi-q'].forEach(id => $(id).addEventListener('change', () => { est.abierto = null; $('fi-panel').innerHTML = ''; cargar(); }));
    $('fi-filtro').addEventListener('change', ev => { est.filtro = ev.target.value; if (est.vista === 'partes' && est.grid) est.grid.render(filas()); });
    cargar();
  }

  root.RRHHVistaFichadas = { montar };
})(typeof self !== 'undefined' ? self : this);
