/**
 * Issabel Call Monitor — Backend v1.0
 *
 * Endpoints:
 *   POST /api/auth/login        → iniciar sesión
 *   POST /api/auth/logout       → cerrar sesión
 *   GET  /api/auth/me           → usuario actual
 *   GET  /api/calls/today       → estadísticas del día actual
 *   GET  /api/calls/range       → estadísticas con rango ?from=&to=
 *   GET  /api/events            → SSE tiempo real (actualiza cada 30s)
 *   GET  /api/admin/users       → lista de usuarios (solo admin)
 */

const express       = require('express');
const session       = require('express-session');
const bcrypt        = require('bcryptjs');
const mysql         = require('mysql2/promise');
const cors          = require('cors');
const fs            = require('fs');
const path          = require('path');

const CONFIG_FILE   = path.join(__dirname, 'config.json');
const EXAMPLE_FILE  = path.join(__dirname, 'config.example.json');

// ── Config ────────────────────────────────────────────────────────
async function loadConfig() {
  if (!fs.existsSync(CONFIG_FILE)) {
    if (fs.existsSync(EXAMPLE_FILE)) {
      fs.copyFileSync(EXAMPLE_FILE, CONFIG_FILE);
      console.log('[CONFIG] config.json creado desde config.example.json — configura la DB antes de continuar.');
    } else {
      throw new Error('No se encontró config.json');
    }
  }

  const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));

  // Auto-hash contraseñas en texto plano
  let changed = false;
  for (const user of raw.users) {
    if (!user.password.startsWith('$2b$') && !user.password.startsWith('$2a$')) {
      user.password = await bcrypt.hash(user.password, 12);
      changed = true;
    }
  }
  if (changed) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 2), 'utf8');
    console.log('[CONFIG] Contraseñas hasheadas con bcrypt y guardadas.');
  }

  return raw;
}

// ── Extracción de nombre de canal ─────────────────────────────────
// SIP/trunk-name-00a1b2c3  →  SIP/trunk-name
// PJSIP/troncal-00000001   →  PJSIP/troncal
// DAHDI/g1-0               →  DAHDI/g1
function extractChannel(raw) {
  if (!raw) return 'Desconocido';
  return raw.replace(/-[0-9a-f]{6,}$/i, '').replace(/-\d+$/, '');
}

// ── Queries CDR ───────────────────────────────────────────────────
async function queryStats(pool, from, to) {
  const [rows] = await pool.query(
    `SELECT
       disposition,
       COUNT(*)                                     AS count,
       COALESCE(SUM(duration), 0)                   AS total_duration,
       COALESCE(SUM(billsec), 0)                    AS total_billsec,
       COALESCE(AVG(NULLIF(billsec,0)), 0)          AS avg_billsec
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY disposition`,
    [from, to]
  );

  const base = {
    ANSWERED:    { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
    'NO ANSWER': { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
    BUSY:        { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
    FAILED:      { count: 0, total_duration: 0, total_billsec: 0, avg_billsec: 0, pct: 0 },
  };

  let total = 0;
  for (const r of rows) {
    const d = r.disposition.toUpperCase();
    if (base[d]) {
      base[d] = {
        count:          Number(r.count),
        total_duration: Number(r.total_duration),
        total_billsec:  Number(r.total_billsec),
        avg_billsec:    Math.round(Number(r.avg_billsec)),
        pct: 0,
      };
    }
    total += Number(r.count);
  }

  for (const key of Object.keys(base)) {
    base[key].pct = total > 0 ? Math.round((base[key].count / total) * 1000) / 10 : 0;
  }

  return { dispositions: base, total };
}

async function queryChannels(pool, from, to, allowedChannels) {
  const [rows] = await pool.query(
    `SELECT
       channel,
       disposition,
       COUNT(*)                    AS count,
       COALESCE(SUM(billsec), 0)  AS total_billsec
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, disposition`,
    [from, to]
  );

  const map = {};
  for (const r of rows) {
    const ch = extractChannel(r.channel);
    if (allowedChannels && allowedChannels.length > 0 && !allowedChannels.includes(ch)) continue;
    if (!map[ch]) {
      map[ch] = { channel: ch, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0, total: 0, total_billsec: 0 };
    }
    const d = r.disposition.toUpperCase();
    if (['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'].includes(d)) {
      map[ch][d] += Number(r.count);
    }
    map[ch].total        += Number(r.count);
    map[ch].total_billsec += Number(r.total_billsec);
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

async function queryHourly(pool, from, to) {
  const [rows] = await pool.query(
    `SELECT
       HOUR(calldate) AS hour,
       disposition,
       COUNT(*)       AS count
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY HOUR(calldate), disposition
     ORDER BY hour`,
    [from, to]
  );

  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0, total: 0,
  }));

  for (const r of rows) {
    const h = Number(r.hour);
    const d = r.disposition.toUpperCase();
    if (['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'].includes(d)) {
      hours[h][d] += Number(r.count);
    }
    hours[h].total += Number(r.count);
  }

  return hours;
}

// ── Helpers de fecha (zona local del servidor) ────────────────────
function toMySQLDate(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

function todayRange() {
  const now  = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const to   = new Date(from.getTime() + 86400_000);
  return { from: toMySQLDate(from), to: toMySQLDate(to) };
}

// ── Arranque ──────────────────────────────────────────────────────
async function startServer() {
  const config = await loadConfig();
  const PORT   = config.server.port || 4000;

  // Pool MySQL
  const pool = mysql.createPool({
    host:             config.db.host,
    port:             config.db.port || 3306,
    user:             config.db.user,
    password:         config.db.password,
    database:         config.db.database,
    timezone:         config.db.timezone || 'local',
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0,
  });

  let dbOk = false;
  try {
    await pool.query('SELECT 1');
    console.log('[DB] Conexión exitosa a MySQL.');
    dbOk = true;
  } catch (e) {
    console.error('[DB] No se pudo conectar:', e.message);
    console.warn('[DB] El servidor arranca sin DB. Edita config.json y reinicia.');
  }

  // ── Express ──
  const app = express();

  app.use(cors({
    origin: ['http://localhost:5173', 'http://localhost:4000'],
    credentials: true,
  }));
  app.use(express.json());
  app.use(session({
    secret:            config.server.sessionSecret,
    resave:            false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge:   86400_000,   // 24 h
      sameSite: 'lax',
    },
  }));

  // Servir frontend compilado (producción)
  const frontDist = path.join(__dirname, '..', 'frontend', 'dist');
  if (fs.existsSync(frontDist)) {
    app.use(express.static(frontDist));
  }

  // ── Middleware auth ──
  function requireAuth(req, res, next) {
    if (!req.session?.user) return res.status(401).json({ ok: false, error: 'No autenticado' });
    next();
  }
  function requireAdmin(req, res, next) {
    if (!req.session?.user)              return res.status(401).json({ ok: false, error: 'No autenticado' });
    if (req.session.user.role !== 'admin') return res.status(403).json({ ok: false, error: 'Se requiere rol de administrador' });
    next();
  }

  // ── Auth ──────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña son requeridos' });

    const user = config.users.find(u => u.username === username);
    if (!user) return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });

    const valid = await bcrypt.compare(password, user.password);
    if (!valid)  return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });

    req.session.user = { id: user.id, username: user.username, role: user.role };
    res.json({ ok: true, user: req.session.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ ok: true, user: req.session.user });
  });

  // ── Helper: obtener datos completos ──────────────────────────
  const allowedChannels = config.channels && config.channels.length > 0 ? config.channels : null;

  async function fetchData(from, to) {
    const [stats, channels, hourly] = await Promise.all([
      queryStats(pool, from, to),
      queryChannels(pool, from, to, allowedChannels),
      queryHourly(pool, from, to),
    ]);
    return { stats, channels, hourly, from, to, generatedAt: new Date().toISOString() };
  }

  // ── Datos de hoy ──────────────────────────────────────────────
  app.get('/api/calls/today', requireAuth, async (req, res) => {
    if (!dbOk) return res.status(503).json({ ok: false, error: 'Base de datos no disponible. Configura config.json.' });
    try {
      const { from, to } = todayRange();
      const data = await fetchData(from, to);
      res.json({ ok: true, ...data });
    } catch (e) {
      console.error('[API] /calls/today:', e.message);
      res.status(500).json({ ok: false, error: 'Error al consultar la base de datos' });
    }
  });

  // ── Datos por rango ───────────────────────────────────────────
  app.get('/api/calls/range', requireAuth, async (req, res) => {
    if (!dbOk) return res.status(503).json({ ok: false, error: 'Base de datos no disponible. Configura config.json.' });

    let { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ ok: false, error: 'Parámetros from y to son requeridos' });

    const fromDate = new Date(from);
    const toDate   = new Date(to);
    if (isNaN(fromDate) || isNaN(toDate))
      return res.status(400).json({ ok: false, error: 'Fechas inválidas' });

    // Incluir todo el día 'to' (hasta 23:59:59)
    toDate.setHours(23, 59, 59, 999);

    try {
      const data = await fetchData(toMySQLDate(fromDate), toMySQLDate(toDate));
      res.json({ ok: true, ...data });
    } catch (e) {
      console.error('[API] /calls/range:', e.message);
      res.status(500).json({ ok: false, error: 'Error al consultar la base de datos' });
    }
  });

  // ── SSE — actualizaciones en tiempo real ──────────────────────
  const sseClients = new Set();

  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of sseClients) {
      try { c.write(msg); } catch { sseClients.delete(c); }
    }
  }

  app.get('/api/events', requireAuth, async (req, res) => {
    res.setHeader('Content-Type',     'text/event-stream');
    res.setHeader('Cache-Control',    'no-cache');
    res.setHeader('Connection',       'keep-alive');
    res.setHeader('X-Accel-Buffering','no');
    res.flushHeaders();

    sseClients.add(res);
    console.log(`[SSE] +1 (total: ${sseClients.size})`);

    // Enviar datos iniciales
    if (dbOk) {
      try {
        const { from, to } = todayRange();
        const data = await fetchData(from, to);
        res.write(`event: init\ndata: ${JSON.stringify(data)}\n\n`);
      } catch (e) {
        console.error('[SSE] Error init:', e.message);
      }
    }

    req.on('close', () => {
      sseClients.delete(res);
      console.log(`[SSE] -1 (total: ${sseClients.size})`);
    });
  });

  // Polling cada N ms → broadcast a clientes SSE
  const pollMs = config.server.pollIntervalMs || 30_000;
  setInterval(async () => {
    if (!dbOk || sseClients.size === 0) return;
    try {
      const { from, to } = todayRange();
      const data = await fetchData(from, to);
      broadcast('update', data);
    } catch (e) {
      console.error('[POLL]', e.message);
    }
  }, pollMs);

  // ── Admin ──────────────────────────────────────────────────────
  app.get('/api/admin/users', requireAdmin, (req, res) => {
    res.json({
      ok: true,
      users: config.users.map(u => ({ id: u.id, username: u.username, role: u.role })),
    });
  });

  // SPA catch-all (producción)
  if (fs.existsSync(frontDist)) {
    app.get('*', (_req, res) => res.sendFile(path.join(frontDist, 'index.html')));
  }

  // ── Listen ────────────────────────────────────────────────────
  app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('╔══════════════════════════════════════════════════╗');
    console.log('║  🟢  Issabel Call Monitor v1.0 — Backend         ║');
    console.log(`║  API    → http://localhost:${PORT}                  ║`);
    console.log(`║  Poll   → cada ${String(pollMs / 1000).padEnd(4)} s                        ║`);
    console.log(`║  DB     → ${dbOk ? '✓ Conectado' : '✗ Sin conexión (configura config.json)'}   ║`);
    console.log('╚══════════════════════════════════════════════════╝');
    console.log('');
  });
}

startServer().catch(e => {
  console.error('[FATAL]', e.message);
  process.exit(1);
});
