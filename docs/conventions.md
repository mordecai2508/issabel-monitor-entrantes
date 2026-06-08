# docs/conventions.md — Convenciones de Código

> Aplicar sin excepción. El proyecto es **JavaScript puro** — no TypeScript.

---

## JavaScript

- `'use strict'` al inicio de cada archivo de backend nuevo.
- `async/await` con `try/catch` en todos los handlers Express.
- No usar `var`; preferir `const` sobre `let`.
- Destructuring donde mejore la legibilidad.
- Módulos CommonJS (`require/module.exports`) en backend; ESM (`import/export`) en frontend.

## Nombres

| Elemento | Convención | Ejemplo |
|---|---|---|
| Archivos de rutas | `camelCase.js` | `users.js`, `inboundCalls.js` |
| Archivos de servicios | `camelCase.js` | `exportService.js` |
| Componentes React | `PascalCase.jsx` | `UserManagement.jsx` |
| Hooks React | `use<Nombre>.js` | `useAlerts.js` |
| Variables/funciones | `camelCase` | `getUserById`, `totalAnswered` |
| Constantes | `SCREAMING_SNAKE_CASE` | `MAX_EXPORT_ROWS` |
| Rutas API | kebab-case | `/api/stats/historical`, `/api/admin/alert-rules` |

## Estructura de un router (backend)

```js
'use strict';
const express = require('express');

module.exports = function usersRouter(pool, config, db) {
  const router = express.Router();

  // GET /api/admin/users
  router.get('/admin/users', requireAdmin, async (req, res) => {
    try {
      const users = db.prepare('SELECT id, username, role, active, last_login FROM users').all();
      res.json({ ok: true, data: users });
    } catch (err) {
      console.error('[users] GET /admin/users:', err.message);
      res.status(500).json({ ok: false, error: 'Error al obtener usuarios' });
    }
  });

  return router;
};
```

> `requireAuth` y `requireAdmin` se importan o se reciben como argumentos del factory.

## SQL (CDR — solo lectura)

- Usar parámetros preparados (`?`) siempre. Nunca concatenar strings.
- Reutilizar las funciones `queryStats`, `queryChannels`, `queryHourly` del server.js existente cuando aplique.
- Queries nuevas sobre CDR van en `backend/services/cdrService.js`.
- Nombre explícito de columnas en SELECT; nunca `SELECT *`.
- Limitar resultados defensivamente: `LIMIT 10000` en queries de exportación si no se especifica.

## SQLite (BD local)

- Usar `better-sqlite3` (síncrono) para el SQLite local.
- Las queries simples van inline; las complejas en `backend/db/setup.js`.
- El archivo `monitor.sqlite` se crea automáticamente en `backend/db/` al arrancar.

## Frontend

- Todas las llamadas HTTP pasan por `src/api.js`. Nunca `fetch()` directo en componentes.
- Estado del servidor: fetching en hooks (`useQuery`-style o useState+useEffect).
- Tailwind para estilos; no añadir archivos CSS adicionales salvo en `index.css`.
- Recharts para gráficos (ya instalado). No añadir otras librerías de gráficos.
- Mensajes de error: toast o banner inline; nunca `alert()`.

## Tests

- Backend: Jest + Supertest. Un test por endpoint (éxito + error).
- Cada test nombra el requisito: `it('R1 - debe devolver lista de usuarios', ...)`.
- Los tests de backend levantan el servidor con una BD SQLite en memoria (`:memory:`).
- No hacer requests reales a la BD de Issabel en tests (usar mocks o fixtures).

## Exportación

- Excel: librería `exceljs` (añadir como dependencia).
- PDF: librería `pdfkit` (añadir como dependencia).
- Los archivos temporales de export se generan en memoria o en `/tmp/`, nunca en `backend/uploads/`.

## Lo que nunca debe aparecer

- `console.log` de debug (solo `console.error` en catch blocks).
- `SELECT *` en queries SQL.
- Contraseñas o secrets en código fuente.
- `eval()` o construcción dinámica de SQL con strings.
- Fetch directo en componentes React.
- Dependencias nuevas sin justificación en la spec.
