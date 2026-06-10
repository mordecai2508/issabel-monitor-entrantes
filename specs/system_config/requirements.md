# requirements.md — system_config

> Feature ID: 13 | Notación EARS | Revisión: 2026-06-10

---

## Endpoint general: GET /api/admin/config

**R1.** WHEN an authenticated administrator sends `GET /api/admin/config`
THE SYSTEM SHALL return HTTP 200 with the current general configuration, including: company name, timezone, language, theme colors (primary and accent), and the relative path/URL of the configured logo (or `null` if none is configured).

**R2.** IF a non-administrator (or unauthenticated) client sends `GET /api/admin/config` THEN THE SYSTEM SHALL return HTTP 403 (authenticated, non-admin) or HTTP 401 (no session), without returning any configuration data.

**R3.** IF no configuration values have been set yet THE SYSTEM SHALL return default values for company name (the existing application name), timezone (the timezone configured in `config.json` for the Issabel database), language (`es`), theme colors (the current default palette), and `logoPath: null`.

---

## Endpoint general: PATCH /api/admin/config

**R4.** WHEN an authenticated administrator sends `PATCH /api/admin/config` with a JSON body containing one or more of: `companyName`, `timezone`, `language`, `themeColors` (object with `primary` and `accent`)
THE SYSTEM SHALL persist only the provided fields, leave unspecified fields unchanged, and return HTTP 200 with the resulting full configuration.

**R5.** IF `companyName` is provided and is not a non-empty string (after trimming) THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any field from the request.

**R6.** IF `timezone` is provided and does not match the expected UTC-offset format (`±HH:MM`, e.g. `-05:00`) THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any field from the request.

**R7.** IF `language` is provided and is not one of the supported language codes (`es`, `en`) THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any field from the request.

**R8.** IF `themeColors` is provided and either `primary` or `accent` is not a valid CSS hex color (`#RGB` or `#RRGGBB`) THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any field from the request.

**R9.** IF a non-administrator (or unauthenticated) client sends `PATCH /api/admin/config` THEN THE SYSTEM SHALL return HTTP 403 (authenticated, non-admin) or HTTP 401 (no session), without persisting any change.

**R10.** WHEN `companyName` is successfully updated via `PATCH /api/admin/config` THE SYSTEM SHALL make the new company name available to the report-generation feature (#12) through the existing `reportService.getBranding` lookup, without requiring any change to the reports module.

---

## Endpoint: POST /api/admin/config/logo (subida de logo)

**R11.** WHEN an authenticated administrator sends `POST /api/admin/config/logo` as `multipart/form-data` with a single file field containing a PNG or JPEG image of size ≤ 2 MB
THE SYSTEM SHALL store the image in `backend/uploads/`, persist its path/reference as the current logo, and return HTTP 200 with the resulting logo reference (e.g. `logoUrl`).

**R12.** IF the uploaded file's MIME type is not `image/png` or `image/jpeg` THEN THE SYSTEM SHALL reject the upload, return HTTP 400 with a descriptive error, and SHALL NOT store the file or change the persisted logo reference.

**R13.** IF the uploaded file exceeds 2 MB THEN THE SYSTEM SHALL reject the upload, return HTTP 400 with a descriptive error, and SHALL NOT store the file or change the persisted logo reference.

**R14.** IF no file is included in the request THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error.

**R15.** WHEN a new logo is successfully uploaded and a previous logo file exists on disk THE SYSTEM SHALL remove the previous logo file after the new one is stored, so that `backend/uploads/` does not accumulate orphaned logo files.

**R16.** IF a non-administrator (or unauthenticated) client sends `POST /api/admin/config/logo` THEN THE SYSTEM SHALL return HTTP 403 (authenticated, non-admin) or HTTP 401 (no session), without storing any file.

---

## Endpoint: GET /api/admin/config/logo (servir logo actual)

**R17.** WHEN any authenticated user sends `GET /api/admin/config/logo` and a logo has been configured and the corresponding file exists on disk
THE SYSTEM SHALL return HTTP 200 streaming the image file with the correct `Content-Type` (`image/png` or `image/jpeg`).

**R18.** IF no logo has been configured, or the configured logo file no longer exists on disk THEN THE SYSTEM SHALL return HTTP 404 with a descriptive error.

**R19.** IF an unauthenticated client sends `GET /api/admin/config/logo` THEN THE SYSTEM SHALL return HTTP 401.

---

## Endpoint: PATCH /api/admin/extensions/:ext (renombrar/ocultar extensión)

**R20.** WHEN an authenticated administrator sends `PATCH /api/admin/extensions/:ext` with a JSON body containing `displayName` (string) and/or `hidden` (boolean)
THE SYSTEM SHALL persist a per-extension override for the extension identified by `:ext` (the CDR `src` value) and return HTTP 200 with the resulting extension configuration (`extension`, `displayName`, `hidden`).

**R21.** IF `:ext` is an empty string or contains characters that cannot correspond to a valid CDR `src`/extension value (per project SQL parameter rules, no validation against a fixed registry of extensions is required since extensions are not enumerated centrally) THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error.

**R22.** IF `displayName` is provided and is not a string (after trimming, may be empty to clear the override) THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any field from the request.

**R23.** IF `hidden` is provided and is not a boolean THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any field from the request.

**R24.** IF neither `displayName` nor `hidden` is provided in the request body THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error.

**R25.** IF a non-administrator (or unauthenticated) client sends `PATCH /api/admin/extensions/:ext` THEN THE SYSTEM SHALL return HTTP 403 (authenticated, non-admin) or HTTP 401 (no session), without persisting any change.

**R26.** WHEN an extension override (`displayName` and/or `hidden`) is persisted for a given extension and a request is later made to remove all overrides (empty `displayName` and `hidden = false`) THE SYSTEM SHALL remove the stored override row entirely rather than retaining an empty record.

---

## Endpoint: PATCH /api/admin/trunks/:trunk (mostrar/ocultar troncal)

**R27.** WHEN an authenticated administrator sends `PATCH /api/admin/trunks/:trunk` with a JSON body containing `hidden` (boolean), where `:trunk` identifies a normalized trunk/channel name as used by `statsService.queryRankings(..., 'trunk', ...)`
THE SYSTEM SHALL persist the visibility override for that trunk and return HTTP 200 with the resulting trunk configuration (`trunk`, `hidden`).

**R28.** IF `hidden` is absent from the request body or is not a boolean THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error and SHALL NOT persist any change.

**R29.** IF `:trunk` is an empty string THEN THE SYSTEM SHALL return HTTP 400 with a descriptive error.

**R30.** IF a non-administrator (or unauthenticated) client sends `PATCH /api/admin/trunks/:trunk` THEN THE SYSTEM SHALL return HTTP 403 (authenticated, non-admin) or HTTP 401 (no session), without persisting any change.

**R31.** WHEN `hidden` is set to `false` for a trunk that previously had `hidden = true` and no other override exists for that trunk THE SYSTEM SHALL remove the stored override row entirely rather than retaining a record with `hidden = false`.

---

## Frontend — pantalla de Configuración

**R32.** THE SYSTEM SHALL provide a new "Configuración" screen, accessible only to administrators, organized into three tabs: "General", "Personalización", and "Apariencia".

**R33.** WHILE the "General" tab is active THE SYSTEM SHALL display editable fields for company name, timezone, and language, and a "Guardar" action that calls `PATCH /api/admin/config` with the modified fields.

**R34.** WHILE the "Personalización" tab is active THE SYSTEM SHALL display: a logo upload control (accepting PNG/JPG, showing the current logo if configured), a list of known extensions (derived from extension rankings) allowing the administrator to set a display name and toggle visibility per extension via `PATCH /api/admin/extensions/:ext`, and a list of known trunks (derived from trunk rankings) allowing the administrator to toggle visibility per trunk via `PATCH /api/admin/trunks/:trunk`.

**R35.** WHILE the "Apariencia" tab is active THE SYSTEM SHALL display color pickers for the primary and accent theme colors, with a "Guardar" action that calls `PATCH /api/admin/config` with the `themeColors` field.

**R36.** WHEN any save action on the Configuración screen succeeds THE SYSTEM SHALL display a success confirmation (inline, not `alert()`); IF it fails THE SYSTEM SHALL display an inline error banner with the server-provided error message.

**R37.** WHEN the logo upload control is used and the selected file is invalid (wrong type or too large) THE SYSTEM SHALL prevent the upload request from being sent and SHALL display an inline validation message before any network call to `POST /api/admin/config/logo`.

**R38.** THE SYSTEM SHALL add a navigation entry "Configuración" in the sidebar (`Layout.jsx`), visible only to users with the `admin` role, linking to the new Configuración screen.

---

## Compatibilidad y seguridad

**R39.** THE SYSTEM SHALL NOT modify the behavior of the existing endpoints `GET /api/config/public`, `PUT /api/admin/app`, `GET /api/admin/channels`, `PUT /api/admin/channels/:channel`, or `GET /api/events`; these SHALL continue to operate exactly as in v1.0, independently of any value stored via the new `/api/admin/config*` endpoints.

**R40.** THE SYSTEM SHALL NOT write to, modify, or alter the schema of the Issabel CDR database (`asteriskcdrdb.cdr`); all extension and trunk identification SHALL be derived from existing read-only CDR queries (`statsService.queryRankings`).

**R41.** THE SYSTEM SHALL store all configuration introduced by this feature (company name, timezone, language, theme colors, logo reference, extension overrides, trunk visibility overrides) in the local SQLite database (`backend/db/monitor.sqlite`), not in `backend/config.json`.

**R42.** THE SYSTEM SHALL respond to `GET /api/admin/config` and `PATCH /api/admin/config` in under 1 second under normal conditions, as these operations only access local SQLite data and do not query the Issabel CDR database.
