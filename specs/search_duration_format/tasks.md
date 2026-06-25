# Tasks — search_duration_format

Feature #44: Búsqueda: label min en columna Duración y centrado de datos

---

## InboundTable.jsx

- [x] T1. En `frontend/src/components/InboundTable.jsx`, localizar el array `COLUMNS`.
      Cambiar el objeto `billsec`:
      - `label`: de `'Duración'` a `'Duración (mm:ss)'`
      - Añadir campo `align: 'center'`

- [x] T2. En el mismo archivo, localizar el `{COLUMNS.map(col => (<th ...>))}`.
      Cambiar la clase `text-left` por una expresión condicional:
      `col.align === 'center' ? 'text-center' : 'text-left'`
      (conservar el resto de clases intactas)

- [x] T3. En el mismo archivo, localizar el `<td>` que renderiza `formatBillsec(row.billsec)`.
      Cambiar la clase `text-right` a `text-center`.

## OutboundTable.jsx

- [x] T4. En `frontend/src/components/OutboundTable.jsx`, localizar el array `COLUMNS`.
      Aplicar los mismos cambios del T1: `label: 'Duración (mm:ss)'` y `align: 'center'`.

- [x] T5. En el mismo archivo, localizar el `{COLUMNS.map(col => (<th ...>))}`.
      Aplicar el mismo cambio del T2 para el condicional de alineación.

- [x] T6. En el mismo archivo, localizar el `<td>` que renderiza `formatBillsec(row.billsec)`.
      Cambiar la clase `text-right` a `text-center`.

## Verificación

- [ ] T7. Verificación manual en InboundTable: realizar una búsqueda y confirmar que
      el encabezado muestra `"DURACIÓN (MM:SS)"` (uppercase por CSS) y que tanto
      encabezado como datos están centrados.

- [ ] T8. Verificación manual en OutboundTable: ídem T7.

- [ ] T9. Confirmar que el sort por columna Duración sigue funcionando al hacer clic
      en el encabezado.

- [ ] T10. Ejecutar `npm run build` desde la raíz — confirmar 0 errores de compilación.
