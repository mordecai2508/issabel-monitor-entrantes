# Feature #48 — subcompany_name_display_fix: Tasks

## Overview

The sidebar `subcompanyName` is not refreshed live because:
- The `useSSE` hook has no `config_updated` listener.
- `routes/config.js` never broadcasts after a successful PATCH.
- `Layout.jsx` has no handler to update state from a SSE event.

Four files need changes. No new files.

---

## T1 — Pass `broadcast` into `configRouter` in `server.js`

**File:** `backend/server.js`

- [x] Search for the line that calls `configRouter(` and mounts it on `/api`.
      It currently looks like:
      ```js
      app.use('/api', configRouter(pool, config, db, requireAuth, requireAdmin, getAppName));
      ```
- [x] Add `broadcast` as the 7th argument:
      ```js
      app.use('/api', configRouter(pool, config, db, requireAuth, requireAdmin, getAppName, broadcast));
      ```
- [x] Verify that the `broadcast` function is defined in `server.js` **before**
      this call (it is — it broadcasts to all SSE `clients`). No other change
      needed in this file.

---

## T2 — Accept `broadcast` in `configRouter` and emit `config_updated` after PATCH

**File:** `backend/routes/config.js`

### T2a — Update factory function signature (line 66)

- [x] Change:
  ```js
  module.exports = function configRouter(pool, config, db, requireAuth, requireAdmin, getAppName) {
  ```
  To:
  ```js
  module.exports = function configRouter(pool, config, db, requireAuth, requireAdmin, getAppName, broadcast) {
  ```

### T2b — Broadcast `config_updated` event after successful PATCH

- [x] Inside `router.patch('/admin/config', requireAdmin, ...)`, find the success
      `res.json` call (approximately line 155). It currently reads:
      ```js
      res.json({ ok: true, data: buildConfigResponse() });
      ```
- [x] Replace it with:
      ```js
      const responseData = buildConfigResponse();
      res.json({ ok: true, data: responseData });
      // Notify all SSE clients of config change (R3, R4)
      if (typeof broadcast === 'function') {
        broadcast('config_updated', {
          appName: responseData.companyName,
          subcompanyName: responseData.subcompanyName,
        });
      }
      ```
  **Important:** use `appName` (not `companyName`) in the payload because
  `Layout.jsx` uses the key `appName` when it reads from `publicConfig`.

---

## T3 — Add `onConfigUpdated` handler and SSE listener to `useSSE` hook

**File:** `frontend/src/hooks/useSSE.js`

### T3a — Update destructured props (line 3)

- [x] Change:
  ```js
  export function useSSE(url, { onInit, onUpdate, onPbxStatus, onAlert } = {}) {
  ```
  To:
  ```js
  export function useSSE(url, { onInit, onUpdate, onPbxStatus, onAlert, onConfigUpdated } = {}) {
  ```

### T3b — Register `addEventListener` for `config_updated`

- [x] After the existing `es.addEventListener('alert', ...)` block (line ~34),
      add:
      ```js
      es.addEventListener('config_updated', (e) => {
        const data = JSON.parse(e.data);
        onConfigUpdated?.(data);
      });
      ```
  Place it **before** the `es.onerror` assignment so it follows the same pattern
  as `pbx_status` and `alert` listeners.

---

## T4 — Handle `onConfigUpdated` in `Layout.jsx`

**File:** `frontend/src/components/Layout.jsx`

- [x] Find the `useSSE('/api/events', { … })` call (around line 56). It currently
      passes two handlers: `onPbxStatus` and `onAlert`.
- [x] Add a third handler `onConfigUpdated` inside the same object:
      ```js
      onConfigUpdated: (data) => {
        if (data.appName !== undefined)        setAppName(data.appName);
        if (data.subcompanyName !== undefined) setSubcompanyName(data.subcompanyName);
      },
      ```
  Place it after the `onAlert` handler, before the closing `}`  of the options
  object. No other lines in this file need changing.

---

## Acceptance Criteria

After implementing T1–T4, the following must hold:

1. Admin opens `/admin/config` → General tab, enters a new "Nombre de subempresa",
   clicks "Guardar".
2. Without reloading the page, the sidebar updates **immediately** to show the
   new value below the company name.
3. If a second browser tab is open (same or different user), the sidebar in that
   tab also updates within the SSE poll cycle.
4. If `subcompanyName` is cleared (empty string saved), the subtitle disappears
   from the sidebar (the existing `{subcompanyName && …}` guard handles this).
5. The `GET /api/config/public` endpoint continues to return `subcompanyName`
   correctly (no regression).
