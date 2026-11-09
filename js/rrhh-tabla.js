/* ==========================================================================
   RRHH · tabla estándar. TODA tabla con datos de la app usa esto:
     · ordenar por columna (clic en el título: ascendente → descendente → sin orden)
     · filtro por columna con buscador y selección múltiple (botón ▾ del título)
     · ajustar el ancho de cada columna arrastrando el borde; doble clic en el borde = autoajuste de esa columna
     · autoajuste de todas las columnas la primera vez y con el botón «Ajustar columnas»
     · los anchos se recuerdan por tabla en este navegador (localStorage, opcional: si no se puede, se sigue sin recordar)
     · contador «N de M filas» y «Limpiar filtros»; el total (pie) se recalcula sobre lo que queda filtrado
   Cada columna: { k, titulo, grupo?, tipo:'txt'|'n'|'p', cls?, sticky?, min?, valor(f)?, texto(f)?, html(f)? }
     valor  = lo que se usa para ordenar · texto = lo que se muestra y se usa en el filtro · html = lo que se pinta
   La parte lógica (ordenar/filtrar) no toca el DOM y se prueba aparte (test/tabla.test.js).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHTabla = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------------- lógica pura ---------------- */
  const sinTildes = s => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const valorDe = (c, f) => (c.valor ? c.valor(f) : f[c.k]);
  const textoDe = (c, f) => { if (c.texto) return String(c.texto(f) == null ? '' : c.texto(f)); const v = valorDe(c, f); return v == null ? '' : String(v); };

  function comparar(a, b) {                               // vacíos al final, números como números, textos en castellano
    const va = a == null || a === '', vb = b == null || b === '';
    if (va || vb) return va === vb ? 0 : va ? 1 : -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b), 'es', { numeric: true, sensitivity: 'base' });
  }
  /** filtros: { k: Set de textos permitidos }. omitir = columna a la que no se le aplica (para armar su lista de opciones). */
  function filtrar(filas, columnas, filtros, omitir) {
    const act = columnas.filter(c => c.k !== omitir && filtros[c.k]);
    return act.length ? filas.filter(f => act.every(c => filtros[c.k].has(textoDe(c, f)))) : filas.slice();
  }
  function ordenar(filas, columnas, orden) {
    const c = orden && columnas.find(x => x.k === orden.k);
    if (!c) return filas.slice();
    const dir = orden.dir === 'desc' ? -1 : 1;
    const vacio = v => v == null || v === '';
    return filas.map((f, i) => [f, i]).sort((x, y) => {
      const a = valorDe(c, x[0]), b = valorDe(c, y[0]);
      if (vacio(a) || vacio(b)) return (vacio(a) - vacio(b)) || x[1] - y[1];       // los vacíos van siempre al final, también en descendente
      return dir * comparar(a, b) || x[1] - y[1];
    }).map(x => x[0]);
  }
  /** Textos distintos de una columna (para la lista del filtro), ordenados como la columna. */
  function opciones(filas, c) {
    const m = new Map();
    for (const f of filas) { const t = textoDe(c, f); if (!m.has(t)) m.set(t, valorDe(c, f)); }
    return [...m.entries()].sort((a, b) => comparar(a[1], b[1])).map(e => e[0]);
  }
  const coincide = (texto, buscado) => !buscado || sinTildes(texto).includes(sinTildes(buscado));

  const logica = { comparar, filtrar, ordenar, opciones, coincide, textoDe, valorDe };

  /* ---------------- DOM ---------------- */
  const esc0 = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const MAX_OPCIONES = 300, ANCHO_MIN = 56;

  /**
   * opts: { el, id, columnas, esc?, pie?(filas)→[html por columna], pieEtiqueta?, filaAttrs?(f)→string, vacio?,
   *         agrupar?: { clave(f), orden?(a,b), fila(clave, filas)→[html por columna] } }
   * → { render(filas, {agrupar:bool}), filtradas(), limpiarFiltros(), ajustar() }
   */
  function crear(opts) {
    const esc = opts.esc || esc0, cols = opts.columnas;
    const est = { filas: [], orden: null, filtros: {}, anchos: {}, agrupar: false, ajustado: false };
    const clave = 'rrhh-tabla-' + (opts.id || 'x');
    try { Object.assign(est.anchos, JSON.parse(localStorage.getItem(clave) || '{}')); est.ajustado = Object.keys(est.anchos).length > 0; } catch (e) { /* sin almacenamiento: no se recuerdan */ }
    const guardar = () => { try { localStorage.setItem(clave, JSON.stringify(est.anchos)); } catch (e) { /* idem */ } };
    const $el = opts.el;
    let pop = null;

    const filtradas = () => ordenar(filtrar(est.filas, cols, est.filtros), cols, est.orden);

    function medir(texto, fuente, extra) {
      const cv = medir.cv || (medir.cv = document.createElement('canvas')), cx = cv.getContext('2d');
      cx.font = fuente; return Math.ceil(cx.measureText(texto).width) + extra;
    }
    function autoAncho(c, filas) {
      const th = $el.querySelector('th[data-k="' + c.k + '"]'), td = $el.querySelector('tbody td');
      const cs = td ? getComputedStyle(td) : null, ch = th ? getComputedStyle(th) : null;
      const fam = (cs && cs.fontFamily) || 'sans-serif', tam = (cs && cs.fontSize) || '12.5px';
      const normal = '400 ' + tam + ' ' + fam, negrita = '700 ' + ((ch && ch.fontSize) || tam) + ' ' + ((ch && ch.fontFamily) || fam);
      let w = medir(c.titulo, negrita, 20 + 44);                            // relleno + iconos de ordenar/filtrar
      for (const f of filas) w = Math.max(w, medir(textoDe(c, f), normal, 22));
      if (est.pieTextos && est.pieTextos[c.k]) w = Math.max(w, medir(est.pieTextos[c.k], '700 ' + tam + ' ' + fam, 34));    // la fila de totales va en negrita
      return Math.max(ANCHO_MIN, Math.min(w, 520));
    }
    function ajustarTodas() {
      const filas = filtradas();
      cols.forEach(c => { est.anchos[c.k] = autoAncho(c, filas); });
      est.ajustado = true; guardar(); pintar();
    }
    const ancho = c => est.anchos[c.k] || c.min || 110;

    function cabecera() {
      const hayGrupos = cols.some(c => c.grupo);
      let h1 = '';
      if (hayGrupos) {
        const gs = []; cols.forEach(c => { const g = gs[gs.length - 1]; if (g && g.t === (c.grupo || '')) g.n++; else gs.push({ t: c.grupo || '', n: 1 }); });
        h1 = '<tr>' + gs.map(g => '<th class="g" colspan="' + g.n + '">' + esc(g.t) + '</th>').join('') + '</tr>';
      }
      let izq = 0;
      const h2 = '<tr' + (hayGrupos ? ' class="h2"' : '') + '>' + cols.map((c, i) => {
        const ord = est.orden && est.orden.k === c.k ? (est.orden.dir === 'desc' ? '▼' : '▲') : '';
        const st = c.sticky ? ' st' + (!cols[i + 1] || !cols[i + 1].sticky ? ' stl' : '') : '';
        const style = 'width:' + ancho(c) + 'px;min-width:' + ancho(c) + 'px;max-width:' + ancho(c) + 'px' + (c.sticky ? ';left:' + izq + 'px' : '');
        if (c.sticky) izq += ancho(c);
        return '<th data-k="' + esc(c.k) + '" class="' + (c.cls || '') + st + '" style="' + style + '"><div class="th-in"><span class="th-t" data-ord="' + esc(c.k) + '" title="Ordenar">' + esc(c.titulo) + '</span>'
          + '<span class="th-ord">' + ord + '</span><button type="button" class="th-fil' + (est.filtros[c.k] ? ' on' : '') + '" data-fil="' + esc(c.k) + '" aria-label="Filtrar ' + esc(c.titulo) + '" title="Filtrar">▾</button></div>'
          + '<span class="th-res" data-res="' + esc(c.k) + '" title="Arrastrá para cambiar el ancho · doble clic: autoajuste"></span></th>';
      }).join('') + '</tr>';
      return '<thead>' + h1 + h2 + '</thead>';
    }
    function celdas(f) {
      let izq = 0;
      return cols.map((c, i) => {
        const st = c.sticky ? ' st' + (!cols[i + 1] || !cols[i + 1].sticky ? ' stl' : '') : '';
        const style = 'width:' + ancho(c) + 'px;max-width:' + ancho(c) + 'px' + (c.sticky ? ';left:' + izq + 'px' : '');
        if (c.sticky) izq += ancho(c);
        const v = valorDe(c, f), neg = c.tipo === 'n' && typeof v === 'number' && v < 0;
        return '<td class="' + (c.cls || '') + st + (neg ? ' neg' : '') + '" style="' + style + '" title="' + esc(textoDe(c, f)) + '">' + (c.html ? c.html(f) : esc(textoDe(c, f))) + '</td>';
      }).join('');
    }
    function filaHtml(celdasHtml, clase) {
      let izq = 0;
      return '<tr class="' + clase + '">' + cols.map((c, i) => {
        const st = c.sticky ? ' st' + (!cols[i + 1] || !cols[i + 1].sticky ? ' stl' : '') : '';
        const style = 'width:' + ancho(c) + 'px;max-width:' + ancho(c) + 'px' + (c.sticky ? ';left:' + izq + 'px' : '');
        if (c.sticky) izq += ancho(c);
        return '<td class="' + (c.cls || '') + st + '" style="' + style + '">' + (celdasHtml[i] == null ? '' : celdasHtml[i]) + '</td>';
      }).join('') + '</tr>';
    }

    function pintar() {
      cerrarPop();
      const fs = filtradas(), total = est.filas.length, hayFiltro = Object.keys(est.filtros).length > 0;
      const barra = '<div class="tbl-barra"><span>' + fs.length + ' de ' + total + ' fila' + (total === 1 ? '' : 's') + '</span>'
        + (hayFiltro ? '<button type="button" class="btn" data-acc="limpiar">Limpiar filtros</button>' : '')
        + '<button type="button" class="btn" data-acc="ajustar">Ajustar columnas</button></div>';
      let body = '';
      if (est.agrupar && opts.agrupar) {
        const mapa = new Map();
        for (const f of fs) { const k = opts.agrupar.clave(f); if (!mapa.has(k)) mapa.set(k, []); mapa.get(k).push(f); }
        const ks = [...mapa.keys()].sort(opts.agrupar.orden || ((a, b) => comparar(a, b)));
        for (const k of ks) body += filaHtml(opts.agrupar.fila(k, mapa.get(k)), 'grupo') + mapa.get(k).map(f => '<tr ' + (opts.filaAttrs ? opts.filaAttrs(f) : '') + '>' + celdas(f) + '</tr>').join('');
      } else body = fs.map(f => '<tr ' + (opts.filaAttrs ? opts.filaAttrs(f) : '') + '>' + celdas(f) + '</tr>').join('');
      let pie = '';
      if (opts.pie) { const p = opts.pie(fs); est.pieTextos = {}; cols.forEach((c, i) => { est.pieTextos[c.k] = String(p[i] == null ? '' : p[i]).replace(/<[^>]*>/g, ''); }); pie = '<tfoot>' + filaHtml(p, 'tot') + '</tfoot>'; }
      const anchoTabla = cols.reduce((s, c) => s + ancho(c), 0);
      $el.innerHTML = barra + (fs.length
        ? '<div class="tblwrap"><table class="tbl fija" style="width:' + anchoTabla + 'px"><colgroup>' + cols.map(c => '<col style="width:' + ancho(c) + 'px">').join('') + '</colgroup>' + cabecera() + '<tbody>' + body + '</tbody>' + pie + '</table></div>'
        : '<div class="empty">' + esc(opts.vacio || 'No hay filas que coincidan con el filtro.') + '</div>');
      if (!est.ajustado && fs.length) { est.ajustado = true; ajustarTodas(); }
    }

    /* ---- filtro por columna ---- */
    function cerrarPop() { if (pop) { pop.remove(); pop = null; document.removeEventListener('mousedown', fuera, true); document.removeEventListener('keydown', tecla, true); } }
    const fuera = ev => { if (pop && !pop.contains(ev.target) && !ev.target.closest('.th-fil')) cerrarPop(); };
    const tecla = ev => { if (ev.key === 'Escape') cerrarPop(); };
    function abrirFiltro(k, boton) {
      cerrarPop();
      const c = cols.find(x => x.k === k); if (!c) return;
      const todas = opciones(filtrar(est.filas, cols, est.filtros, k), c);
      const sel = new Set(est.filtros[k] ? [...est.filtros[k]].filter(t => todas.includes(t)) : todas);
      let buscado = '';
      pop = document.createElement('div'); pop.className = 'fil-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Filtro: ' + c.titulo);
      pop.innerHTML = '<input type="search" class="fil-q" placeholder="Buscar…" autocomplete="off"><label class="fil-todo"><input type="checkbox" data-todo> <span>(Seleccionar todo)</span></label>'
        + '<div class="fil-lista"></div><div class="fil-pie"><button type="button" class="btn" data-ok>Aplicar</button><button type="button" class="btn" data-borrar>Quitar filtro</button></div>';
      document.body.appendChild(pop);
      const r = boton.getBoundingClientRect();
      pop.style.top = Math.min(r.bottom + 4, window.innerHeight - 340) + 'px';
      pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - 260)) + 'px';
      const visibles = () => todas.filter(t => coincide(t, buscado));
      function lista() {
        const v = visibles(), mostrar = v.slice(0, MAX_OPCIONES);
        pop.querySelector('.fil-lista').innerHTML = mostrar.map(t => '<label><input type="checkbox" data-v="' + esc(t) + '"' + (sel.has(t) ? ' checked' : '') + '> <span>' + (t === '' ? '(vacío)' : esc(t)) + '</span></label>').join('')
          + (v.length > MAX_OPCIONES ? '<div class="nota" style="margin:6px 4px">Hay ' + v.length + ' valores: escribí en el buscador para acotar.</div>' : '') + (v.length ? '' : '<div class="nota" style="margin:6px 4px">Sin coincidencias.</div>');
        const t = pop.querySelector('[data-todo]'); t.checked = v.length > 0 && v.every(x => sel.has(x)); t.indeterminate = !t.checked && v.some(x => sel.has(x));
      }
      lista();
      pop.querySelector('.fil-q').addEventListener('input', ev => { buscado = ev.target.value; lista(); });
      pop.querySelector('[data-todo]').addEventListener('change', ev => { visibles().forEach(t => (ev.target.checked ? sel.add(t) : sel.delete(t))); lista(); });
      pop.querySelector('.fil-lista').addEventListener('change', ev => { const t = ev.target.dataset.v; if (t === undefined) return; ev.target.checked ? sel.add(t) : sel.delete(t); lista(); });
      pop.querySelector('[data-ok]').addEventListener('click', () => { if (sel.size === todas.length) delete est.filtros[k]; else est.filtros[k] = new Set(sel); pintar(); });
      pop.querySelector('[data-borrar]').addEventListener('click', () => { delete est.filtros[k]; pintar(); });
      document.addEventListener('mousedown', fuera, true); document.addEventListener('keydown', tecla, true);
      pop.querySelector('.fil-q').focus();
    }

    /* ---- eventos (delegados: el contenido se vuelve a pintar) ---- */
    $el.addEventListener('click', ev => {
      const acc = ev.target.closest('[data-acc]'); if (acc) { acc.dataset.acc === 'limpiar' ? limpiarFiltros() : ajustarTodas(); return; }
      const fil = ev.target.closest('[data-fil]'); if (fil) { abrirFiltro(fil.dataset.fil, fil); return; }
      const ord = ev.target.closest('[data-ord]');
      if (ord) {
        const k = ord.dataset.ord, o = est.orden;
        est.orden = !o || o.k !== k ? { k, dir: 'asc' } : o.dir === 'asc' ? { k, dir: 'desc' } : null;
        pintar();
      }
    });
    $el.addEventListener('dblclick', ev => {
      const r = ev.target.closest('[data-res]'); if (!r) return;
      const c = cols.find(x => x.k === r.dataset.res); est.anchos[c.k] = autoAncho(c, filtradas()); guardar(); pintar();
    });
    $el.addEventListener('mousedown', ev => {
      const r = ev.target.closest('[data-res]'); if (!r || ev.detail > 1) return;
      ev.preventDefault();
      const c = cols.find(x => x.k === r.dataset.res), x0 = ev.clientX, w0 = ancho(c);
      const mover = e => { est.anchos[c.k] = Math.max(ANCHO_MIN, w0 + e.clientX - x0); aplicarAncho(); };
      const soltar = () => { document.removeEventListener('mousemove', mover); document.removeEventListener('mouseup', soltar); guardar(); pintar(); };
      document.addEventListener('mousemove', mover); document.addEventListener('mouseup', soltar);
    });
    function aplicarAncho() {                                           // durante el arrastre: sin volver a pintar todo
      const t = $el.querySelector('table.tbl'); if (!t) return;
      t.style.width = cols.reduce((s, c) => s + ancho(c), 0) + 'px';
      let izq = 0;
      t.querySelectorAll('col').forEach((col, i) => { col.style.width = ancho(cols[i]) + 'px'; });
      cols.forEach((c, i) => {
        const w = ancho(c) + 'px';
        t.querySelectorAll('tr').forEach(tr => { const el = tr.children[i]; if (!el || el.colSpan > 1) return; el.style.width = w; el.style.maxWidth = w; if (el.tagName === 'TH') el.style.minWidth = w; if (c.sticky) el.style.left = izq + 'px'; });
        if (c.sticky) izq += ancho(c);
      });
    }
    function limpiarFiltros() { est.filtros = {}; pintar(); }

    return {
      render(filas, o) { est.filas = filas || []; est.agrupar = !!(o && o.agrupar); pintar(); },
      filtradas, limpiarFiltros, ajustar: ajustarTodas,
    };
  }

  return { crear, _logica: logica };
});
