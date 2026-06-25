# Review Feature #46 — subcompany_name_config

**Fecha:** 2026-06-25
**Reviewer:** agente `reviewer`
**Resultado:** APROBADO

---

## Verificación de requisitos

### R1 — `getGeneralConfig` incluye `subcompanyName` con valor por defecto ''
**PASS** — `configService.js` línea 62: `subcompanyName: getConfigValue(db, 'subcompanyName', '') || ''`

### R2 — `updateGeneralConfig` valida string ≤100 chars y persiste con `setConfigValue`
**PASS** — `configService.js` líneas 112-116: valida `typeof subcompanyName !== 'string' || subcompanyName.length > 100`. Línea 136-138: persiste con `setConfigValue(db, 'subcompanyName', subcompanyName.trim())`.

### R3 — GET /api/admin/config incluye `subcompanyName` en la respuesta
**PASS** — `routes/config.js` línea 107: `buildConfigResponse()` devuelve `subcompanyName: general.subcompanyName`.

### R4 — PATCH /api/admin/config acepta y procesa `subcompanyName`
**PASS** — `routes/config.js` líneas 123-150: destructura `subcompanyName` del body, lo incluye en la condición de "algún campo provisto" (línea 125) y lo pasa a `updateGeneralConfig` (línea 150).

### R5 — GET /api/config/public (sin auth) incluye `subcompanyName`
**PASS** — `server.js` líneas 650-653: endpoint sin middleware de auth; responde `{ appName: getAppName(), subcompanyName }` donde `subcompanyName` se lee con `getConfigValue(db, 'subcompanyName', '') || ''`.

### R6 — Layout.jsx NO tiene "Physical" hardcodeado; lee `subcompanyName` dinámicamente y muestra de forma condicional
**PASS** — `Layout.jsx` líneas 39, 50-53: estado `subcompanyName` inicializado a `''`, poblado desde `api.publicConfig()`. Líneas 134-136: renderizado condicional `{subcompanyName && (<div ...>{subcompanyName}</div>)}`. No hay ningún texto "Physical" en el archivo.

### R7 — SystemConfig.jsx tiene campo "Nombre de subempresa" con maxLength=100 e incluye el campo en el guardado
**PASS** — `SystemConfig.jsx` líneas 169, 218-225: estado `subcompanyName` con `useState(config.subcompanyName || '')`, campo `<Input maxLength={100} ...>` con label "Nombre de subempresa". Línea 195: incluido en `api.updateAdminConfig({ companyName, subcompanyName, timezone, language, businessHours })`.

### R8 — exportService incluye `subcompanyName` en encabezado PDF y Excel cuando no está vacío
**PASS**
- PDF: líneas 316-318: `if (branding.subcompanyName) { doc.text(branding.subcompanyName, ...) }`
- Excel: función `writeXlsxHeaderBlock` (línea 606) acepta `subcompanyName`; líneas 609-611: `if (subcompanyName) { worksheet.addRow([subcompanyName]).commit(); }`. Línea 654: se pasa `subcompanyName: branding.subcompanyName || ''`.

---

## Build

```
✓ built in 18.46s
```
Sin errores. Solo una advertencia de chunk size (preexistente, no relacionada con esta feature).

---

## Conclusión

Todos los requisitos R1–R8 están correctamente implementados. El build es exitoso.
