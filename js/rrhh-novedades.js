/* ==========================================================================
   RRHH · novedades para Delta (etapa 2 de Fichadas). Lógica pura, sin pantalla ni base: validar renglones y armar el Excel de importación.
   Formato del Excel (el de «Novedades registradas» de Delta): Fecha, Número de legajo, Código de novedad, Cantidad, Valor, Observaciones. Sin C.U.I.L.
   Las horas extra NO se generan acá: las calcula Delta desde las fichadas depuradas.
   ========================================================================== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.RRHHNovedades = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  /** Códigos que ya vimos en el histórico de novedades de la empresa. «tipo» = qué se carga (estoy suponiendo según el histórico; no es una lista cerrada: se puede escribir otro código). */
  const CODIGOS = [
    { codigo: 'HSENF', descripcion: 'Enfermedad', tipo: 'horas' }, { codigo: 'LICART', descripcion: 'Licencia por ART', tipo: 'horas' },
    { codigo: 'HSJUS', descripcion: 'Horas justificadas', tipo: 'horas' }, { codigo: 'HSJUSVA', descripcion: 'Horas justificadas', tipo: 'horas' },
    { codigo: 'HSINJ', descripcion: 'Ausencia injustificada', tipo: 'horas' }, { codigo: 'HSDESC', descripcion: '', tipo: 'horas' },
    { codigo: 'VACJOR', descripcion: 'Vacaciones', tipo: 'horas' }, { codigo: 'VACM', descripcion: 'Vacaciones', tipo: 'horas' },
    { codigo: 'LICSSDO', descripcion: 'Licencia sin goce', tipo: 'horas' }, { codigo: 'LICCUIFAM', descripcion: 'Licencia por cuidado familiar', tipo: 'horas' },
    { codigo: 'MATERNIDAD', descripcion: 'Maternidad', tipo: 'horas' }, { codigo: 'MATRIMONIO', descripcion: 'Matrimonio', tipo: 'horas' }, { codigo: 'NACIMIENTO', descripcion: 'Nacimiento', tipo: 'horas' },
    { codigo: 'FALLECIM', descripcion: 'Fallecimiento', tipo: 'horas' }, { codigo: 'EXAMEN', descripcion: 'Examen', tipo: 'horas' }, { codigo: 'MÉDICO', descripcion: 'Médico', tipo: 'horas' },
    { codigo: 'TRAMITE', descripcion: 'Trámite', tipo: 'horas' }, { codigo: 'SANGRE', descripcion: 'Donación de sangre', tipo: 'horas' }, { codigo: 'MUDANZA', descripcion: 'Mudanza', tipo: 'horas' },
    { codigo: 'ADELANTO', descripcion: '', tipo: 'importe' }, { codigo: 'DESCADEL', descripcion: '', tipo: 'importe' }];
  const HEADERS = ['Fecha', 'Número de legajo', 'Código de novedad', 'Cantidad', 'Valor', 'Observaciones'];
  const num2 = x => (typeof x === 'number' ? x : Number(String(x == null ? '' : x).trim().replace(',', '.')));
  /** Normaliza lo que escribe la persona. Cantidad y valor aceptan coma decimal («7,5»). */
  function normalizar(n) {
    const cant = n.cantidad === '' || n.cantidad == null ? 0 : num2(n.cantidad), val = n.valor === '' || n.valor == null ? 0 : num2(n.valor);
    return { fecha: String(n.fecha || '').trim(), legajo: Number(n.legajo), codigo: String(n.codigo || '').trim().toUpperCase(), cantidad: cant, valor: val,
      observaciones: n.observaciones == null ? null : (String(n.observaciones).trim() || null), origen: n.origen === 'fichadas' ? 'fichadas' : 'manual' };
  }
  /** → lista de errores (vacía si está bien). */
  function validar(n) {
    const e = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.fecha) || isNaN(new Date(n.fecha + 'T12:00:00'))) e.push('La fecha no es válida.');
    if (!Number.isInteger(n.legajo) || n.legajo <= 0) e.push('El legajo tiene que ser un número.');
    if (!n.codigo) e.push('Falta el código de novedad.'); else if (n.codigo.length > 30) e.push('El código es demasiado largo.');
    if (!(n.cantidad >= 0) || !(n.valor >= 0)) e.push('Cantidad y valor no pueden ser negativos.');
    else if (!(n.cantidad > 0 || n.valor > 0)) e.push('Cargá una cantidad o un valor.');
    if (n.observaciones && n.observaciones.length > 200) e.push('Las observaciones pasan los 200 caracteres.');
    return e;
  }
  const clave = n => n.legajo + '|' + n.fecha + '|' + n.codigo;
  /** Renglones ya cargados con el mismo legajo, fecha y código (para avisar antes de duplicar). */
  const duplicada = (n, existentes) => existentes.some(x => clave(x) === clave(n));
  /** Número de serie de Excel de una fecha ISO (sin pasar por Date: evita el corrimiento de un día por zona horaria). */
  function serial(iso) { const [y, m, d] = iso.split('-').map(Number); return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000); }
  /** Filas del Excel de Delta, ordenadas por fecha y legajo. La primera es el encabezado; la fecha va como número de serie (formatearla dd/mm/yyyy al escribir). */
  function filasDelta(novs) {
    const o = [...novs].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.legajo - b.legajo || a.codigo.localeCompare(b.codigo));
    return [HEADERS.slice()].concat(o.map(n => [serial(n.fecha), n.legajo, n.codigo, n.cantidad, n.valor, n.observaciones || '']));
  }
  return { CODIGOS, HEADERS, normalizar, validar, clave, duplicada, serial, filasDelta };
});
