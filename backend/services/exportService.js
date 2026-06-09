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
 */
async function toXlsx(rows, res, filenameBase, truncated = false) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);
  if (truncated) {
    res.setHeader('X-Truncated', 'true');
  }

  const workbook  = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const worksheet = workbook.addWorksheet('Entrantes');

  // Header row
  const headerRow = worksheet.addRow([
    'Fecha/Hora', 'Origen', 'Destino', 'Troncal',
    'Duración (s)', 'Seg. facturados', 'Estado',
  ]);
  headerRow.commit();

  // Data rows
  for (const r of rows) {
    const dataRow = worksheet.addRow([
      r.calldate, r.src, r.dst, r.channel,
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
 */
function drawTable(doc, headers, rows) {
  const colWidths = [130, 80, 60, 110, 65, 70, 75];
  const rowHeight = 16;
  const margin    = 40;
  const pageWidth = doc.page.width;
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

    const values = [
      r.calldate, r.src, r.dst, r.channel,
      String(r.duration), String(r.billsec), r.disposition,
    ];
    doc.fillColor('#111111');
    cx = x;
    for (let i = 0; i < values.length; i++) {
      doc.text(String(values[i] || ''), cx + 3, y + 4, { width: colWidths[i] - 6, lineBreak: false });
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
 * @param {object}   filters      - { from, to, trunk?, origin?, disposition? }
 * @param {boolean}  [truncated]
 */
function toPdf(rows, res, filenameBase, filters, truncated = false) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4', layout: 'landscape' });
  doc.pipe(res);

  // Title
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text('Llamadas Entrantes — Búsqueda', { align: 'center' });
  doc.moveDown(0.4);

  // Date range
  doc.fontSize(10).font('Helvetica').fillColor('#333333')
    .text(`Rango de fechas: ${filters.from} — ${filters.to}`, { align: 'center' });
  doc.moveDown(0.3);

  // Active filters
  const activeFilters = [];
  if (filters.trunk)       activeFilters.push(`Troncal: ${filters.trunk}`);
  if (filters.origin)      activeFilters.push(`Origen: ${filters.origin}`);
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
    const headers = ['Fecha/Hora', 'Origen', 'Destino', 'Troncal', 'Duración (s)', 'Seg. fact.', 'Estado'];
    drawTable(doc, headers, rows);
  }

  doc.end();
}

module.exports = { toXlsx, toPdf };
