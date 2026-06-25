# Tasks — subcompany_name_config

- [x] T1. No hay dependencias npm nuevas.

- [x] T2. No hay cambios de esquema en SQLite.
      La clave `subcompany_name` se inserta/actualiza en la tabla existente `system_config`
      mediante `setConfigValue`. No se requiere `ALTER TABLE`.

- [x] T3. **Backend — `backend/services/configService.js`**
      - En `getGeneralConfig`: añadir `subcompanyName: getConfigValue(db, 'subcompanyName', '') || ''`.
      - En `updateGeneralConfig`: añadir validación y persistencia de `subcompanyName`
        (string, trim, longitud máxima 100 caracteres; rechazar con status 400 si se viola).

- [x] T4. **Backend — `backend/routes/config.js`**
      - En `buildConfigResponse`: incluir `subcompanyName: general.subcompanyName` en
        el objeto retornado.
      - En `PATCH /admin/config`: destructurar `subcompanyName` del body; incluirlo en
        la condición de "al menos un campo"; pasarlo a `updateGeneralConfig`.
      - En `GET /api/public/config` (ubicar el endpoint en `server.js` o donde esté):
        añadir `subcompanyName` leído de SQLite para que `Layout.jsx` pueda consumirlo
        sin autenticación admin.

- [x] T5. No hay nuevo router. Todos los cambios van a routers existentes.

- [ ] T6. **Tests — `backend/tests/subcompany_name_config.test.js`**
      - R1: verificar que `getGeneralConfig` retorna `subcompanyName: ''` cuando la
        clave no existe en `system_config`.
      - R2: verificar que `PATCH /admin/config` con `{ subcompanyName: 'ACME' }` persiste
        el valor y lo devuelve en la respuesta.
      - R5: verificar que `GET /admin/config` incluye `subcompanyName` en la respuesta.
      - R8: verificar que `PATCH /admin/config` con `subcompanyName` de 101 caracteres
        devuelve HTTP 400.

- [x] T7. **Frontend — `frontend/src/components/SystemConfig.jsx`**
      - En `GeneralTab`: añadir estado `subcompanyName`, campo `<Input>` con label
        "Nombre de subempresa" y `maxLength={100}`, e incluirlo en la llamada a
        `api.updateAdminConfig`.

- [x] T8. **Frontend — `frontend/src/components/Layout.jsx`**
      - Añadir estado `subcompanyName` (default `''`).
      - En `useEffect` de `api.publicConfig()`: leer `d.subcompanyName` y guardarlo.
      - Reemplazar `<div className="text-xs text-slate-500 leading-none mt-0.5">Physical</div>`
        por renderizado condicional: mostrar solo cuando `subcompanyName` no está vacío.

- [x] T9. **Frontend — componente(s) de reportes PDF/Excel**
      - Localizar donde se construye el encabezado del reporte (buscar referencias a
        `companyName` en el código de generación de PDF/Excel).
      - Añadir `subcompanyName` como segunda línea del encabezado, solo si no está vacío (R6, R7).

- [ ] T10. Verificación manual:
      - Ir a Configuración → General, escribir un valor en "Nombre de subempresa" y guardar.
      - Verificar que el sidebar muestra el valor debajo del nombre de empresa.
      - Guardar con campo vacío y verificar que el subtítulo desaparece del sidebar.
      - Generar un reporte PDF/Excel y verificar que el subtítulo aparece/se omite según el valor configurado.

- [ ] T11. Ejecutar `npm test` (verde), `npm run lint` (sin errores), `npm run build` (sin errores).
