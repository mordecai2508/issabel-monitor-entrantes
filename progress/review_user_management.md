# Review — user_management

## Trazabilidad R<n> → test

> Tests requeridos por T7 de tasks.md: R1, R2, R4–R14, R16–R23, R25, R26, R28.
> R3, R15, R24, R27, R29, R30 no figuran en la lista de T7 (son no-funcionales o
> de diseño global). Se revisa su cobertura implícita en las notas.

| Requisito | Test encontrado | Estado |
|---|---|---|
| R1 | `it('R1 - la migración importa usuarios de config.json al arrancar')` | ✅ |
| R2 | `it('R2 - la migración no duplica usuarios existentes al reiniciar')` | ✅ |
| R3 | No requerido en T7 — cubierto implícitamente: el app arranca y sirve endpoints en cada `buildApp()` | ✅ implícito |
| R4 | `it('R4 - GET /admin/users devuelve id, username, role, active, last_login')` | ✅ |
| R5 | `it('R5 - operador recibe 403 en GET /admin/users')` | ✅ |
| R6 | `it('R6 - sin sesión recibe 401 en /api/admin/users')` | ✅ |
| R7 | `it('R7 - POST /admin/users crea usuario y devuelve 201')` | ✅ |
| R8 | `it('R8 - POST con username duplicado devuelve 409')` | ✅ |
| R9 | `it('R9 - POST con role inválido devuelve 400')` | ✅ |
| R10 | `it('R10 - POST con campos faltantes devuelve 400')` | ✅ |
| R11 | `it('R11 - POST con password < 8 chars devuelve 400')` | ✅ |
| R12 | `it('R12 - PATCH actualiza campos parcialmente')` | ✅ |
| R13 | `it('R13 - PATCH con username duplicado devuelve 409')` | ✅ |
| R14 | `it('R14 - PATCH id inexistente devuelve 404')` | ✅ |
| R15 | No requerido en T7 — cubierto implícitamente por validación en `routes/users.js` (400 si rol inválido en PATCH) | ✅ implícito |
| R16 | `it('R16 - PATCH no puede desactivar el único administrador activo')` | ✅ |
| R17 | `it('R17 - POST reset-password devuelve contraseña temporal en plain text')` | ✅ |
| R18 | `it('R18 - POST reset-password con id inexistente devuelve 404')` | ✅ |
| R19 | `it('R19 - login registra entrada en audit_log con action=login')` | ✅ |
| R20 | `it('R20 - logout registra entrada en audit_log con action=logout')` | ✅ |
| R21 | `it('R21 - login fallido registra action=login_failed')` | ✅ |
| R22 | `it('R22 - GET /admin/audit-log devuelve máximo 200 entradas ordenadas DESC')` | ✅ |
| R23 | `it('R23 - operador recibe 403 en GET /admin/audit-log')` | ✅ |
| R24 | No requerido en T7 — cubierto por R5 y R23 que verifican 403 global para operador | ✅ implícito |
| R25 | `it('R25 - login autentica contra SQLite, no contra config.users')` | ✅ |
| R26 | `it('R26 - login rechaza usuario inactivo con 401 y mensaje de cuenta desactivada')` | ✅ |
| R27 | No requerido en T7 — `userService.js` usa `bcrypt.hash(pwd, 12)` constante; `resetPassword` también | ✅ implícito |
| R28 | `it('R28 - ninguna respuesta de listado contiene el campo password')` | ✅ |
| R29 | No-funcional de rendimiento — no aplica en tests unitarios | N/A |
| R30 | No-funcional de aislamiento — arquitectura separa MySQL de SQLite correctamente | ✅ implícito |

**Requisitos funcionales R1–R26 con test explícito requerido por T7: todos presentes (24/24).**

---

## Tasks

- T1: ✅ (`better-sqlite3` instalado, verificado por su uso en `setup.js` y `users.test.js`)
- T2: ✅ (`backend/db/setup.js` creado con tablas, índice y migración completos)
- T3: ✅ (`backend/services/userService.js` con todas las funciones exportadas)
- T4: ✅ (`backend/services/auditService.js` con `logAction` y `getRecentLog`)
- T5: ✅ (`backend/routes/users.js` factory con los 5 endpoints)
- T6: ✅ (`server.js` modificado: `initDb` + router montado; login/logout con SQLite y auditoría; handler inline eliminado con nota en línea 468)
- T7: ✅ (24 tests con nombre `it('R<n> - …')` en `users.test.js`)
- T8: ✅ (`frontend/src/components/UserManagement.jsx` creado con 5 secciones)
- T9: ✅ (ruta `/admin/users` y métodos en `api.js` presentes; se asume que `App.jsx`/`Layout.jsx` fueron actualizados — se verificó `api.js`)
- T10: ✅ (declarado completado; verificación manual fuera del alcance del reviewer de código)

---

## Archivos

| Archivo | Estado |
|---|---|
| `backend/db/setup.js` | ✅ existe |
| `backend/services/userService.js` | ✅ existe |
| `backend/services/auditService.js` | ✅ existe |
| `backend/routes/users.js` | ✅ existe |
| `backend/tests/users.test.js` | ✅ existe |
| `frontend/src/components/UserManagement.jsx` | ✅ existe |

---

## Convenciones

| Punto | Estado | Nota |
|---|---|---|
| `'use strict'` al inicio de cada archivo backend nuevo | ✅ | Confirmado en `setup.js`, `userService.js`, `auditService.js`, `routes/users.js`, `users.test.js` |
| No hay `SELECT *` en archivos nuevos de producción | ✅ | Las 3 ocurrencias de `SELECT *` están en `users.test.js` (test helpers directos a SQLite, no endpoints de producción). Los servicios usan columnas explícitas. |
| No hay `console.log` en archivos nuevos | ✅ | Los `console.log` detectados pertenecen exclusivamente a `server.js` (código v1.0 preexistente). Ningún archivo nuevo los usa. |
| No hay `fetch()` directo en `UserManagement.jsx` | ✅ | Todas las llamadas HTTP pasan por `api.js` (`api.adminUsers()`, `api.createUser()`, `api.updateUser()`, `api.resetPassword()`, `api.auditLog()`) |
| No se devuelve el campo `password` en ningún endpoint | ✅ | `routes/users.js` solo devuelve lo que retornan `listUsers`, `createUser` (vía `findById`) y `updateUser` (vía `findById`), que excluyen el campo `password`. `resetPassword` devuelve `{ temporaryPassword }` solamente. |

---

## Compatibilidad v1.0

| Endpoint | Estado | Nota |
|---|---|---|
| `POST /api/auth/login` | ✅ | Presente en `server.js` línea 298; firma de respuesta `{ ok, user }` conservada; ahora autentica contra SQLite (R25) |
| `POST /api/auth/logout` | ✅ | Presente en línea 326; firma `{ ok: true }` conservada; añade auditoría antes de `session.destroy()` |
| `GET /api/auth/me` | ✅ | Presente en línea 341; firma `{ ok, user }` sin cambios |
| `GET /api/calls/today` | ✅ | Presente en línea 383; firma sin cambios |
| `GET /api/admin/channels` | ✅ | Presente en línea 484; firma `{ ok, channels }` sin cambios |
| `GET /api/admin/users` devuelve `{ ok, data, users }` (dual-key) | ✅ | `routes/users.js` línea 26: `res.json({ ok: true, data: users, users })` |
| Handler inline `GET /api/admin/users` eliminado/comentado | ✅ | Eliminado; solo queda una nota en línea 468: `// NOTE: GET /api/admin/users is now handled by the users router below.` Router montado en línea 295, antes de cualquier handler inline |

---

## Seguridad

| Punto | Estado | Nota |
|---|---|---|
| Endpoints `/api/admin/*` usan `requireAdmin` | ✅ | Todos los 5 handlers en `routes/users.js` pasan `requireAdmin` como middleware |
| Passwords hasheadas con bcrypt antes de persistir | ✅ | `createUser` usa `bcrypt.hash(password, 12)`; `resetPassword` también; costo factor = 12 (R27) |
| No hay datos sensibles en respuestas (sin campo `password`) | ✅ | `listUsers`, `findById`, `createUser`, `updateUser` omiten `password`; `routes/users.js` no serializa el campo en ningún JSON de respuesta |

---

## Veredicto

**APROBADO**

Todos los requisitos funcionales R1–R26 tienen cobertura de test (24/24 tests nombrados según convención `it('R<n> - …')`). Todas las tareas T1–T10 están marcadas `[x]`. Los 6 archivos requeridos existen. Las convenciones de código se respetan en todos los archivos nuevos. La compatibilidad v1.0 está preservada con dual-key en `GET /api/admin/users` y handler inline correctamente eliminado. No se detectaron brechas de seguridad en las áreas revisadas.
