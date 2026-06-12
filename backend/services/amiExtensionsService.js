'use strict';

const AsteriskManager = require('asterisk-manager');

const DEFAULT_TIMEOUT_MS  = 5_000;
const DEFAULT_INTERVAL_MS = 30_000;

const EMPTY_STATE = Object.freeze({
  total: 0,
  active: 0,
  extensions: [],
  available: false,
});

/**
 * Factory for the AMI extensions status service (feature #18 —
 * dashboard_extensions_status).
 *
 * Maintains an in-memory snapshot of PJSIP/SIP endpoint registration status
 * (`{ total, active, extensions: [{ extension, status }], available }`),
 * refreshed periodically via the read-only AMI action `PJSIPShowEndpoints`.
 *
 * - If `amiConfig` is missing or incomplete (R1/R2), the integration is
 *   treated as "not configured": no AMI connection is ever attempted and
 *   `getStatus()` always returns the empty/unavailable state.
 * - On connection/query failure, the previously cached successful result is
 *   retained if one exists (R10); otherwise the empty/unavailable state is
 *   kept. Failures are logged via `console.error` without exposing
 *   credentials (R11/R20).
 * - Only read-only AMI actions are issued (R5/R19).
 *
 * @param {{ host?: string, port?: number, username?: string, password?: string }|undefined|null} amiConfig
 * @param {{ timeoutMs?: number }} [options]
 * @returns {{
 *   check: () => Promise<object>,
 *   getStatus: () => object,
 *   start: (intervalMs?: number) => () => void,
 * }}
 */
module.exports = function createAmiExtensionsService(amiConfig, options = {}) {
  const timeoutMs = options.timeoutMs || DEFAULT_TIMEOUT_MS;

  const configured = Boolean(
    amiConfig &&
    amiConfig.host &&
    amiConfig.port &&
    amiConfig.username &&
    amiConfig.password,
  );

  let state = { ...EMPTY_STATE };
  let hasSucceededOnce = false;
  let ami = null;

  if (configured) {
    ami = new AsteriskManager(amiConfig.port, amiConfig.host, amiConfig.username, amiConfig.password, false);
    // Prevent unhandled 'error' events from crashing the process (R11).
    ami.on('error', (err) => {
      console.error('[ami] connection error:', err.message);
    });
  }

  function getStatus() {
    return { ...state, extensions: state.extensions.map(e => ({ ...e })) };
  }

  /**
   * Sends the `PJSIPShowEndpoints` AMI action and accumulates the
   * `EndpointList` events (one per endpoint) until `EndpointListComplete`.
   *
   * Field mapping (verified against Asterisk 18/Issabel PJSIP AMI output):
   * - `extension`: `ObjectName` field of each `EndpointList` event — the
   *   PJSIP endpoint identifier (typically the extension number).
   * - `status`: derived from the `DeviceState` field. Asterisk reports
   *   `UNAVAILABLE` when an endpoint has no registered contacts; any other
   *   value (`NOT_INUSE`, `INUSE`, `RINGING`, `ON HOLD`, etc.) indicates the
   *   endpoint has at least one registered contact, so it is normalized to
   *   `'active'`. `UNAVAILABLE` (or a missing `DeviceState`) is normalized
   *   to `'inactive'`.
   */
  function queryEndpoints() {
    return new Promise((resolve, reject) => {
      const endpoints = [];

      function onManagerEvent(evt) {
        const eventName = String(evt.event || '').toLowerCase();

        if (eventName === 'endpointlist') {
          const extension = evt.objectname || evt.resource;
          const deviceState = (evt.devicestate || '').toUpperCase();
          const status = deviceState && deviceState !== 'UNAVAILABLE' ? 'active' : 'inactive';
          if (extension) endpoints.push({ extension, status });
        } else if (eventName === 'endpointlistcomplete') {
          cleanup();
          resolve(endpoints);
        }
      }

      function cleanup() {
        ami.removeListener('managerevent', onManagerEvent);
      }

      ami.on('managerevent', onManagerEvent);

      ami.action({ action: 'PJSIPShowEndpoints' }, (err) => {
        if (err) {
          cleanup();
          reject(err instanceof Error ? err : new Error(String(err.message || 'Error AMI')));
        }
        // On success, the response itself carries no endpoint data — the
        // endpoints arrive as `EndpointList`/`EndpointListComplete` events
        // handled above.
      });
    });
  }

  async function check() {
    if (!configured) {
      return getStatus();
    }

    let timeoutHandle;

    try {
      const endpoints = await Promise.race([
        queryEndpoints(),
        new Promise((_resolve, reject) => {
          timeoutHandle = setTimeout(() => reject(new Error('Timeout al consultar extensiones AMI')), timeoutMs);
        }),
      ]);

      const total  = endpoints.length;
      const active = endpoints.filter(e => e.status === 'active').length;

      state = { total, active, extensions: endpoints, available: true };
      hasSucceededOnce = true;
    } catch (err) {
      console.error('[ami] PJSIPShowEndpoints failed:', err.message);
      if (!hasSucceededOnce) {
        state = { ...EMPTY_STATE };
      }
      // else: retain the previously cached successful result (R10) — `state`
      // is left untouched.
    } finally {
      clearTimeout(timeoutHandle);
    }

    return getStatus();
  }

  function start(intervalMs = DEFAULT_INTERVAL_MS) {
    if (!configured) {
      return function stop() {};
    }

    const timer = setInterval(() => {
      check().catch(err => console.error('[ami] check:', err.message));
    }, intervalMs);

    return function stop() {
      clearInterval(timer);
    };
  }

  return { check, getStatus, start };
};
