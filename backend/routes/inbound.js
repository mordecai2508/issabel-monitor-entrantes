'use strict';

const express       = require('express');
const cdrService    = require('../services/cdrService');
const exportService = require('../services/exportService');

const ALLOWED_DISPOSITIONS = ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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
 * Factory for the inbound calls router.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {object}   config
 * @param {Function} requireAuth
 * @param {Function} extractChannel
 * @returns {import('express').Router}
 */
module.exports = function inboundRouter(pool, config, requireAuth, extractChannel) {
  const router = express.Router();

  // ── GET /api/calls/inbound ──────────────────────────────────────
  router.get('/calls/inbound', requireAuth, async (req, res) => {
    try {
      const { from, to, trunk, origin, disposition, page: rawPage, limit: rawLimit } = req.query;

      // Validate required date params
      if (!from || !to) {
        return res.status(400).json({ ok: false, error: 'Los parámetros from y to son requeridos' });
      }
      if (!isValidDate(from)) {
        return res.status(400).json({ ok: false, error: 'El parámetro from tiene un formato inválido (YYYY-MM-DD)' });
      }
      if (!isValidDate(to)) {
        return res.status(400).json({ ok: false, error: 'El parámetro to tiene un formato inválido (YYYY-MM-DD)' });
      }

      // Validate optional disposition
      if (disposition !== undefined && disposition !== '') {
        if (!ALLOWED_DISPOSITIONS.includes(disposition.toUpperCase())) {
          return res.status(400).json({
            ok: false,
            error: `disposition debe ser uno de: ${ALLOWED_DISPOSITIONS.join(', ')}`,
          });
        }
      }

      // Validate and parse pagination
      const page = rawPage !== undefined ? parseInt(rawPage, 10) : 1;
      if (!Number.isInteger(page) || page < 1) {
        return res.status(400).json({ ok: false, error: 'El parámetro page debe ser un entero mayor o igual a 1' });
      }

      const limit = rawLimit !== undefined ? parseInt(rawLimit, 10) : 100;
      if (!Number.isInteger(limit) || limit < 1) {
        return res.status(400).json({ ok: false, error: 'El parámetro limit debe ser un entero entre 1 y 500' });
      }
      if (limit > 500) {
        return res.status(400).json({ ok: false, error: 'El parámetro limit no puede superar 500' });
      }

      const filters = {
        from,
        to,
        trunk:       trunk       || null,
        origin:      origin      || null,
        disposition: disposition ? disposition.toUpperCase() : null,
      };

      const { rows: data, meta } = await cdrService.queryInbound(
        pool, filters, { page, limit }, extractChannel
      );

      res.json({ ok: true, data, meta });
    } catch (err) {
      console.error('[inbound] GET /calls/inbound:', err.message);
      res.status(500).json({ ok: false, error: 'Error al consultar la base de datos' });
    }
  });

  // ── GET /api/calls/inbound/export ───────────────────────────────
  router.get('/calls/inbound/export', requireAuth, async (req, res) => {
    try {
      const { from, to, trunk, origin, disposition, format } = req.query;

      // Validate required date params
      if (!from || !to) {
        return res.status(400).json({ ok: false, error: 'Los parámetros from y to son requeridos' });
      }
      if (!isValidDate(from)) {
        return res.status(400).json({ ok: false, error: 'El parámetro from tiene un formato inválido (YYYY-MM-DD)' });
      }
      if (!isValidDate(to)) {
        return res.status(400).json({ ok: false, error: 'El parámetro to tiene un formato inválido (YYYY-MM-DD)' });
      }

      // Validate format
      if (!format || !['xlsx', 'pdf'].includes(format)) {
        return res.status(400).json({ ok: false, error: 'El parámetro format debe ser xlsx o pdf' });
      }

      // Validate optional disposition
      if (disposition !== undefined && disposition !== '') {
        if (!ALLOWED_DISPOSITIONS.includes(disposition.toUpperCase())) {
          return res.status(400).json({
            ok: false,
            error: `disposition debe ser uno de: ${ALLOWED_DISPOSITIONS.join(', ')}`,
          });
        }
      }

      const filters = {
        from,
        to,
        trunk:       trunk       || null,
        origin:      origin      || null,
        disposition: disposition ? disposition.toUpperCase() : null,
      };

      const rows = await cdrService.queryInboundExport(pool, filters, extractChannel);
      const truncated    = rows.length >= cdrService.MAX_EXPORT_ROWS;
      const filenameBase = `entrantes_${filters.from}_${filters.to}`;

      if (format === 'xlsx') {
        await exportService.toXlsx(rows, res, filenameBase, truncated);
      } else {
        exportService.toPdf(rows, res, filenameBase, filters, truncated);
      }
    } catch (err) {
      console.error('[inbound] GET /calls/inbound/export:', err.message);
      if (!res.headersSent) {
        res.status(500).json({ ok: false, error: 'Error al generar la exportación' });
      }
    }
  });

  return router;
};
