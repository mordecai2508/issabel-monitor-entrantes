'use strict';

const fs = require('fs');

const ExcelJS  = require('exceljs');
const PDFDocument = require('pdfkit');
const { MAX_EXPORT_ROWS } = require('./cdrService');
const {
  INBOUND_XLSX_HEADERS,
  INBOUND_PDF_HEADERS,
  INBOUND_ROW_KEYS,
  OUTBOUND_XLSX_HEADERS,
  OUTBOUND_PDF_HEADERS,
  OUTBOUND_ROW_KEYS,
} = require('./reportConstants');

// ── Report titles per type (R13, R18-R28) ───────────────────────────────────
const REPORT_TITLES = {
  executive:  'Resumen Ejecutivo',
  inbound:    'Llamadas Entrantes',
  outbound:   'Llamadas Salientes',
  extensions: 'Actividad de Extensiones',
  trunks:     'Actividad de Troncales',
};

const RANKING_HEADERS = ['Nombre', 'Total', 'Contestadas', 'No contestadas', 'Ocupado', 'Fallidas', 'Dur. media (s)'];
const RANKING_ROW_KEYS = ['name', 'total', 'answered', 'no_answer', 'busy', 'failed', 'avg_duration'];

const DISPOSITION_LABELS = {
  ANSWERED:    'Contestadas',
  'NO ANSWER': 'No contestadas',
  BUSY:        'Ocupado',
  FAILED:      'Fallidas',
};

const DISPOSITIONS_ORDER = ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'];

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

/**
 * Draw a simple vertical bar chart on a PDFDocument using only vector
 * primitives (rect, text, moveTo/lineTo) — same visual style as drawTable
 * (#1e3a5f / #3b82f6 palette). Bars are scaled relative to the maximum value.
 *
 * @param {PDFDocument} doc
 * @param {object} opts
 * @param {string}   opts.title
 * @param {string[]} opts.labels
 * @param {number[]} opts.values
 * @param {number}   opts.x
 * @param {number}   opts.y
 * @param {number}   opts.width
 * @param {number}   opts.height
 * @param {string}   [opts.color]
 * @returns {number} the y coordinate immediately below the chart
 */
function drawBarChart(doc, { title, labels, values, x, y, width, height, color = '#3b82f6' }) {
  const titleHeight = 18;
  const labelHeight = 14;
  const chartTop    = y + titleHeight;
  const chartHeight = height - titleHeight - labelHeight;
  const chartBottom = chartTop + chartHeight;

  // Title
  doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(title, x, y, { width, align: 'left' });

  // Axis line
  doc.moveTo(x, chartBottom).lineTo(x + width, chartBottom).stroke('#cccccc');

  if (!labels || labels.length === 0) {
    doc.fontSize(9).font('Helvetica').fillColor('#888888')
      .text('Sin datos para el rango seleccionado', x, chartTop + chartHeight / 2 - 6, { width, align: 'center' });
    return y + height;
  }

  const maxValue  = Math.max(1, ...values);
  const slotWidth = width / labels.length;
  const barWidth  = Math.min(40, slotWidth * 0.6);

  for (let i = 0; i < labels.length; i++) {
    const value     = Number(values[i]) || 0;
    const barHeight = chartHeight > 0 ? (value / maxValue) * (chartHeight - 14) : 0;
    const slotX     = x + i * slotWidth;
    const barX      = slotX + (slotWidth - barWidth) / 2;
    const barY      = chartBottom - barHeight;

    // Value label above the bar
    doc.fontSize(7).font('Helvetica').fillColor('#333333')
      .text(String(value), slotX, barY - 10, { width: slotWidth, align: 'center', lineBreak: false });

    // Bar
    doc.rect(barX, barY, barWidth, barHeight).fill(color);

    // Category label below the axis
    doc.fontSize(7).font('Helvetica').fillColor('#555555')
      .text(String(labels[i]), slotX, chartBottom + 3, { width: slotWidth, align: 'center', lineBreak: false });
  }

  return y + height;
}

/**
 * Draw the shared report header (logo, company name, report title,
 * date range, generation timestamp) at the top of the current PDF page.
 *
 * @param {PDFDocument} doc
 * @param {object} opts
 * @param {string} opts.type
 * @param {string} opts.from
 * @param {string} opts.to
 * @param {{ companyName: string, logoPath: string|null }} opts.branding
 */
function drawReportHeader(doc, { type, from, to, branding }) {
  const margin = 40;
  let textX = margin;

  // Logo (R14) — graceful degradation if not configured (R15)
  if (branding.logoPath && fs.existsSync(branding.logoPath)) {
    try {
      doc.image(branding.logoPath, margin, doc.y, { width: 60 });
      textX = margin + 70;
    } catch (err) {
      console.error('[exportService] drawReportHeader image:', err.message);
    }
  }

  const startY = doc.y;

  // Company name
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(branding.companyName, textX, startY, { align: 'left' });

  // Report title
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#1e3a5f')
    .text(REPORT_TITLES[type] || 'Reporte', textX, doc.y + 2, { align: 'left' });

  // Date range
  doc.fontSize(10).font('Helvetica').fillColor('#333333')
    .text(`Rango de fechas: ${from} — ${to}`, textX, doc.y + 4, { align: 'left' });

  // Generation timestamp
  doc.fontSize(8).font('Helvetica').fillColor('#888888')
    .text(`Generado: ${new Date().toISOString()}`, textX, doc.y + 2, { align: 'left' });

  doc.y = Math.max(doc.y, startY + 60) + 10;
  doc.x = margin;

  // Separator line
  doc.moveTo(margin, doc.y).lineTo(doc.page.width - margin, doc.y).stroke('#dddddd');
  doc.moveDown(0.6);
}

/**
 * Draw a centered "no data" message in the body of the report.
 * @param {PDFDocument} doc
 */
function drawNoDataMessage(doc) {
  doc.moveDown(0.5);
  doc.fontSize(11).font('Helvetica').fillColor('#555555')
    .text('Sin datos para el rango seleccionado', { align: 'center' });
  doc.moveDown(0.5);
}

/**
 * Render the body of the `executive` report (R18-R20).
 * @param {PDFDocument} doc
 * @param {object} data - shape returned by reportService.collectReportData(type='executive')
 */
function renderExecutiveBody(doc, data) {
  const margin = 40;
  const contentWidth = doc.page.width - margin * 2;
  const { overallTotals, trend, inboundTotals, outboundTotals, topExtensions, topTrunks } = data;

  // KPI summary (R18)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Resumen general');
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica').fillColor('#111111');
  doc.text(`Total de llamadas: ${overallTotals.total}`);
  doc.text(`Contestadas: ${overallTotals.answered}`);
  doc.text(`No contestadas: ${overallTotals.no_answer}`);
  doc.text(`Ocupado: ${overallTotals.busy}`);
  doc.text(`Fallidas: ${overallTotals.failed}`);
  doc.text(`Duración media (s): ${overallTotals.avg_duration}`);
  doc.moveDown(0.3);

  doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e3a5f').text('Entrantes');
  doc.fontSize(9).font('Helvetica').fillColor('#111111')
    .text(`Total: ${inboundTotals.total} | Contestadas: ${inboundTotals.ANSWERED} | No contestadas: ${inboundTotals['NO ANSWER']} | Ocupado: ${inboundTotals.BUSY} | Fallidas: ${inboundTotals.FAILED}`);
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#1e3a5f').text('Salientes');
  doc.fontSize(9).font('Helvetica').fillColor('#111111')
    .text(`Total: ${outboundTotals.total} | Contestadas: ${outboundTotals.ANSWERED} | No contestadas: ${outboundTotals['NO ANSWER']} | Ocupado: ${outboundTotals.BUSY} | Fallidas: ${outboundTotals.FAILED}`);
  doc.moveDown(0.6);

  // Trend chart (R19)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Tendencia diaria');
  doc.moveDown(0.2);
  if (trend.length === 0) {
    drawNoDataMessage(doc);
  } else {
    const chartHeight = 140;
    if (doc.y + chartHeight > doc.page.height - margin) doc.addPage();
    const newY = drawBarChart(doc, {
      title:  'Llamadas por día',
      labels: trend.map(p => p.period_label),
      values: trend.map(p => p.total),
      x: margin, y: doc.y, width: contentWidth, height: chartHeight,
    });
    doc.y = newY;
    doc.moveDown(0.6);
  }

  // Top-5 extensions (R20)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Top 5 extensiones');
  doc.moveDown(0.2);
  if (topExtensions.length === 0) {
    drawNoDataMessage(doc);
  } else {
    drawTable(doc, RANKING_HEADERS, topExtensions, RANKING_ROW_KEYS);
    doc.y += topExtensions.length * 16 + 16 + 8;
  }
  doc.moveDown(0.6);

  // Top-5 trunks (R20)
  if (doc.y + 60 > doc.page.height - margin) doc.addPage();
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Top 5 troncales');
  doc.moveDown(0.2);
  if (topTrunks.length === 0) {
    drawNoDataMessage(doc);
  } else {
    drawTable(doc, RANKING_HEADERS, topTrunks, RANKING_ROW_KEYS);
    doc.y += topTrunks.length * 16 + 16 + 8;
  }
}

/**
 * Render the body of the `inbound`/`outbound` reports (R21-R24).
 * @param {PDFDocument} doc
 * @param {object} data - shape returned by reportService.collectReportData(type='inbound'|'outbound')
 */
function renderCallsBody(doc, data) {
  const margin = 40;
  const contentWidth = doc.page.width - margin * 2;
  const { rows, summary, truncated } = data;

  const isOutbound = data.type === 'outbound';
  const pdfHeaders = isOutbound ? OUTBOUND_PDF_HEADERS : INBOUND_PDF_HEADERS;
  const rowKeys    = isOutbound ? OUTBOUND_ROW_KEYS    : INBOUND_ROW_KEYS;

  // Summary by disposition (R21/R23)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Resumen por disposición');
  doc.moveDown(0.3);
  doc.fontSize(9).font('Helvetica').fillColor('#111111');
  doc.text(`Total: ${summary.total}`);
  for (const d of DISPOSITIONS_ORDER) {
    doc.text(`${DISPOSITION_LABELS[d]}: ${summary[d]}`);
  }
  if (truncated) {
    doc.fontSize(9).fillColor('#cc0000')
      .text(`AVISO: El resultado fue truncado a ${MAX_EXPORT_ROWS} registros.`);
  }
  doc.moveDown(0.6);

  // Disposition distribution chart (R22/R24)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Distribución por disposición');
  doc.moveDown(0.2);
  if (summary.total === 0) {
    drawNoDataMessage(doc);
  } else {
    const chartHeight = 140;
    if (doc.y + chartHeight > doc.page.height - margin) doc.addPage();
    const newY = drawBarChart(doc, {
      title:  'Llamadas por disposición',
      labels: DISPOSITIONS_ORDER.map(d => DISPOSITION_LABELS[d]),
      values: DISPOSITIONS_ORDER.map(d => summary[d]),
      x: margin, y: doc.y, width: contentWidth, height: chartHeight,
    });
    doc.y = newY;
    doc.moveDown(0.6);
  }

  // Detail table (R21/R23)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text('Detalle de llamadas');
  doc.moveDown(0.2);
  if (rows.length === 0) {
    drawNoDataMessage(doc);
  } else {
    if (doc.y + 40 > doc.page.height - margin) doc.addPage();
    drawTable(doc, pdfHeaders, rows, rowKeys);
  }
}

/**
 * Render the body of the `extensions`/`trunks` reports (R25-R28).
 * @param {PDFDocument} doc
 * @param {object} data - shape returned by reportService.collectReportData(type='extensions'|'trunks')
 */
function renderRankingBody(doc, data) {
  const margin = 40;
  const contentWidth = doc.page.width - margin * 2;
  const { rankings, type } = data;
  const label = type === 'extensions' ? 'extensiones' : 'troncales';

  // Top-N chart (R26/R28)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text(`Top ${label} por volumen de llamadas`);
  doc.moveDown(0.2);
  if (rankings.length === 0) {
    drawNoDataMessage(doc);
  } else {
    const chartHeight = 160;
    if (doc.y + chartHeight > doc.page.height - margin) doc.addPage();
    const newY = drawBarChart(doc, {
      title:  `Total de llamadas por ${type === 'extensions' ? 'extensión' : 'troncal'}`,
      labels: rankings.map(r => r.name),
      values: rankings.map(r => r.total),
      x: margin, y: doc.y, width: contentWidth, height: chartHeight,
    });
    doc.y = newY;
    doc.moveDown(0.6);
  }

  // Ranking table (R25/R27)
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#1e3a5f').text(`Ranking de ${label}`);
  doc.moveDown(0.2);
  if (rankings.length === 0) {
    drawNoDataMessage(doc);
  } else {
    if (doc.y + 40 > doc.page.height - margin) doc.addPage();
    drawTable(doc, RANKING_HEADERS, rankings, RANKING_ROW_KEYS);
  }
}

/**
 * Build a full multi-section report PDF and pipe it to the HTTP response.
 *
 * @param {object} res - Express response object
 * @param {object} opts
 * @param {string} opts.type         - one of reportService.REPORT_TYPES
 * @param {string} opts.from         - YYYY-MM-DD
 * @param {string} opts.to           - YYYY-MM-DD
 * @param {{ companyName: string, logoPath: string|null }} opts.branding
 * @param {object} opts.data         - shape returned by reportService.collectReportData
 * @param {string} opts.filenameBase
 */
function buildReportPdf(res, { type, from, to, branding, data, filenameBase }) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.pdf"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  drawReportHeader(doc, { type, from, to, branding });

  if (type === 'executive') {
    renderExecutiveBody(doc, data);
  } else if (type === 'inbound' || type === 'outbound') {
    renderCallsBody(doc, data);
  } else {
    renderRankingBody(doc, data);
  }

  doc.end();
}

/**
 * Write the shared header block (title, company, date range, timestamp)
 * as plain rows at the top of an Excel worksheet (R29).
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} opts.companyName
 * @param {string} opts.from
 * @param {string} opts.to
 */
function writeXlsxHeaderBlock(worksheet, { title, companyName, from, to }) {
  worksheet.addRow([title]).commit();
  worksheet.addRow([companyName]).commit();
  worksheet.addRow([`Rango de fechas: ${from} — ${to}`]).commit();
  worksheet.addRow([`Generado: ${new Date().toISOString()}`]).commit();
  worksheet.addRow([]).commit();
}

/**
 * Write a data table (header row + data rows) to an Excel worksheet.
 * If there are no rows, writes a single "Sin datos" row (R30).
 *
 * @param {ExcelJS.Worksheet} worksheet
 * @param {string[]} headers
 * @param {object[]} rows
 * @param {string[]} rowKeys
 */
function writeXlsxTable(worksheet, headers, rows, rowKeys) {
  worksheet.addRow(headers).commit();
  if (rows.length === 0) {
    worksheet.addRow(['Sin datos para el rango seleccionado']).commit();
    return;
  }
  for (const r of rows) {
    worksheet.addRow(rowKeys.map(k => r[k] != null ? r[k] : '')).commit();
  }
}

/**
 * Build a full multi-section report workbook and stream it to the HTTP response.
 *
 * @param {object} res - Express response object
 * @param {object} opts
 * @param {string} opts.type         - one of reportService.REPORT_TYPES
 * @param {string} opts.from         - YYYY-MM-DD
 * @param {string} opts.to           - YYYY-MM-DD
 * @param {{ companyName: string, logoPath: string|null }} opts.branding
 * @param {object} opts.data         - shape returned by reportService.collectReportData
 * @param {string} opts.filenameBase
 */
async function buildReportXlsx(res, { type, from, to, branding, data, filenameBase }) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filenameBase}.xlsx"`);

  const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res });
  const title = REPORT_TITLES[type] || 'Reporte';
  const headerOpts = { title, companyName: branding.companyName, from, to };

  if (type === 'executive') {
    const { overallTotals, trend, inboundTotals, outboundTotals, topExtensions, topTrunks } = data;

    const wsResumen = workbook.addWorksheet('Resumen');
    writeXlsxHeaderBlock(wsResumen, headerOpts);
    writeXlsxTable(
      wsResumen,
      ['Métrica', 'Total', 'Entrantes', 'Salientes'],
      buildExecutiveSummaryRows(overallTotals, inboundTotals, outboundTotals),
      ['metric', 'total', 'inbound', 'outbound']
    );
    await wsResumen.commit();

    const wsTrend = workbook.addWorksheet('Tendencia');
    writeXlsxHeaderBlock(wsTrend, headerOpts);
    writeXlsxTable(wsTrend, ['Fecha', 'Total', 'Contestadas', 'No contestadas', 'Ocupado', 'Fallidas', 'Dur. media (s)'], trend,
      ['period_label', 'total', 'answered', 'no_answer', 'busy', 'failed', 'avg_duration']);
    await wsTrend.commit();

    const wsExt = workbook.addWorksheet('Top Extensiones');
    writeXlsxHeaderBlock(wsExt, headerOpts);
    writeXlsxTable(wsExt, RANKING_HEADERS, topExtensions, RANKING_ROW_KEYS);
    await wsExt.commit();

    const wsTrunks = workbook.addWorksheet('Top Troncales');
    writeXlsxHeaderBlock(wsTrunks, headerOpts);
    writeXlsxTable(wsTrunks, RANKING_HEADERS, topTrunks, RANKING_ROW_KEYS);
    await wsTrunks.commit();

  } else if (type === 'inbound' || type === 'outbound') {
    const { rows, summary } = data;
    const isOutbound = type === 'outbound';
    const xlsxHeaders = isOutbound ? OUTBOUND_XLSX_HEADERS : INBOUND_XLSX_HEADERS;
    const rowKeys     = isOutbound ? OUTBOUND_ROW_KEYS    : INBOUND_ROW_KEYS;

    const wsResumen = workbook.addWorksheet('Resumen');
    writeXlsxHeaderBlock(wsResumen, headerOpts);
    writeXlsxTable(
      wsResumen,
      ['Disposición', 'Cantidad'],
      [
        { label: 'Total', value: summary.total },
        ...DISPOSITIONS_ORDER.map(d => ({ label: DISPOSITION_LABELS[d], value: summary[d] })),
      ],
      ['label', 'value']
    );
    await wsResumen.commit();

    const wsDetalle = workbook.addWorksheet('Detalle');
    writeXlsxHeaderBlock(wsDetalle, headerOpts);
    writeXlsxTable(wsDetalle, xlsxHeaders, rows, rowKeys);
    await wsDetalle.commit();

  } else {
    // extensions / trunks
    const { rankings } = data;
    const wsRanking = workbook.addWorksheet('Ranking');
    writeXlsxHeaderBlock(wsRanking, headerOpts);
    writeXlsxTable(wsRanking, RANKING_HEADERS, rankings, RANKING_ROW_KEYS);
    await wsRanking.commit();
  }

  await workbook.commit();
}

/**
 * Build the rows for the executive summary table (overall vs. inbound vs. outbound).
 * @param {object} overallTotals
 * @param {object} inboundTotals
 * @param {object} outboundTotals
 * @returns {object[]}
 */
function buildExecutiveSummaryRows(overallTotals, inboundTotals, outboundTotals) {
  return [
    { metric: 'Total de llamadas', total: overallTotals.total,     inbound: inboundTotals.total,            outbound: outboundTotals.total },
    { metric: 'Contestadas',       total: overallTotals.answered,  inbound: inboundTotals.ANSWERED,         outbound: outboundTotals.ANSWERED },
    { metric: 'No contestadas',    total: overallTotals.no_answer, inbound: inboundTotals['NO ANSWER'],     outbound: outboundTotals['NO ANSWER'] },
    { metric: 'Ocupado',           total: overallTotals.busy,      inbound: inboundTotals.BUSY,             outbound: outboundTotals.BUSY },
    { metric: 'Fallidas',          total: overallTotals.failed,    inbound: inboundTotals.FAILED,           outbound: outboundTotals.FAILED },
    { metric: 'Duración media (s)', total: overallTotals.avg_duration, inbound: '—', outbound: '—' },
  ];
}

module.exports = {
  toXlsx,
  toPdf,
  drawTable,
  drawBarChart,
  buildReportPdf,
  buildReportXlsx,
};
