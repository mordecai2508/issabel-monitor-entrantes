'use strict';

const express       = require('express');
const reportService = require('../services/reportService');
const exportService = require('../services/exportService');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const REPORT_TIMEOUT_MS = 10000;

/**
 * Validate that a string is in YYYY-MM-DD format.
 * @param {string} s
 * @returns {boolean}
 */
function isValidDate(s) {
  if (!s || !DATE_RE.test(s)) return false;
  const d = new Date(s + 'T00:00:00');
  return !isNaN(d.getTime());
}

/**
 * Factory for the reports router.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {object}   config
 * @param {import('better-sqlite3').Database} db
 * @param {Function} requireAuth
 * @param {Function} extractChannel
 * @param {boolean}  dbOk
 * @returns {import('express').Router}
 */
module.exports = function reportsRouter(pool, config, db, requireAuth, extractChannel, dbOk) {
  const router           = express.Router();
  const inboundChannels  = (config.channels && config.channels.inbound)  || [];
  const outboundChannels = (config.channels && config.channels.outbound) || [];
  const lostDests        = config.lostDestinations || [];

  function getAppName() {
    return config.app?.name || 'Call Monitor';
  }

  /**
   * Shared handler for /reports/:type/pdf and /reports/:type/xlsx.
   * @param {'pdf'|'xlsx'} format
   */
  function handler(format) {
    return async (req, res) => {
      const { type } = req.params;
      const { from, to } = req.query;

      // R3 — validate :type
      if (!reportService.REPORT_TYPES.includes(type)) {
        return res.status(400).json({
          ok: false,
          error: 'El tipo de reporte debe ser uno de: executive, inbound, outbound, extensions, trunks',
        });
      }

      // R4 — validate from/to format
      if (!isValidDate(from) || !isValidDate(to)) {
        return res.status(400).json({
          ok: false,
          error: 'Los parámetros from y to son requeridos y deben ser fechas válidas (YYYY-MM-DD)',
        });
      }

      // R5 — from <= to
      if (from > to) {
        return res.status(400).json({ ok: false, error: 'La fecha from no puede ser posterior a to' });
      }

      // R8 — DB unavailable
      if (!dbOk) {
        return res.status(503).json({ ok: false, error: 'Base de datos no disponible' });
      }

      let timedOut = false;
      const timeoutId = setTimeout(() => {
        timedOut = true;
        if (!res.headersSent) {
          res.status(504).json({ ok: false, error: 'La generación del reporte tardó demasiado' });
        }
      }, REPORT_TIMEOUT_MS);

      try {
        const data = await reportService.collectReportData(pool, type, from, to, { inboundChannels, outboundChannels, extractChannel, lostDests });

        clearTimeout(timeoutId);
        if (timedOut) return; // R9 — response already sent

        const branding = reportService.getBranding(db, getAppName());
        const filenameBase = `reporte_${type}_${from}_${to}`;

        if (format === 'pdf') {
          exportService.buildReportPdf(res, { type, from, to, branding, data, filenameBase });
        } else {
          await exportService.buildReportXlsx(res, { type, from, to, branding, data, filenameBase });
        }
      } catch (err) {
        clearTimeout(timeoutId);
        if (timedOut) return;

        console.error(`[reports] GET /reports/${type}/${format}:`, err.message);
        if (!res.headersSent) {
          res.status(500).json({ ok: false, error: 'Error al generar el reporte' });
        } else {
          res.end();
        }
      }
    };
  }

  router.get('/reports/:type/pdf',  requireAuth, handler('pdf'));
  router.get('/reports/:type/xlsx', requireAuth, handler('xlsx'));

  return router;
};
