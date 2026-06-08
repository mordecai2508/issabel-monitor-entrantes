# design.md — user_management

---

## 1. Endpoints nuevos

All new endpoints require session authentication. `/api/admin/*` additionally
requires `requireAdmin` (role = `admin`). Responses follow the project standard:
`{ ok: true, data: … }` on success, `{ ok: false, error: "…" }` on failure.

| Method | Route | Auth | Request body | Response body | HTTP codes |
|---|---|---|---|---|---|
| GET | `/api/admin/users` | Admin | — | `{ ok, data: [{ id, username, role, active, last_login }] }` | 200, 401, 403 |
| POST | `/api/admin/users` | Admin | `{ username, password, role }` | `{ ok, data: { id, username, role, active } }` | 201, 400, 401, 403, 409 |
| PATCH | `/api/admin/users/:id` | Admin | `{ username?, role?, active? }` (partial) | `{ ok, data: { id, username, role, active, last_login } }` | 200, 400, 401, 403, 404, 409 |
| POST | `/api/admin/users/:id/reset-password` | Admin | — | `{ ok, data: { temporaryPassword } }` | 200, 401, 403, 404 |
| GET | `/api/admin/audit-log` | Admin | — | `{ ok, data: [{ id, user_id, username, action, ip, timestamp }] }` | 200, 401, 403 |

### Endpoint overlap with v1.0

`GET /api/admin/users` already exists in `server.js` (line 440). It currently
reads from `config.users` and returns `{ ok, users: […] }` (note: key is `users`,
not `data`). The new router **shadows** the old handler because Express mounts
routers before the inline route registration in `startServer()` — the new router
is registered first.

To avoid breaking the frontend `ChannelAliasManager.jsx` or any consumer that
reads `response.users`, the new GET handler will return the response under **both**
keys for one release cycle:

```js
res.json({ ok: true, data: users, users }); // transitional dual-key
```

The `UserManagement.jsx` component (new) will consume `data`. Existing consumers
that read `users` continue to work. A follow-up cleanup task can remove the
legacy key when all consumers are updated.

---

## 2. Cambios en BD

### Table `users` (new — in `backend/db/monitor.sqlite`)

```sql
CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  username   TEXT    UNIQUE NOT NULL,
  password   TEXT    NOT NULL,          -- bcrypt hash, rounds=12
  role       TEXT    NOT NULL CHECK (role IN ('admin', 'operador')),
  active     INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT    NOT NULL DEFAULT (datetime('now')),
  last_login TEXT                        -- ISO datetime, nullable
);
```

### Table `audit_log` (new — in `backend/db/monitor.sqlite`)

```sql
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER,                   -- NULL on login_failed if user not found
  username   TEXT,                      -- denormalized for failed-login traceability
  action     TEXT    NOT NULL CHECK (action IN ('login', 'logout', 'login_failed')),
  ip         TEXT,
  timestamp  TEXT    NOT NULL DEFAULT (datetime('now'))
);
```

Index to keep audit queries fast:

```sql
CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log (timestamp DESC);
```

Both tables are created by `backend/db/setup.js` via `better-sqlite3`. The
`system_config`, `alert_rules`, and `alerts` tables from `architecture.md` are
also created by the same setup file (already specified in the architecture doc).

---

## 3. Dependencias nuevas

No new npm dependencies are required.

- `better-sqlite3` is already planned in the architecture as the SQLite driver.
  If it is not yet installed, `npm install better-sqlite3 --workspace=backend` is
  the single installation step (T1 in tasks).
- `bcryptjs` is already present in `backend/` (used by `server.js`).
- `crypto` (Node built-in) is used for generating temporary passwords — no package
  needed.

---

## 4. Lógica no obvia

### 4.1 Migration from config.json → SQLite

Executed once inside `backend/db/setup.js` as part of database initialization,
before the Express app starts accepting requests:

1. Open (or create) `backend/db/monitor.sqlite` with `better-sqlite3`.
2. Run `CREATE TABLE IF NOT EXISTS users …` and `CREATE TABLE IF NOT EXISTS audit_log …`.
3. Read `config.json` to obtain the `users` array.
4. For each config user, run:
   ```sql
   INSERT OR IGNORE INTO users (id, username, password, role, active)
   VALUES (?, ?, ?, ?, 1)
   ```
   `INSERT OR IGNORE` is safe for repeated restarts: if the username already
   exists the row is skipped (satisfies R2).
5. Return the open `db` instance to `startServer()`.

The migration is synchronous (better-sqlite3 is sync) and completes in
milliseconds even for dozens of users.

### 4.2 Login flow after migration (R25)

`server.js` `POST /api/auth/login` currently looks up `config.users`. After
this feature, the handler must:

1. Query `SELECT id, username, password, role, active FROM users WHERE username = ?`.
2. If no row found → 401.
3. If `active = 0` → 401 with "Cuenta desactivada" message (R26).
4. `bcrypt.compare(password, row.password)` → if false → 401.
5. On success: set `req.session.user`, update `last_login`, call `auditService.log(...)`.

The inline login handler in `server.js` is updated (the single allowed one-liner
change per architecture rules) by replacing `config.users.find(...)` with a call
to `userService.findByUsername(username)`. This is the **only** change to
`server.js` beyond mounting the new router.

### 4.3 Temporary password generation (R17)

```js
const crypto = require('crypto');

function generateTempPassword() {
  // 12 random bytes → 16-char base64url string (URL-safe, no padding)
  return crypto.randomBytes(12).toString('base64url');
}
```

The plain-text value is returned to the admin exactly once; only its bcrypt hash
is stored. The admin must communicate it to the user out-of-band.

### 4.4 Last-login update

On successful login, `userService` runs:

```sql
UPDATE users SET last_login = datetime('now') WHERE id = ?
```

### 4.5 Last active admin guard (R16)

Before deactivating a user or demoting them from `admin`:

```sql
SELECT COUNT(*) AS cnt FROM users WHERE role = 'admin' AND active = 1
```

If `cnt = 1` and the target user is that admin, reject with 409.

### 4.6 IP address extraction

Use `req.ip` (Express, honors `trust proxy` if set). Fallback:
`req.connection.remoteAddress`. Store as-is (may be IPv4-mapped IPv6 like
`::ffff:127.0.0.1`).

---

## 5. Componentes frontend

### `UserManagement.jsx`

- **Route**: `/admin/users` (admin-only, wrapped in existing `PrivateRoute` pattern)
- **Location**: `frontend/src/components/UserManagement.jsx`
- **Purpose**: Full CRUD table for users + audit log viewer.

**Sections:**

1. **Users table** — columns: Username, Role, Status (Active/Inactive), Last Login,
   Actions (Edit, Reset Password, Deactivate/Activate).
2. **Create user form** — inline or modal: Username, Password, Role selector.
3. **Edit user modal** — Username, Role, Active toggle.
4. **Reset password modal** — confirmation prompt; shows generated password once
   after confirmation.
5. **Audit log table** — last 200 entries: Timestamp, Username, Action, IP.
   Refreshed on tab click.

**API calls** (all via `src/api.js`):

```js
api.get('/api/admin/users')
api.post('/api/admin/users', { username, password, role })
api.patch(`/api/admin/users/${id}`, { username?, role?, active? })
api.post(`/api/admin/users/${id}/reset-password`)
api.get('/api/admin/audit-log')
```

**Error handling**: display inline banners (no `alert()`). Success: brief
success banner that auto-dismisses after 3 s.

### Navigation additions

- `App.jsx`: add `<Route path="/admin/users" element={<PrivateRoute adminOnly><UserManagement /></PrivateRoute>} />`.
- `Layout.jsx`: add sidebar item "Usuarios" with icon, visible only when
  `user.role === 'admin'`, linking to `/admin/users`.

---

## 6. Decisión técnica — SQLite vs seguir con config.json

| Criterio | config.json | SQLite (elegido) |
|---|---|---|
| CRUD seguro con concurrencia | No (race condition en writes) | Sí (better-sqlite3 serialized) |
| Soporte para auditoría (append-only log) | No viable (crecimiento ilimitado del JSON) | Sí (tabla dedicada, indexed) |
| Queries ad-hoc (filtros, paginación) | No | Sí (SQL) |
| Zero nueva infraestructura | Sí | Sí (archivo local, sin server) |
| Consistencia con arquitectura del proyecto | No (doc architecture.md prohíbe añadir más entidades a config.json) | Sí |

SQLite with `better-sqlite3` is the prescribed storage layer in `docs/architecture.md`
for all new local persistence needs. No external service is required.

---

## 7. Compatibilidad con v1.0

| Endpoint v1.0 | Status after feature | Notes |
|---|---|---|
| `POST /api/auth/login` | Modified (backward compatible) | Source of truth changes from `config.users` to SQLite `users` table. Response shape unchanged. |
| `POST /api/auth/logout` | Modified (backward compatible) | Adds audit log call. Response shape unchanged. |
| `GET /api/auth/me` | Unchanged | No modification needed. |
| `GET /api/admin/users` | Replaced by new router, dual-key response | Returns `{ ok, data, users }` transitionally. Shape is a superset of v1.0. |
| All other endpoints | Unchanged | No modification. |

The `config.users` array in `config.json` is **not deleted** during migration.
It remains as a fallback reference but is no longer the authentication source.
This ensures a clean rollback path if needed.
