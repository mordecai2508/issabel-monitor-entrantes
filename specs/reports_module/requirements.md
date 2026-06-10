# requirements.md — reports_module

> Feature ID: 12 | Notación EARS | Revisión: 2026-06-10

---

## Endpoints generales /api/reports/:type/pdf y /api/reports/:type/xlsx

**R1.** WHEN a client sends `GET /api/reports/:type/pdf` with `from` and `to` query parameters and `:type` is one of `executive`, `inbound`, `outbound`, `extensions`, `trunks`
THE SYSTEM SHALL generate a PDF document for the requested report type covering the date range and stream it as a file download (HTTP 200, `Content-Type: application/pdf`).

**R2.** WHEN a client sends `GET /api/reports/:type/xlsx` with `from` and `to` query parameters and `:type` is one of `executive`, `inbound`, `outbound`, `extensions`, `trunks`
THE SYSTEM SHALL generate an Excel (.xlsx) workbook for the requested report type covering the date range and stream it as a file download (HTTP 200, `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`).

**R3.** IF `:type` is not one of `executive`, `inbound`, `outbound`, `extensions`, `trunks` THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'El tipo de reporte debe ser uno de: executive, inbound, outbound, extensions, trunks' }` for both the `/pdf` and `/xlsx` routes.

**R4.** IF `from` or `to` is absent or not a valid date string (`YYYY-MM-DD`) THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'Los parámetros from y to son requeridos y deben ser fechas válidas (YYYY-MM-DD)' }`.

**R5.** IF `from` is after `to` THEN THE SYSTEM SHALL return HTTP 400 `{ ok: false, error: 'La fecha from no puede ser posterior a to' }`.

**R6.** THE SYSTEM SHALL require an authenticated session (`requireAuth`) for all `/api/reports/*` endpoints; an unauthenticated request SHALL return HTTP 401.

**R7.** IF the queried date range contains no CDR records for the requested report type THEN THE SYSTEM SHALL still generate a valid PDF or Excel file containing the report header (title, company name, date range) and an explicit "sin datos" message instead of empty tables, returning HTTP 200.

**R8.** IF the MySQL (Issabel CDR) database is unavailable THEN THE SYSTEM SHALL return HTTP 503 `{ ok: false, error: 'Base de datos no disponible' }` for both `/pdf` and `/xlsx` routes, without generating a partial file.

**R9.** IF report generation for a given request takes longer than 10 seconds THEN THE SYSTEM SHALL abort and return HTTP 504 `{ ok: false, error: 'La generación del reporte tardó demasiado' }`, provided no response bytes have been sent yet.

**R10.** WHEN an unexpected error occurs during report generation after the response has already started streaming THEN THE SYSTEM SHALL terminate the response stream without sending an additional JSON error body (to avoid corrupting the partially-sent file), and SHALL log the error server-side.

**R11.** THE SYSTEM SHALL NOT write any data to the Issabel CDR database; all report queries SHALL be read-only `SELECT` statements executed via existing or new read-only service functions.

**R12.** THE SYSTEM SHALL reuse the existing CDR aggregation/query services (`statsService`, `cdrService`) for data retrieval rather than duplicating their SQL logic in the reports module.

---

## Contenido común de los reportes (PDF)

**R13.** THE SYSTEM SHALL include in every generated PDF report: a title identifying the report type, the configured application/company name, the requested date range (`from` – `to`), and a generation timestamp.

**R14.** IF a corporate logo is configured in the system (via the future `system_config` feature) THEN THE SYSTEM SHALL embed that logo image in the header of the generated PDF.

**R15.** IF no corporate logo is configured THEN THE SYSTEM SHALL generate the PDF without a logo, using only the configured application/company name in the header (graceful degradation — this SHALL NOT be treated as an error).

**R16.** THE SYSTEM SHALL include at least one chart (visual graphic, e.g. a bar chart) embedded in the body of every generated PDF report, representing the report's key metric(s) over the requested range.

**R17.** THE SYSTEM SHALL include at least one data table in the body of every generated PDF report, with column headers appropriate to the report type.

---

## Reporte: executive (resumen ejecutivo)

**R18.** WHEN `:type` is `executive` THE SYSTEM SHALL include in the report: total calls, answered calls, missed/no-answer calls, busy calls, failed calls, and average call duration for the requested date range, broken down into inbound and outbound totals.

**R19.** THE SYSTEM SHALL include in the `executive` report a trend table or chart showing call volume across sub-periods (days) within the requested range.

**R20.** THE SYSTEM SHALL include in the `executive` report a top-5 ranking of the most active extensions and a top-5 ranking of the most active trunks for the requested date range.

---

## Reporte: inbound (llamadas entrantes)

**R21.** WHEN `:type` is `inbound` THE SYSTEM SHALL include in the report: a summary of inbound call counts by disposition (`ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED`) and a table of inbound call detail records (date/time, origin, destination, trunk, duration, disposition) for the requested date range, capped at the same maximum row count used by existing CDR exports.

**R22.** THE SYSTEM SHALL include in the `inbound` report a chart showing the distribution of inbound calls by disposition for the requested date range.

---

## Reporte: outbound (llamadas salientes)

**R23.** WHEN `:type` is `outbound` THE SYSTEM SHALL include in the report: a summary of outbound call counts by disposition (`ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED`) and a table of outbound call detail records (date/time, extension, destination, trunk, duration, disposition) for the requested date range, capped at the same maximum row count used by existing CDR exports.

**R24.** THE SYSTEM SHALL include in the `outbound` report a chart showing the distribution of outbound calls by disposition for the requested date range.

---

## Reporte: extensions (actividad de extensiones)

**R25.** WHEN `:type` is `extensions` THE SYSTEM SHALL include in the report a ranking table of extensions ordered by total call volume for the requested date range, with columns: extension, total calls, answered, no-answer, busy, failed, and average duration.

**R26.** THE SYSTEM SHALL include in the `extensions` report a chart showing the top-N extensions by total call volume for the requested date range.

---

## Reporte: trunks (actividad de troncales)

**R27.** WHEN `:type` is `trunks` THE SYSTEM SHALL include in the report a ranking table of trunks ordered by total call volume for the requested date range, with columns: trunk (normalized channel name), total calls, answered, no-answer, busy, failed, and average duration.

**R28.** THE SYSTEM SHALL include in the `trunks` report a chart showing the top-N trunks by total call volume for the requested date range.

---

## Contenido común de los reportes (Excel)

**R29.** THE SYSTEM SHALL generate, for every report type and the `/xlsx` route, a workbook containing at least one worksheet with: a header section (report title, company name, date range, generation timestamp) followed by the same tabular data described for the corresponding PDF report (R18–R28), without requiring embedded charts in the Excel output.

**R30.** IF the queried range contains no records for a given table within an Excel report THEN THE SYSTEM SHALL still generate the worksheet with headers and a single row indicating "Sin datos para el rango seleccionado".

---

## Frontend — pantalla de Reportes

**R31.** THE SYSTEM SHALL provide a new page accessible to authenticated users with a report type selector offering the options: Resumen ejecutivo, Llamadas entrantes, Llamadas salientes, Actividad de extensiones, Actividad de troncales.

**R32.** THE SYSTEM SHALL provide on the Reportes page a date-range picker (Desde / Hasta) shared by all report types.

**R33.** THE SYSTEM SHALL provide on the Reportes page two buttons, "Descargar PDF" and "Descargar Excel", that trigger a file download for the selected report type and date range via the corresponding `/api/reports/:type/pdf` or `/api/reports/:type/xlsx` endpoint.

**R34.** IF `from`, `to`, or the report type is not selected THEN THE SYSTEM SHALL disable the download buttons on the Reportes page.

**R35.** WHILE a report is being generated THE SYSTEM SHALL display a loading indicator on the triggering button; IF the request fails THE SYSTEM SHALL display an inline error banner (no `alert()`) with the server-provided error message.

**R36.** THE SYSTEM SHALL add a navigation entry "Reportes" in the sidebar (`Layout.jsx`) linking to the new Reportes page, accessible to all authenticated users (not admin-only).

---

## Compatibilidad y seguridad

**R37.** THE SYSTEM SHALL NOT modify or break the existing endpoints `/api/calls/inbound`, `/api/calls/outbound`, `/api/calls/inbound/export`, `/api/calls/outbound/export`, `/api/stats/historical`, `/api/stats/compare`, or `/api/stats/rankings`.

**R38.** THE SYSTEM SHALL NOT introduce a dependency on the `system_config` feature (#13) for its core functionality; any logo/branding integration SHALL be optional and SHALL degrade gracefully (R15) when that feature does not yet exist or no logo has been configured.

**R39.** THE SYSTEM SHALL respond to each `/api/reports/:type/pdf` and `/api/reports/:type/xlsx` request in under 10 seconds for date ranges up to 1 year, consistent with the export performance rule in `docs/architecture.md` (RNF-02).
