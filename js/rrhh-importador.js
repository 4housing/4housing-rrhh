/* ==========================================================================
   RRHH · parseo de informes (handoff §3). Sin dependencias ni DOM.
   Entrada: matriz de filas (primera fila = encabezados), como la da
   XLSX.utils.sheet_to_json(hoja, {header:1, raw:true, defval:null}).
   Salida: solo los campos que la app guarda. Se DESCARTAN C.U.I.L., teléfono,
   correo y demás datos personales (handoff §3.3, §8).
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RRHHImportador = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const norm = s => String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  /** Mapa campo -> índice de columna según alternativas de encabezado (normalizadas, por prefijo). */
  function columnas(encabezado, requeridas) {
    const h = encabezado.map(norm);
    const idx = {}, faltan = [];
    for (const [campo, alternativas] of Object.entries(requeridas)) {
      const i = h.findIndex(x => alternativas.some(a => x === a || x.startsWith(a + ' ')));
      if (i < 0) faltan.push(campo); else idx[campo] = i;
    }
    return { idx, faltan };
  }

  /** Columnas OPCIONALES: devuelve solo las que existen (campo -> índice). */
  function columnasOpc(encabezado, opcionales) {
    const h = encabezado.map(norm), idx = {};
    for (const [campo, alternativas] of Object.entries(opcionales)) {
      const i = h.findIndex(x => alternativas.some(a => x === a || x.startsWith(a + ' ')));
      if (i >= 0) idx[campo] = i;
    }
    return idx;
  }

  /** ¿La primera fila parece el encabezado de este tipo de informe? (para elegir la hoja) */
  function pareceInforme(matriz, tipo) {
    if (!matriz || !matriz.length) return false;
    const h = matriz[0].map(norm);
    const clave = { resumen: 'nro de concepto', novedades: 'cod novedad', padron: 'apellido y nombre' }[tipo];
    const tieneLegajo = h.includes('legajo') || (tipo === 'padron' && h.includes('numero'));   // el Excel de control llama «Número» al legajo
    return tieneLegajo && h.some(x => x.startsWith(clave));
  }

  const MS_DIA = 86400000;
  /** Date | serial de Excel | 'AAAA-MM-DD' | 'DD/MM/AAAA' -> 'AAAA-MM-DD' (o null). */
  function aFechaISO(v) {
    if (v == null || v === '') return null;
    const p2 = n => String(n).padStart(2, '0');
    if (v instanceof Date && !isNaN(v)) {
      // SheetJS crea las fechas en hora local: usar getters locales evita correr un día
      return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    }
    if (typeof v === 'number' && isFinite(v)) {
      const d = new Date(Math.round((v - 25569) * MS_DIA));
      return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate());
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s);
    if (m) return m[3] + '-' + p2(m[2]) + '-' + p2(m[1]);
    // Períodos sin día (así vienen algunos meses del histórico): 'AAAA-MM' y 'MM/AAAA' -> primer día del mes
    m = /^(\d{4})-(\d{2})$/.exec(s);
    if (m && +m[2] >= 1 && +m[2] <= 12) return m[1] + '-' + m[2] + '-01';
    m = /^(\d{1,2})\/(\d{4})$/.exec(s);
    if (m && +m[1] >= 1 && +m[1] <= 12) return m[2] + '-' + p2(m[1]) + '-01';
    return null;
  }

  /** Número estricto: acepta number, o string con punto decimal. Vacío -> null. NaN -> undefined (error). */
  function aNumero(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : undefined;
    const s = String(v).trim().replace(/\s/g, '');
    return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : undefined;
  }
  const aEntero = v => { const n = aNumero(v); return n == null || n === undefined ? n : (Number.isInteger(n) ? n : undefined); };
  const texto = v => (v == null ? null : String(v).trim() || null);

  function moda(valores) {
    const c = new Map();
    for (const v of valores) c.set(v, (c.get(v) || 0) + 1);
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  }

  function resultado(extra) { return Object.assign({ filas: [], periodo: null, errores: [], advertencias: [] }, extra); }
  const MAX_ERRORES = 50;

  /** Resumen de conceptos liquidados (4H o 4H OC), handoff §3.1. */
  function parseResumen(matriz) {
    const out = resultado();
    const { idx, faltan } = columnas(matriz[0] || [], {
      legajo: ['legajo'], tipo_liquidacion: ['tipo de liquidacion'], periodo: ['periodo liquidado'],
      nro_concepto: ['nro de concepto'], importe: ['importe liquidado'],
      cantidad: ['cantidad liquidada'], valor: ['valor liquidado'],
    });
    if (faltan.length) { out.errores.push('Faltan columnas: ' + faltan.join(', ')); return out; }
    // Descripción y grupo del concepto: no son datos personales; el esquema oficial los guarda en cada fila.
    const opc = columnasOpc(matriz[0], { descripcion: ['desc de concepto'], grupo: ['grupo de concepto'] });
    const periodos = [];
    for (let i = 1; i < matriz.length; i++) {
      const r = matriz[i];
      if (!r || r[idx.legajo] == null || r[idx.legajo] === '') continue;   // fila vacía
      const legajo = aEntero(r[idx.legajo]), nro = aEntero(r[idx.nro_concepto]);
      const importe = aNumero(r[idx.importe]), cantidad = aNumero(r[idx.cantidad]), valor = aNumero(r[idx.valor]);
      const tipo = texto(r[idx.tipo_liquidacion]), per = aFechaISO(r[idx.periodo]);
      const mal = [];
      if (legajo == null || legajo === undefined) mal.push('legajo');
      if (nro == null || nro === undefined) mal.push('nro. de concepto');
      if (importe === undefined) mal.push('importe');
      if (cantidad === undefined) mal.push('cantidad');
      if (valor === undefined) mal.push('valor');
      if (!tipo) mal.push('tipo de liquidación');
      if (!per) mal.push('período');
      if (mal.length) { if (out.errores.length < MAX_ERRORES) out.errores.push('Fila ' + (i + 1) + ': dato inválido en ' + mal.join(', ')); continue; }
      periodos.push(per.slice(0, 7));
      out.filas.push({ legajo, tipo_liquidacion: tipo, nro_concepto: nro,
                       descripcion: opc.descripcion != null ? texto(r[opc.descripcion]) : null,
                       grupo: opc.grupo != null ? texto(r[opc.grupo]) : null,
                       importe: importe ?? 0, cantidad, valor });
    }
    return cerrarPeriodo(out, periodos, 'Período liquidado');
  }

  /** Novedades registradas (4H o 4H OC), handoff §3.2. */
  function parseNovedades(matriz) {
    const out = resultado();
    const { idx, faltan } = columnas(matriz[0] || [], {
      fecha: ['fecha'], legajo: ['legajo'], cod_novedad: ['cod novedad'], novedad: ['novedad'],
      cantidad: ['cantidad'], expresion: ['expresion'], valor: ['valor'], origen: ['origen'],
    });
    if (faltan.length) { out.errores.push('Faltan columnas: ' + faltan.join(', ')); return out; }
    const opc = columnasOpc(matriz[0], { departamento: ['departamento'] });
    const periodos = [];
    for (let i = 1; i < matriz.length; i++) {
      const r = matriz[i];
      if (!r || r[idx.legajo] == null || r[idx.legajo] === '') continue;
      const legajo = aEntero(r[idx.legajo]), fecha = aFechaISO(r[idx.fecha]);
      const cantidad = aNumero(r[idx.cantidad]), valor = aNumero(r[idx.valor]);
      const cod = texto(r[idx.cod_novedad]);
      const mal = [];
      if (legajo == null || legajo === undefined) mal.push('legajo');
      if (!fecha) mal.push('fecha');
      if (!cod) mal.push('código de novedad');
      if (cantidad === undefined) mal.push('cantidad');
      if (valor === undefined) mal.push('valor');
      if (mal.length) { if (out.errores.length < MAX_ERRORES) out.errores.push('Fila ' + (i + 1) + ': dato inválido en ' + mal.join(', ')); continue; }
      periodos.push(fecha.slice(0, 7));
      out.filas.push({ fecha, legajo, cod_novedad: cod, novedad: texto(r[idx.novedad]), cantidad,
                       expresion: texto(r[idx.expresion]), valor, origen: texto(r[idx.origen]),
                       departamento: opc.departamento != null ? texto(r[opc.departamento]) : null });
    }
    return cerrarPeriodo(out, periodos, 'Fecha');
  }

  function cerrarPeriodo(out, periodos, que) {
    if (!out.filas.length && !out.errores.length) out.errores.push('El archivo no tiene filas con datos.');
    if (periodos.length) {
      const [p, n] = moda(periodos);
      out.periodo = p;
      const otros = periodos.length - n;
      if (otros) out.advertencias.push(otros + ' fila(s) con ' + que + ' fuera de ' + p + '.');
    }
    return out;
  }

  /**
   * Padrón (handoff §3.3): SOLO legajo, nombre y departamento.
   * Teléfono, C.U.I.L. y correo se ignoran a propósito: ni se leen.
   */
  function parsePadron(matriz) {
    const out = resultado();
    const { idx, faltan } = columnas(matriz[0] || [], {
      legajo: ['legajo', 'numero'], nombre: ['apellido y nombre', 'nombre'], departamento: ['departamento', 'descripcion de departamento'],
    });
    if (faltan.length) { out.errores.push('Faltan columnas: ' + faltan.join(', ')); return out; }
    const vistos = new Set();
    for (let i = 1; i < matriz.length; i++) {
      const r = matriz[i];
      if (!r || r[idx.legajo] == null || r[idx.legajo] === '') continue;
      const legajo = aEntero(r[idx.legajo]), nombre = texto(r[idx.nombre]);
      if (legajo == null || legajo === undefined || !nombre) {
        if (out.errores.length < MAX_ERRORES) out.errores.push('Fila ' + (i + 1) + ': legajo o nombre inválido'); continue;
      }
      if (vistos.has(legajo)) { out.advertencias.push('Legajo ' + legajo + ' repetido (fila ' + (i + 1) + '): se ignora.'); continue; }
      vistos.add(legajo);
      out.filas.push({ legajo, nombre, departamento: texto(r[idx.departamento]) });
    }
    if (!out.filas.length && !out.errores.length) out.errores.push('El archivo no tiene filas con datos.');
    return out;
  }

  // Excel de control mensual (LIQUIDACION_MENSUAL_SUELDOS_AAAAMM.xlsx): trae el recibo 4H, la liquidación OC y los legajos en un solo archivo.
  // Las hojas derivadas (Project, Resumen, SUSS…) NO son informes y nunca se importan.
  const sinEspacios = s => norm(s).replace(/ /g, '');
  const HOJAS_DERIVADAS = ['project', 'resumen', 'suss', 'ope', 'admin', 'gcia', 'td', 'conceptos'];
  const esHojaDerivada = nombre => HOJAS_DERIVADAS.includes(sinEspacios(nombre));
  function hojasDeControl(nombres) {
    const buscar = x => (nombres || []).find(n => sinEspacios(n) === sinEspacios(x)) || null;
    return { cuatroH: buscar('Liquidacion Mensual'), oc: buscar('Liquidacion Mensual (2)'), padron: buscar('Legajos') };
  }

  /** Legajos liquidados que no están en el padrón (handoff §7.3). */
  function legajosSinPadron(filasLiquidacion, padron) {
    const en = new Set(padron.map(p => p.legajo));
    return [...new Set(filasLiquidacion.map(f => f.legajo))].filter(l => !en.has(l)).sort((a, b) => a - b);
  }

  return { parseResumen, parseNovedades, parsePadron, legajosSinPadron, pareceInforme, aFechaISO, norm, esHojaDerivada, hojasDeControl };
});
