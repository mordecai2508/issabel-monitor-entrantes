'use strict';

const ExcelJS  = require('exceljs');
const PDFDocument = require('pdfkit');
const { MAX_EXPORT_ROWS } = require('./cdrService');

/**
 * Stream an XLSX file to the HTTP response.
 *
 * @param {object[]} rows       - Mapped CDR rows
 * @param {object}   res        - Express response object
 * @param {string}   filenameBase
 * @param {boolean}  [truncated]
 * @param {string[]|null} [headers]   - Column header labels; defaults to inbound labels if null
 * @param {string}   [sheetName]      - Worksheet name; defaults to 'Entrantes'
 */
async function toXlsx(rows, res, filenameBase, truncated = false, headers = null, sheetName = 'Entrantes') {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
  if (truncated) {
    res.setHeader('X-Truncated', 'true');
  }

  const workbook  = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const worksheet = workbook.addWorksheet(sheetName);

  // Header row
  const effectiveHeaders = headers !== null ? headers : [
    'Fecha/Hora', 'Origen', 'Destino', 'Troncal',
    'Duración (s)', 'Seg. facturados', 'Estado',
  ];
  const headerRow = worksheet.addRow(effectiveHeaders);
  headerRow.commit();

  // Data rows
  for (const r of rows) {
    const dataRow = worksheet.addRow([
      r.calldate, r.src, r.dst, r.channel || r.dstchannel,
      r.duration, r.billsec, r.disposition,
    ]);
    dataRow.commit();
  }

  await worksheet.commit();
  await workbook.commit();
}

/**
 * Helper: draw a table on a PDFDocument.
 * Handles page breaks when content overflows.
 *
 * @param {PDFDocument} doc
 * @param {string[]}    headers
 * @param {object[]}    rows
 * @param {string[]}    [rowKeys] - field keys to read from each row; defaults to inbound keys
 */
function drawTable(doc, headers, rows, rowKeys = null) {
  const effectiveKeys = rowKeys || ['calldate', 'src', 'dst', 'channel', 'duration', 'billsec', 'disposition'];
  const colWidths = [130, 80, 60, 110, 65, 70, 75];
  const rowHeight = 16;
  const margin    = 40;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  let x = margin;
  let y = doc.y + 8;

  // Draw header row background
  doc.rect(x, y, tableWidth, rowHeight).fill('#1e3a5f');

  // Draw header text
  doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
  let cx = x;
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i], cx + 3, y + 4, { width: colWidths[i] - 6, lineBreak: false });
    cx += colWidths[i];
  }
  y += rowHeight;

  // Draw data rows
  doc.font('Helvetica').fontSize(6.5).fillColor('#111111');
  let alternate = false;
  for (const r of rows) {
    // Page break check
    if (y + rowHeight > doc.page.height - margin) {
      doc.addPage();
      y = margin;
      // Redraw header on new page
      doc.rect(x, y, tableWidth, rowHeight).fill('#1e3a5f');
      doc.fillColor('#ffffff').fontSize(7).font('Helvetica-Bold');
      cx = x;
      for (let i = 0; i < headers.length; i++) {
        doc.text(headers[i], cx + 3, y + 4, { width: colWidths[i] - 6, lineBreak: false });
        cx += colWidths[i];
      }
      y += rowHeight;
      doc.font('Helvetica').fontSize(6.5).fillColor('#111111');
      alternate = false;
    }

    if (alternate) {
      doc.rect(x, y, tableWidth, rowHeight).fill('#f5f5f5');
    }

    const values = effectiveKeys.map(k => String(r[k] != null ? r[k] : ''));
    doc.fillColor('#111111');
    cx = x;
    for (let i = 0; i < values.length; i++) {
      doc.text(values[i], cx + 3, y + 4, { width: colWidths[i] - 6, lineBreak: false });
      cx += colWidths[i];
    }

    // Bottom border
    doc.moveTo(x, y + rowHeight).lineTo(x + tableWidth, y + rowHeight).stroke('#dddddd');

    y += rowHeight;
    alternate = !alternate;
  }
}

/**
 * Stream a PDF file to the HTTP response.
 *
 * @param {object[]} rows         - Mapped CDR rows
 * @param {object}   res          - Express response object
 * @param {string}   filenameBase
 * @param {object}   filters      - { from, to, trunk?, origin?, extension?, dest?, disposition? }
 * @param {boolean}  [truncated]
 * @param {string|null}   [title]      - Document title; defaults to 'Llamadas Entrantes — Búsqueda'
 * @param {string[]|null} [pdfHeaders] - Table column headers; defaults to inbound labels
 * @param {string[]|null} [rowKeys]    - Row field keys for table columns; defaults to inbound keys
 */
function toPdf(rows, res, filenameBase, filters, truncated = false, title = null, pdfHeaders = null, rowKeys = null) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  const effectiveTitle = title !== null ? title : 'Llamadas Entrantes — Búsqueda';

  // Title
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(effectiveTitle, { align: 'center' });
  doc.moveDown(0.4);

  // Date range
  doc.fontSize(10).font('Helvetica').fillColor('#333333')
    .text(`Rango de fechas: ${filters.from} — ${filters.to}`, { align: 'center' });
  doc.moveDown(0.3);

  // Active filters
  const activeFilters = [];
  if (filters.trunk)       activeFilters.push(`Troncal: ${filters.trunk}`);
  if (filters.origin)      activeFilters.push(`Origen: ${filters.origin}`);
  if (filters.extension)   activeFilters.push(`Extensión: ${filters.extension}`);
  if (filters.dest)        activeFilters.push(`Destino: ${filters.dest}`);
  if (filters.disposition) activeFilters.push(`Estado: ${filters.disposition}`);
  if (activeFilters.length > 0) {
    doc.fontSize(9).fillColor('#555555')
      .text(`Filtros activos: ${activeFilters.join(' | ')}`, { align: 'center' });
    doc.moveDown(0.3);
  }

  // Generation timestamp
  doc.fontSize(8).fillColor('#888888')
    .text(`Generado: ${new Date().toISOString()}`, { align: 'center' });
  doc.moveDown(0.3);

  // Truncation warning
  if (truncated) {
    doc.fontSize(9).fillColor('#cc0000')
      .text(`AVISO: El resultado fue truncado a ${MAX_EXPORT_ROWS} registros.`, { align: 'center' });
    doc.moveDown(0.3);
  }

  if (rows.length === 0) {
    doc.fontSize(11).fillColor('#555555')
      .text('No se encontraron registros para los filtros seleccionados.', { align: 'center' });
  } else {
    const effectiveHeaders = pdfHeaders !== null ? pdfHeaders : ['Fecha/Hora', 'Origen', 'Destino', 'Troncal', 'Duración (s)', 'Seg. fact.', 'Estado'];
    drawTable(doc, effectiveHeaders, rows, rowKeys);
  }

  doc.end();
}

module.exports = { toXlsx, toPdf };
