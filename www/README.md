# AdminRed (RedNet)

Aplicación web (PWA) para administrar un negocio de reventa de servicio de internet: clientes, cobros mensuales, mora, deuda de equipo e inventario, gastos, inversiones, reportes, recibos y recordatorios por WhatsApp. Está pensada para instalarse en el teléfono y usarse offline, con doble moneda (CUP/USD) para el contexto cubano.

Es JavaScript vanilla modular: **sin framework, sin bundler, sin build, sin dependencias de npm en el frontend.** Todos los datos viven en el dispositivo del usuario (archivo vinculado o localStorage) — no hay backend ni servidor propio.

**Versión actual:** `5.15.0` (ver `js/version.js`; el detalle de novedades por versión vive en `CHANGELOG.md`).

## Novedades de esta versión (5.10.5)

- **Modelo de mora corregido: ahora la mora son meses reales de atraso, no "se pasó del día de pago".** Antes, un cliente aparecía como "moroso" (KPI y ventana) solo si se había pasado de su día de pago + días de gracia **dentro del mismo mes**. Eso dejaba invisibles a los clientes que debían uno o varios meses enteros sin pagar — justo el problema reportado. Ahora **mora = meses completos que el cliente debe sin pagar** (`getMora > 0`), calculados así:
  - Si el cliente **ha pagado antes**: meses posteriores a su último mes pagado, excluyendo el mes actual (en curso). Ejemplo: pagó hasta junio, vamos en septiembre → debe julio + agosto = **2 meses de mora**.
  - Si el cliente **nunca ha pagado**: meses desde su **mes de inicio de cobro** (ver campo nuevo más abajo) hasta el mes actual, excluido. Convención aprobada: `mesInicio = 2026-09` → en septiembre mora 0, en octubre mora 1 (debe septiembre), en noviembre mora 2 (debe septiembre + octubre).
  - El mes **actual** nunca se cuenta como mora automáticamente (se gestiona vía el estado del cliente: Por vencer / Atrasado). La mora cuenta solo los meses que ya terminaron sin pago.
- **KPI "Clientes morosos" y ventana de mora ahora coinciden.** El KPI del panel ahora cuenta clientes con `getMora > 0` (mora real de meses), igual que la ventana "Clientes morosos". Antes el KPI usaba `getStatus === 'due'` (solo vencidos del mes actual), así que mostraba un número distinto al de la ventana. Ahora ambos reflejan lo mismo: clientes que pasaron de un mes a otro sin pagar.
- **Ventana "Clientes morosos" reescrita.** Muestra solo clientes con mora real (`getMora > 0`), **agrupados por corte** (día de pago), cada uno con un badge que indica los **meses de atraso** y la deuda total. Los clientes que solo se pasaron de su día de pago pero todavía estamos en el mismo mes **no son morosos** (van en Cobranza como pendientes). Al pie, botón "Recordar a todos (WhatsApp)".
- **Ventana "Cobranza" reescrita: ahora muestra todos los pendientes del mes, agrupados por corte.** Antes mostraba solo los del corte vigente. Ahora muestra **todos los clientes activos que no han pagado este mes** (`getStatus !== 'paid'` y cuyo mes de inicio ≤ mes actual), **agrupados por corte** (día de pago), con el **corte vigente destacado arriba** (borde + badge "● Vigente" + días restantes) y luego los demás cortes ordenados por día. Cada cliente trae su estado (Por vencer / Atrasado / Pago parcial), teléfono, total a cobrar (neto + cuota de equipo si tiene) y botones Cobrar / WhatsApp. Al pie, "Recordar a todos (WhatsApp)". Una nota al pie aclara: los que deben meses anteriores van en "Clientes morosos"; los "Por iniciar" (mes de inicio futuro) no aparecen todavía.
- **Nuevo campo "Mes de inicio de cobro" al crear/editar cliente.** Un selector de mes (por defecto el mes actual, con rango de 6 meses atrás a 12 meses adelante) que indica **a partir de qué mes se le empieza a esperar pago** a ese cliente. Se guarda como `cliente.mesInicio = "YYYY-MM"`. Esto resuelve el caso del cliente que das de alta en agosto pero quieres cobrarle recién desde septiembre: si pones su mes de inicio en septiembre, en agosto aparecerá como **"Por iniciar"** (no debe todavía), no como "Atrasado", y no aparecerá en Cobranza ni en Mora hasta que llegue septiembre. Si lo dejas en el mes actual, el cliente se comporta como siempre.
- **Nuevo estado de cliente "Por iniciar".** Cuando el mes actual es anterior al mes de inicio de cobro del cliente, su estado es **"Por iniciar"** (badge gris claro con icono ⏭) en vez de "Atrasado". Significa que todavía no le toca pagar. Aparece como opción nueva en el filtro de estado de la lista de clientes.
- **Aviso de cambio de mes al iniciar la app.** Cuando abres AdminRed y hay clientes que **no pagaron el mes anterior** (debían pagar el mes pasado y no lo hicieron), la app muestra un **toast amarillo** avisando: "N clientes no pagó/n el mes pasado (YYYY-MM). Revisa Mora y Cobranza." para que sepas que hay arrastres del mes anterior que atender. El aviso se muestra una sola vez por sesión.
- **Migración automática de datos (esquema v6).** Los clientes existentes que no tenían el campo `mesInicio` reciben automáticamente uno calculado a partir de su `createdAt` (mes de alta), o el mes actual como último recurso. Así la app sigue funcionando con datos viejos sin que tengas que editar cada cliente.

## Novedades de la versión 5.10.4


- **KPIs del panel principales ahora son clicables (ventanas superpuestas).** Los tres KPIs de operación del panel — **Cobranza**, **Clientes morosos** y **Fondo de caja** — ahora abren una ventana superpuesta (overlay) al tocarlos, sin salir del panel:
  - **Cobranza:** abre una ventana con los clientes pendientes del **corte vigente** (el corte cuyo ciclo está activo hoy), cada uno con su corte, estado, teléfono, monto a cobrar y botones para **Cobrar** (abre el modal de cobro) y **WhatsApp** (envía recordatorio individual). Al pie hay un botón **“Recordar a todos (WhatsApp)”** para notificar masivamente a los pendientes del corte vigente. Si no hay ningún corte vigente el día de hoy, muestra un aviso informativo en lugar de abrir la ventana.
  - **Clientes morosos:** abre una ventana con los clientes morosos **agrupados por corte vencido** (cortes cuya fecha de pago ya pasó y quedaron sin pagar). Solo se abre si existen morosos; si no hay ninguno, muestra un aviso “No hay clientes morosos”. Cada moroso trae botones de **Cobrar** y **WhatsApp**, y al pie un **“Recordar a todos (WhatsApp)”**.
  - **Fondo de caja:** abre directamente la ventana de **retiro de caja** (la misma que antes estaba en el widget del panel), con el fondo disponible, monto a retirar, concepto y fecha.
- **Eliminado el widget grande “💵 Fondo de caja” del panel principal.** Como el KPI de Fondo de caja ahora abre la ventana de retiro al tocarlo, el widget redundante que ocupaba espacio en el panel se eliminó. La funcionalidad de extraer dinero y ver el historial de retiros se mantiene intacta, ahora accesible desde el KPI.
- **Nuevo modelo de cortes (ciclos de cobro) — `js/core/ciclos.js`.** Se añadió un módulo central que formaliza cómo funcionan los cortes: cada corte es un día de pago (p. ej. 5, 15, 25) y su **ciclo comienza 5 días antes** (`inicioCiclo = max(1, diaPago − 5)`, nunca retrocede al mes anterior). El **corte vigente** es aquel cuyo `inicioCiclo <= hoy <= diaPago`; los cortes con `diaPago < hoy` y clientes sin pagar se consideran **vencidos** y sus clientes aparecen como morosos. Esto permite que Cobranza muestre solo los pendientes del corte actual y Clientes morosos muestre los de cortes ya vencidos, exactamente como funciona el negocio real (los recordatorios empiezan 5 días antes de cada fecha de pago). Los días de gracia son configurables en Ajustes (`graciaDias`, por defecto 5).

## Novedades de la versión 5.10.3

- **Corrección: la vinculación del archivo de guardado se perdía al reiniciar la app.** Al cerrar y volver a abrir AdminRed, la sección Ajustes mostraba "⚠️ Sin archivo vinculado" aunque el archivo sí estuviera vinculado internamente. Causa raíz: al iniciar la app, `restaurarHandle()` (que recupera el handle del archivo desde IndexedDB) se ejecutaba en el paso 6, **antes** de que se renderizara la vista (paso 11), por lo que el elemento `#archivo-status` aún no existía en el DOM y el estado "✅ Archivo vinculado" nunca se pintaba. Solución: ahora el estado visual del archivo se refresca **después** de renderizar (nuevo paso 11b en `init.js`), por lo que al reiniciar la vinculación se mantiene visible y persistente.
- **Validación de que el archivo vinculado sigue accesible al reiniciar.** `restaurarHandle()` ahora, cuando tiene permiso concedido, lee el archivo para confirmar que sigue accesible (no fue movido, renombrado o borrado). Si ya no está accesible, avisa al usuario para que re-vincule desde Ajustes, en vez de dejar un handle "fantasma" que falla silenciosamente al guardar.
- **Corrección: el flag de cifrado del archivo (`fileIsEncrypted`) no se restauraba al iniciar.** Solo lo restauraba `pin.js` en su propio init; si el archivo estaba cifrado y el usuario guardaba justo tras un reinicio (antes de desbloquear el PIN), se escribía texto plano sobre un archivo cifrado y se corrompía. Ahora `init.js` restaura el flag desde `localStorage` antes de tocar el handle.
- **Detección dinámica de permiso pendiente en Ajustes.** `actualizarStatus()` ahora consulta `queryPermission` en tiempo real y muestra el aviso "permiso pendiente" con el botón "Conceder permiso" cuando corresponde, también al volver a entrar a Ajustes, no solo al iniciar.
- **Banner de permiso más robusto en WebView móvil (ej. Edge Android / com.microsoft.emmx).** `requestPermission` fuera de un gesto de usuario ahora se captura sin lanzar error, dejando el handle en memoria para que el banner lo conceda con un toque.

## Novedades de la versión 5.10.2

- **Solicitud automática de permiso del archivo vinculado al abrir la app:** al iniciar AdminRed, si ya habías vinculado un archivo de datos previamente, la app intenta reconectar automáticamente y pedir permiso de lectura/escritura sin que tengas que hacer nada. En los navegadores donde `requestPermission` requiere un gesto del usuario (la mayoría de los móviles), aparece un **banner flotante azul** en la parte superior con el nombre del archivo y el mensaje "Toca aquí para conceder permiso". Al tocarlo, el permiso se concede al instante y el archivo queda vinculado. El banner desaparece solo a los 15 segundos. También puedes conceder el permiso manualmente desde **Ajustes → Archivo vinculado**, donde ahora aparece un botón "Conceder permiso" cuando el permiso está pendiente.
- **Función para extraer/retirar dinero del fondo de caja:** en el panel principal ahora aparece un widget **"💵 Fondo de caja"** que muestra el saldo disponible y dos botones: **"💵 Extraer de caja"** (registra un retiro) y **"📋 Ver retiros"** (historial). Al pulsar "Extraer de caja" se abre un modal con el fondo disponible, el monto a retirar, un concepto/motivo y la fecha. La app valida en tiempo real: si el monto excede el fondo, advierte que el fondo quedará negativo; si no, muestra el fondo restante después del retiro. Los retiros se guardan como gastos especiales (categoría "Retiro de caja", marca `esRetiroCaja`) para que se resten automáticamente del fondo de caja calculado (`saldo inicial + ingresos − gastos`). En la sección de Gastos, los retiros aparecen con un icono 💵 y una etiqueta "Retiro de caja" para distinguirlos de los gastos normales. Se pueden eliminar desde el historial de retiros, lo que devuelve el dinero al fondo.

## Novedades de la versión 5.10.1

- **Corrección: la configuración del proveedor de internet y la tasa USD no se guardaban.** Al cambiar los datos del paquete del proveedor (nombre, megas, precio por mega, sobreventa) o la tasa de cambio USD en Ajustes y pulsar "Guardar configuración", los valores se perdían al recargar la página y no aparecían en el panel principal. Causa: la configuración se guardaba en una clave de localStorage separada (`adminred:config`) pero no se sincronizaba con el blob de datos combinado (`adminred:data`). Al recargar, el blob con la configuración antigua sobreescribía la nueva. Solución: al guardar la configuración ahora se sincronizan ambas fuentes de almacenamiento, y al iniciar la app se reaplica la configuración desde la clave autoritativa después de cargar el blob.
- **Corrección: el fondo de caja no registraba más ganancias cuando había vuelto (excedente).** Cada vez que un cliente pagaba con un vuelto (excedente), el fondo de caja se reducía por el monto del vuelto, aunque ese dinero nunca fue ingreso (entró y salió inmediatamente). Causa: la fórmula del fondo restaba los excedentes además de los ingresos ya registrados solo como neto. Solución: la fórmula del fondo ahora es `saldo inicial + ingresos totales − gastos totales` (sin restar excedentes), ya que los ingresos ya registran solo el neto cobrado, no el total pagado por el cliente.

## Novedades de la versión 5.10.0

- **Cintillas colapsables (accordion cards):** las secciones de Clientes, Cobros, Realizados, Inversión, Inventario y Gastos ahora muestran tarjetas colapsables en lugar de tablas. Cada tarjeta muestra una línea resumida (nombre + IP + total a pagar en Clientes/Cobros; concepto + monto en Gastos/Inversión; material + disponible en Inventario). Al tocar la tarjeta se expande para ver todos los datos del contacto/registro con etiquetas claras (PLAN, TELÉFONO, IP/RED, DIRECCIÓN, PAGO DÍA, ESTADO, SALDO EQUIPO, ACCIONES). Esto facilita enormemente la navegación en el móvil, donde las tablas eran difíciles de leer.
- **Campo IP / Dirección de red en clientes:** cada cliente ahora puede tener una dirección IP asociada (ej. `10.10.10.5`). Se configura al crear/editar el cliente y se muestra tanto en la tarjeta colapsada como en el detalle expandido. Útil para gestores de red que necesitan saber qué IP tiene cada cliente.

## Novedades de la versión 5.9.0

- **Importar cliente desde contactos del teléfono:** al crear un cliente nuevo, puedes tocar el botón "📍 Contactos" junto al campo Teléfono para abrir la lista de contactos del dispositivo y traer automáticamente el nombre, teléfono y dirección del contacto seleccionado. Usa la Contact Picker API (disponible en Chrome Android). Si el contacto tiene varios números, te permite elegir cuál usar.

## Novedades de la versión 5.8.9

- **Interfaz por pestañas (tabs):** navegación reorganizada en tabs para acceso rápido desde el móvil.
- **Pago al proveedor por megas × precio:** el pago mensual al proveedor de internet se calcula automáticamente como `megas contratados × precio por mega` (CUP). Configurable en Ajustes → "Mi paquete de internet".
- **Sobreventa de capacidad (sobreventa):** define cuántos megas extra puedes vender por encima de tu paquete del proveedor. La app muestra un indicador de capacidad ocupada vs. disponible en tu red.
- **Cliente personalizado:** al crear/editar un cliente, puedes marcarlo como "personalizado" y definir megas y precio por mega propios; el costo se calcula automáticamente.
- **Días de pago restringidos a cortes 5/15/25:** los días de pago de los clientes se limitan a los cortes 5, 15 y 25 de cada mes, con lógica de redondeo al corte más cercano.
- **Guardado por archivo vinculado (File System Access API):** vincula un archivo real en el dispositivo para guardar y cargar los datos del negocio. El handle se recuerda entre sesiones (IndexedDB) y se puede desvincular en cualquier momento. Opcionalmente cifrado con PIN (AES-GCM real).
- **Sin Firebase, sin notificaciones push:** se eliminó por completo la dependencia de Firebase (Firestore/FCM) y el sistema de notificaciones push vía GitHub Actions. Las notificaciones son locales (dentro de la app) y los recordatorios se envían por WhatsApp desde la propia app.

## Instalación / uso

No requiere build ni instalación de paquetes para correr el frontend.

1. Clona o descarga el repo.
2. Sirve la carpeta con cualquier servidor estático (no abras `index.html` con `file://` directamente, porque el Service Worker y la File System Access API necesitan `http(s)://`):
   ```bash
   npx serve .
   # o
   python3 -m http.server 8080
   ```
3. Abre la URL local en el navegador (Chrome o Edge recomendados para File System Access API). Desde ahí puedes instalarla como PWA ("Instalar app" / "Agregar a pantalla de inicio").

### Primer uso

- Al abrir por primera vez, la app crea datos de ejemplo para que veas cómo funciona. Puedes borrarlos desde Ajustes.
- **Archivo de datos:** en Ajustes → "Archivo de datos" puedes:
  - **Vincular / crear archivo:** crea o selecciona un archivo `.json` en el dispositivo donde se guardarán los datos del negocio.
  - **Guardar en archivo:** guarda manualmente el estado en el archivo vinculado.
  - **Abrir archivo:** carga datos desde un archivo existente.
  - **Desvincular archivo:** quita la vinculación (los datos siguen en localStorage del navegador; el archivo no se borra).
  - **Exportar / Importar respaldo JSON:** para transferir datos entre dispositivos.
- **PIN (opcional):** configura un PIN para cifrar el archivo de datos con AES-GCM. Si se pierde el PIN, no es posible recuperar el contenido (cifrado real, no ofuscación).

### Script de despliegue por Termux

Si trabajas desde Android con Termux, el repositorio incluye `actualizar.sh`, un script que sincroniza la copia local del repo con GitHub:

```bash
bash actualizar.sh
```

El script asume que los archivos están en `/storage/emulated/0/Download/AdminRed-main-fix/AdminRed-main/`. Si usas otra ruta, edita la variable `cd` al principio del script. Para el primer envío, configura tu token de GitHub:

```bash
git remote set-url origin https://TU_TOKEN@github.com/leolhf/AdminRed.git
```

Luego ejecuta `actualizar.sh` cada vez que quieras subir cambios (usa `git push --force` para sobreescribir el historial del repo remoto).

## Arquitectura

Vanilla JS modular, sin framework ni bundler. Todo el código se organiza bajo el namespace global `RN` (definido en `js/core/state.js` como `window.RN`). El **orden de carga de los `<script>` en `index.html` es crítico** — está documentado en detalle en [`js/DEPENDENCIAS.md`](js/DEPENDENCIAS.md).

```
js/
  core/             Estado global (RN.state), config, cálculos, cifrado, checkpoints, undo, validación, migraciones
    models/         Modelo de inversión/deuda de equipo (investment.js)
  storage/          Persistencia: localStorage, archivo (File System Access API), export/import
  ui/               Render de tablas/tarjetas, temas, pestañas (tabs), edición inline, componentes (modal/confirm/prompt)
  clientes/         Alta/edición/borrado de clientes, historial por cliente
  cobros/           Cobro mensual, mora, inversión/deuda de equipo, venta de inventario, descuentos, cierre de mes
  reportes/         Historial, tendencias, predicción, estadísticas, reporte mensual, recibos, calendario, salud
  notificaciones/   Notificaciones locales y envío de recordatorio por WhatsApp
  paquete/          Modal de paquete del proveedor (pago por megas × precio/mega + sobreventa)
  red/              Equipos de red asociados a clientes
  version.js        Versión de la app (APP_VERSION)
  pin.js            PIN de acceso / cifrado
  pwa.js            Service Worker + instalación PWA
  init.js           Inicialización (debe ser el último script)
icons/              Iconos PWA (192/512, normal y maskable)
sw.js               Service Worker (cachea por versión)
manifest.json       Manifest de la PWA
actualizar.sh       Script de despliegue desde Termux
```

### Namespace RN

El estado y toda la lógica cuelgan del objeto global `RN`:

- `RN.state` — todo el estado del negocio (clientes, historial, gastos, config, fileHandle, etc.)
- `RN.calc` — cálculos de negocio (estado del cliente, mora, deuda, etc.)
- `RN.render` — renderizado de la UI
- `RN.config` — configuración persistente
- `RN.moneda` — doble moneda CUP/USD
- `RN.storageLocal` — persistencia en localStorage
- `RN.storageFile` — persistencia en archivo vinculado (File System Access API)
- `RN.crypto` — cifrado AES-GCM
- `RN.migration` — migraciones de esquema de datos
- `RN.checkpoint` / `RN.undo` — checkpoints y deshacer/rehacer
- `RN.validacion` — validación de integridad + flag isDirty
- `RN.modalCliente` / `RN.modalCobro` — modales de cliente y cobro
- `RN.uiComponents` — modal, confirm, prompt reutilizables
- `RN.notifyUI` — toasts
- `RN.export` — export/import de respaldos y CSV

### Conceptos clave del dominio

- **Estado del cliente** (`getStatus` en `calculations.js`): `ok` / `warn` / `due` / `paid`, según día de pago y si tiene mora.
- **Mora:** meses de atraso en el pago del servicio mensual.
- **Deuda de equipo:** saldo pendiente por un equipo vendido a plazos a un cliente; se cobra junto con el servicio mensual (`cuotaEquipo`) hasta saldarse.
- **Días de pago (cortes):** los clientes pagan los días 5, 15 o 25 de cada mes.
- **Pago al proveedor:** `megas contratados × precio por mega (CUP)` — configurable en Ajustes.
- **Sobreventa:** megas extra que se permiten vender por encima del paquete del proveedor; la app avisa cuando la capacidad asignada a clientes se acerca o supera el límite.
- **Cliente personalizado:** cliente con megas y precio por mega propios (no usa un plan predefinido); el costo se calcula como `megas × precio/mega`.

## Cómo agregar una nueva funcionalidad

1. Decide en qué carpeta encaja (o si necesitas una nueva bajo `js/`).
2. Si el módulo usa funciones de otro (`state.js`, `calculations.js`, `core/models/investment.js`, etc.), agrégalo al `<script>` de `index.html` **después** de sus dependencias.
3. Actualiza `js/DEPENDENCIAS.md` con el módulo nuevo y sus dependencias.
4. Si el cambio toca el modelo de datos guardado (nuevos campos en cliente, historial, config), revisa `js/core/migration.js` para migrar datos existentes sin romper archivos ya guardados.
5. Sube el número en `js/version.js` para invalidar la caché del Service Worker (`sw.js`).

## Troubleshooting común

- **"La app no carga / pantalla en blanco":** revisa la consola del navegador — casi siempre es un script cargado fuera de orden. Verifica contra `js/DEPENDENCIAS.md`.
- **"Los cambios no se ven tras actualizar el código":** sube `APP_VERSION` en `js/version.js` para forzar la invalidación de caché del Service Worker, o desregistra el Service Worker manualmente desde DevTools.
- **"El archivo de datos no abre / pide PIN y falla":** el archivo está cifrado con `core/crypto.js`; si se perdió el PIN no hay forma de recuperar el contenido (cifrado real, no ofuscación).
- **"File System Access API no funciona":** requiere Chrome o Edge de escritorio, o Chrome en Android con flags habilitados. En navegadores sin soporte, la app usa automáticamente localStorage como respaldo.
- **"Un cliente muestra datos de deuda de equipo raros tras editar":** revisa `getDeudaEquipoCliente`/`getCuotaEquipoCliente` en `core/models/investment.js` — ambos exigen `deudaEquipo > 0`, no solo que sea `number`, para evitar cobrar cuotas de deudas ya saldadas.
- **"El botón Contactos no aparece al crear cliente":** la Contact Picker API solo está disponible en Chrome Android (Chrome 80+, Android M+) sobre HTTPS. En otros navegadores el botón se oculta automáticamente y se usa el campo de teléfono manual.

## Qué pasa cuando cambia de mes (cobros, estadísticas y clientes)

AdminRed **no tiene un "mes activo" controlado por la app**. Todo se calcula contra el **mes del calendario real** (`new Date()`). Esto significa que cuando el calendario pasa de agosto a septiembre, automáticamente todos los cálculos pasan a septiembre — sin que tengas que hacer nada. El botón **"Cerrar mes"** (en el menú de acciones rápidas) **no controla el mes activo**: solo genera una **foto (snapshot) histórica** de los KPIs del mes que termina (ingresos, gastos, utilidad, cuántos clientes pagaron) y **anula los descuentos puntuales pendientes** que no se aplicaron, para que no se arrastren al mes siguiente. Es opcional y manual: lo usas cuando ya terminaste de cobrar el mes y quieres "sellar" los números para comparar meses en los reportes. Si no lo usas, la app sigue funcionando igual.

Esto es lo que ocurre con cada parte cuando el calendario cambia de mes:

**Cobros (historial):** los cobros que registraste en agosto **siguen ahí**; no se borran ni se mueven. El historial es permanente. Lo que cambia es qué cobros cuenta la app como "de este mes": al llegar septiembre, la app busca cobros con `mes = '2026-09'` para saber quién pagó este mes. Los de agosto quedan como historial y se usan para calcular la mora (si alguien no pagó agosto, en septiembre cuenta como 1 mes de atraso). Por eso es importante **registrar el cobro en el mes correcto**: al abrir el modal de cobro, el campo "Mes que se paga" permite elegir a qué mes aplica el pago (por defecto el mes actual, pero puedes seleccionar un mes anterior si estás cobrando un pago atrasado).

**Estadísticas (ingresos, gastos, utilidad del mes):** al cambiar de mes, los KPIs del panel ("Ingresos del mes", "Utilidad neta", "Tasa de cobro") **se reinician a 0 automáticamente** porque ahora calculan sobre el nuevo mes, donde todavía no has registrado cobros ni gastos. Los del mes anterior no se pierden: si hiciste "Cerrar mes", quedaron guardados como snapshot en el historial mensual (menú rápido → "Historial mensual"). Si **no** hiciste "Cerrar mes", los números del mes anterior ya no se ven en el panel, pero los cobros y gastos individuales siguen en sus respectivas listas y pueden consultarse. Por eso se recomienda hacer "Cerrar mes" cuando termines de cobrar un mes, para conservar el resumen.

**Clientes (estados):** el estado de cada cliente se recalcula automáticamente contra el nuevo mes. Un cliente que en agosto estaba "Pagado" (pagó agosto) pasa a su estado de septiembre según su día de pago: si su corte aún no llega, "Al día"; si ya pasó su corte, "Por vencer" o "Atrasado". Un cliente que **no pagó agosto** pasa a ser **moroso** en septiembre (debe 1 mes de atraso) y aparece en la ventana "Clientes morosos". La app detecta esto al iniciar y muestra un **aviso amarillo**: "N clientes no pagó/n el mes pasado (2026-08). Revisa Mora y Cobranza." Los clientes cuyo **mes de inicio de cobro** es septiembre (o posterior) pasan de "Por iniciar" a aparecer en Cobranza como pendientes, automáticamente.

**Mora:** la mora de un cliente se recalcula contra el nuevo mes. Si alguien debía 2 meses en agosto y tampoco paga septiembre, en octubre deberá 3. Si paga septiembre (registrando el cobro con mes = septiembre), su último mes pagado pasa a septiembre y su mora baja. Si pagó agosto pero no septiembre, en octubre tendrá 1 mes de mora (debe septiembre).

**Dónde se gestionan las bonificaciones/descuentos (desde v5.15.0):** la creación ya no se hace dentro del modal de cobro. Hay dos puntos de entrada: la vista **Finanzas → Descuentos** (botón "🎁 + Nueva bonificación / descuento" con selector de cliente, y "Descuento por lote", con un mini-resumen de activas · pendientes · impacto CUP del mes) y el **botón 🎁 de cada cliente** en "Cobros del mes" (se destaca en verde con contador y tooltip de impacto cuando el cliente ya tiene bonificaciones vigentes ese mes, y los detalles de la tarjeta muestran una fila "Bonificaciones" con el importe de cada una). El modal de cobro queda en **solo lectura** para descuentos: los muestra, permite anularlos y recalcula los totales al instante **sin perder lo tecleado** (USD/CUP/notas). Cada creación o anulación queda registrada como evento en la ventana de **Auditoría**.

**Descuentos puntuales y bonificaciones:** los descuentos de un mes que quedaron "pendientes" (no se aplicaron a ningún cobro) se pueden anular automáticamente al hacer "Cerrar mes", para que no se arrastren al siguiente mes. Los descuentos recurrentes (permanentes por cliente) no se ven afectados por el cambio de mes. Las **bonificaciones** (desde v5.14.4) pueden tener **Duración**: *permanente* (aplica todos los meses hasta que la anules), *N meses* (aplica ese rango, ej. jun–ago) o *1 solo pago*. Las permanentes y de N meses **no se anulan** al cerrar el mes: siguen aplicando en los meses siguientes. Si anulas una bonificación que ya descontó en cobros, la app **revierte su efecto en todos esos cobros** con el valor que tenían congelado (los cobros ya emitidos no cambian si luego editas el descuento).

**Resumen:** el cambio de mes es **automático y silencioso** — la app siempre trabaja con el mes real del calendario. "Cerrar mes" es solo una herramienta opcional para guardar el resumen histórico y limpiar descuentos puntuales pendientes (las bonificaciones permanentes o de varios meses **no** se anulan). Lo único que debes hacer al empezar un mes nuevo es **revisar la Cobranza** (para ver quiénes tienen que pagar este mes) y la **Mora** (para ver quiénes arrastran meses sin pagar), y registrar los cobros a medida que los vayas cobrando.

## Estado del proyecto

No hay tests automatizados ni pipeline de CI configurados — los cambios se prueban manualmente antes de subir. Ver `js/DEPENDENCIAS.md` para el detalle técnico de módulos.
