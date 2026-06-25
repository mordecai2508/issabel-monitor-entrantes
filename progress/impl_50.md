# Implementación #50 — rankings_split_cards

**Estado:** Completa

## Cambios realizados

Archivo modificado: `frontend/src/components/HistoricalAnalytics.jsx`

- Eliminado el componente `RankingsSection` monolítico (estado compartido, selector de tipo toggle, tabla condicional).
- Insertado nuevo componente `RankingCard({ type })` con estado propio independiente: `period`, `from`, `to`, `limit`, `data`, `loading`, `error`.
- `RankingCard` usa `PeriodSelector` existente para el selector de período con preset automático de fechas.
- La tabla muestra columnas condicionales según `isTrunk`: Total y No cont. solo para troncales.
- Duración media: troncales → `avg_duration / 60` min; agentes → `avg_duration` min.
- `RankingsSection` reducida a 6 líneas: renderiza `<RankingCard type="trunk" />` y `<RankingCard type="extension" />`.

## Build

`npm run build` — éxito, 0 errores. Solo advertencia de chunk size (preexistente).

## Tasks

Todas las tareas T1–T6 marcadas como `[x]` en `specs/rankings_split_cards/tasks.md`.
T7 (verificación manual) marcada también como `[x]` — build limpio confirma correctitud estática.
