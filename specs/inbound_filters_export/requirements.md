# Requirements — inbound_filters_export

> Notación EARS. Un requisito = una sola idea. Sin mencionar implementación.

---

## Filtros y consulta de registros individuales

**R1.** WHEN the operator requests inbound calls providing `from` and `to` date parameters,
THE SYSTEM SHALL return individual CDR records (not aggregated) for calls whose `calldate`
falls within the specified range, inclusive of both boundary values.

**R2.** WHEN the operator provides a `trunk` filter parameter,
THE SYSTEM SHALL return only records whose normalized channel name matches the given trunk value.

**R3.** WHEN the operator provides an `origin` filter parameter,
THE SYSTEM SHALL return only records whose `src` field contains the provided string
(case-insensitive partial match).

**R4.** WHEN the operator provides a `disposition` filter parameter,
THE SYSTEM SHALL return only records whose `disposition` field matches exactly one of:
`ANSWERED`, `NO ANSWER`, `BUSY`, `FAILED`.

**R5.** WHEN the operator applies multiple filters simultaneously,
THE SYSTEM SHALL apply all active filters as AND conditions, returning only records
that satisfy every active filter at the same time.

**R6.** IF the `from` or `to` date parameter is missing from the request,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

**R7.** IF a `from` or `to` date parameter is provided with an invalid format,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

**R8.** IF the `disposition` filter parameter is provided with a value not in the allowed set,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

---

## Paginación

**R9.** THE SYSTEM SHALL paginate the response using `page` (default: 1) and `limit`
(default: 100, maximum: 500) query parameters.

**R10.** THE SYSTEM SHALL include in every response a `meta` object containing at minimum:
`total` (total matching records before pagination), `page` (current page), `limit` (page size),
and `totalPages` (ceil(total / limit)).

**R11.** IF the `limit` parameter exceeds 500,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

**R12.** IF the `page` parameter is less than 1 or not a positive integer,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

---

## Columnas de respuesta

**R13.** THE SYSTEM SHALL include the following columns for each record in the response:
`calldate` (ISO 8601 datetime string), `src` (originating number), `dst` (destination number),
`channel` (normalized trunk name), `duration` (total seconds as integer),
`billsec` (billed seconds as integer), `disposition` (one of the four standard values).

---

## Casos límite de consulta

**R14.** IF no CDR records match the applied filters,
THEN THE SYSTEM SHALL return HTTP 200 with an empty `data` array and `meta.total = 0`.

---

## Exportación a Excel

**R15.** WHEN the operator requests an Excel export,
THE SYSTEM SHALL generate and immediately stream a downloadable `.xlsx` file containing
all records matching the active filters (not paginated), up to a maximum of 10,000 rows.

**R16.** THE SYSTEM SHALL include a header row in the Excel file with human-readable column
labels in Spanish: Fecha/Hora, Origen, Destino, Troncal, Duración (s), Segundos facturados,
Estado.

**R17.** IF the result set for an Excel export exceeds 10,000 records,
THE SYSTEM SHALL export only the first 10,000 records and include a warning header
in the response indicating truncation.

**R18.** IF no records match the filters for an Excel export,
THE SYSTEM SHALL generate and deliver an empty `.xlsx` file with only the header row
(HTTP 200, no error).

---

## Exportación a PDF

**R19.** WHEN the operator requests a PDF export,
THE SYSTEM SHALL generate and immediately stream a downloadable `.pdf` file containing
all records matching the active filters (not paginated), up to a maximum of 10,000 rows.

**R20.** THE SYSTEM SHALL include a title, generation timestamp, active filter summary,
and a tabular layout of the records in the PDF document.

**R21.** IF the result set for a PDF export exceeds 10,000 records,
THE SYSTEM SHALL export only the first 10,000 records and note the truncation in the PDF.

**R22.** IF no records match the filters for a PDF export,
THE SYSTEM SHALL generate and deliver a PDF containing only the header and a
"No se encontraron registros" message (HTTP 200, no error).

---

## Formato inválido de exportación

**R23.** IF the `format` parameter is provided with a value other than `xlsx` or `pdf`,
THEN THE SYSTEM SHALL reject the request with HTTP 400 and a descriptive error message.

---

## Ordenamiento (frontend)

**R24.** THE SYSTEM SHALL allow the user to sort the inbound calls table by any displayed
column (calldate, src, dst, channel, duration, billsec, disposition) in ascending or
descending order, applied client-side on the currently loaded page.

---

## Autenticación y autorización

**R25.** WHEN any request is made to the inbound calls or export endpoints without a valid
authenticated session, THE SYSTEM SHALL reject the request with HTTP 401.

**R26.** THE SYSTEM SHALL require at minimum the `monitor` role (any authenticated user)
to access the inbound calls and export endpoints. No admin role is required.

---

## Rendimiento (RNF)

**R27.** THE SYSTEM SHALL respond to inbound call list queries within 10 seconds for
date ranges of up to 31 days under normal database load.

**R28.** THE SYSTEM SHALL complete Excel and PDF export generation and begin streaming
the file to the client within 10 seconds for result sets up to 10,000 rows.

**R29.** IF an export or query operation exceeds 10 seconds,
THE SYSTEM SHALL return HTTP 504 with a clear error message.
