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
const { initDb }    = require('./db/setup');
const userService   = require('./services/userService');
const auditService  = require('./services/auditService');
const inboundRouter  = require('./routes/inbound');
const outboundRouter = require('./routes/outbound');
const statsRouter    = require('./routes/stats');
const reportsRouter  = require('./routes/reports');
const configRouter   = require('./routes/config');

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
  // Migración de config.channels: array plano (v1.0) → { inbound, outbound } (v2.0)
  if (Array.isArray(raw.channels)) {
    raw.channels = { inbound: raw.channels, outbound: [] };
    changed = true;
  } else if (raw.channels && typeof raw.channels === 'object') {
    raw.channels.inbound  = raw.channels.inbound  || [];
    raw.channels.outbound = raw.channels.outbound || [];
  } else {
    raw.channels = { inbound: [], outbound: [] };
  }

  if (changed) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(raw, null, 2), 'utf8');
    console.log('[CONFIG] Contraseñas hasheadas con bcrypt y/o config.channels migrado y guardado.');
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
// direction: 'in' = solo channels.inbound, 'out' = solo channels.outbound (explícito), null = todos
// inboundChannels y outboundChannels son arrays (pueden estar vacíos, nunca null/undefined)
function passesFilter(channel, inboundChannels, outboundChannels, direction) {
  const ch = extractChannel(channel);

  if (direction === 'out') {
    // Canales internos (Local/) nunca son salientes externos
    if (ch.startsWith('Local/')) return false;
    return outboundChannels.includes(ch);
  }

  if (direction === 'in') {
    return inboundChannels.includes(ch);
  }

  return true; // direction = null → todos
}

// ── Reclasificación de disposición (#17 lostDestinations + #21 agente) ──
// Evaluado sobre dstchannel "crudo" (sin extractChannel, ver R19).
const AGENT_DSTCHANNEL_RE = /^(Agent\/\d+|SIP\/\d+-)/;

// Devuelve la clave de disposición efectiva ('ANSWERED' | 'NO ANSWER' |
// 'BUSY' | 'FAILED' | null) tras aplicar las reclasificaciones de #17
// (dst en lostDests) y #21 (ANSWERED sin dstchannel de agente).
function resolveDisposition(row, lostDests) {
  const d = row.disposition.toUpperCase();
  let targetKey = ['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'].includes(d) ? d : null;
  if (!targetKey) return null;

  // #17: dst en lostDestinations reclasifica cualquier disposición hacia 'NO ANSWER'
  const isLostDst = lostDests.includes(row.dst);
  if (isLostDst && targetKey !== 'NO ANSWER') {
    targetKey = 'NO ANSWER';
  }

  // #21: ANSWERED sin dstchannel de agente reclasifica hacia 'NO ANSWER'
  if (targetKey === 'ANSWERED' && !AGENT_DSTCHANNEL_RE.test(row.dstchannel || '')) {
    targetKey = 'NO ANSWER';
  }

  return targetKey;
}

async function queryStats(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup']) {
  const [rows] = await pool.query(
    `SELECT
       channel,
       dst,
       dstchannel,
       disposition,
       COUNT(*)                    AS count,
       COALESCE(SUM(duration), 0)  AS total_duration,
       COALESCE(SUM(billsec), 0)   AS total_billsec
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, dst, dstchannel, disposition`,
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
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;

    const targetKey = resolveDisposition(r, lostDests);
    if (targetKey) {
      base[targetKey].count          += Number(r.count);
      base[targetKey].total_duration += Number(r.total_duration);
      base[targetKey].total_billsec  += Number(r.total_billsec);
    }
    total += Number(r.count);
  }

  if (base.ANSWERED.count > 0)
    base.ANSWERED.avg_billsec = Math.round(base.ANSWERED.total_billsec / base.ANSWERED.count);

  for (const key of Object.keys(base)) {
    base[key].pct = total > 0 ? Math.round((base[key].count / total) * 1000) / 10 : 0;
  }

  return { dispositions: base, total };
}

async function queryChannels(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup']) {
  const [rows] = await pool.query(
    `SELECT
       channel,
       dst,
       dstchannel,
       disposition,
       COUNT(*)                    AS count,
       COALESCE(SUM(billsec), 0)  AS total_billsec
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, dst, dstchannel, disposition`,
    [from, to]
  );

  const map = {};
  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;
    const ch = extractChannel(r.channel);
    if (!map[ch]) {
      map[ch] = { channel: ch, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0, total: 0, total_billsec: 0 };
    }

    const targetKey = resolveDisposition(r, lostDests);
    if (targetKey) {
      map[ch][targetKey] += Number(r.count);
    }
    map[ch].total         += Number(r.count);
    map[ch].total_billsec += Number(r.total_billsec);
  }

  return Object.values(map).sort((a, b) => b.total - a.total);
}

async function queryHourly(pool, from, to, inboundChannels, outboundChannels, direction = 'in', lostDests = ['s', 'hang', 'hangup']) {
  const [rows] = await pool.query(
    `SELECT
       channel,
       dst,
       dstchannel,
       HOUR(calldate) AS hour,
       disposition,
       COUNT(*)       AS count
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, dst, dstchannel, HOUR(calldate), disposition
     ORDER BY hour`,
    [from, to]
  );

  const hours = Array.from({ length: 24 }, (_, i) => ({
    hour: i,
    ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0, total: 0,
  }));

  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, direction)) continue;
    const h = Number(r.hour);

    const targetKey = resolveDisposition(r, lostDests);
    if (targetKey) {
      hours[h][targetKey] += Number(r.count);
    }
    hours[h].total += Number(r.count);
  }

  return hours;
}

async function queryQueues(pool, from, to, inboundChannels, outboundChannels, queues, lostDests) {
  if (!queues || queues.length === 0) return [];

  const [rows] = await pool.query(
    `SELECT channel, dst, disposition, COUNT(*) AS count
     FROM cdr
     WHERE calldate >= ? AND calldate < ?
     GROUP BY channel, dst, disposition`,
    [from, to]
  );

  const validDsts = new Set([...queues, ...lostDests]);
  const result = {};
  for (const q of queues) {
    result[q] = { queue: q, label: `Cola ${q}`, total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };
  }
  result['__lost__'] = { queue: '__lost__', label: 'Perdidas', total: 0, ANSWERED: 0, 'NO ANSWER': 0, BUSY: 0, FAILED: 0 };

  for (const r of rows) {
    if (!passesFilter(r.channel, inboundChannels, outboundChannels, 'in')) continue;
    if (!validDsts.has(r.dst)) continue;
    const key   = queues.includes(r.dst) ? r.dst : '__lost__';
    const d     = r.disposition.toUpperCase();
    result[key].total += Number(r.count);
    if (['ANSWERED', 'NO ANSWER', 'BUSY', 'FAILED'].includes(d))
      result[key][d] += Number(r.count);
  }

  return Object.values(result);
}

// ── Helpers de fecha (zona local del servidor) ────────────────────
function toMySQLDate(d) {
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
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

  // ── SQLite local DB ───────────────────────────────────────────
  const db = initDb(config);
  app.use('/api', require('./routes/users')(pool, config, db, requireAuth, requireAdmin));
  app.use('/api', inboundRouter(pool, config, requireAuth, extractChannel));
  app.use('/api', outboundRouter(pool, config, requireAuth, extractChannel));
  app.use('/api', statsRouter(pool, config, requireAuth));
  app.use('/api', reportsRouter(pool, config, db, requireAuth, extractChannel, dbOk));
  app.use('/api', configRouter(pool, config, db, requireAuth, requireAdmin, getAppName));

  // ── SSE — broadcast helper (declarado temprano para pbxHealthService) ──
  const sseClients = new Set();

  function broadcast(event, data) {
    const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const c of sseClients) {
      try { c.write(msg); } catch { sseClients.delete(c); }
    }
  }

  // ── PBX health monitoring (feature pbx_health) ─────────────────
  const createPbxHealthService = require('./services/pbxHealthService');
  const pbxHealthService = createPbxHealthService(pool, broadcast);
  pbxHealthService.start(15_000);

  // ── AMI extensions status (feature dashboard_extensions_status) ─
  const createAmiExtensionsService = require('./services/amiExtensionsService');
  const amiExtensionsService = createAmiExtensionsService(config.ami);
  amiExtensionsService.start(30_000);

  app.use('/api', require('./routes/pbx')(pool, config, db, requireAuth, pbxHealthService, amiExtensionsService));

  // ── Alertas y monitoreo (feature alerts_monitoring) ─────────────
  const createMailService = require('./services/mailService');
  const mailService = createMailService(config.smtp);
  const createAlertService = require('./services/alertService');
  const alertService = createAlertService(pool, config, db, broadcast, pbxHealthService, mailService);
  alertService.start();
  app.use('/api', require('./routes/alerts')(pool, config, db, requireAuth, requireAdmin, alertService));

  // ── Auth ──────────────────────────────────────────────────────
  app.post('/api/auth/login', async (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password)
      return res.status(400).json({ ok: false, error: 'Usuario y contraseña son requeridos' });

    const user = userService.findByUsername(db, username);
    if (!user) {
      auditService.logAction(db, { userId: null, username, action: 'login_failed', ip: req.ip });
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    if (user.active === 0) {
      auditService.logAction(db, { userId: user.id, username: user.username, action: 'login_failed', ip: req.ip });
      return res.status(401).json({ ok: false, error: 'Cuenta desactivada' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      auditService.logAction(db, { userId: user.id, username: user.username, action: 'login_failed', ip: req.ip });
      return res.status(401).json({ ok: false, error: 'Usuario o contraseña incorrectos' });
    }

    req.session.user = { id: user.id, username: user.username, role: user.role };
    userService.updateLastLogin(db, user.id);
    auditService.logAction(db, { userId: user.id, username: user.username, action: 'login', ip: req.ip });
    res.json({ ok: true, user: req.session.user });
  });

  app.post('/api/auth/logout', (req, res) => {
    if (req.session?.user) {
      auditService.logAction(db, {
        userId:   req.session.user.id,
        username: req.session.user.username,
        action:   'logout',
        ip:       req.ip,
      });
    }
    req.session.destroy(() => {
      res.clearCookie('connect.sid');
      res.json({ ok: true });
    });
  });

  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json({ ok: true, user: req.session.user });
  });

  // ── Helper: obtener datos completos ──────────────────────────
  const inboundChannels  = config.channels.inbound  || [];
  const outboundChannels = config.channels.outbound || [];
  const configQueues     = config.queues         || [];
  const lostDests        = config.lostDestinations || ['s', 'hang', 'hangup'];

  function getAliases()  { return config.channelAliases || {}; }
  function getAppName()  { return config.app?.name || 'Call Monitor'; }

  async function fetchData(from, to) {
    const [
      totalStats, totalChannels, totalHourly,
      inStats, inChannels, inHourly,
      outStats, outChannels,
      queues,
    ] = await Promise.all([
      queryStats(pool, from, to, inboundChannels, outboundChannels, null,  lostDests),
      queryChannels(pool, from, to, inboundChannels, outboundChannels, null, lostDests),
      queryHourly(pool, from, to, inboundChannels, outboundChannels, null, lostDests),
      queryStats(pool, from, to, inboundChannels, outboundChannels, 'in',  lostDests),
      queryChannels(pool, from, to, inboundChannels, outboundChannels, 'in', lostDests),
      queryHourly(pool, from, to, inboundChannels, outboundChannels, 'in', lostDests),
      queryStats(pool, from, to, inboundChannels, outboundChannels, 'out', lostDests),
      queryChannels(pool, from, to, inboundChannels, outboundChannels, 'out', lostDests),
      queryQueues(pool, from, to, inboundChannels, outboundChannels, configQueues, lostDests),
    ]);
    return {
      stats: totalStats, channels: totalChannels, hourly: totalHourly,
      inbound:  { stats: inStats,  channels: inChannels,  hourly: inHourly },
      outbound: { stats: outStats, channels: outChannels },
      queues,
      channelAliases: getAliases(),
      appName: getAppName(),
      from, to,
      generatedAt: new Date().toISOString(),
    };
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

    // Parsear como medianoche local (no UTC) para evitar desfase de un día
    const fromDate = new Date(from + 'T00:00:00');
    const toDate   = new Date(to   + 'T23:59:59');
    if (isNaN(fromDate) || isNaN(toDate))
      return res.status(400).json({ ok: false, error: 'Fechas inválidas' });

    try {
      const data = await fetchData(toMySQLDate(fromDate), toMySQLDate(toDate));
      res.json({ ok: true, ...data });
    } catch (e) {
      console.error('[API] /calls/range:', e.message);
      res.status(500).json({ ok: false, error: 'Error al consultar la base de datos' });
    }
  });

  // ── SSE — actualizaciones en tiempo real ──────────────────────
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
        data.pbxStatus = pbxHealthService.getStatus();
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
  // NOTE: GET /api/admin/users is now handled by the users router below.

  app.get('/api/config/public', (req, res) => {
    res.json({ appName: getAppName() });
  });

  app.put('/api/admin/app', requireAdmin, (req, res) => {
    const { name } = req.body || {};
    if (typeof name !== 'string' || !name.trim())
      return res.status(400).json({ ok: false, error: 'El campo name es requerido' });
    if (!config.app) config.app = {};
    config.app.name = name.trim();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    res.json({ ok: true, name: config.app.name });
  });

  app.get('/api/admin/channels', requireAdmin, (req, res) => {
    const aliases = getAliases();
    const inbound  = (config.channels.inbound  || []).map(ch => ({
      channel: ch,
      direction: 'inbound',
      alias: aliases[ch] || '',
    }));
    const outbound = (config.channels.outbound || []).map(ch => ({
      channel: ch,
      direction: 'outbound',
      alias: aliases[ch] || '',
    }));
    res.json({ ok: true, channels: [...inbound, ...outbound] });
  });

  app.put('/api/admin/channels/:channel', requireAdmin, (req, res) => {
    const channel = decodeURIComponent(req.params.channel);
    const { alias } = req.body || {};
    if (typeof alias !== 'string')
      return res.status(400).json({ ok: false, error: 'El campo alias es requerido' });
    if (!config.channels.inbound.includes(channel) && !config.channels.outbound.includes(channel))
      return res.status(404).json({ ok: false, error: 'Canal no encontrado' });

    if (!config.channelAliases) config.channelAliases = {};
    if (alias.trim()) {
      config.channelAliases[channel] = alias.trim();
    } else {
      delete config.channelAliases[channel];
    }
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    res.json({ ok: true, channel, alias: alias.trim() });
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
