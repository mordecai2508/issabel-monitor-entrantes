'use strict';

const MAX_EXPORT_ROWS = 10000;

/**
 * Build the WHERE clause and params array for inbound CDR queries.
 * @param {object} filters - { from, to, trunk, origin, disposition }
 * @returns {{ conditions: string[], params: any[] }}
 */
function buildWhereClause(filters) {
  const { from, to, trunk, origin, disposition } = filters;
  const conditions = [];
  const params = [];

  // Date range (required)
  conditions.push('calldate >= ?');
  params.push(from + ' 00:00:00');

  conditions.push('calldate <= ?');
  params.push(to + ' 23:59:59');

  // Optional: trunk filter via LIKE prefix
  if (trunk) {
    conditions.push('channel LIKE CONCAT(?, \'%\')');
    params.push(trunk);
  }

  // Optional: origin partial match
  if (origin) {
    conditions.push('src LIKE CONCAT(\'%\', ?, \'%\')');
    params.push(origin);
  }

  // Optional: disposition exact match (case-insensitive)
  if (disposition) {
    conditions.push('UPPER(disposition) = UPPER(?)');
    params.push(disposition);
  }

  return { conditions, params };
}

/**
 * Map a raw CDR row to the API shape.
 * @param {object} row
 * @param {Function} extractChannelFn
 * @returns {object}
 */
function mapRow(row, extractChannelFn) {
  return {
    calldate:    row.calldate instanceof Date ? row.calldate.toISOString() : row.calldate,
    src:         row.src,
    dst:         row.dst,
    channel:     extractChannelFn(row.channel),
    duration:    Number(row.duration),
    billsec:     Number(row.billsec),
    disposition: row.disposition,
  };
}

/**
 * Query individual CDR rows with optional filters and pagination.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ from: string, to: string, trunk?: string, origin?: string, disposition?: string }} filters
 * @param {{ page?: number, limit?: number }} pagination
 * @param {Function} extractChannelFn
 * @returns {Promise<{ rows: object[], meta: { total: number, page: number, limit: number, totalPages: number } }>}
 */
async function queryInbound(pool, filters, pagination, extractChannelFn) {
  const page  = Number(pagination.page)  || 1;
  const limit = Number(pagination.limit) || 100;
  const offset = (page - 1) * limit;

  const { conditions, params } = buildWhereClause(filters);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM cdr ${where}`;
  const dataSql  = `SELECT calldate, src, dst, channel, duration, billsec, disposition
                    FROM cdr
                    ${where}
                    ORDER BY calldate DESC
                    LIMIT ? OFFSET ?`;

  const [[countRow]] = await pool.query(countSql, params);
  const total = Number(countRow.total);

  const dataParams = [...params, limit, offset];
  const [dataRows] = await pool.query(dataSql, dataParams);

  const rows = dataRows.map(r => mapRow(r, extractChannelFn));
  const totalPages = Math.ceil(total / limit);

  return {
    rows,
    meta: { total, page, limit, totalPages },
  };
}

/**
 * Query all matching CDR rows for export (no pagination, capped at MAX_EXPORT_ROWS).
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ from: string, to: string, trunk?: string, origin?: string, disposition?: string }} filters
 * @param {Function} extractChannelFn
 * @returns {Promise<object[]>}
 */
async function queryInboundExport(pool, filters, extractChannelFn) {
  const { conditions, params } = buildWhereClause(filters);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `SELECT calldate, src, dst, channel, duration, billsec, disposition
               FROM cdr
               ${where}
               ORDER BY calldate DESC
               LIMIT ${MAX_EXPORT_ROWS}`;

  const [rows] = await pool.query(sql, params);
  return rows.map(r => mapRow(r, extractChannelFn));
}

/**
 * Build the WHERE clause and params array for outbound CDR queries.
 * @param {object} filters - { from, to, trunk, extension, dest, disposition }
 * @param {string[]} allowedChannels - configured inbound trunk channels
 * @returns {{ conditions: string[], params: any[] }}
 */
function buildOutboundWhereClause(filters, allowedChannels) {
  const conditions = [];
  const params = [];

  conditions.push('calldate >= ?');
  params.push(filters.from + ' 00:00:00');
  conditions.push('calldate <= ?');
  params.push(filters.to + ' 23:59:59');

  conditions.push("channel NOT LIKE 'Local/%'");

  if (allowedChannels && allowedChannels.length > 0) {
    for (const ch of allowedChannels) {
      conditions.push("channel NOT LIKE CONCAT(?, '%')");
      params.push(ch);
    }
  }

  if (filters.trunk) {
    conditions.push("dstchannel LIKE CONCAT(?, '%')");
    params.push(filters.trunk);
  }
  if (filters.extension) {
    conditions.push("src LIKE CONCAT('%', ?, '%')");
    params.push(filters.extension);
  }
  if (filters.dest) {
    conditions.push("dst LIKE CONCAT('%', ?, '%')");
    params.push(filters.dest);
  }
  if (filters.disposition) {
    conditions.push('UPPER(disposition) = UPPER(?)');
    params.push(filters.disposition);
  }

  return { conditions, params };
}

/**
 * Map a raw outbound CDR row to the API shape.
 * @param {object} row
 * @param {Function} extractChannelFn
 * @returns {object}
 */
function mapOutboundRow(row, extractChannelFn) {
  return {
    calldate:    row.calldate instanceof Date ? row.calldate.toISOString() : row.calldate,
    src:         row.src,
    dst:         row.dst,
    dstchannel:  extractChannelFn ? extractChannelFn(row.dstchannel || '') : (row.dstchannel || ''),
    duration:    Number(row.duration),
    billsec:     Number(row.billsec),
    disposition: row.disposition,
  };
}

/**
 * Query individual outbound CDR rows with optional filters and pagination.
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ from: string, to: string, trunk?: string, extension?: string, dest?: string, disposition?: string }} filters
 * @param {{ page?: number, limit?: number }} pagination
 * @param {string[]} allowedChannels
 * @param {Function} extractChannelFn
 * @returns {Promise<{ rows: object[], meta: { total: number, page: number, limit: number, totalPages: number } }>}
 */
async function queryOutbound(pool, filters, pagination, allowedChannels, extractChannelFn) {
  const page   = Number(pagination.page)  || 1;
  const limit  = Number(pagination.limit) || 100;
  const offset = (page - 1) * limit;

  const { conditions, params } = buildOutboundWhereClause(filters, allowedChannels);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const countSql = `SELECT COUNT(*) AS total FROM cdr ${where}`;
  const dataSql  = `SELECT calldate, src, dst, dstchannel, duration, billsec, disposition
                    FROM cdr
                    ${where}
                    ORDER BY calldate DESC
                    LIMIT ? OFFSET ?`;

  const [[countRow]] = await pool.query(countSql, params);
  const total = Number(countRow.total);

  const dataParams = [...params, limit, offset];
  const [dataRows] = await pool.query(dataSql, dataParams);

  const rows = dataRows.map(r => mapOutboundRow(r, extractChannelFn));
  const totalPages = Math.ceil(total / limit);

  return {
    rows,
    meta: { total, page, limit, totalPages },
  };
}

/**
 * Query all matching outbound CDR rows for export (no pagination, capped at MAX_EXPORT_ROWS).
 *
 * @param {import('mysql2/promise').Pool} pool
 * @param {{ from: string, to: string, trunk?: string, extension?: string, dest?: string, disposition?: string }} filters
 * @param {string[]} allowedChannels
 * @param {Function} extractChannelFn
 * @returns {Promise<object[]>}
 */
async function queryOutboundExport(pool, filters, allowedChannels, extractChannelFn) {
  const { conditions, params } = buildOutboundWhereClause(filters, allowedChannels);
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const sql = `SELECT calldate, src, dst, dstchannel, duration, billsec, disposition
               FROM cdr
               ${where}
               ORDER BY calldate DESC
               LIMIT ${MAX_EXPORT_ROWS}`;

  const [rows] = await pool.query(sql, params);
  return rows.map(r => mapOutboundRow(r, extractChannelFn));
}

module.exports = {
  queryInbound,
  queryInboundExport,
  queryOutbound,
  queryOutboundExport,
  MAX_EXPORT_ROWS,
};
