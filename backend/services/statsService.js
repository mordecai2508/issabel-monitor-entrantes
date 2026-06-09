'use strict';

function calcVariation(v1, v2) {
  if (v1 === 0) return null;
  return Math.round(((v2 - v1) / v1) * 100 * 10) / 10;
}

async function queryHistorical(pool, period, from, to) {
  const fromTs = from + ' 00:00:00';
  const toTs   = to   + ' 23:59:59';

  let rows;

  if (period === 'day') {
    [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(calldate, '%Y-%m-%d')  AS period_label,
         COUNT(*)                            AS total,
         SUM(disposition = 'ANSWERED')       AS answered,
         SUM(disposition = 'NO ANSWER')      AS no_answer,
         SUM(disposition = 'BUSY')           AS busy,
         SUM(disposition = 'FAILED')         AS failed,
         ROUND(AVG(duration), 2)             AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?
       GROUP BY DATE_FORMAT(calldate, '%Y-%m-%d')
       ORDER BY period_label ASC`,
      [fromTs, toTs]
    );
  } else if (period === 'week') {
    [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(calldate, '%x-W%v')    AS period_label,
         COUNT(*)                            AS total,
         SUM(disposition = 'ANSWERED')       AS answered,
         SUM(disposition = 'NO ANSWER')      AS no_answer,
         SUM(disposition = 'BUSY')           AS busy,
         SUM(disposition = 'FAILED')         AS failed,
         ROUND(AVG(duration), 2)             AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?
       GROUP BY DATE_FORMAT(calldate, '%x-%v')
       ORDER BY DATE_FORMAT(calldate, '%x-%v') ASC`,
      [fromTs, toTs]
    );
  } else if (period === 'month') {
    [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(calldate, '%Y-%m')     AS period_label,
         COUNT(*)                            AS total,
         SUM(disposition = 'ANSWERED')       AS answered,
         SUM(disposition = 'NO ANSWER')      AS no_answer,
         SUM(disposition = 'BUSY')           AS busy,
         SUM(disposition = 'FAILED')         AS failed,
         ROUND(AVG(duration), 2)             AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?
       GROUP BY DATE_FORMAT(calldate, '%Y-%m')
       ORDER BY period_label ASC`,
      [fromTs, toTs]
    );
  } else if (period === 'year') {
    [rows] = await pool.query(
      `SELECT
         DATE_FORMAT(calldate, '%Y')        AS period_label,
         COUNT(*)                            AS total,
         SUM(disposition = 'ANSWERED')       AS answered,
         SUM(disposition = 'NO ANSWER')      AS no_answer,
         SUM(disposition = 'BUSY')           AS busy,
         SUM(disposition = 'FAILED')         AS failed,
         ROUND(AVG(duration), 2)             AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?
       GROUP BY DATE_FORMAT(calldate, '%Y')
       ORDER BY period_label ASC`,
      [fromTs, toTs]
    );
  } else {
    // custom — single aggregate
    [rows] = await pool.query(
      `SELECT
         COUNT(*)                            AS total,
         SUM(disposition = 'ANSWERED')       AS answered,
         SUM(disposition = 'NO ANSWER')      AS no_answer,
         SUM(disposition = 'BUSY')           AS busy,
         SUM(disposition = 'FAILED')         AS failed,
         ROUND(AVG(duration), 2)             AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?`,
      [fromTs, toTs]
    );
  }

  let points;
  if (period === 'custom') {
    const r = rows[0];
    // If no records, total will be 0 (COUNT(*) always returns a row)
    if (Number(r.total) === 0) {
      points = [];
    } else {
      points = [{
        period_label: `${from} / ${to}`,
        total:        Number(r.total),
        answered:     Number(r.answered),
        no_answer:    Number(r.no_answer),
        busy:         Number(r.busy),
        failed:       Number(r.failed),
        avg_duration: Number(Number(r.avg_duration).toFixed(2)),
      }];
    }
  } else {
    points = rows.map(r => ({
      period_label: r.period_label,
      total:        Number(r.total),
      answered:     Number(r.answered),
      no_answer:    Number(r.no_answer),
      busy:         Number(r.busy),
      failed:       Number(r.failed),
      avg_duration: Number(Number(r.avg_duration).toFixed(2)),
    }));
  }

  return { period, from, to, points };
}

async function queryCompare(pool, p1from, p1to, p2from, p2to) {
  const totalQuery = `SELECT
    COUNT(*)                            AS total,
    SUM(disposition = 'ANSWERED')       AS answered,
    SUM(disposition = 'NO ANSWER')      AS no_answer,
    SUM(disposition = 'BUSY')           AS busy,
    SUM(disposition = 'FAILED')         AS failed,
    ROUND(AVG(duration), 2)             AS avg_duration
  FROM cdr
  WHERE calldate >= ? AND calldate <= ?`;

  const [[rows1], [rows2]] = await Promise.all([
    pool.query(totalQuery, [p1from + ' 00:00:00', p1to + ' 23:59:59']),
    pool.query(totalQuery, [p2from + ' 00:00:00', p2to + ' 23:59:59']),
  ]);

  const r1 = rows1[0];
  const r2 = rows2[0];

  const kpis1 = {
    total:        Number(r1.total),
    answered:     Number(r1.answered),
    no_answer:    Number(r1.no_answer),
    busy:         Number(r1.busy),
    failed:       Number(r1.failed),
    avg_duration: Number(Number(r1.avg_duration).toFixed(2)),
  };

  const kpis2 = {
    total:        Number(r2.total),
    answered:     Number(r2.answered),
    no_answer:    Number(r2.no_answer),
    busy:         Number(r2.busy),
    failed:       Number(r2.failed),
    avg_duration: Number(Number(r2.avg_duration).toFixed(2)),
  };

  const variation = {
    total:        calcVariation(kpis1.total,        kpis2.total),
    answered:     calcVariation(kpis1.answered,     kpis2.answered),
    no_answer:    calcVariation(kpis1.no_answer,    kpis2.no_answer),
    busy:         calcVariation(kpis1.busy,         kpis2.busy),
    failed:       calcVariation(kpis1.failed,       kpis2.failed),
    avg_duration: calcVariation(kpis1.avg_duration, kpis2.avg_duration),
  };

  return {
    period1: { from: p1from, to: p1to, ...kpis1 },
    period2: { from: p2from, to: p2to, ...kpis2 },
    variation,
  };
}

async function queryRankings(pool, from, to, type, limit) {
  const safeLimit = Math.min(Number(limit) || 10, 50);
  const fromTs = from + ' 00:00:00';
  const toTs   = to   + ' 23:59:59';

  let rows;

  if (type === 'extension') {
    [rows] = await pool.query(
      `SELECT
         src                                    AS name,
         COUNT(*)                               AS total,
         SUM(disposition = 'ANSWERED')          AS answered,
         SUM(disposition = 'NO ANSWER')         AS no_answer,
         SUM(disposition = 'BUSY')              AS busy,
         SUM(disposition = 'FAILED')            AS failed,
         ROUND(AVG(duration), 2)                AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?
         AND src IS NOT NULL AND src != ''
       GROUP BY src
       ORDER BY total DESC
       LIMIT ?`,
      [fromTs, toTs, safeLimit]
    );
  } else {
    // trunk
    [rows] = await pool.query(
      `SELECT
         LEFT(channel,
           CHAR_LENGTH(channel)
           - CHAR_LENGTH(SUBSTRING_INDEX(channel, '-', -1))
           - 1
         )                                       AS name,
         COUNT(*)                                AS total,
         SUM(disposition = 'ANSWERED')           AS answered,
         SUM(disposition = 'NO ANSWER')          AS no_answer,
         SUM(disposition = 'BUSY')               AS busy,
         SUM(disposition = 'FAILED')             AS failed,
         ROUND(AVG(duration), 2)                 AS avg_duration
       FROM cdr
       WHERE calldate >= ? AND calldate <= ?
         AND channel IS NOT NULL AND channel != ''
         AND channel NOT LIKE 'Local/%'
       GROUP BY name
       ORDER BY total DESC
       LIMIT ?`,
      [fromTs, toTs, safeLimit]
    );
  }

  const rankings = rows.map(r => ({
    name:         r.name,
    total:        Number(r.total),
    answered:     Number(r.answered),
    no_answer:    Number(r.no_answer),
    busy:         Number(r.busy),
    failed:       Number(r.failed),
    avg_duration: Number(Number(r.avg_duration).toFixed(2)),
  }));

  return { type, from, to, limit: safeLimit, rankings };
}

module.exports = { queryHistorical, queryCompare, queryRankings };
