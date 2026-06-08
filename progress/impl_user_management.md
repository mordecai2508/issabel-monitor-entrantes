# Implementación — user_management

## Archivos creados/modificados

### Creados
- `backend/db/setup.js` — initDb(config): crea tablas users/audit_log, índice, migración desde config.json
- `backend/services/userService.js` — findByUsername, findById, listUsers, createUser, updateUser, resetPassword, updateLastLogin
- `backend/services/auditService.js` — logAction, getRecentLog
- `backend/routes/users.js` — factory usersRouter: 5 endpoints admin
- `backend/tests/users.test.js` — 24 tests Jest+Supertest con SQLite :memory:
- `frontend/src/components/UserManagement.jsx` — CRUD tabla usuarios + modal edición + modal reset + tabla auditoría

### Modificados
- `backend/package.json` — añadido better-sqlite3 (dep), jest+supertest (devDep), script "test"
- `backend/server.js` — require initDb/userService/auditService; db=initDb(config) antes de rutas auth; login migrado a SQLite + audit; logout + audit; inline GET /admin/users eliminado; router montado en /api
- `frontend/src/api.js` — añadidos createUser, updateUser, resetPassword, auditLog
- `frontend/src/App.jsx` — import UserManagement; ruta /admin/users con AdminRoute
- `frontend/src/components/Layout.jsx` — import Users icon; NavItem "Usuarios" visible para admin

## Trazabilidad R<n> → test

| Requisito | Descripción del test | Archivo:línea |
|---|---|---|
| R1 | la migración importa usuarios de config.json al arrancar | users.test.js:138 |
| R2 | la migración no duplica usuarios existentes al reiniciar | users.test.js:144 |
| R4 | GET /admin/users devuelve id, username, role, active, last_login | users.test.js:155 |
| R5 | operador recibe 403 en GET /admin/users | users.test.js:170 |
| R6 | sin sesión recibe 401 en /api/admin/users | users.test.js:175 |
| R7 | POST /admin/users crea usuario y devuelve 201 | users.test.js:181 |
| R8 | POST con username duplicado devuelve 409 | users.test.js:196 |
| R9 | POST con role inválido devuelve 400 | users.test.js:207 |
| R10 | POST con campos faltantes devuelve 400 | users.test.js:217 |
| R11 | POST con password < 8 chars devuelve 400 | users.test.js:223 |
| R12 | PATCH actualiza campos parcialmente | users.test.js:232 |
| R13 | PATCH con username duplicado devuelve 409 | users.test.js:248 |
| R14 | PATCH id inexistente devuelve 404 | users.test.js:258 |
| R16 | PATCH no puede desactivar el único administrador activo | users.test.js:264 |
| R17 | POST reset-password devuelve contraseña temporal en plain text | users.test.js:271 |
| R18 | POST reset-password con id inexistente devuelve 404 | users.test.js:282 |
| R19 | login registra entrada en audit_log con action=login | users.test.js:289 |
| R20 | logout registra entrada en audit_log con action=logout | users.test.js:297 |
| R21 | login fallido registra action=login_failed | users.test.js:305 |
| R22 | GET /admin/audit-log devuelve máximo 200 entradas ordenadas DESC | users.test.js:312 |
| R23 | operador recibe 403 en GET /admin/audit-log | users.test.js:329 |
| R25 | login autentica contra SQLite, no contra config.users | users.test.js:335 |
| R26 | login rechaza usuario inactivo con 401 y mensaje de cuenta desactivada | users.test.js:343 |
| R28 | ninguna respuesta de listado contiene el campo password | users.test.js:356 |

## Resultado

- Tests: 24/24 passing
- Build frontend: ✅ (advertencia de chunk size pre-existente, no nueva)
- No-regresión: ✅ (módulos cargan sin errores; login/logout no regressionados)
- Notas:
  - La tabla `users` usa `role IN ('admin','operador')` con CHECK constraint SQLite.
  - El campo `active` se migra como INTEGER 1/0 (SQLite no tiene BOOLEAN nativo).
  - La ruta frontend usa el patrón `AdminRoute` existente (no `PrivateRoute adminOnly`) ya que ese componente exacto provee la misma funcionalidad en este codebase.
  - GET /api/admin/users devuelve `{ ok, data, users }` (dual-key) para compatibilidad con ChannelAliasManager y otros consumidores de v1.0.
  - `better-sqlite3` versión 12.x instalada; WAL mode activado para concurrencia.
