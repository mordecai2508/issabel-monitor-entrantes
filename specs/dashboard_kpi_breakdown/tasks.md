# tasks.md — dashboard_kpi_breakdown

> Feature ID: 16 | Orden de implementación | Revisión: 2026-06-10

El implementer sigue estas tareas en orden. Marca `[x]` al completar cada una.

Esta feature **no toca backend** (sin nuevas dependencias, sin cambios en
`backend/server.js`, sin nuevas tablas SQLite, sin nuevas queries CDR, sin
tests Jest nuevos) — ver `design.md §1–3, §8`. Todo el trabajo es en
`frontend/src/components/Dashboard.jsx`.

---

- [x] **T1. Derivar las nuevas magnitudes en `Dashboard.jsx` (R1, R2, R5, R6, R9, R10, R12)**
  - Archivo: `frontend/src/components/Dashboard.jsx`
  - En el bloque donde hoy se calculan `disp`, `total`, `lostTotal`, añadir:
    ```js
    const answered = disp?.ANSWERED?.count   ?? 0;
    const noAnswer = disp?.['NO ANSWER']?.count ?? 0;
    const busy     = disp?.BUSY?.count       ?? 0;
    const failed   = disp?.FAILED?.count     ?? 0;

    const answeredPct = disp?.ANSWERED?.pct     ?? 0;
    const lostPct     = disp?.['NO ANSWER']?.pct ?? 0;
    const busyPct     = disp?.BUSY?.pct          ?? 0;
    const failedPct   = disp?.FAILED?.pct        ?? 0;

    const inboundTotal  = data?.inbound?.stats?.total  ?? 0;
    const outboundTotal = data?.outbound?.stats?.total ?? 0;
    const inboundPct  = total > 0 ? Math.round((inboundTotal  / total) * 1000) / 10 : 0;
    const outboundPct = total > 0 ? Math.round((outboundTotal / total) * 1000) / 10 : 0;
    ```
  - **Eliminar** la línea `const lostTotal = queues.find(q => q.queue === '__lost__')?.total ?? 0;`
    (R8) — ya no se usa como fuente de "Perdidas". No eliminar `queues` en sí
    (sigue usándose para `QueueCard`).
  - Usar siempre `?? 0` para que valores ausentes no produzcan `NaN`/`undefined`
    en el render (R6, R12).

- [x] **T2. Importar los iconos nuevos de `lucide-react` (R5, R9)**
  - Archivo: `frontend/src/components/Dashboard.jsx`
  - Añadir a la importación existente de `lucide-react`: `PhoneOff`,
    `PhoneIncoming`, `PhoneOutgoing` (todos confirmados disponibles en
    `^0.376.0`, ver `design.md §5.1`).
  - No eliminar ningún icono actualmente importado y en uso
    (`PhoneMissed`, `PhoneCall`, `Phone`, `AlertTriangle`, etc.).

- [x] **T3. Reemplazar el grid de StatCards principales (R1, R2, R4, R5, R6, R8)**
  - Archivo: `frontend/src/components/Dashboard.jsx`
  - Sustituir el bloque actual:
    ```jsx
    <StatCard label="Total llamadas" value={total} ... />
    <StatCard label="Contestadas" value={disp?.ANSWERED?.count} ... pct={disp?.ANSWERED?.pct} />
    <StatCard label="Perdidas" value={lostTotal} ... />
    ```
    por el bloque definido en `design.md §5.1`:
    - "Total llamadas" → `value={total}` (sin cambios de fuente).
    - "Contestadas" → `value={answered}`, `pct={answeredPct}`.
    - "Perdidas" → `value={noAnswer}`, `pct={lostPct}`, `icon={PhoneMissed}`,
      `sub="sin atender, del total"`.
  - Verificar visualmente que `total === answered + noAnswer + busy + failed`
    para los datos de prueba (manual, ver T7).

- [x] **T4. Añadir la tarjeta "Ocupado" junto a "Fallidas" (R5)**
  - Archivo: `frontend/src/components/Dashboard.jsx`
  - En el segundo grid (hoy `grid-cols-2 lg:grid-cols-4` con "Fallidas" + bloque
    resumen de duración/canales), añadir `<StatCard label="Ocupado"
    value={busy} icon={PhoneOff} color="amber" sub="del total" pct={busyPct} />`
    antes o después de "Fallidas", ajustando el `col-span` del bloque resumen
    de duración/canales según `design.md §5.1` (de `lg:col-span-3` a
    `lg:col-span-2`, o el ajuste de grid equivalente que el implementer elija)
    de modo que el bloque resumen conserve sus tres sub-bloques (duración
    promedio, tiempo total, canales activos) sin pérdida de información.

- [x] **T5. Añadir el bloque Entrantes / Salientes (R9, R10, R11, R12)**
  - Archivo: `frontend/src/components/Dashboard.jsx`
  - Añadir un nuevo grid (`grid-cols-1 sm:grid-cols-2 gap-4`) con dos
    `StatCard`:
    - "Llamadas entrantes" → `value={inboundTotal}`, `icon={PhoneIncoming}`,
      `pct={inboundPct}`, `sub="del total"`.
    - "Llamadas salientes" → `value={outboundTotal}`, `icon={PhoneOutgoing}`,
      `pct={outboundPct}`, `sub="del total"`.
  - Ubicarlo inmediatamente después del grid de "Total/Contestadas/Perdidas"
    (T3) o después del grid de "Ocupado/Fallidas/resumen" (T4) — el
    implementer elige el orden visual más claro, documentándolo con un
    comentario JSX breve (`{/* Desglose Entrantes / Salientes */}`).
  - No implementar el indicador "Otros"/diferencia (R11) salvo que se desee;
    si se implementa, usar `Math.max(0, total - inboundTotal - outboundTotal)`
    y etiquetarlo claramente como aproximado.

- [x] **T6. Confirmar que el bloque de colas (`QueueCard`/`__lost__`) sigue intacto (R7, R8)**
  - Archivo: `frontend/src/components/Dashboard.jsx`
  - Confirmar que el bloque:
    ```jsx
    {queues.filter(q => q.queue !== '__lost__').length > 0 && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {queues.filter(q => q.queue !== '__lost__').map(q => <QueueCard key={q.queue} queue={q} />)}
      </div>
    )}
    ```
    permanece sin modificaciones funcionales. La función `QueueCard` (definida
    inline en el mismo archivo) no se modifica.
  - Confirmar que ningún identificador `__lost__` queda referenciado fuera de
    este bloque tras T1 (grep `__lost__` en `Dashboard.jsx` debe mostrar solo
    los dos usos dentro de `queues.filter(...)`/`queues.find` ya existentes
    para el bloque de colas, si el implementer decide conservar algún uso
    informativo opcional — de lo contrario, cero referencias).

- [x] **T7. Verificación manual (R1–R13, sustituye tests automatizados de frontend)** — ver nota de alcance en `progress/impl_dashboard_kpi_breakdown.md` (no se pudo levantar navegador/SSE en vivo en este entorno; verificado por código + simulación aritmética con payloads mock).
  - Levantar backend (`cd backend && npm run dev`) y frontend (`cd frontend
    && npm run dev`).
  - **Caso A — `config.queues` vacío/no configurado:**
    1. Confirmar que "Perdidas" muestra un valor `>= 0` que coincide con
       `disp['NO ANSWER'].count` visible en la respuesta de
       `GET /api/calls/today` (inspeccionar con DevTools → Network).
    2. Confirmar aritméticamente: `Total llamadas == Contestadas + Perdidas +
       Ocupado + Fallidas`.
    3. Confirmar que el bloque de `QueueCard` no se renderiza (porque
       `queues` está vacío).
  - **Caso B — `config.queues` con al menos una extensión configurada:**
    1. Repetir los pasos 1–2 del Caso A (la tarjeta general "Perdidas" sigue
       basada en `dispositions['NO ANSWER']`, no en `__lost__`).
    2. Confirmar que el bloque de `QueueCard` se renderiza con sus tarjetas
       de cola, sin cambios visuales respecto al comportamiento previo.
  - **Caso C — desglose Entrantes/Salientes:**
    1. Confirmar que "Llamadas entrantes" == `data.inbound.stats.total` y
       "Llamadas salientes" == `data.outbound.stats.total` del payload.
    2. Confirmar que ambos porcentajes (`pct`) son `0` cuando `total === 0`,
       sin `NaN`/`Infinity`.
  - **Caso D — tiempo real (R13):**
    1. Dejar el dashboard abierto y esperar al menos un ciclo de
       `pollIntervalMs` (o generar una llamada de prueba si es posible).
    2. Confirmar en DevTools (Network → `/api/events` → EventStream) que tras
       un evento `update`, las tarjetas "Perdidas", "Ocupado", "Total
       llamadas", "Llamadas entrantes" y "Llamadas salientes" se actualizan
       con los nuevos valores.
  - **Caso E — sin datos (R6):**
    1. Si es posible, probar con un rango/día sin llamadas (o simular
       `dispositions` con todos los `count` en `0`).
    2. Confirmar que todas las tarjetas muestran `0` sin `NaN`/`undefined` ni
       errores en consola.

- [x] **T8. Verificación final**
  - `cd frontend && npm run build` — debe completar sin errores de
    compilación (no hay `npm test`/`npm run lint` en frontend, ver
    `design.md §8`).
  - `cd backend && npm test` — debe seguir en verde (no se espera ningún
    cambio, esto confirma no-regresión de la suite existente).
  - `./init.sh` — debe ejecutar sin errores (protocolo de arranque del
    proyecto).
  - Confirmar que `/inbound`, `/outbound`, `/historical`,
    `/admin/channels` y el resto de rutas siguen funcionando sin cambios
    (no se tocó ningún archivo fuera de `Dashboard.jsx`).
