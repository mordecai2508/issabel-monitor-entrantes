# Manual de Usuario — Issabel Call Monitor

> **Versión:** 2.0 · **Fecha:** junio 2026

---

## Tabla de contenido

1. [Introducción](#1-introducción)
2. [Acceso al sistema](#2-acceso-al-sistema)
3. [Navegación general](#3-navegación-general)
4. [Dashboard — Monitoreo en tiempo real](#4-dashboard--monitoreo-en-tiempo-real)
5. [Llamadas Entrantes](#5-llamadas-entrantes)
6. [Llamadas Salientes](#6-llamadas-salientes)
7. [Histórico de Llamadas](#7-histórico-de-llamadas)
8. [Analytics Histórico](#8-analytics-histórico)
9. [Alertas Activas](#9-alertas-activas)
10. [Reportes](#10-reportes)
11. [Administración — Gestión de Usuarios](#11-administración--gestión-de-usuarios)
12. [Administración — Configuración del Sistema](#12-administración--configuración-del-sistema)
13. [Administración — Reglas de Alerta](#13-administración--reglas-de-alerta)
14. [Administración — Canales](#14-administración--canales)
15. [Referencia de roles y permisos](#15-referencia-de-roles-y-permisos)
16. [Glosario](#16-glosario)

---

## 1. Introducción

**Issabel Call Monitor** es un dashboard en tiempo real que muestra las estadísticas de llamadas de su central telefónica (PBX Issabel/Asterisk). Permite a los supervisores y operadores de call center visualizar el estado del tráfico telefónico del día, consultar históricos, generar reportes y configurar alertas automáticas.

### ¿Qué puede hacer con esta herramienta?

- Ver cuántas llamadas se recibieron, contestaron y perdieron **en este momento**.
- Consultar el historial de llamadas de días, semanas o meses anteriores.
- Comparar el rendimiento entre dos períodos.
- Generar reportes ejecutivos en PDF o Excel.
- Recibir alertas automáticas cuando ocurre algo inusual (caída de troncal, pico de llamadas perdidas, etc.).
- Administrar usuarios y personalizar el sistema.

---

## 2. Acceso al sistema

### Iniciar sesión

1. Abra su navegador web e ingrese la dirección del sistema (ej. `http://192.168.1.100:4000`).
2. Ingrese su **nombre de usuario** y **contraseña**.
3. Haga clic en **Iniciar sesión**.

> Si olvidó su contraseña, comuníquese con el administrador del sistema para que la restablezca.

### Cerrar sesión

Haga clic en el ícono de usuario ubicado en la esquina superior derecha del menú lateral y seleccione **Cerrar sesión**.

---

## 3. Navegación general

El menú principal se encuentra en el panel lateral izquierdo. Dependiendo de su rol (operador o administrador) verá diferentes opciones.

### Menú para Operadores

| Ícono | Sección | Descripción |
|---|---|---|
| 📊 | **Dashboard** | Monitoreo en tiempo real |
| 📞 | **Entrantes** | Llamadas recibidas del día |
| ↗️ | **Salientes** | Llamadas realizadas del día |
| 📅 | **Histórico** | Consulta por rango de fechas |
| 📈 | **Analytics** | Tendencias y comparativas |
| 🔔 | **Alertas** | Alertas activas del sistema |
| 📄 | **Reportes** | Generación de reportes |

### Menú adicional para Administradores

| Ícono | Sección | Descripción |
|---|---|---|
| 👥 | **Usuarios** | Gestión de cuentas de usuario |
| ⚙️ | **Configuración** | Parámetros del sistema |
| 🔕 | **Reglas de alerta** | Configurar alertas automáticas |
| 📡 | **Canales** | Nombres de troncales/canales |

### Indicador de conexión en tiempo real

En la esquina superior derecha del dashboard verá un badge que indica el estado de la conexión:

- 🟢 **En vivo** — El sistema está recibiendo datos correctamente.
- ⚪ **Reconectando...** — Se perdió la conexión; el sistema intenta reconectar automáticamente.

---

## 4. Dashboard — Monitoreo en tiempo real

**Acceso:** Menú lateral → Dashboard  
**Rol:** Operador y Administrador  
**Actualización:** Automática cada 30 segundos

El Dashboard es la pantalla principal. Muestra un resumen completo de toda la actividad telefónica del **día actual**.

### 4.1 Tarjetas de resumen

En la parte superior encontrará tarjetas con los indicadores clave:

| Tarjeta | Qué muestra |
|---|---|
| **Total de llamadas** | Todas las llamadas del día (entrantes + salientes) |
| **Contestadas** | Llamadas atendidas por un agente; incluye porcentaje sobre el total |
| **Perdidas** | Clientes que colgaron mientras esperaban en el IVR/menú; nadie los atendió |
| **No contestadas** | Clientes que entraron a la cola de espera pero ningún agente respondió a tiempo |
| **Duración promedio** | Duración media de las llamadas contestadas (en minutos:segundos) |
| **Tiempo total** | Suma de la duración de todas las llamadas del día |

> **Perdidas vs. No contestadas:** Una llamada *perdida* es cuando el cliente cuelga antes de que un agente pueda contestar (se fue del menú IVR). Una llamada *no contestada* es cuando el cliente esperó en la cola pero los agentes no la tomaron.

#### Desglose de Perdidas por horario

Si el administrador configuró un horario de atención, las llamadas perdidas se dividen en:
- **En horario:** Llamadas perdidas durante el horario laboral (alta prioridad).
- **Fuera de horario:** Llamadas perdidas fuera del horario laboral (esperado).

### 4.2 Estadísticas de Entrantes y Salientes

Debajo de las tarjetas principales encontrará secciones separadas para tráfico **Entrante** y **Saliente**, cada una con sus propias métricas y gráficas.

### 4.3 Colas de atención

Tarjetas individuales para cada cola del sistema (ej. *Soporte*, *Ventas*), mostrando:
- Total de llamadas recibidas
- Contestadas y no contestadas
- Llamadas con señal de ocupado

### 4.4 Gráficas

- **Distribución de llamadas (pastel):** Proporción visual de llamadas contestadas, perdidas, no contestadas y fallidas.
- **Llamadas por hora (línea):** Volumen de llamadas en cada hora del día; permite identificar horas pico.

### 4.5 Estadísticas por canal

Tabla al final del dashboard que muestra, para cada troncal/canal:
- Nombre del canal (o alias configurado)
- Total, contestadas, no contestadas, ocupado, fallidas
- Duración total y promedio

---

## 5. Llamadas Entrantes

**Acceso:** Menú lateral → Entrantes  
**Rol:** Operador y Administrador  
**Actualización:** Automática cada 30 segundos

Muestra las mismas métricas que el Dashboard pero **filtradas únicamente para llamadas que llegaron desde fuera** (clientes llamando al call center).

Útil para supervisores que solo gestionan el tráfico de recepción sin mezclarlo con las llamadas salientes.

---

## 6. Llamadas Salientes

**Acceso:** Menú lateral → Salientes  
**Rol:** Operador y Administrador  
**Actualización:** Automática cada 30 segundos

Muestra las métricas de **llamadas que los agentes realizaron hacia el exterior** (clientes, proveedores, etc.).

Incluye:
- Total de llamadas salientes
- Contestadas (cliente atendió) con porcentaje
- Duración promedio
- Estadísticas por canal saliente

> Si no hubo actividad saliente, el sistema mostrará el mensaje: *"No hay llamadas salientes registradas hoy"*.

---

## 7. Histórico de Llamadas

**Acceso:** Menú lateral → Histórico  
**Rol:** Operador y Administrador

Permite consultar las estadísticas de **cualquier período pasado** seleccionando un rango de fechas.

### Cómo consultar el histórico

1. En el campo **Desde**, seleccione la fecha de inicio.
2. En el campo **Hasta**, seleccione la fecha de fin.
3. Haga clic en **Buscar**.
4. El sistema mostrará las mismas métricas del Dashboard pero para el período indicado.

### Exportar datos

Después de realizar una búsqueda, puede descargar la tabla de estadísticas por canal en formato CSV haciendo clic en **Exportar CSV**.

---

## 8. Analytics Histórico

**Acceso:** Menú lateral → Analytics  
**Rol:** Operador y Administrador

Módulo avanzado de análisis con tres herramientas independientes.

### 8.1 Tendencia de llamadas

Muestra la evolución del volumen de llamadas a lo largo del tiempo.

**Cómo usar:**
1. Seleccione un período predefinido o use el selector de fechas personalizado:
   - **Día** — Solo hoy
   - **Semana** — Lunes a domingo de la semana actual
   - **Mes** — Mes calendario actual
   - **Año** — Año calendario
   - **Personalizado** — Elija fecha inicio y fin manualmente
2. La gráfica de barras se actualiza mostrando el total de llamadas (azul) y llamadas contestadas (verde) por día.

### 8.2 Comparativa de períodos

Compara las métricas de dos períodos diferentes para identificar mejoras o retrocesos.

**Cómo usar:**
1. Defina el **Período 1** (P1): fecha inicio y fin.
2. Defina el **Período 2** (P2): fecha inicio y fin.
3. Haga clic en **Comparar**.
4. La tabla mostrará, para cada métrica, el valor de P1, el valor de P2 y la variación porcentual:
   - 🔴 Rojo = retroceso (el valor bajó)
   - 🟢 Verde = mejora (el valor subió)

**Métricas comparadas:**
- Total de llamadas
- Contestadas, No contestadas, Ocupado, Fallidas
- Duración media de llamadas (en segundos)

### 8.3 Rankings

Ranking de rendimiento de agentes (extensiones) o troncales.

**Cómo usar:**
1. Seleccione **Agentes** o **Troncales** con el toggle.
2. Defina el rango de fechas.
3. Indique cuántos resultados mostrar en **Top N** (entre 1 y 50; por defecto 10).
4. La tabla se ordena automáticamente por total de llamadas descendente.

**Columnas:**
- Posición (#)
- Nombre (extensión o troncal)
- Total de llamadas
- Contestadas y No contestadas
- Duración media (segundos)

---

## 9. Alertas Activas

**Acceso:** Menú lateral → Alertas  
**Rol:** Operador y Administrador

Muestra las alertas activas generadas automáticamente por el sistema. Las alertas nuevas aparecen en tiempo real sin necesidad de recargar la página.

### Tipos de alertas

| Tipo | Descripción |
|---|---|
| **Pico de llamadas perdidas** | Se superó el umbral de llamadas perdidas en los últimos 60 minutos |
| **Troncal fuera de servicio** | Un canal no registró actividad durante X minutos |
| **PBX desconectado** | La central telefónica Issabel/Asterisk dejó de responder |

### Resolver una alerta

1. Identifique la alerta en la lista.
2. Verifique y atienda la situación en el sistema telefónico.
3. Haga clic en **Resolver** en la tarjeta de la alerta para retirarla de la lista.

> Resolver una alerta en el sistema no corrige automáticamente el problema en la central. Es solo una confirmación de que el operador tomó conocimiento.

---

## 10. Reportes

**Acceso:** Menú lateral → Reportes  
**Rol:** Operador y Administrador

Genera reportes formales descargables en **PDF** o **Excel (XLSX)**.

### Tipos de reporte disponibles

| Reporte | Contenido |
|---|---|
| **Resumen ejecutivo** | Métricas globales del período: totales, porcentajes, duración |
| **Llamadas entrantes** | Estadísticas detalladas del tráfico entrante |
| **Llamadas salientes** | Estadísticas detalladas del tráfico saliente |
| **Actividad de extensiones** | Ranking de agentes por volumen de llamadas |
| **Actividad de troncales** | Ranking de canales/troncales por volumen de llamadas |

### Cómo generar un reporte

1. Seleccione el **tipo de reporte** haciendo clic en uno de los botones.
2. Defina el rango de fechas con los campos **Desde** y **Hasta**.
3. Haga clic en:
   - **Descargar PDF** para obtener el reporte en formato PDF.
   - **Descargar Excel** para obtener el reporte en formato XLSX.
4. El archivo se descargará automáticamente en su computadora.

---

## 11. Administración — Gestión de Usuarios

**Acceso:** Menú lateral → Usuarios  
**Rol:** Solo Administrador

### 11.1 Crear un nuevo usuario

1. Complete los campos del formulario en la parte superior:
   - **Username:** Nombre de usuario (único, sin espacios).
   - **Contraseña:** Mínimo 8 caracteres.
   - **Rol:** Seleccione *Operador* o *Admin*.
2. Haga clic en **Crear usuario**.

> Las contraseñas se almacenan de forma segura (cifradas con bcrypt). El sistema nunca guarda contraseñas en texto plano.

### 11.2 Gestionar usuarios existentes

En la tabla de usuarios puede:

| Acción | Descripción |
|---|---|
| **Editar** | Cambia el username, rol o estado del usuario |
| **Resetear contraseña** | Genera una contraseña temporal; anótela y entreguela al usuario |
| **Activar / Desactivar** | Toggle rápido para habilitar o bloquear el acceso |

> Un usuario desactivado no puede iniciar sesión aunque tenga credenciales correctas.

### 11.3 Auditoría de accesos

La pestaña **Auditoría** muestra un registro de todos los eventos de acceso:
- Inicios de sesión exitosos
- Cierres de sesión
- Intentos de inicio de sesión fallidos

Cada registro incluye: fecha/hora, usuario, acción e IP de origen.

Haga clic en **Actualizar** para refrescar el log manualmente.

---

## 12. Administración — Configuración del Sistema

**Acceso:** Menú lateral → Configuración  
**Rol:** Solo Administrador

Panel central de configuración dividido en tres pestañas.

### 12.1 Pestaña: General

| Campo | Descripción |
|---|---|
| **Nombre de la empresa** | Se muestra en el encabezado del dashboard y en los reportes |
| **Zona horaria** | Debe coincidir con la zona horaria del servidor Issabel (ej. `-05:00`) |
| **Idioma** | Idioma de la interfaz: Español o Inglés |
| **Horario de atención** | Activa el desglose de llamadas perdidas por horario laboral |

**Configurar horario de atención:**
1. Active la casilla **Horario de atención**.
2. Seleccione los **días laborales** (ej. Lunes a Viernes).
3. Ingrese la **hora de inicio** y **hora de fin** (formato HH:MM).
4. Haga clic en **Guardar**.

Una vez configurado, el Dashboard mostrará las llamadas perdidas divididas en "En horario" y "Fuera de horario".

### 12.2 Pestaña: Personalización

**Logo de la empresa:**
1. Haga clic en **Seleccionar archivo** y elija una imagen (PNG o JPG, máx. 2 MB).
2. Haga clic en **Subir logo**.
3. El logo se mostrará en el encabezado del menú.

**Nombres de extensiones:**
Permite asignar nombres amigables a las extensiones (números internos) para que en los rankings y reportes aparezcan con el nombre del agente en lugar del número.
1. Localice la extensión en la tabla.
2. Haga clic en el ícono de **lápiz** para editar.
3. Escriba el nombre y presione **Enter** para guardar, o **Escape** para cancelar.
4. Use el toggle **Visible / Oculta** para mostrar u ocultar la extensión en los rankings.

**Visibilidad de troncales:**
Control similar para ocultar troncales que no deben aparecer en reportes o dashboards.

### 12.3 Pestaña: Apariencia

Permite personalizar los colores del tema visual:

1. **Color primario:** Color principal de botones y encabezados (por defecto azul `#3b82f6`).
2. **Color de acento:** Color secundario del menú lateral (por defecto azul oscuro `#1e3a5f`).
3. Haga clic en el cuadro de color o escriba directamente el código hexadecimal.
4. Haga clic en **Guardar**.

---

## 13. Administración — Reglas de Alerta

**Acceso:** Menú lateral → Reglas de alerta  
**Rol:** Solo Administrador

Configura las condiciones que disparan alertas automáticas en el Panel de Alertas.

### Tipos de reglas

| Tipo | Cuándo se activa | Umbral |
|---|---|---|
| **Pico de llamadas perdidas** | Cuando en los últimos 60 min se superó X llamadas perdidas | Número de llamadas |
| **Troncal fuera de servicio** | Cuando un canal no registra actividad durante X minutos | Minutos sin actividad |
| **PBX desconectado** | Cuando la central no responde | Sin umbral |

### Crear una regla

1. Seleccione el **tipo de regla** en el formulario.
2. Si el tipo lo requiere, ingrese el **umbral** (número).
3. (Opcional) Ingrese un **correo electrónico** para recibir notificaciones por email.
4. Haga clic en **Guardar**.

### Gestionar reglas existentes

| Acción | Descripción |
|---|---|
| **Habilitar / Deshabilitar** | Toggle rápido para activar o pausar la regla sin eliminarla |
| **Editar** | Cambia el umbral y el correo de notificación |
| **Eliminar** | Elimina la regla permanentemente |

> Puede crear múltiples reglas del mismo tipo con distintos umbrales o correos de notificación.

---

## 14. Administración — Canales

**Acceso:** Menú lateral → Canales  
**Rol:** Solo Administrador

Permite asignar **nombres personalizados** a los canales (troncales) de la central telefónica. Estos nombres aparecen en todos los dashboards, tablas y reportes en lugar del identificador técnico.

### Asignar un nombre a un canal

1. Localice el canal en la tabla.
2. Haga clic en el ícono de **lápiz** (✏️) en la columna de acciones.
3. Escriba el nombre deseado (ej. *Troncal Principal*, *Claro*, *Telmex*).
4. Presione **Enter** para guardar, o **Escape** para cancelar.

> Los canales marcados como "Entrante" (azul) son los que reciben llamadas del exterior. Los "Saliente" (ámbar) son los que se usan para llamadas salientes.

---

## 15. Referencia de roles y permisos

| Función | Operador | Administrador |
|---|---|---|
| Dashboard en tiempo real | ✅ | ✅ |
| Llamadas Entrantes | ✅ | ✅ |
| Llamadas Salientes | ✅ | ✅ |
| Histórico de Llamadas | ✅ | ✅ |
| Analytics Histórico | ✅ | ✅ |
| Alertas Activas (ver) | ✅ | ✅ |
| Alertas Activas (resolver) | ✅ | ✅ |
| Reportes | ✅ | ✅ |
| Gestión de Usuarios | ❌ | ✅ |
| Configuración del Sistema | ❌ | ✅ |
| Reglas de Alerta | ❌ | ✅ |
| Canales | ❌ | ✅ |

---

## 16. Glosario

| Término | Significado |
|---|---|
| **CDR** | Call Detail Record — Registro detallado de cada llamada almacenado por la central |
| **Canal / Troncal** | Línea telefónica que conecta la central con el proveedor o con el exterior |
| **Cola** | Lista de espera donde los clientes aguardan a ser atendidos por un agente |
| **Extensión** | Número interno asignado a un agente o teléfono dentro de la empresa |
| **IVR** | Interactive Voice Response — Menú de voz automático ("Marque 1 para soporte...") |
| **PBX** | Private Branch Exchange — La central telefónica (Issabel/Asterisk) |
| **SSE** | Server-Sent Events — Tecnología que permite recibir actualizaciones automáticas del servidor sin recargar la página |
| **AMI** | Asterisk Manager Interface — Protocolo para comunicarse con Asterisk en tiempo real |
| **ANSWERED** | Llamada contestada por un agente |
| **NO ANSWER** | Llamada que no fue atendida (incluye perdidas y no contestadas en cola) |
| **BUSY** | Llamada que encontró la línea ocupada |
| **FAILED** | Llamada que no pudo establecerse por error técnico |

---

*Manual generado para Issabel Call Monitor v2.0*
