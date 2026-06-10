'use strict';

// ── Cabeceras compartidas para tablas de detalle (inbound/outbound) ──────────
// Extraídas de routes/inbound.js (defaults de exportService) y routes/outbound.js
// para reutilizarlas en reportService/exportService sin duplicar literales.
// No cambia el comportamiento de /api/calls/inbound/export ni /api/calls/outbound/export.

const INBOUND_XLSX_HEADERS = ['Fecha/Hora', 'Origen', 'Destino', 'Troncal', 'Duración (s)', 'Seg. facturados', 'Estado'];
const INBOUND_PDF_HEADERS  = ['Fecha/Hora', 'Origen', 'Destino', 'Troncal', 'Duración (s)', 'Seg. fact.', 'Estado'];
const INBOUND_ROW_KEYS     = ['calldate', 'src', 'dst', 'channel', 'duration', 'billsec', 'disposition'];

const OUTBOUND_XLSX_HEADERS = ['Fecha/Hora', 'Extensión', 'Destino', 'Troncal', 'Duración (s)', 'Seg. facturados', 'Estado'];
const OUTBOUND_PDF_HEADERS  = ['Fecha/Hora', 'Extensión', 'Destino', 'Troncal', 'Duración (s)', 'Seg. fact.', 'Estado'];
const OUTBOUND_ROW_KEYS     = ['calldate', 'src', 'dst', 'dstchannel', 'duration', 'billsec', 'disposition'];

module.exports = {
  INBOUND_XLSX_HEADERS,
  INBOUND_PDF_HEADERS,
  INBOUND_ROW_KEYS,
  OUTBOUND_XLSX_HEADERS,
  OUTBOUND_PDF_HEADERS,
  OUTBOUND_ROW_KEYS,
};
