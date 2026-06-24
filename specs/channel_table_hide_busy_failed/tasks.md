# Tasks — channel_table_hide_busy_failed

Feature #39: Ocultar llamadas Ocupadas y Fallidas de la tabla 'Estadísticas por canal'

El implementer sigue estas tareas en orden y marca `[x]` al completar cada una.

---

- [x] T1. En `frontend/src/components/ChannelTable.jsx`, eliminar el elemento
      `<SortHeader col="BUSY" label="Ocupado" />` del bloque `<thead>` (R1).

- [x] T2. En `frontend/src/components/ChannelTable.jsx`, eliminar el elemento
      `<SortHeader col="FAILED" label="Fallidas" />` del bloque `<thead>` (R2).

- [x] T3. En `frontend/src/components/ChannelTable.jsx`, eliminar el bloque `<td>`
      que renderiza `ch.BUSY` y `pct(ch.BUSY, ch.total)` dentro del `sorted.map(...)` (R1).

- [x] T4. En `frontend/src/components/ChannelTable.jsx`, eliminar el bloque `<td>`
      que renderiza `ch.FAILED` y `pct(ch.FAILED, ch.total)` dentro del `sorted.map(...)` (R2).

- [ ] T5. Verificar visualmente en el navegador (o con `npm run dev:frontend`) que la tabla
      en Dashboard muestra exactamente las columnas: Canal, Total, Contest., Perdidas,
      No Contest., Tiempo — sin columnas Ocupado ni Fallidas (R3, R5).

- [ ] T6. Verificar que la tabla en HistoricalView (tras una búsqueda) muestra las mismas
      columnas sin Ocupado ni Fallidas (R5).

- [ ] T7. Verificar que la tabla en InboundView muestra las mismas columnas sin Ocupado
      ni Fallidas (R5).

- [ ] T8. Verificar que el ordenamiento por clic en cada cabecera restante (Total, Contest.,
      Perdidas, No Contest., Tiempo) funciona correctamente (R6).

- [ ] T9. Ejecutar `npm run build` desde la raíz del monorepo y confirmar que el build
      termina sin errores ni advertencias nuevas (RNF3).
