# tasks.md — charts_perdidas_horario (#47)

El implementer sigue estas tareas en orden y marca `[x]` al completar cada una.

---

## Backend

- [x] T1. En `backend/server.js`, función `queryHourly` (línea ~283):
  - Añadir parámetro `businessHours = null` a la firma.
  - Ampliar el SELECT de la query SQL añadiendo `DAYOFWEEK(calldate) AS call_dow`.
  - Ampliar el GROUP BY añadiendo `DAYOFWEEK(calldate)`.
  - En la inicialización de `hours`, añadir `ivr_hangup_business: 0` e
    `ivr_hangup_offhours: 0` dentro de cada objeto `breakdown`.
  - En el loop de filas, después de `classifyUnansweredReason`, añadir el bloque
    condicional con `isWithinBusinessHours` para poblar los dos campos nuevos
    (ver design.md §2).

- [x] T2. En `backend/server.js`, función `fetchData` (línea ~539):
  - Pasar `businessHours` como octavo argumento en las dos llamadas a
    `queryHourly` (totalHourly e inHourly).

---

## Frontend — componentes

- [x] T3. En `frontend/src/components/DispositionChart.jsx`:
  - Añadir `businessHours` a la desestructuración de props.
  - Añadir las claves `'Perdidas en horario'` y `'Perdidas fuera de horario'`
    al mapa `COLORS`; eliminar las claves `'Ocupado'` y `'Fallidas'`.
  - Reemplazar el array `data` estático por la lógica condicional descrita en
    design.md §5 (lostEntries según `businessHours`).
  - Eliminar los entries de `'Ocupado'` y `'Fallidas'` del array (ya no deben
    figurar en ninguna rama).

- [x] T4. En `frontend/src/components/HourlyChart.jsx`:
  - Añadir `businessHours` a la desestructuración de props.
  - Reemplazar el map de `data` por la versión condicional descrita en
    design.md §5 (campos Perdidas vs. Perdidas en/fuera horario).
  - Actualizar el cálculo de `total` para que no sume Ocupado ni Fallidas.
  - Reemplazar los `<Bar>` de "Ocupado" y "Fallidas" por los `<Bar>` condicionales
    según `businessHours` (ver design.md §5).

- [x] T5. En `frontend/src/components/Dashboard.jsx`:
  - Pasar `businessHours={businessHours}` al `<DispositionChart>`.
  - Pasar `businessHours={businessHours}` al `<HourlyChart>`.
  (`businessHours` ya está disponible como `data?.businessHours ?? null` — línea 138.)

- [x] T6. En `frontend/src/components/HistoricalView.jsx`:
  - Pasar `businessHours={businessHours}` al `<DispositionChart>`.
  - Pasar `businessHours={businessHours}` al `<HourlyChart>`.
  (`businessHours` ya está disponible en línea 67.)

---

## Verificación

- [x] T7. Verificar visualmente (o con build) que:
  - Sin businessHours: DispositionChart muestra Contestadas / Perdidas / No Contest.
    (sin Ocupado ni Fallidas).
  - Sin businessHours: HourlyChart muestra Contestadas / Perdidas / No Contest.
    (sin Ocupado ni Fallidas).
  - Con businessHours: DispositionChart muestra Contestadas / Perdidas en horario /
    Perdidas fuera de horario / No Contest.
  - Con businessHours: HourlyChart muestra Contestadas / Perdidas en horario /
    Perdidas fuera de horario / No Contest.

- [x] T8. Ejecutar `npm run build` (desde raíz del monorepo) y confirmar que no hay
  errores de compilación ni warnings de ESLint relevantes.

- [x] T9. Trazabilidad de requisitos:
  - R1 → cubierto por T3 (eliminar Ocupado/Fallidas de DispositionChart)
  - R2 → cubierto por T4 (eliminar Ocupado/Fallidas de HourlyChart)
  - R3 → cubierto por T3 (lostEntries condicional en DispositionChart)
  - R4 → cubierto por T3 (fallback a segmento único "Perdidas")
  - R5 → ya cubierto por el `.filter(d => d.value > 0)` existente
  - R6 → cubierto por T4 (barras condicionales en HourlyChart)
  - R7 → cubierto por T4 (fallback a barra única "Perdidas")
  - R8 → cubierto por T1
  - R9 → cubierto por T1 (valores 0 por defecto cuando businessHours=null)
  - R10 → cubierto por T2
  - R11, R12 → cubiertos por T5, T6
  - R13, R14, R15 → verificar en T8
