# Tasks — analytics_agents_ranking_fix

Feature #42: Analytics: ranking de agentes muestra solo llamadas contestadas; duración media en minutos

El implementer sigue este orden y marca `[x]` al completar cada tarea.

---

- [x] T1. **`statsService.js` — añadir `answeredRowFilter(lostDests)`**
  Crear una función auxiliar (análoga a `buildChannelCondition`) que devuelva
  `{ sql, params }` con la cláusula WHERE que filtra únicamente filas contestadas por el
  agente según la lógica de reclasificación:
  - Si `lostDests` vacío: `AND disposition = 'ANSWERED'`
  - Si `lostDests` no vacío: `AND dst NOT IN (?,…) AND UPPER(disposition) = 'ANSWERED'`
    (los destinos perdidos quedan excluidos)

- [x] T2. **`statsService.js` — modificar `queryRankings` para `type=extension`**
  Aplicar los cambios en la rama `if (type === 'extension')`:
  1. Incorporar `answeredRowFilter(lostDests)` al WHERE de la query SQL (después del
     filtro de fecha y del filtro `dstchannel REGEXP ?`).
  2. Cambiar `ROUND(AVG(duration), 2) AS avg_duration` por
     `ROUND(AVG(billsec) / 60, 1) AS avg_duration`.
  3. Mantener los campos `answeredExpr` y `noAnswerExpr` en el SELECT para seguir
     devolviendo `answered` y `no_answer` por fila agrupada.
  4. Actualizar los parámetros de la query para incluir los de `answeredRowFilter`.
  No tocar la rama `else` (trunks).

- [x] T3. **`statsService.js` — verificar mapeo de resultados**
  En el bloque `const rankings = rows.map(...)`, confirmar que `avg_duration` se mapea
  con `Number(Number(r.avg_duration).toFixed(1))` (1 decimal, no 2) para consistencia con
  el cambio de unidad.

- [x] T4. **Revisar generadores de reportes para encabezados de duración**
  Buscar en `backend/` archivos de generación de PDF y Excel
  (p. ej. `pdfGenerator.js`, `excelGenerator.js` o similar) que contengan la unidad
  "segundos" o "(s)" en columnas de duración para el reporte de tipo `extensions`.
  Actualizar esos encabezados a "Duración media (min)".
  Encontrado en `backend/services/exportService.js`: `RANKING_HEADERS` tenía "Dur. media (s)".
  Se crearon `RANKING_HEADERS_EXTENSIONS` (con "Dur. media (min)" y "Llamadas contestadas")
  y `RANKING_HEADERS_TRUNK` (sin cambio). Se actualizaron `renderRankingBody`, la hoja
  "Top Extensiones" del Excel ejecutivo, y el xlsx de tipo `extensions`.

- [x] T5. **`HistoricalAnalytics.jsx` — actualizar encabezado de columna duración**
  En `RankingsSection`, cambiar el encabezado de la columna de duración a condicional:
  - `type=extension`: "Dur. media (min)"
  - `type=trunk`: "Dur. media (s)"

- [x] T6. **`HistoricalAnalytics.jsx` — actualizar renderizado de `avg_duration`**
  En la celda de duración de la tabla de rankings, formatear el valor según tipo:
  - `type=extension`: mostrar `${row.avg_duration} min`
  - `type=trunk`: mostrar `${row.avg_duration} s` (sin cambio funcional, solo agrega unidad)
  Extraer un helper `formatDuration(value, type)` para mantener el JSX limpio.

- [x] T7. **`HistoricalAnalytics.jsx` — (opcional) actualizar encabezado "Total de llamadas"**
  Cuando `rankType === 'extension'`, cambiar el encabezado "Total de llamadas" a
  "Llamadas contestadas" para reflejar que ahora total = answered.

- [x] T8. **Tests backend — verificar R1, R2, R3, RCL1, RCL2, RCL3**
  Añadidos 6 casos en `backend/tests/stats.test.js` (describe '#42'):
  - `R1/R2` — total === answered para cada agente del resultado.
  - `R3` — avg_duration es numérico, 1 decimal, y < 60 (en minutos).
  - `RCL1` — sin llamadas contestadas, ranking vacío.
  - `RCL2` — rango sin datos, rankings es [].
  - `RCL3` — type=trunk no se ve afectado.
  Todos 32 tests pasan (`npx jest tests/stats.test.js`).

- [ ] T9. **Verificación manual end-to-end**
  1. `npm run build` sin errores.
  2. Iniciar backend y navegar a Analytics → Rankings → Agentes.
  3. Confirmar que la columna "Total de llamadas" (o "Llamadas contestadas") muestra
     el mismo valor que "Llamadas Contestadas".
  4. Confirmar que "Dur. media" muestra valores en minutos (típicamente < 60 para
     llamadas normales), con el sufijo "min".
  5. Confirmar que el ranking de Troncales no ha cambiado su comportamiento.
  6. Generar un reporte de tipo "extensiones" y verificar que la columna de duración
     muestra minutos.
