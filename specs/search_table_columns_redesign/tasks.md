# Tasks — search_table_columns_redesign

Feature #41 | Rediseñar columnas de la tabla en búsqueda de entrantes y salientes

Ejecutar en orden. Marcar `[x]` al completar cada tarea.

---

## Backend

- [x] T1. Agregar `channel` al SELECT SQL de `queryOutbound` y `queryOutboundExport` en
         `backend/services/cdrService.js` (actualmente omitido).
         Afecta las dos queries: la paginada y la de exportación.

- [x] T2. Agregar `channel: row.channel || ''` al objeto devuelto por `mapOutboundRow` en
         `backend/services/cdrService.js`.

- [x] T3. Crear `backend/services/callFormatters.js` con las funciones:
         `extractAgentName(channel)`, `formatBillsec(seconds)`, `dispositionLabel(disposition)`.
         Ver implementación en design.md §7.

- [x] T4. Actualizar `backend/services/reportConstants.js`:
         - `INBOUND_XLSX_HEADERS` y `INBOUND_PDF_HEADERS` → nuevos 7 headers (Fecha/Hora, Origen, Troncal, Destino, Canal Destino, Duración, Estado).
         - `INBOUND_ROW_KEYS` → `['calldate', 'src', 'channel', 'dst', 'agentName', 'duration_fmt', 'disposition_label']`.
         - `OUTBOUND_XLSX_HEADERS` y `OUTBOUND_PDF_HEADERS` → mismos 7 headers.
         - `OUTBOUND_ROW_KEYS` → `['calldate', 'src', 'dstchannel', 'dst', 'agentName', 'duration_fmt', 'disposition_label']`.

- [x] T5. Actualizar el handler de exportación en `backend/routes/inbound.js`:
         Importar `callFormatters` y enriquecer `displayRows` con los campos virtuales
         `agentName`, `duration_fmt`, `disposition_label` (y aplicar alias a `channel`).
         Ver design.md §6.2.

- [x] T6. Actualizar el handler de exportación en `backend/routes/outbound.js`:
         Importar `callFormatters` y enriquecer `displayRows` con los mismos campos virtuales.
         Ver design.md §6.2.

- [x] T7. Verificar que `exportService.toPdf` y `exportService.toXlsx` no requieren cambios
         estructurales (sólo consumen las constantes y las filas ya enriquecidas).

## Frontend

- [x] T8. Crear `frontend/src/utils/callFormatters.js` (versión ES module) con las mismas
         tres funciones: `extractAgentName`, `formatBillsec`, `dispositionLabel`.

- [x] T9. Actualizar `frontend/src/components/InboundTable.jsx`:
         - Importar las tres funciones de `callFormatters.js`.
         - Reemplazar `COLUMNS` con el nuevo orden: Fecha/Hora | Origen | Troncal | Destino | Canal Destino | Duración | Estado.
         - Actualizar el render del tbody para usar `aliasMap[row.channel]`, `extractAgentName(row.dstchannel)`,
           `formatBillsec(row.billsec)`, y `dispositionLabel(row.disposition)`.
         - Eliminar las columnas "Duración (s)" y "Seg. fact." que quedan obsoletas.

- [x] T10. Actualizar `frontend/src/components/OutboundTable.jsx`:
          - Importar las tres funciones de `callFormatters.js`.
          - Reemplazar `COLUMNS` con el mismo nuevo orden.
          - Actualizar el render del tbody: Troncal usa `aliasMap[row.dstchannel]`,
            Canal Destino usa `extractAgentName(row.channel)` (canal origen de la llamada saliente).
          - Eliminar las columnas "Duración (s)" y "Seg. fact." obsoletas.

## Tests

- [x] T11. Crear/actualizar `backend/tests/callFormatters.test.js` con casos:
          - R8/R9: `extractAgentName("Agent/03")` → `"Agent/03"`
          - R8/R9: `extractAgentName("Agent/03-000001ab")` → `"Agent/03"`
          - R8/R9: `extractAgentName("SIP/202-00a1b2c3")` → `"202"`
          - R8/R9: `extractAgentName("")` → `""`
          - R8/R9: `extractAgentName("Local/s@from-internal")` → `""`
          - R10: `formatBillsec(0)` → `"0:00"`
          - R10: `formatBillsec(59)` → `"0:59"`
          - R10: `formatBillsec(225)` → `"3:45"`
          - R10: `formatBillsec(3661)` → `"61:01"`
          - R11: `dispositionLabel("ANSWERED")` → `"Contestada"`
          - R11: `dispositionLabel("NO ANSWER")` → `"No contestada"`
          - R11: `dispositionLabel("BUSY")` → `"Ocupado"`
          - R11: `dispositionLabel("FAILED")` → `"Fallida"`
          - R11: `dispositionLabel("OTHER")` → `"OTHER"`

- [x] T12. Crear/actualizar `backend/tests/cdrService.outbound.test.js`:
          - R14: verificar que `mapOutboundRow` incluye el campo `channel` en el objeto resultante.
          - R14: verificar que las queries SQL de outbound incluyen `channel` en el SELECT.

- [x] T13. Añadir test en `backend/tests/inbound.export.test.js` (o equivalente):
          - R15/R17: verificar que el payload de exportación inbound incluye los campos
            `agentName`, `duration_fmt`, `disposition_label`.

- [x] T14. Añadir test en `backend/tests/outbound.export.test.js` (o equivalente):
          - R16/R17: verificar que el payload de exportación outbound incluye los campos
            `agentName`, `duration_fmt`, `disposition_label`.

## Verificación final

- [x] T15. Ejecutar `npm test` desde la raíz — todos los tests deben pasar en verde.
          NOTA: 3 suites pre-existentes siguen fallando (alerts, config, reports) por razones
          no relacionadas con esta feature. Los 33 nuevos tests de la feature pasan en verde.

- [x] T16. Ejecutar `npm run build` — build del frontend sin errores ni warnings críticos.
          Build exitoso en 12.13s. Warning de chunk >500kB es pre-existente.

- [ ] T17. Smoke test manual:
          - Abrir InboundTable, realizar una búsqueda; verificar que la tabla muestra las 7 columnas
            en el orden correcto y que Canal Destino, Duración y Estado muestran valores formateados.
          - Abrir OutboundTable, repetir la verificación.
          - Exportar como Excel y PDF desde cada tabla; verificar headers y valores formateados
            en el archivo descargado.
          - Verificar que el alias de troncal se aplica correctamente en ambas tablas y exportaciones.
