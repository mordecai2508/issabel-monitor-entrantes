# tasks.md — historical_analytics

> Feature ID: 11 | Orden de implementación | Revisión: 2026-06-08

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

---

- [x] **T1. Crear `backend/services/statsService.js`**
  - Archivo: `backend/services/statsService.js`
  - Añadir `'use strict'` al inicio.
  - Exportar tres funciones: `queryHistorical(pool, period, from, to)`, `queryCompare(pool, p1from, p1to, p2from, p2to)`, `queryRankings(pool, from, to, type, limit)`.
  - Implementar las queries SQL según `design.md §2, §3, §4`.
  - `queryHistorical`: seleccionar el `DATE_FORMAT` según `period`; para `custom` hacer la query de agregado total y construir el array `points` con un único elemento.
  - `queryCompare`: ejecutar dos queries de totales en `Promise.all`, calcular variación con `calcVariation` (null si v1 === 0).
  - `queryRankings`: aplicar `Math.min(limit, 50)` antes de la query; ramificar por `type` (`src` vs canal normalizado).
  - Usar parámetros preparados (`?`) en todas las queries; nunca concatenar strings SQL.

- [x] **T2. Crear `backend/routes/stats.js`**
  - Archivo: `backend/routes/stats.js`
  - Patrón factory: `module.exports = function statsRouter(pool, config, requireAuth) { ... }`.
  - Añadir `'use strict'` al inicio.
  - Implementar `GET /stats/historical`: validar `period`, `from`, `to`; llamar `statsService.queryHistorical`; devolver `{ ok: true, data: result }`.
  - Implementar `GET /stats/compare`: validar los cuatro parámetros de fecha y que `period_from <= period_to` en ambos períodos; llamar `statsService.queryCompare`.
  - Implementar `GET /stats/rankings`: validar `type`, `from`, `to`, y `limit` (entero 1–50, default 10); llamar `statsService.queryRankings`.
  - Todos los endpoints requieren `requireAuth`.
  - Manejar errores de BD con `console.error` y devolver HTTP 500 con `{ ok: false, error: ... }`.
  - Si `dbOk` es false (recibido como parámetro del factory), devolver HTTP 503 con `{ ok: false, error: 'Base de datos no disponible' }`.

- [x] **T3. Registrar el router en `backend/server.js`**
  - Dentro de `startServer()`, después de la línea que registra `outboundRouter` y antes de los endpoints inline de auth, añadir:
    ```js
    const statsRouter = require('./routes/stats');
    app.use('/api', statsRouter(pool, config, requireAuth, dbOk));
    ```
  - Solo esta línea; no modificar ninguna otra parte de `server.js`.

- [x] **T4. Escribir tests `backend/tests/stats.test.js`**
  - Archivo: `backend/tests/stats.test.js`
  - Framework: Jest + Supertest.
  - Crear una instancia de Express con el router montado, usando un `pool` mockeado (`jest.fn` o objeto con `query` mockeado).
  - Incluir un test por requisito relevante, nombrando cada `it` con el código de requisito:
    - `R1` — GET /stats/historical con parámetros válidos retorna 200 y estructura correcta.
    - `R2`–`R6` — un test por cada value de `period`; verificar que `period_label` tiene el formato correcto.
    - `R8` — period inválido retorna 400.
    - `R9` — from/to ausentes o inválidos retornan 400.
    - `R10` — from posterior a to retorna 400.
    - `R11` — rango sin datos retorna 200 con `points: []`.
    - `R12` — sin sesión retorna 401 (en los tres endpoints).
    - `R14`–`R17` — GET /stats/compare retorna 200 con variación correcta incluidos casos null.
    - `R18`–`R19` — parámetros inválidos de compare retornan 400.
    - `R22`–`R25` — GET /stats/rankings retorna 200 con estructura correcta para ambos tipos.
    - `R27` — limit fuera de rango retorna 400.
    - `R28` — type inválido retorna 400.
    - `R30` — rango sin datos retorna 200 con `rankings: []`.
  - No hacer queries reales a la BD de Issabel; usar mocks de `pool.query`.

- [x] **T5. Crear `frontend/src/components/HistoricalAnalytics.jsx`**
  - Archivo: `frontend/src/components/HistoricalAnalytics.jsx` (componente nuevo, no modifica ningún existente).
  - Implementar el PeriodSelector con los cinco botones (Día, Semana, Mes, Año, Personalizado) y la lógica de auto-fill de fechas según `design.md §7`.
  - Sección Tendencia: `<ResponsiveContainer><BarChart>` (o `LineChart`) de Recharts, con `dataKey="total"` y el eje X mostrando `period_label`; llamar `api.statsHistorical` al pulsar "Consultar".
  - Sección Comparativa: dos pares de date pickers (Período 1 / Período 2) y botón "Comparar"; tabla con columnas KPI | P1 | P2 | Variación%; variación positiva en verde (`text-green-400`), negativa en rojo (`text-red-400`), null como `—`.
  - Sección Rankings: toggle extensiones/troncales + input `limit` (1–50); tabla con columnas # | Nombre | Total | Contestadas | No contestadas | Duración media.
  - Cada sección gestiona su propio estado `loading`/`error`/`data` con `useState` + handlers; no auto-fetch en mount.
  - Mostrar spinner durante carga y banner inline en error (no `alert()`).
  - Todas las llamadas HTTP via `api.statsHistorical`, `api.statsCompare`, `api.statsRankings` (no `fetch` directo).
  - Usar Tailwind para estilos; reutilizar clases `card`, `btn-primary`, `input` ya presentes en la app.

- [x] **T6. Añadir los tres métodos de API en `frontend/src/api.js`**
  - En el objeto exportado por `src/api.js`, añadir:
    - `statsHistorical({ period, from, to })` → `GET /api/stats/historical?period=...&from=...&to=...`
    - `statsCompare({ period1_from, period1_to, period2_from, period2_to })` → `GET /api/stats/compare?...`
    - `statsRankings({ from, to, type, limit })` → `GET /api/stats/rankings?...`
  - Seguir el mismo patrón del helper `get` existente; construir los query params con `URLSearchParams`.

- [x] **T7. Añadir ruta en `frontend/src/App.jsx` y entrada en sidebar de `frontend/src/components/Layout.jsx`**
  - En `App.jsx`: importar `HistoricalAnalytics` y añadir `<Route path="/historical/analytics" element={<PrivateRoute><HistoricalAnalytics /></PrivateRoute>} />` dentro del bloque de rutas protegidas.
  - En `Layout.jsx`: añadir un ítem de navegación "Analytics" con enlace a `/historical/analytics` en el sidebar, siguiendo el patrón de los ítems existentes (mismo componente `NavLink` u objeto de nav array). Colocarlo debajo del ítem "Histórico".

- [x] **T8. Verificación final**
  - Ejecutar `npm test` desde la raíz: todos los tests deben pasar en verde, incluyendo los nuevos `stats.test.js` y los existentes (no-regresión).
  - Ejecutar `npm run build`: el build de Vite debe completar sin errores de compilación.
  - Confirmar que `GET /api/calls/range` y `HistoricalView.jsx` siguen funcionando igual que antes.
  - Confirmar que la ruta `/historical/analytics` carga el componente nuevo y que los tres endpoints responden con la estructura esperada.
