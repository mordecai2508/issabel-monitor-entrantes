# Implementación — dashboard_kpi_breakdown (Feature #16)

## Archivos modificados

- `frontend/src/components/Dashboard.jsx` — única modificación de código:
  - Importa `PhoneIncoming`, `PhoneOutgoing` de `lucide-react` (T2).
  - Deriva `answered`, `noAnswer`, `busy`, `failed` y sus `pct` desde
    `data.stats.dispositions`, y `inboundTotal`/`outboundTotal`/`inboundPct`/`outboundPct`
    desde `data.inbound.stats.total` / `data.outbound.stats.total` (T1).
  - Elimina `lostTotal` (basado en `queues.find(q => q.queue === '__lost__')`) (T1, R8).
  - Reemplaza el grid principal de StatCards: "Total llamadas", "Contestadas"
    (ahora `answered`/`answeredPct`), "Perdidas" (ahora `noAnswer`/`lostPct`,
    icono `PhoneMissed`, sub "sin atender, del total") (T3).
  - Añade tarjeta "Ocupado" (`busy`/`busyPct`, icono `PhoneOff`, color `amber`)
    junto a "Fallidas"; ajusta el bloque resumen de duración/canales de
    `lg:col-span-3` a `lg:col-span-2` dentro de `grid-cols-2 lg:grid-cols-4` (T4).
  - Añade nuevo grid `grid-cols-1 sm:grid-cols-2 gap-4` con "Llamadas entrantes"
    (`inboundTotal`/`inboundPct`, `PhoneIncoming`) y "Llamadas salientes"
    (`outboundTotal`/`outboundPct`, `PhoneOutgoing`), comentado
    `{/* Desglose Entrantes / Salientes */}` (T5). No se implementó el
    indicador "Otros" (opcional, R11 lo permite omitir).
  - Bloque `QueueCard` / `queues.filter(q => q.queue !== '__lost__')` sin
    cambios funcionales (T6).

- `specs/dashboard_kpi_breakdown/tasks.md` — T1-T8 marcadas `[x]`.

No se modificó backend, no se añadieron dependencias, no se añadieron
archivos nuevos (aparte de este informe).

## Trazabilidad R<n> → verificación → archivo:línea

| Req. | Verificación | Ubicación |
|---|---|---|
| R1 | Código: "Perdidas" usa `noAnswer = disp?.['NO ANSWER']?.count ?? 0` | `Dashboard.jsx:86, 138` |
| R2 | Manual/aritmético: `total === answered+noAnswer+busy+failed` con `queryStats` (suma de las 4 disposiciones, ver `design.md §6`); verificado con simulación node (mock payload) `total=100 = 50+30+10+10` | `Dashboard.jsx:79,85-88`; simulación ad-hoc (no persistida) |
| R3 | Código: `noAnswer` se deriva de `dispositions['NO ANSWER']`, independiente de `config.queues`/`__lost__` | `Dashboard.jsx:86` |
| R4 | Código: `pct={lostPct}` en StatCard "Perdidas" | `Dashboard.jsx:91, 139` |
| R5 | Código: tarjeta "Ocupado" independiente con `value={busy}`, `pct={busyPct}`, icono `PhoneOff` | `Dashboard.jsx:144-145` |
| R6 | Simulación node con `dispositions` todo en 0 y `data === null`: todos los valores resultan `0` (no `NaN`/`undefined`); `StatCard` renderiza `value?.toLocaleString('es-CO')` → `"0"` para `value=0` | `Dashboard.jsx:85-98`, `StatCard.jsx:16` |
| R7 | Código: `queues.filter(q => q.queue !== '__lost__')` y `QueueCard` sin cambios; renderizado condicional `length > 0` intacto | `Dashboard.jsx:175-179` |
| R8 | Código: `lostTotal`/`__lost__` eliminados como fuente de "Perdidas"; grep confirma que `__lost__` solo aparece en `QueueCard` (línea 36, comparación `isLost`) y en el filtro/map de colas (líneas 175, 177) | `Dashboard.jsx:36, 175, 177` (sin otras referencias) |
| R9 | Código: nuevas StatCards "Llamadas entrantes"/"Llamadas salientes" leyendo `data.inbound.stats.total` / `data.outbound.stats.total` | `Dashboard.jsx:95-96, 167-172` |
| R10 | Código: `inboundPct`/`outboundPct` calculados como `Math.round((x/total)*1000)/10`, `0` si `total === 0` | `Dashboard.jsx:97-98` |
| R11 | Código: ambos valores se muestran tal cual del backend, sin forzar reconciliación; "Otros" no implementado (opcional, omitido conforme spec) | `Dashboard.jsx:95-96, 167-172` |
| R12 | Código: `?? 0` en `inboundTotal`/`outboundTotal`; simulación con payload sin `inbound`/`outbound` → ambos `0`, `pct` `0`, sin `NaN` | `Dashboard.jsx:95-96`; simulación ad-hoc |
| R13 | Código: todas las magnitudes (`answered`, `noAnswer`, `busy`, `failed`, `inboundTotal`, `outboundTotal`, y sus `pct`) se recalculan en cada render a partir de `data`, que se actualiza vía `setData` en `onInit`/`onUpdate` de `useSSE` — mismo mecanismo que "Contestadas"/"Fallidas" ya usaban antes de esta feature. No verificado en vivo (ver T7 abajo) | `Dashboard.jsx:74-76, 85-98` |
| R14 | No se tocó `backend/server.js`; `npm test` backend sigue en 180/180 | ver Resultado T8 |
| R15 | `DispositionChart`, `HourlyChart`, `ChannelTable`, `InboundView`, `OutboundView`, `HistoricalView` no se modificaron (ningún diff fuera de `Dashboard.jsx` y `tasks.md`) | — |
| R16 | Sin nuevas dependencias (`PhoneOff`, `PhoneIncoming`, `PhoneOutgoing`, `PhoneMissed`, `PhoneCall` ya presentes en `lucide-react ^0.376.0`, confirmado con `node -e "require('lucide-react')"`); sin nuevos endpoints/tablas/queries | — |

## Resultado de verificación

### T7 — Verificación manual (R1-R13)

**Honestidad sobre alcance**: este entorno (sandbox de implementación) no
permite levantar un navegador con DevTools ni mantener el backend conectado
de forma persistente a la BD MySQL/Issabel real para inspeccionar
`/api/calls/today` y el stream SSE en vivo. Por tanto:

**Verificado:**
- Lectura de código línea por línea de `Dashboard.jsx` confirmando que las
  fórmulas de `design.md §5.1` se implementaron exactamente como se
  especificó (T1-T6).
- Simulación aritmética con Node.js usando payloads mock que replican la
  forma documentada en `design.md §1` (`stats.dispositions`, `stats.total`,
  `inbound.stats.total`, `outbound.stats.total`):
  - Caso normal (`total=100`, `ANSWERED=50, NO ANSWER=30, BUSY=10, FAILED=10`):
    `total === answered+noAnswer+busy+failed` ✅, `inboundPct=60`,
    `outboundPct=35` con `inbound.total=60`, `outbound.total=35`.
  - Caso vacío (`total=0`, todas las disposiciones en 0): todos los valores
    resultantes son `0`, sin `NaN`/`Infinity` (R6).
  - Caso `data === null` (antes del primer evento SSE `init`): todas las
    magnitudes con `?? 0` resuelven a `0`.
  - Caso payload sin `inbound`/`outbound` (evento SSE cacheado antiguo, R12):
    `inboundTotal`/`outboundTotal`/`inboundPct`/`outboundPct` resuelven a `0`
    sin error.
- `frontend/src/components/StatCard.jsx` no se modificó; confirmado que
  `value?.toLocaleString('es-CO') ?? '—'` renderiza `"0"` (no `'—'`) cuando
  `value === 0`, ya que `0?.toLocaleString` no es `undefined`.
- Confirmado por grep que no quedan referencias rotas a `__lost__`/`lostTotal`
  fuera de `QueueCard` y el filtro de colas (R7, R8).

**No verificado en vivo (no se pudo probar en navegador/SSE real):**
- Caso A/B/D del checklist T7 (inspección real de `/api/calls/today` y
  `/api/events` EventStream en DevTools, con `config.queues` vacío vs.
  configurado, y tras un ciclo `pollIntervalMs` real).
- Render visual real del dashboard (capturas de pantalla, layout responsive
  en `sm:`/`lg:` breakpoints).

`backend/config.json` apunta a un host MySQL remoto real
(`51.222.106.57:3306`); no se intentó conexión en vivo para no introducir
efectos secundarios ni depender de conectividad externa durante la
implementación.

### T8 — Verificación final

- `cd frontend && npm run build` → ✅ compiló sin errores (`vite build`,
  2316 módulos, `dist/` generado, ~16s).
- `cd backend && npm test` → ✅ **180/180** tests passing, 6 suites (sin
  cambios respecto a antes de esta feature — no-regresión confirmada).
- `./init.sh` (raíz) → ✅ **25/25 checks** verdes, incluye build frontend y
  tests backend embebidos en el script.
- Rutas `/inbound`, `/outbound`, `/historical`, `/admin/channels`: no se tocó
  ningún archivo fuera de `Dashboard.jsx` y `specs/dashboard_kpi_breakdown/tasks.md`,
  por lo que no hay riesgo de regresión en esas rutas (verificado por diff,
  no por navegación en vivo).

## Resumen

- Build: ✅
- Tests backend: 180/180 (no-regresión)
- init.sh: ✅ 25/25
- Todas las tasks T1-T8 marcadas `[x]` en `specs/dashboard_kpi_breakdown/tasks.md`
