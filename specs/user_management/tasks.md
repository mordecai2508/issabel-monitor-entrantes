# tasks.md — user_management

> El implementer sigue este orden estrictamente, marcando `[x]` al completar cada tarea.
> No iniciar T(n+1) si T(n) falla o está incompleto.

---

- [x] T1. Instalar `better-sqlite3` en el workspace backend si no está ya presente
      (`npm install better-sqlite3 --workspace=backend`). Verificar que
      `backend/package.json` lo lista en `dependencies`.

- [x] T2. Crear/actualizar `backend/db/setup.js`:
      - Crear el directorio `backend/db/` si no existe.
      - Abrir (o crear) `backend/db/monitor.sqlite` con `better-sqlite3`.
      - Ejecutar `CREATE TABLE IF NOT EXISTS users (…)` con el esquema completo
        de `design.md` §2 (columnas: id, username, password, role, active,
        created_at, last_login; CHECK constraints en role y active).
      - Ejecutar `CREATE TABLE IF NOT EXISTS audit_log (…)` con el esquema completo
        (columnas: id, user_id, username, action, ip, timestamp; CHECK en action).
      - Crear índice `idx_audit_log_timestamp` en `audit_log(timestamp DESC)`.
      - Implementar la migración desde `config.json`: leer el array `users` e
        insertar cada uno con `INSERT OR IGNORE` (preserva id, username, password,
        role; activo = 1). Ver §4.1 de `design.md`.
      - Exportar la función `initDb(config)` que devuelve la instancia `db`.

- [x] T3. Crear `backend/services/userService.js` con las siguientes funciones
      exportadas (todas reciben `db` como primer argumento o lo reciben del módulo):
      - `findByUsername(db, username)` → row | undefined
      - `findById(db, id)` → row | undefined
      - `listUsers(db)` → array de `{ id, username, role, active, last_login }`
      - `createUser(db, { username, password, role })` → `{ id, username, role, active }`
        (hash de password con bcrypt rounds=12 antes de insertar; lanza error si
        username duplicado)
      - `updateUser(db, id, { username?, role?, active? })` → row actualizado
        (validar last-admin guard de R16 antes de desactivar o degradar)
      - `resetPassword(db, id)` → `{ temporaryPassword }` (genera con `crypto`,
        guarda hash, devuelve plano)
      - `updateLastLogin(db, id)` → void (UPDATE last_login = datetime('now'))
      - Todas las funciones de escritura usan sentencias `better-sqlite3` preparadas.
      - Nunca devolver el campo `password` en ningún objeto retornado.

- [x] T4. Crear `backend/services/auditService.js` con:
      - `logAction(db, { userId, username, action, ip })` → void
        (INSERT en audit_log; userId puede ser null para login_failed sin usuario encontrado)
      - `getRecentLog(db, limit = 200)` → array de 200 entradas más recientes,
        ordenadas timestamp DESC, con username resuelto (puede estar desnormalizado
        en la tabla o hacer JOIN simple).

- [x] T5. Crear `backend/routes/users.js` como factory `usersRouter(pool, config, db)`:
      - `GET  /admin/users` — llama `userService.listUsers(db)`. Responde
        `{ ok, data: users, users }` (dual-key transitional; ver §7 design.md).
      - `POST /admin/users` — valida campos, llama `userService.createUser(db, …)`,
        responde 201.
      - `PATCH /admin/users/:id` — valida campos parciales, llama
        `userService.updateUser(db, id, body)`, responde 200.
      - `POST /admin/users/:id/reset-password` — llama
        `userService.resetPassword(db, id)`, responde 200 con `{ ok, data: { temporaryPassword } }`.
      - `GET  /admin/audit-log` — llama `auditService.getRecentLog(db)`, responde 200.
      - Todos los endpoints usan `requireAdmin`. Importar/recibir `requireAdmin`
        y `requireAuth` como argumentos del factory (o re-implementar localmente
        basándose en `req.session.user`).
      - `try/catch` en todos los handlers; `console.error` solo en catch.
      - Seguir la convención de estructura de router de `docs/conventions.md`.

- [x] T6. Modificar `backend/server.js` (cambios mínimos, dos modificaciones):
      a) En `startServer()`, antes de `app.listen()`, añadir:
         ```js
         const db = require('./db/setup')(config);
         const usersRouter = require('./routes/users');
         app.use('/api', usersRouter(pool, config, db, requireAuth, requireAdmin));
         ```
      b) En `POST /api/auth/login`, reemplazar la búsqueda en `config.users` por
         `userService.findByUsername(db, username)`, añadir la comprobación de
         `active` (R26), actualizar `last_login` en éxito, y llamar a
         `auditService.logAction(db, …)` tanto en éxito (action=`login`) como en
         fallo (action=`login_failed`).
      c) En `POST /api/auth/logout`, añadir llamada a
         `auditService.logAction(db, { userId: req.session.user.id, … action: 'logout' })`
         antes de `session.destroy()`.
      - El endpoint GET `/api/admin/users` inline existente (línea ~440) debe
        eliminarse o comentarse para evitar que eclipse al router (el router debe
        montarse ANTES del inline handler, o el inline handler debe eliminarse).

- [x] T7. Escribir `backend/tests/users.test.js` usando Jest + Supertest:
      - Setup: instanciar la app con SQLite `:memory:`, poblar un admin y un operador.
      - Un test por cada requisito funcional citado abajo:
        - `R1`  — la migración importa usuarios de config.json al arrancar.
        - `R2`  — la migración no duplica usuarios existentes.
        - `R4`  — GET /admin/users devuelve id, username, role, active, last_login.
        - `R5`  — operador recibe 403 en GET /admin/users.
        - `R6`  — sin sesión recibe 401 en /admin/users.
        - `R7`  — POST /admin/users crea usuario y devuelve 201.
        - `R8`  — POST con username duplicado devuelve 409.
        - `R9`  — POST con role inválido devuelve 400.
        - `R10` — POST con campos faltantes devuelve 400.
        - `R11` — POST con password < 8 chars devuelve 400.
        - `R12` — PATCH actualiza campos parcialmente.
        - `R13` — PATCH con username duplicado devuelve 409.
        - `R14` — PATCH id inexistente devuelve 404.
        - `R16` — PATCH no puede desactivar el único admin activo (409).
        - `R17` — POST reset-password devuelve contraseña temporal en plain text.
        - `R18` — POST reset-password con id inexistente devuelve 404.
        - `R19` — login registra entrada en audit_log con action=login.
        - `R20` — logout registra entrada en audit_log con action=logout.
        - `R21` — login fallido registra action=login_failed.
        - `R22` — GET /admin/audit-log devuelve máximo 200 entradas ordenadas DESC.
        - `R23` — operador recibe 403 en GET /admin/audit-log.
        - `R25` — login autentica contra SQLite, no contra config.users.
        - `R26` — login rechaza usuario inactivo con 401.
        - `R28` — ninguna respuesta contiene el campo password.
      - Nombrar cada test como: `it('R<n> - <descripción en español>', …)`.
      - No hacer requests reales a MySQL; mockear `pool` si fuera necesario.

- [x] T8. Crear `frontend/src/components/UserManagement.jsx`:
      - Sección 1: tabla de usuarios con columnas Username, Role, Estado, Último Login,
        Acciones (Editar, Reset Password, Activar/Desactivar).
      - Sección 2: formulario de creación (Username, Password, Role). Inline o modal.
      - Sección 3: modal de edición (Username, Role, toggle Active).
      - Sección 4: modal de reset password — muestra la contraseña temporal generada
        una sola vez con indicación de "guárdala, no se mostrará de nuevo".
      - Sección 5: tabla de auditoría (últimas 200 entradas; se carga al hacer clic
        en pestaña "Auditoría").
      - Todas las llamadas HTTP via `src/api.js` (nunca fetch directo).
      - Mensajes de error: banner inline; mensajes de éxito: banner auto-dismiss 3 s.
      - No añadir librerías de UI externas; usar Tailwind.

- [x] T9. Añadir ruta y navegación:
      - `frontend/src/App.jsx`: añadir
        `<Route path="/admin/users" element={<PrivateRoute adminOnly><UserManagement /></PrivateRoute>} />`
        siguiendo el patrón existente de rutas protegidas.
      - `frontend/src/components/Layout.jsx`: añadir ítem "Usuarios" en la sección
        de admin del sidebar, visible solo cuando `user.role === 'admin'`,
        con enlace a `/admin/users`. Seguir el estilo visual de los ítems existentes.

- [x] T10. Verificación final:
      - `npm test` en `backend/` — todos los tests de `users.test.js` en verde.
      - `npm run lint` (si existe script) — sin errores ni advertencias nuevas.
      - `npm run build` — build de frontend sin errores.
      - Smoke test manual de no-regresión: login, logout, GET /api/auth/me,
        GET /api/calls/today, GET /api/admin/channels — todos responden igual que en v1.0.
      - Verificar que GET /api/admin/users devuelve `{ ok: true, data: […], users: […] }`
        (dual-key) para compatibilidad transitional.
