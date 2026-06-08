# docs/architecture.md — Arquitectura del Sistema

---

## Stack tecnológico

| Capa | Tecnología |
|---|---|
| Backend | Node.js + Express.js (JavaScript, sin TypeScript) |
| Sesiones | express-session (httpOnly cookie, 24h) |
| Hashing | bcryptjs (rounds=12) |
| BD Issabel | MySQL via mysql2/promise (solo lectura, tabla `cdr`) |
| BD local | SQLite via better-sqlite3 (usuarios, alertas, auditoría) |
| Real-time | Server-Sent Events (SSE nativo) |
| Frontend | React 18 + Vite + Tailwind CSS + Recharts |
| Router | React Router v6 |
| Tests | Jest + Supertest (backend) / Vitest (frontend) |
| Deploy | Docker (un contenedor; backend sirve el frontend compilado) |

---

## Estructura de carpetas (objetivo)

El proyecto ya existe como monolito. Las nuevas features se añaden como
**extensiones** sin romper el código existente:

```
backend/
├── server.js           # Existente — NO modificar su estructura interna
│                       # Solo añadir require() de los nuevos routers al final
├── config.json         # Existente — NO añadir más entidades aquí
├── config.example.json # Existente
├── db/
│   ├── setup.js        # Inicializa monitor.sqlite con las tablas locales
│   └── monitor.sqlite  # Auto-creado al arrancar (gitignored)
├── routes/             # Nuevos archivos de rutas (uno por feature)
│   ├── users.js        # /api/admin/users — user_management
│   ├── inbound.js      # /api/calls/inbound — inbound_filters_export
│   ├── outbound.js     # /api/calls/outbound — outbound_filters_export
│   ├── stats.js        # /api/stats/historical, /api/stats/compare, /api/stats/rankings
│   ├── reports.js      # /api/reports/:type — reports_module
│   ├── config.js       # /api/admin/config — system_config
│   ├── pbx.js          # /api/pbx/health, /api/pbx/sync — pbx_health
│   └── alerts.js       # /api/alerts, /api/admin/alerts — alerts_monitoring
├── services/           # Lógica de negocio separada
│   ├── cdrService.js   # Wraps de las funciones CDR existentes
│   ├── exportService.js# Genera XLSX y PDF
│   ├── reportService.js# Genera reportes completos
│   ├── alertService.js # Evaluación de reglas de alerta
│   └── mailService.js  # Envío de correos (nodemailer)
├── uploads/            # Logos subidos (gitignored excepto .gitkeep)
└── tests/
    ├── users.test.js
    ├── inbound.test.js
    └── ...

frontend/src/
├── (archivos existentes — no modificar salvo para añadir rutas/nav)
├── components/
│   ├── (existentes)
│   ├── UserManagement.jsx
│   ├── InboundTable.jsx       # Reemplaza/extiende InboundView.jsx
│   ├── OutboundTable.jsx
│   ├── HistoricalAnalytics.jsx
│   ├── ReportsModule.jsx
│   ├── SystemConfig.jsx
│   ├── PbxStatus.jsx          # Indicador en Layout.jsx
│   └── AlertsPanel.jsx
└── hooks/
    ├── useSSE.js              # Existente — añadir manejo de 'pbx_status' y 'alert'
    └── useAlerts.js           # Nuevo
```

---

## Patrón de integración de nuevas rutas

Para no modificar la estructura existente de `server.js`, cada nueva feature
añade un archivo en `backend/routes/` y se monta con una sola línea en `server.js`:

```js
// Al final de server.js, dentro de startServer(), antes de app.listen():
const usersRouter = require('./routes/users');
app.use('/api', usersRouter(pool, config, db));  // db = instancia SQLite
```

Cada router recibe `(pool, config, db)` como factory:
```js
// backend/routes/users.js
const express = require('express');

module.exports = function usersRouter(pool, config, db) {
  const router = express.Router();
  // ... endpoints
  return router;
};
```

---

## BD local SQLite (nuevas tablas)

Solo para datos propios del monitor (no de Issabel):

```sql
-- Usuarios (migración desde config.json)
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT UNIQUE NOT NULL,
  password   TEXT NOT NULL,        -- bcrypt hash
  role       TEXT NOT NULL,        -- 'admin' | 'operador'
  active     INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- Auditoría de accesos
CREATE TABLE IF NOT EXISTS audit_log (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id   INTEGER,
  action    TEXT NOT NULL,         -- 'login' | 'logout' | 'login_failed'
  ip        TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Configuración del sistema
CREATE TABLE IF NOT EXISTS system_config (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- Reglas de alerta
CREATE TABLE IF NOT EXISTS alert_rules (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT NOT NULL,       -- 'trunk_down' | 'ext_unreachable' | 'lost_spike' | 'pbx_disconnect'
  threshold    REAL,
  enabled      INTEGER DEFAULT 1,
  notify_email TEXT
);

-- Alertas activas
CREATE TABLE IF NOT EXISTS alerts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id     INTEGER REFERENCES alert_rules(id),
  type        TEXT NOT NULL,
  description TEXT,
  resolved    INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  resolved_at TEXT
);
```

---

## Respuesta estándar de API

```js
// Éxito
res.json({ ok: true, data: <payload> });
res.status(201).json({ ok: true, data: <payload> });

// Error
res.status(400).json({ ok: false, error: 'Mensaje descriptivo' });
res.status(401).json({ ok: false, error: 'No autenticado' });
res.status(403).json({ ok: false, error: 'Se requiere rol de administrador' });
res.status(404).json({ ok: false, error: 'No encontrado' });
res.status(500).json({ ok: false, error: 'Error interno del servidor' });
```

---

## Seguridad

- Contraseñas hasheadas con bcrypt (rounds=12) antes de persistir.
- Sesiones con httpOnly cookie (24h); `sameSite: 'lax'`.
- Los endpoints `/api/admin/*` requieren `requireAdmin`.
- Los endpoints de consulta requieren `requireAuth`.
- Ningún dato de la BD Issabel se escribe (solo SELECT).
- Los archivos subidos (logos) se validan por MIME y tamaño (<=2MB).
- El secreto de sesión se lee de `config.json` (nunca hardcodeado).

---

## Reglas de rendimiento (RNF-02)

- Dashboard: respuesta < 5 s. El polling SSE es cada 30 s.
- Consultas históricas < 10 s. Usar índices en las queries CDR (el índice
  `calldate` debe existir en la BD de Issabel; si no, agregar `LIMIT` defensivo).
- Los exports (Excel/PDF) se generan bajo demanda sin cache; si tarda > 10 s,
  devolver 504 con mensaje claro.
