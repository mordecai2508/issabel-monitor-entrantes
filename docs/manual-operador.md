# Guía de Usuario — Issabel Call Monitor

> Para operadores y supervisores de call center · Versión 2.0 · Junio 2026

---

## ¿Qué es este sistema?

Es una pantalla de monitoreo que muestra, en tiempo real, cuántas llamadas están entrando y saliendo de su empresa, cuántas se contestaron y cuántas se perdieron. También le permite consultar días anteriores y descargar reportes.

No necesita hacer nada especial para que los datos se actualicen — el sistema lo hace solo cada 30 segundos.

---

## Cómo entrar al sistema

1. Abra su navegador (Chrome, Edge o Firefox).
2. Escriba la dirección que le dio su administrador (por ejemplo `http://192.168.1.100:4000`).
3. Ingrese su **usuario** y **contraseña**.
4. Haga clic en **Iniciar sesión**.

> Si no recuerda su contraseña, avise a su administrador para que la restablezca.

### Cómo salir

Haga clic en su nombre de usuario en la parte superior del menú y seleccione **Cerrar sesión**.

---

## Las secciones del menú

En la barra del lado izquierdo encontrará estas opciones:

| Sección | Para qué sirve |
|---|---|
| **Dashboard** | Ver el resumen del día en tiempo real |
| **Entrantes** | Ver solo las llamadas que recibió hoy |
| **Salientes** | Ver solo las llamadas que realizó hoy |
| **Histórico** | Consultar estadísticas de días anteriores |
| **Analytics** | Comparar períodos y ver tendencias |
| **Alertas** | Ver avisos importantes del sistema |
| **Reportes** | Descargar informes en PDF o Excel |

---

## Dashboard — El resumen del día

Esta es la pantalla principal. Muestra todo lo que está pasando **hoy** con las llamadas de su empresa.

### Los números principales

En la parte de arriba verá tarjetas con los datos más importantes:

| Tarjeta | Qué significa |
|---|---|
| **Total de llamadas** | Todas las llamadas del día (recibidas y realizadas) |
| **Contestadas** | Llamadas que un agente atendió; también muestra el porcentaje del total |
| **Perdidas** | Clientes que colgaron mientras escuchaban el menú de opciones, antes de hablar con alguien |
| **No contestadas** | Clientes que esperaron en la línea pero ningún agente los atendió |
| **Duración promedio** | Cuánto duran en promedio las llamadas que sí se contestaron |
| **Tiempo total** | La suma de todas las duraciones del día |

> **¿Cuál es la diferencia entre Perdidas y No contestadas?**
> - **Perdida:** el cliente colgó solo, antes de que alguien lo atendiera (mientras escuchaba "marque 1, marque 2…").
> - **No contestada:** el cliente esperó en la línea, pero los agentes no tomaron la llamada.

### Desglose por horario

Si su empresa tiene configurado un horario de atención, verá que las llamadas perdidas se separan en dos grupos:
- **En horario:** clientes que llamaron en horas laborales y no fueron atendidos (requieren seguimiento).
- **Fuera de horario:** clientes que llamaron fuera del horario de trabajo (es algo esperado).

### Las gráficas

- **Gráfica de pastel:** muestra visualmente qué proporción de las llamadas se contestaron, se perdieron, etc.
- **Gráfica por hora:** muestra en qué horas del día hubo más llamadas. Útil para identificar las horas de mayor demanda.

### La tabla de canales

Al final del dashboard hay una tabla que desglosa las llamadas por cada línea telefónica (troncal) que tiene la empresa, con sus números de contestadas, perdidas, etc.

---

## Llamadas Entrantes

Muestra las mismas estadísticas del Dashboard pero **solo de las llamadas que llegaron desde afuera** (clientes llamando a su empresa).

Útil cuando quiere ver únicamente el rendimiento de su equipo de recepción, sin mezclar con las llamadas que sus agentes realizaron.

---

## Llamadas Salientes

Muestra las estadísticas de **las llamadas que sus agentes realizaron** hacia clientes u otras personas.

> Si no hubo llamadas salientes en el día, el sistema mostrará un mensaje indicándolo.

---

## Histórico — Consultar días anteriores

Le permite ver las estadísticas de cualquier período pasado.

### Cómo consultar

1. Haga clic en **Histórico** en el menú.
2. Seleccione la **fecha de inicio** y la **fecha de fin**.
3. Haga clic en **Buscar**.
4. Verá las mismas métricas del Dashboard pero para ese período.

### Exportar los datos

Después de hacer una búsqueda, puede descargar los datos en un archivo CSV (compatible con Excel) haciendo clic en **Exportar CSV**.

---

## Analytics — Tendencias y comparativas

Esta sección tiene tres herramientas para analizar el desempeño a lo largo del tiempo.

### Tendencia de llamadas

Muestra una gráfica con la evolución del volumen de llamadas día a día.

1. Seleccione el período que quiere ver: hoy, esta semana, este mes, este año, o un rango personalizado.
2. La gráfica se actualiza automáticamente.

Las barras **azules** muestran el total de llamadas; las **verdes**, las contestadas.

### Comparativa de períodos

Compara dos períodos para saber si el desempeño mejoró o empeoró.

1. Defina el **Período 1** (por ejemplo, la semana pasada).
2. Defina el **Período 2** (por ejemplo, la semana anterior a esa).
3. Haga clic en **Comparar**.
4. Verá una tabla con la diferencia entre los dos períodos:
   - **Verde** = mejoró
   - **Rojo** = bajó

### Rankings

Muestra cuáles agentes o líneas telefónicas tuvieron más actividad en un período.

1. Elija **Agentes** o **Troncales** con el botón selector.
2. Seleccione el rango de fechas.
3. Indique cuántos resultados ver (por defecto 10).
4. La lista aparecerá ordenada de mayor a menor actividad.

---

## Alertas — Avisos del sistema

Esta pantalla muestra avisos automáticos cuando algo inusual ocurre, por ejemplo:

- Demasiadas llamadas perdidas en poco tiempo.
- Una línea telefónica que dejó de funcionar.
- El sistema telefónico no responde.

Las alertas aparecen en tiempo real — no necesita recargar la página.

### Cómo atender una alerta

1. Lea la descripción de la alerta para entender qué ocurrió.
2. Tome las acciones necesarias (avise a su supervisor, revise las líneas, etc.).
3. Haga clic en **Resolver** para marcar la alerta como atendida y retirarla de la lista.

> Resolver la alerta en pantalla no soluciona el problema técnico por sí solo — simplemente confirma que usted la vio y la atendió.

---

## Reportes — Descargar informes

Genera informes formales que puede guardar o enviar por correo.

### Tipos de informes disponibles

| Informe | Contenido |
|---|---|
| **Resumen ejecutivo** | Los números más importantes del período |
| **Llamadas entrantes** | Detalle de las llamadas recibidas |
| **Llamadas salientes** | Detalle de las llamadas realizadas |
| **Actividad de agentes** | Qué agente atendió más llamadas |
| **Actividad de líneas** | Qué líneas telefónicas tuvieron más tráfico |

### Cómo generar un reporte

1. Seleccione el tipo de informe que necesita.
2. Elija la **fecha de inicio** y la **fecha de fin**.
3. Haga clic en **Descargar PDF** (para un documento listo para imprimir o enviar) o en **Descargar Excel** (para una hoja de cálculo editable).
4. El archivo se descargará automáticamente.

---

## Preguntas frecuentes

**¿Cada cuánto se actualiza el dashboard?**
Automáticamente cada 30 segundos. No necesita recargar la página.

**¿Qué significa el punto verde "En vivo" en la esquina superior?**
Indica que el sistema está recibiendo datos correctamente. Si aparece "Reconectando…" en gris, es que se perdió la conexión momentáneamente — el sistema intentará reconectar solo.

**¿Por qué el número de "Perdidas" es diferente al de "No contestadas"?**
Son dos situaciones distintas. Perdida = el cliente se fue antes de hablar con alguien. No contestada = el cliente esperó pero nadie lo atendió.

**No veo algunas opciones del menú que me mencionaron.**
Probablemente su cuenta es de tipo Operador y no tiene acceso a las secciones de administración. Consulte con su administrador.

**¿Puedo ver llamadas de meses anteriores?**
Sí, usando la sección **Histórico** o **Analytics**, puede consultar cualquier período pasado.

---

*Issabel Call Monitor v2.0 — Guía para Operadores*
