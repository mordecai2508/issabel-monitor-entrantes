# Requirements — outbound_filters_export

> Notación EARS. Un requisito = una sola idea. Sin mencionar implementación.

---

## Filtros y consulta de registros individuales

**R1.** WHEN the operator requests outbound calls providing `from` and `to` date parameters,
THE SYSTEM SHALL return individual CDR records (not aggregated) for calls whose `calldate`
falls within the specified range, inclusive of both boundary values.

**R2.** WHEN the operator provides a `trunk` filter parameter,
THE SYSTEM SHALL return only records whose normalized outbound channel name (derived from
`dstchannel`) matches the given trunk value.

**R3.** WHEN the operator provides an `extension` filter parameter,
THE SYSTEM SHALL return only records whose `src` field contains the provided string
(case-insensitive partial match), where `src` represents the internal extension that originated
the call.

**R4.** WHEN the operator provides a `dest` filter parameter,
THE SYSTEM SHALL return only records whose `dst` field contains the provided string
(case-insensitive partial match), where `dst` represents the external number dialed.

**R5.** WHEN the operator provides a `disposition` filter parameter,
THE SYSTEM SHALL return only records whose `disposition` field matches exactly one of:
`ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED`.

**R6.** WHEN the operator applies multiple filters simultaneously,
THE SYSTEM SHALL apply all active filters as AND conditions, returning only records
that satisfy every active filter at the same time.

**R7.** IF the `from` or `to` date parameter is missing from the request,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

**R8.** IF a `from` or `to` date parameter is provided with an invalid format,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

**R9.** IF the `disposition` filter parameter is provided with a value not in the allowed set,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

---

## Identificación de llamadas salientes

**R10.** THE SYSTEM SHALL identify outbound calls as CDR records where the `channel` field
belongs to an internal extension (not present in the configured allowed channels list) and
`dstchannel` belongs to an outbound trunk (present in the configured allowed channels list),
following the same logic as the existing `passesFilter(channel, allowedChannels, 'out')`
function.

**R11.** THE SYSTEM SHALL exclude records where `channel` starts with `Local/` from outbound
results, consistent with the existing direction-filtering behavior.

---

## Paginación

**R12.** THE SYSTEM SHALL paginate the response using `page` (default: 1) and `limit`
(default: 100, maximum: 500) query parameters.

**R13.** THE SYSTEM SHALL include in every response a `meta` object containing at minimum:
`total` (total matching records before pagination), `page` (current page), `limit` (page size),
and `totalPages` (ceil(total / limit)).

**R14.** IF the `limit` parameter exceeds 500,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

**R15.** IF the `page` parameter is less than 1 or not a positive integer,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

---

## Columnas de respuesta

**R16.** THE SYSTEM SHALL include the following columns for each record in the response:
`calldate` (ISO 8601 datetime string), `src` (internal extension that originated the call),
`dst` (external number dialed), `dstchannel` (normalized outbound trunk name),
`duration` (total seconds as integer), `billsec` (billed seconds as integer),
`disposition` (one of the four standard values).

---

## Casos límite de consulta

**R17.** IF no CDR records match the applied filters,
THEN THE SYSTEM SHALL return HTTP 200 with an empty `data` array and `meta.total = 0`.

---

## Exportación a Excel

**R18.** WHEN the operator requests an Excel export,
THE SYSTEM SHALL generate and immediately stream a downloadable `.xlsx` file containing
all records matching the active filters (not paginated), up to a maximum of 10,000 rows.

**R19.** THE SYSTEM SHALL include a header row in the Excel file with human-readable column
labels in Spanish: Fecha/Hora, Extensión, Destino, Troncal, Duración (s), Seg. facturados,
Estado.

**R20.** IF the result set for an Excel export exceeds 10,000 records,
THE SYSTEM SHALL export only the first 10,000 records and include a warning header
in the response indicating truncation.

**R21.** IF no records match the filters for an Excel export,
THE SYSTEM SHALL generate and deliver an empty `.xlsx` file with only the header row
(HTTP 200, no error).

---

## Exportación a PDF

**R22.** WHEN the operator requests a PDF export,
THE SYSTEM SHALL generate and immediately stream a downloadable `.pdf` file containing
all records matching the active filters (not paginated), up to a maximum of 10,000 rows.

**R23.** THE SYSTEM SHALL include a title, generation timestamp, active filter summary,
and a tabular layout of the records in the PDF document.

**R24.** IF the result set for a PDF export exceeds 10,000 records,
THE SYSTEM SHALL export only the first 10,000 records and note the truncation in the PDF.

**R25.** IF no records match the filters for a PDF export,
THE SYSTEM SHALL generate and deliver a PDF containing only the header and a
"No se encontraron registros" message (HTTP 200, no error).

---

## Formato inválido de exportación

**R26.** IF the `format` parameter is provided with a value other than `xlsx` or `pdf`,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

---

## Ordenamiento (frontend)

**R27.** THE SYSTEM SHALL allow the user to sort the outbound calls table by any displayed
column (calldate, src, dst, dstchannel, duration, billsec, disposition) in ascending or
descending order, applied client-side on the currently loaded page.

---

## Autenticación y autorización

**R28.** WHEN any request is made to the outbound calls or export endpoints without a valid
authenticated session, THE SYSTEM SHALL reject the request with HTTP 401.

**R29.** THE SYSTEM SHALL require at minimum the `monitor` role (any authenticated user)
to access the outbound calls and export endpoints. No admin role is required.

---

## Reutilización de código existente

**R30.** THE SYSTEM SHALL implement outbound CDR queries by extending the existing
`backend/services/cdrService.js` file with new exported functions, without modifying or
duplicating the existing `queryInbound` or `queryInboundExport` functions.

**R31.** THE SYSTEM SHALL generate Excel and PDF exports by reusing the existing
`toXlsx` and `toPdf` functions from `backend/services/exportService.js`, providing
outbound-specific column headers and filename prefix.

---

## Compatibilidad con v1.0

**R32.** THE SYSTEM SHALL preserve all existing endpoints (`/api/calls/today`,
`/api/calls/range`, `/api/events`, `/api/calls/inbound`, `/api/calls/inbound/export`)
and the existing `OutboundView.jsx` frontend component without any modification to
their behavior or contracts.

---

## Rendimiento (RNF)

**R33.** THE SYSTEM SHALL respond to outbound call list queries within 10 seconds for
date ranges of up to 31 days under normal database load.

**R34.** THE SYSTEM SHALL complete Excel and PDF export generation and begin streaming
the file to the client within 10 seconds for result sets up to 10,000 rows.

**R35.** IF an export or query operation exceeds 10 seconds,
THE SYSTEM SHALL return HTTP 504 with a clear error message.
