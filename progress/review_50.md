# Review #50 — rankings_split_cards

**Fecha:** 2026-06-25
**Archivo revisado:** `frontend/src/components/HistoricalAnalytics.jsx`
**Resultado:** APROBADO

## Verificación de requisitos

| ID  | Requisito | Estado | Notas |
|-----|-----------|--------|-------|
| R1  | Existe `function RankingCard({ type })` | PASS | Línea 329 |
| R2  | `RankingCard` tiene estado propio: `period`, `from`, `to`, `limit`, `data`, `loading`, `error` con `useState` | PASS | Líneas 330–336 — los 7 estados presentes |
| R3  | `RankingCard` llama `api.statsRankings({ from, to, type, limit })` en `handleQuery` | PASS | Línea 351 |
| R4  | `RankingCard` renderiza `<PeriodSelector>` con las props correctas | PASS | Líneas 367–376 — todas las props presentes |
| R5  | Control Top N (`input type="number"`) vinculado a `limit` | PASS | Líneas 380–388 |
| R6  | Renderiza `<Spinner />` y `<ErrorBanner />` cuando corresponde | PASS | Líneas 390–391 |
| R7  | Tabla troncales: #, Nombre, Total, Contestadas, No cont., Dur. media (min) | PASS | Líneas 403–410, 418–421 — columnas condicionales con `isTrunk` |
| R8  | Tabla agentes: #, Nombre, Llamadas contestadas, Dur. media (min) — sin Total ni No cont. | PASS | Mismas líneas — columnas Total y No cont. ocultas cuando `!isTrunk` |
| R9  | `RankingsSection` solo renderiza `<RankingCard type="trunk" />` y `<RankingCard type="extension" />` | PASS | Líneas 437–444 |
| R10 | No existe `rankType` ni `setRankType` en el archivo | PASS | 0 ocurrencias confirmadas |
| R11 | `HistoricalAnalytics` (raíz) no fue modificado — sigue renderizando `<RankingsSection />` | PASS | Líneas 448–461 — sin cambios estructurales |
| R12 | 0 errores de compilación | PASS | Build exitoso: `✓ built in 11.05s` (solo advertencia de chunk size, no es error) |

## Observaciones

- La advertencia de chunk >500 kB es preexistente al proyecto y no es un error de compilación.
- La duración en la tabla de troncales aplica la conversión `row.avg_duration / 60` (segundos → minutos), mientras que para agentes usa el valor directo `row.avg_duration` — comportamiento correcto según el diseño del backend.
- Todos los 12 requisitos verificados con éxito.
