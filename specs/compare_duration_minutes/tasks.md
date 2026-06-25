# Tasks — compare_duration_minutes

- [x] T1. No hay dependencias npm nuevas que instalar.

- [x] T2. No hay cambios de esquema en SQLite.

- [x] T3. **Backend — `backend/services/statsService.js`, función `queryCompare`**
      - Cambiar `ROUND(AVG(duration), 2) AS avg_duration` por `ROUND(AVG(billsec) / 60, 1) AS avg_duration` en `totalQuery`.
      - Cambiar `.toFixed(2)` a `.toFixed(1)` al serializar `kpis1.avg_duration` y `kpis2.avg_duration`.

- [x] T4. **Frontend — `frontend/src/components/HistoricalAnalytics.jsx`**
      - Actualizar la etiqueta en `KPI_LABELS`: `'Duración media (min)'` (clave `avg_duration`).
      - Añadir función auxiliar `formatValue(key, val)` que devuelve `${val} min` cuando `key === 'avg_duration'` y `val` (sin unidad) para el resto.
      - En las celdas de valor de la tabla comparativa (`data.period1[key]`, `data.period2[key]`), invocar `formatValue(key, valor)` en lugar del valor crudo.

- [x] T5. No hay router nuevo ni registro en `server.js`.

- [ ] T6. **Tests — `backend/tests/compare_duration_minutes.test.js`**
      - R1: verificar que `queryCompare` devuelve `avg_duration` en minutos (mock de `pool.query` con `billsec = 120` → esperar `avg_duration = 2.0`).
      - R3: verificar que cuando `billsec` es NULL/0, `avg_duration` es `0.0` (no error).
      - R4: verificar que `variation.avg_duration` es calculado correctamente sobre los valores convertidos.

- [ ] T7. Verificación manual: abrir la sección "Comparativa de períodos" y confirmar que la fila "Duración media (min)" muestra el valor en minutos con formato `X.X min`.

- [ ] T8. Ejecutar `npm test` (verde), `npm run lint` (sin errores), `npm run build` (sin errores).
