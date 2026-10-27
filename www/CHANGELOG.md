# Changelog — AdminRed (RedNet)

> Este es el changelog unificado. Las notas por versión anteriores a v5.42 que vivían en `CHANGELOG_vX.Y.Z.md` se archivaron en `docs/historial/`.

## v5.55.52 — Flujo de dinero: una sola ganancia, auditoría de caja

Implementa las 6 recomendaciones de la revisión del flujo de dinero.

- **Ganancia unificada:** nuevo `RN.calc.utilidadOperativaMes` (ingresos − gastos operativos, sin cuadres, devoluciones ni aplicaciones de préstamo). La usan bolsillos/reserva, proyección de caja, aporte extra de inversiones y snapshots (`utilidadOperativa`). `utilidadMes` queda como "resultado de caja" (compatibilidad).
- **Un solo criterio de gasto operativo:** inversiones usa `RN.calc.esGastoOperativo`.
- **Recuperación virtual vs real:** `RN.investment.aplicacionPendiente` calcula cuánto generaron los clientes y aún no se devolvió de verdad. Aviso en Caja y en la tarjeta de deuda, con botón *Aplicar* (se puede apagar con `config.avisoAplicacionInversion = false`).
- **Auditoría de caja** (`RN.auditoria.verificarCaja`, dentro de Auditoría financiera y tras importar un respaldo): fondo recalculado, gavetas CUP/USD, conciliación de bolsillos, movimientos sin mes, gastos USD sin `montoPagadoUSD`, clientes sin `mesInicio`.
- **Bolsillos conciliables:** `bolsillos()` devuelve `serie` (mes a mes, con `recorte` de reserva), `fondoCorridoFinal` y `desfaseFondo`.
- **Textos en la UI** que aclaran fondo real vs ganancia operativa vs % recuperado contable.
- **Tests:** +25 de flujo de caja (pago mixto, vuelto USD, cuadre posterior, retiro que toca reserva, devolución en el mismo mes).

## v5.55.51 — Release sin iconos globales (5.50)

- Empaqueta **5.55.49** (caja única libre/reserva al pagar deuda).
- **No** incluye el cambio de iconos de cabecera/panel/cliente de la 5.55.50.
- Sí mantiene WhatsApp/Cobrar en icono (pedidos antes).

## v5.55.50 — Iconos en botones de acción

- Cliente: Historial 📋, Cola 📡, Equipos 📦, Editar ✏️, Eliminar 🗑️ (+ Cobrar/WA).
- Panel: Cobros 💵, Calendario 📅, Revisar 📊, Ver caja 💼, Pagar 💨, Ver 📈.
- Cabeceras: Abrir caja 💼, Planes 📑, Nuevo ➕.

## v5.55.49 — Caja única en pagar deuda

- **Libre y reserva** aplican al **total** de caja (CUP + USD×tasa).
- **CUP/USD** solo eligen de qué gaveta física sale el dinero.
- Validación en dos pasos: (1) billetes disponibles (2) cabe en libre o confirma reserva.

## v5.55.48 — Pagar deuda: prioridad moneda física

- Deuda en **USD**: al pagar en USD se exige gaveta de dólares; si no alcanzan, aviso claro.
- Deuda/pago en **CUP**: libre + reserva (como antes).
- El gasto guarda `montoPagadoUSD` para descontar dólares reales de caja.

## v5.55.47 — Fix crítico pantalla / clientes

- Se había borrado por error `RN.render.escAttr` al añadir iconos.
- Eso provocaba **Error al pintar la pantalla** y listas vacías.
- Función restaurada; iconos WhatsApp/Cobrar siguen activos.

## v5.55.46 — WhatsApp y Cobrar solo iconos (toda la app)

- Helpers `RN.render.btnWhatsApp` / `btnCobrar`.
- Listas de clientes, cobros, mora, cobranza, calendario, historial, recibo, notificaciones y panel: **icono** en lugar del nombre.

## v5.55.45 — Iconos compactos en Clientes a atender

- WhatsApp: icono oficial (verde).
- Cobrar: 💰.
- Botones más compactos en móvil.

## v5.55.44 — Atención: WhatsApp + Cobrar; orden panel

- Botones **WhatsApp** y **Cobrar** en cada cliente de Clientes a atender.
- **Clientes a atender** aparece **arriba de Bandeja**.

## v5.55.43 — Clientes a atender = ciclo + atrasados

- **Por cobrar** ya no es solo `diaPago === hoy`.
- Incluye: **en ventana de cobro** (1–5 / 11–15 / 21–25) + **vencidos** de cortes anteriores + **mora**.
- Misma lógica en panel y en la vista Cobros.

## v5.55.42 — Fix tasa en pagar deuda

- El modal **Pagar deuda** leía `config.tasaUSD` (clave incorrecta) y no veía la tasa de Ajustes (`tasaUsd`).
- Ahora usa `RN.moneda.tasa()` y, si falta, la tasa de la compra de la deuda.

## v5.55.41 — WhatsApp: tasa según tipo de plan

- **Plan en CUP**: monto en CUP + equivalente USD con la **tasa actual**.
- **Plan en USD**: monto en USD + equivalente CUP con la **tasa del mensaje** (fijada al 1.er WhatsApp del mes).

## v5.55.40 — Panel: ventana de cobro (no solo el día exacto)

- **Hoy · qué hacer** y el KPI **En ciclo** listan clientes **dentro de su ventana** (1–5, 11–15, 21–25) que aún no pagaron.
- Ejemplo: el día 23 salen los del corte 25 (ventana 21–25), no “nadie”.

## v5.55.39 — Bloque de pago unificado (USD + CUP)

- Eliminado el selector CUP / USD / Mixto en el bloque estándar de moneda.
- Siempre se muestran **los dos campos**; usas uno, el otro, o ambos.
- Aplicado en depósitos/retiros (vía `bloquePagoHTML`), cobros de clientes y gastos.
- Atajos en cobro: “Usar total en USD” / “Usar total en CUP”.

## v5.55.38 — Vuelto en USD (prioridad) o mixto

- Si el cliente paga de más en USD, puedes devolver el vuelto en **USD**, **mixto** o **solo CUP**.
- Por defecto se **prioriza USD** (devuelve dólares primero; el resto en pesos si hace falta).
- La gaveta de USD resta lo devuelto en dólares.

## v5.55.37 — Fix pago mixto marcado como parcial

- Con redondeo **a favor del cliente** (resto CUP a múltiplo de 100), el cobro se registraba completo pero el estado salía **parcial**.
- `getStatus` ahora suma `ajusteRedondeo` y respeta `tipoPago: completo`.

## v5.55.36 — WhatsApp en dos monedas

- Recordatorios, mora y comprobantes muestran el **pago del servicio en CUP y USD** (con la tasa).
- Formato: `3,200.00 CUP / $10.00 USD (1 USD = 320 CUP)`.
- Si no hay tasa configurada, solo se muestra CUP.

## v5.55.35 — Red: IP libre y cola padre

- **Ajustes → Cola MikroTik (Reglas):** prefijo de red, rango de octetos, IPs ignoradas, otras colas padre.
- **Nuevo/editar cliente:** selector de **cola padre**; campo IP con botón **Libre** (siguiente IP disponible).
- El comando `/queue simple` usa el parent del cliente (o el global).
- Aviso si la IP está ocupada o en la lista de ignoradas.

## v5.55.34 — Cobros: sugerencia en USD

Aunque el plan del cliente esté en CUP, el modal de cobro muestra el **equivalente en USD** y un botón **Aplicar $X.XX** / **Usar sugerido** para registrar el pago completo en dólares. Al tocar el toggle USD se rellena automáticamente el monto sugerido.

## v5.55.33 — Inventario: compras USD estrictas

- Selector **moneda del costo** (CUP / USD) en compra de inventario.
- Si el costo es **USD**, el pago **solo sale de los dólares de caja** (sin completar con CUP).
- Si **no alcanza el USD**, se notifica con claridad y se bloquea el guardado (opción: crédito o depositar dólares).
- Gasto registrado como **Inversión material**.
- Al vender un lote comprado en USD: precio sugerido con **\$USD** y ≈ CUP a la tasa actual.

## v5.55.32 — Compra inventario → caja

- Compra pagada **siempre registra gasto** y rebaja caja (bug del checkbox corregido).
- Opción **A crédito** si no debe salir dinero ahora.
- Validación de saldos físicos CUP/USD; aviso y **Completar con otra moneda** (mixto).
- `usdEnCaja` resta USD de gastos (inventario, proveedor, etc.).

## v5.55.31 — Tasa vía el Toque (APK / web)

- **Android APK:** al consultar tasa se abre la app `com.elToque.tasas` si está instalada (plugin ElToque).
- Si no está instalada o falla → respaldo `https://eltoque.com/`.
- **Navegador / Windows:** abre `https://eltoque.com/`.
- Nota: Android no permite leer la base de datos de otra app; el usuario anota e ingresa la tasa.

## v5.55.30 — Tema oscuro fijo

- Eliminado el botón de tema del header (más espacio en la barra).
- La app fuerza siempre `data-theme="dark"` (Neo Glass).

## v5.55.29 — Panel operativo

- Sin modo Análisis (análisis en Reportes).
- Hero de hoy: cobran hoy + monto; atajos Cobros / Calendario.
- Bandeja priorizada (máx. 7): hoy, pendientes, deudas urgentes, morosos, incidencias, alertas.
- Mes compacto: % cobranza, utilidad, ingresos, gastos + enlaces.
- Dinero: libre/reserva/por cobrar/por pagar; Caja; por pagar y proveedor solo si urgencia.
- Limpieza de widgets de tendencia/caja embebida en el Panel.

## v5.55.28 — Ajustes profesional

- Modal con pestañas: **Negocio · Datos · Comunicación · Sistema**.
- Negocio: parámetros + Guardar configuración; antigüedad de tasa USD; enlace a Capacidad (no bloque MikroTik completo).
- Datos: archivo local + Google Drive.
- Sistema: seguridad, updates, diagnóstico, APK, zona de peligro reforzada.
- Aviso al cerrar con cambios sin guardar.

## v5.55.27 — Margen, Morosos e Incidencias

- **Margen:** resumen, mes seleccionable, ranking móvil, mejor/peor, nodo real, editar cliente.
- **Morosos/bajas:** KPIs, chips (1 mes / 2+ / sin tel), Cobrar · WhatsApp · Baja; bajas con motivos y reactivar.
- **Incidencias:** KPIs, prioridad, cards, historial cerradas, reabrir.

## v5.55.26 — Diagnóstico en Reportes (Salud)

- Subpestaña **Salud** retirada del menú Análisis.
- Bloque **Diagnóstico** en Reportes: semáforos + acciones (Cobros, Morosos, Gastos, Inversión).
- Respeta el mes seleccionado en Reportes.
- Vista residual solo redirige a Reportes.

## v5.55.25 — Reportes profesional

- Tablero del periodo: utilidad, ingresos, gastos, % cobranza, ticket, pendientes.
- Selector de mes global; reporte ejecutivo automático al cambiar mes.
- Tendencia; accesos a Salud, Margen, Morosos, Incidencias, Realizados.
- Historial completo eliminado de Reportes (solo últimos 8 cobros del periodo).
- Exportar / copiar resumen ejecutivo.

## v5.55.24 — Calendario profesional

- Resumen del mes: pendiente $, clientes, % pagado, días con carga.
- Celdas: N pendientes (o OK si todos pagados); color por peor pendiente.
- Aviso si el mes visualizado ≠ mes operativo.
- Modal del día: pendientes primero; KPI “Pendiente este día”.
- Leyenda colapsable; empty state con enlace a Cobros.
- Refresco de la rejilla tras abrir cobro desde el día.

## v5.55.23 — Realizados + fix nodos

- Realizados: resumen del filtro, chips Este mes / Anterior / Todos, origen servicio/inventario.
- Recibo a un toque; KPIs etiquetados; contador; empty state a Cobros.
- **Fix:** `nodos` no se serializaba en localStorage → se perdían al cerrar la app.

## v5.55.22 — Cobros profesional

- Héroe del mes: % avance, cobrado vs esperado, pendientes/pagados.
- Chips: Pendientes (default), Hoy, En ciclo, Vencidos, Pagados, Notificados WA, Todos.
- Orden: urgencia · monto · día de pago · nombre.
- **Cobrar / Completar** visible sin expandir.
- Cerrar mes fuera del header (zona Cierre al final).

## v5.55.21 — Clientes profesional

- KPIs del parque: activos, atrasados, al día/pagados, sin IP.
- Chips rápidos: atrasados, por vencer, al día, pagados, sin IP, sin nodo, admin, inactivos.
- Orden: IP · nombre · deuda · día de pago.
- Tarjeta: plan · megas · IP · nodo; **Cobrar** visible sin expandir.
- Contador “Mostrando X de Y”.

## v5.55.20 — Nodos de red (jerarquía y equipo)

- Entidad **nodos** con padre/hijo (principal → APs/sectores).
- Por nodo: clientes, megas vendidos, Limit At **directo y de la rama**.
- Recomendación de puerto **100M vs 1G** según carga de la rama.
- Zona **Nodos** en Capacidad y colas; cliente con campo nodo opcional.
- Esquema de datos v12.

## v5.55.19 — Capacidad y colas profesional

- Héroe: % uso del tope, comprometido/margen, barra de estado.
- KPIs: comprometido, margen libre, clientes en cola, estado.
- Alertas: excedido, sin Limit At, omitidos de script, top Limit At.
- Planificación: cuántos clientes más caben por plan.
- MikroTik: copiar script upsert/export con toast fiable; lista de omitidos.
- Eliminada tarjeta de equipos vacía y acciones duplicadas.

## v5.55.18 — Descuentos profesionales

- Hero **Este mes**: impacto estimado + acciones.
- KPIs: impacto, activas, vencen este mes, pendientes próximo cobro.
- Bloque **Urgente** (vencen / un pago pendiente).
- Etiquetas en español (tipo y cálculo); botón **+ Nuevo descuento**.
- Alta con selector de tipo (Bonificación / Afectación / Ajuste).
- Texto de ayuda y listado más legible.

## v5.55.17 — Inventario profesional

- **KPIs visibles:** valor en stock, unidades, agotados, margen potencial (antes se calculaban y no se mostraban).
- Hero de resumen + acciones Comprar / Asignar.
- Filtros: con stock / agotados / búsqueda.
- **Asignado sin cobrar** como bandeja de pendientes.
- Compra: opción **Registrar como gasto / salida de caja** (ligada al lote).
- No eliminar lotes con asignaciones; botón Asignar en el resumen de cada producto.

## v5.55.16 — Gastos profesionales

- KPI **gastos operativos del mes** (excluye cuadres, devoluciones de deuda, aplicaciones de préstamo, retiros legacy).
- Lista filtrada por **mes**; filtros por tipo, categoría y búsqueda.
- Cabecera: solo **Nuevo gasto** y **Proveedor** (cuadre queda en Caja).
- Hero del mes + delta vs mes anterior + mayor categoría + saldo proveedor.
- **Editar** gastos operativos/proveedor; mensajes de borrado según tipo.

## v5.55.15 — Capital en red profesional

- **Bugfix:** `totalInvertido` / `totalRecuperado` / efectivo solo cuentan capital propio (excluyen préstamos).
- **Estado del capital:** hero con % recuperado, por recuperar y tiempo estimado.
- KPIs de activo (por recuperar en ámbar, no rojo de deuda).
- Tarjetas: “Red · En recuperación”, por recuperar, clientes y proyección.
- Bloque colapsable **Cómo se calcula**; aviso al crear inversión propia (no mueve caja).

## v5.55.14 — Por pagar profesional

- **Siguiente a pagar** arriba (saldo, badges, Pagar, enlace a Caja).
- **Agenda** antes que resumen; política colapsable (“Ver reglas”).
- Tarjetas de **pasivo**: “Por devolver”, moneda del contrato, destino del dinero, meta/fecha.
- Botón **Pagar** visible en el resumen de cada deuda activa.
- KPI dual: total CUP + tramo USD de contrato; progreso renombrado a **Devolución global**.

## v5.55.13 — Caja profesional (Ahora · Movimientos · Cierre)

- **Ahora:** hero “Puedes retirar” (libre), reserva, fondo, CUP/USD físicos, acciones Retirar / Depositar / Cuadrar / Cobrar.
- **Movimientos:** feed unificado (depósitos, retiros, devoluciones, proveedor, aplicaciones de préstamo).
- **Al cierre:** resumen compacto + detalle de proyección bajo demanda.
- Alertas locales (libre bajo, proveedor pendiente, USD físico si hay deudas en USD).
- Depositar al mismo nivel que Retirar.

## v5.55.12 — Flujo de préstamo → caja + destino

- Al **crear un préstamo externo**: se registra **depósito en caja** (entrada del dinero).
- **Destino** (default: queda en caja): capital en red / inventario / retiro personal.
- Capital e inventario generan **gasto de aplicación** (sale de caja).
- Retiro personal genera **retiro** ligado al préstamo.
- Al **eliminar** el préstamo se limpian depósito, aplicación y retiro asociados (y las devoluciones).

## v5.55.11 — Caja en Dinero; Panel más limpio

- Nueva vista **Dinero → Caja**: proyección, bolsillos, saldos físicos, cuadrar y retirar.
- **Panel:** sin bloque detallado de caja; KPI “Libre en caja” y carteras con acceso directo.
- Grupo Dinero abre por defecto en **Caja**.

## v5.55.10 — Pago del paquete del proveedor (parcial + descuento + multi-moneda)

- **Pagos parciales:** el saldo del mes se acumula; no se marca pagado hasta cubrir el paquete.
- **Descuento (CUP):** reduce el saldo sin salir de caja.
- **Monedas:** CUP, USD y **Mixto** visibles.
- Si pagas en una moneda y no alcanza: **aviso** y botón para completar con la otra (USD↔CUP) a la tasa del día.
- Botón **Cubrir saldo** y confirmación al registrar un parcial.

## v5.55.9 — Fix Panel en Android vertical

- Eliminada **duplicación de alertas** (bandeja + “requiere atención”).
- Eliminada **duplicación de caja** (proyección ya trae CUP/USD físicos).
- Cabecera del Panel: modo Día a día / Análisis en **fila completa** en pantallas estrechas.
- Filas de la bandeja: texto y botón apilados, sin recorte horizontal.
- “Ver más indicadores” **no se cierra** solo al refrescar el panel.

## v5.55.8 — Panel profesional (Hoy · Mes · Caja)

- **3 zonas fijas:** Hoy (acción) → Mes (resultado) → Caja y capital.
- **Bandeja del día:** cobranza, alertas, deudas y avisos en una sola lista priorizada.
- **KPIs mínimos** arriba; “Ver más indicadores” para el detalle.
- **Modo Día a día / Análisis:** en Día a día se ocultan tendencia, cortes y rentabilidad.
- **Caja unificada** (libre/reserva + físicos) y **carteras:** Por cobrar · Por pagar · En caja.

## v5.55.7 — Organización profesional de dinero (pasivos vs capital)

- **Por pagar** (submenú Dinero): solo préstamos a devolver; agenda ordenada por vencimiento/meta/saldo.
- **Capital en red**: solo inversiones de capital propio y su recuperación.
- **Política de pagos** en Ajustes: % libre (25), % austeridad (10), uso de reserva (nunca / con meta / siempre confirmando).
- **Panel (Inicio):** tarjeta “Por pagar esta semana” con acceso rápido a Pagar.
- Textos de carteras: Por pagar · Capital en red (además de Gastos / Inventario / Descuentos).

## v5.55.6 — Plan completo de pago de deudas

- **Meta por deuda**: cuota mensual y/o fecha objetivo al crear/editar préstamo externo.
- **Tiempo estimado** en ficha y modal (según meta o % del libre proyectado).
- **Doble sugerido**: libre real de hoy vs libre si cobras toda la cartera.
- Si el libre está justo: recomienda bajar al **10 %**; si hay meta y no alcanza, propone **reserva** solo con casilla de confirmación.
- Modal **Pagar deuda** con botones: sugerido ahora, ideal post-cobros, meta cuota, liquidar.

## v5.55.5 — Pago de deudas (moneda + sugerido por caja libre)

- El saldo de un **préstamo externo** se lleva en la **moneda del préstamo** (USD o CUP).
- Si la deuda es en USD y pagas con CUP, se convierte con la **tasa del día**.
- **Sugerido automático** = % del bolsillo libre (por defecto **25 %**, config `pctLibreDeudas`).
- Modal **Pagar deuda**: botones Usar sugerido / Liquidar saldo, preview de salida de caja y saldo restante.
- Al crear el préstamo, si el desembolso fue en USD se marca `monedaDeuda: USD`.

## v5.55.4 — Fix submenú de la barra de grupos

- El submenú no aparecía porque el `overflow-x` de la barra lo recortaba (limitación CSS).
- Los paneles de submenú salen de la pista con scroll y se posicionan bajo toda la barra.
- Al tocar **Operación / Dinero / Análisis** (etc.) el submenú vuelve a desplegarse a ancho completo.

## v5.55.3 — Menú de grupos desplazable

- La barra **Inicio · Operación · Dinero · Red · Análisis** se desplaza en horizontal (igual que los submenús).
- En pantallas pequeñas los grupos ya no se comprimen: se deslizan con el dedo.
- Al cambiar de sección, el grupo activo se centra en la barra.
- Los submenús siguen a **ancho completo** de pantalla (no quedan recortados).

## v5.55.2 — Escritura y corrección ortográfica en Android

- Política de campos para el teclado del sistema (Gboard / Samsung):
  - **Texto libre (ES):** `lang="es"` + `spellcheck="true"` + `autocorrect="on"` en notas, incidencias, motivo de baja, conceptos y plantillas WhatsApp.
  - **Nombres:** `autocapitalize="words"` (cliente y plan).
  - **IP, teléfono, montos, PIN, búsquedas:** corrección OFF + `inputmode` adecuado (`tel`, `decimal`, `numeric`, `search`).
- Completados campos que faltaban: descripción de incidencia, notas de baja, prompt genérico.
- `html lang="es"` ya presente; formularios alineados con la política 4.2 del plan de trabajo.

## v5.55.1 — Estructura de navegación

- **Nueva barra de pestañas (5 grupos):** Inicio · Operación · Dinero · Red · Análisis.
- **Inicio** = Panel (dashboard) como entrada principal.
- **Operación** = Clientes, Cobros, Realizados, Calendario (trabajo del día).
- **Dinero** = Inversiones y deudas, Gastos, Inventario, Descuentos.
- **Red** (nuevo) = capacidad Limit At y accesos a comandos MikroTik, separado de cobros.
- **Análisis** = Reportes, Salud, Margen, Morosos/bajas, Incidencias (solo consulta).
- Ajustes sigue siendo modal (no pestaña).
- Tipografía de tabs un poco más compacta en móvil para que quepan los 5 grupos.
- Tests del submenú plegable actualizados a los nuevos nombres de grupo.

## v5.53.7 — Fix botones tema / guardar / versión

- Corregido error de sintaxis en `cola-mikrotik.js` (comillas en botones de script) que impedía cargar el módulo y hacía fallar el arranque al pintar el dashboard.
- Los botones del header (tema, guardar, versión, menú) se registran **antes** de `render.todo`, así siguen activos aunque falle una vista.
- `estadoCapacidad` y el widget de capacidad toleran ausencia de `RN.cola`.

## v5.53.6 — MikroTik: IP ya ocupada

Tras guardar un cliente, el modal de comando muestra:

- **Actualizar (upsert)** — si la IP ya tiene cola en el router (ej. nombre `28`), la actualiza a Pepe + límites del plan. Recomendado.
- **ADD puro** — solo si la IP está libre.
- Aviso si otra ficha de la app usa la misma IP.

## v5.53.5 — Comandos MikroTik estilo RouterBoard

- Genera `/queue simple add` igual que el **export** del RB (limit-at, max-limit, parent LEO, priority, pcq, target /32).
- Tras **guardar un cliente** con IP y megas: modal con el comando listo para copiar al Terminal.
- Script completo: **estilo export** o **upsert** (actualizar si ya existe).
- Al dar de baja: copia comando de **remove** de la cola por IP.

## v5.53.4 — Flujo de apertura de modales

- `RN.uiComponents.trasCerrar(fn)` — cierra y ejecuta la acción en el siguiente frame (doble rAF).
- `modal(..., { replace: true })` y `reemplazarModal()` — sustituyen sin apilar.
- `cerrarModal({ todo: true })` — cierra toda la pila.
- Aviso de inicio → Cobranza y refresh de WhatsApp en Cobranza usan el nuevo flujo.

## v5.53.3 — Fix aviso → Cobranza

- El botón **Ir a Cobranza** del modal al abrir ahora cierra el aviso y abre el modal de cobranza (con retardo para no chocar con el overlay).
- Si no hay pendientes en Cobranza, redirige a **Cobros** con filtro de ciclo.

## v5.53.2 — Avisos al abrir la app

Máximo **1 modal** por apertura, en este orden:

1. **Cobranza / ciclo** — hoy, en ventana o vencidos
2. **Cierre de mes** — día ≥ 28 sin snapshot (o mes anterior sin cerrar)
3. **Paquete proveedor** — día ≥ 10 y sin gasto de proveedor registrado
4. **Tasa USD** — urgente o sin tasa (respeta posposición de tasa-aviso)

Cada aviso tiene **No mostrar hoy**. El botón flotante de tasa sigue activo para avisos leves.

## v5.53.1 — Cobranza: notificados por WhatsApp

- En el modal **📋 Cobranza**, los clientes ya notificados en este ciclo muestran:
  - Badge **💬 Notificado**
  - Fila con fondo/borde verde
  - Botón «💬 Otra vez» si se vuelve a avisar
- Contador **💬 N notificados** por corte
- Tras enviar WhatsApp se refresca el modal

## v5.53.0 — Cierre reforzado + Fases 4–7

### Cierre de mes
- Checkbox obligatorio «He revisado los avisos».
- Si hay pendientes de cobro: cierre normal bloqueado; solo **Forzar cierre** (con confirmación).
- Snapshot guarda `cierreForzado` y `pendientesAlCerrar`.

### Fase 4 — Préstamos
- Meta mensual de devolución (CUP) + progreso del mes.
- Saldo dual USD/CUP en deudas activas.
- Estimación de meses restantes.

### Fase 5 — Margen por cliente
- Nueva vista **Análisis → Margen** (ranking neto − costo efectivo del mega).

### Fase 6 — Morosos / bajas
- Vista **Morosos / bajas**: listar mora, dar de baja con motivo, reactivar.

### Fase 7 — Incidencias
- Vista **Incidencias**: tickets simples (abierta/cerrada) por cliente.

## v5.52.9 — Fase 3: cierre de mes guiado

- Botón **Cerrar mes** abre un **asistente con checklist**:
  - Paquete del proveedor (¿cubierto / gasto registrado?)
  - Cobros pendientes y pagos parciales
  - Deudas personales (devuelto vs por devolver)
  - Mora
  - Saldo de caja
  - Descuentos puntuales a anular
- Confirmar genera el **snapshot** y anula puntuales (igual que antes).
- No obliga a tener todo en verde: puedes cerrar con advertencias.

## v5.52.8 — Fase 2: recordatorios Hoy / En ciclo / Vencidos

- En **Cobros**: chips **Todos · Hoy · En ciclo · Vencidos · 💬 Notificados** con contadores.
- Orden por urgencia (hoy → en ventana → vencidos → resto).
- Notificaciones locales con texto de **ciclo** (ej. «del 11 al 15»).
- Cobranza: título de corte incluye la ventana de cobro.
- `RN.ciclos.resumenRecordatorios()` clasifica pendientes del mes.

## v5.52.7 — Fase 1: WhatsApp con ciclo de cobro + marca notificado

- Ventanas de cobro: corte **5** → del 1 al 5; **15** → del 11 al 15; **25** → del 21 al 25.
- Plantillas de recordatorio/mora incluyen **Ciclo de cobro** (`{cicloCobro}`).
- Al abrir WhatsApp se marca el cliente; en **Cobros** aparece con borde verde, 💬 y badge «Notificado».
- Botón **💬 WhatsApp** en cada ficha pendiente de cobro.
- La marca vale para todo el ciclo (mes + día de pago), no solo el día del envío.

## v5.52.6 — Recuperación topeada al 100 %

- La barra **Recuperación de la inversión** ya no muestra 117 % u otros valores > 100.
- **Recuperado** = capital cubierto (máx. = invertido); **Por recuperar** = 0 al completar.
- Si el margen de clientes supera el capital, se muestra **Ganancia extra** (no “más recuperación”).
- En tarjetas individuales: % topeado a 100 y nota de excedente.
- **Préstamos externos** no se archivan por margen: solo al devolver el capital al prestamista (barra de deudas).

## v5.52.5 — Cierre formal de inversiones de capital propio

- Al alcanzar **≥ 100 %** de recuperación efectiva, la inversión de capital propio se marca con `inversionRecuperada` y `fechaRecuperacion`.
- Se mueve a la sección **Inversiones recuperadas** (como las deudas concluidas).
- Toast al marcar: *«Inversión recuperada… El margen de aquí en adelante es ganancia.»*
- Badge **✓ Recuperada** en la tarjeta; la barra global muestra «✓ Inversión recuperada» cuando corresponde.
- Los cobros posteriores siguen contando (excedente = ganancia del negocio).

## v5.52.4 — Precio medio de venta corregido

- **Bug:** el precio medio dividía ingresos cobrados del mes entre *todos* los megas vendidos. A mitad de mes (clientes sin pagar o con descuento) salía por debajo del costo de compra (ej. 885 vs 1.250) aunque vendieras a 1.500–2.500 CUP/M.
- **Ahora:**
  - **Precio medio de venta** = neto esperado de los clientes ÷ megas (tarifa real de venta).
  - **Precio medio cobrado** = solo sobre quienes ya pagaron este mes (megas de esos clientes).
  - **Ingreso de megas sin costo** usa el precio medio de venta, no el cobrado parcial.

## v5.52.3 — Rentabilidad real: plus de cortesía + cobertura del paquete

- **Plus de cortesía** en Gestionar servicio: megas que pagas (ej. 40) + plus gratis del proveedor (ej. 5). El costo del paquete sigue siendo solo `megas pagados × precio`.
- Capacidad / tope de red = pagados + plus − reserva.
- **Tarjeta Rentabilidad rediseñada:** resumen del paquete, cobertura con lo cobrado (y hasta qué corte), precio medio de venta, ganancia por mega, ahorro por megas sin costo e ingreso aprox. de esos megas.
- Migración: si no había `plusMegas`, se toma el valor legacy de `sobreventaMegas`.

## v5.52.2 — Botones de caja simplificados

- En la tarjeta **🏦 Caja · Dos bolsillos** solo quedan: Depositar, Retirar, Depósitos, Retiros y Por moneda.
- Se eliminaron los atajos Depositar/Retirar USD y CUP: la moneda (CUP / USD / Mixto) se elige dentro del modal.

## v5.52.1 — Caja unificada (proyectada + dos bolsillos)

- **Fusión de tarjetas:** "🏦 Caja proyectada" y "🔒 Caja — Dos bolsillos" se unifican en una sola tarjeta **🏦 Caja · Dos bolsillos**.
- Muestra en un solo bloque: proyección al cierre del mes, reserva/libre proyectados, estado actual de la gaveta (USD/CUP físicos), barra de bolsillos y acciones.
- **Botones simplificados:** solo Depositar, Retirar, historiales y «Por moneda». La moneda (CUP / USD / Mixto) se elige dentro del modal; se eliminaron los atajos Depositar/Retirar USD y CUP de la tarjeta.
- La lógica de cálculo (`cajaProyeccion` y `bolsillos`) no cambia; solo se unifica el render.
- `renderReserva` queda como no-op por compatibilidad.

## v5.52.0 — Caja proyectada más clara, reserva que se reinicia cada mes y Ajustes como modal

- **🏦 Caja proyectada rediseñada** (`RN.calc.cajaProyeccion`, `RN.panelWidgets.renderCajaProyectada`): resultado grande arriba («Al cerrar el mes tendrás») con aviso verde/amarillo/rojo; la cuenta en cuatro líneas (hoy en caja + te falta cobrar − te falta pagar = al cierre, con «faltan N de M clientes»); barra de **reserva y libre al cierre**; **«Puedes sacar hoy sin comprometer la reserva»** con botón Retirar; lo que falta cobrar **por corte**; **escenario con la tasa de cobro real** (promedio ponderado de los últimos 3 meses cerrados, aplicada a lo que falta cobrar); y una nota con lo no incluido (atrasos de meses anteriores y gastos sin registrar).
- **«Te falta cobrar» ya no cuenta a quienes aún no empiezan a pagar** (`mesInicio` futuro), igual que la ganancia proyectada, y excluye administradores.
- **La reserva se reinicia cada mes** (`RN.calc.bolsillos`): si en un mes se retira más de lo libre (se toca la reserva), al cerrar ese mes la reserva se recorta a lo que realmente quedó en caja y el mes siguiente arranca desde ahí, sin arrastrar un bolsillo libre negativo. En el mes en curso no se recorta y se sigue avisando el faltante. Se calcula con el historial existente (ingresos + depósitos − gastos − retiros por mes); no se guardan datos nuevos. `bolsillos()` devuelve además `reservaInicioMes` y `gananciaMes`. Al aplicarse sobre el historial, un retiro de más de meses pasados deja de figurar como deuda de libre.
- **Retiro seguro**: `retirableHoy` = caja al cierre − reserva al cierre, sin pasar de lo que hay hoy en caja. Es una cifra distinta de «Puedes retirar» de la tarjeta Dos bolsillos (esa usa solo lo cobrado hasta hoy y no descuenta lo que falta pagar).
- **⚙️ Ajustes ahora es un modal** que se abre desde ⚡ Acciones rápidas (`RN.ajustes.abrir()`, `js/ui/ajustes-modal.js`). Se quitó la pestaña Análisis → Ajustes; `RN.tabs.ir('ajustes')` abre el modal por compatibilidad. El contenido sigue en el DOM (`#ajustes-overlay`), así que todos sus ids y funciones (Drive, respaldo, configuración, PIN, actualizaciones) siguen igual; Esc o tocar fuera lo cierra, y los modales que se abren desde dentro quedan por encima.
- Sin cambios en el esquema de datos. Pruebas nuevas (355/355) y prueba jsdom `tools/test-ajustes-modal.js` (27 comprobaciones; `npm run test:ui`, integrada en el CI).
- **VERSION**: `APP_VERSION` sube de `5.51.0` a `5.52.0`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.51.0 — Editar descuentos y bonificaciones (también las permanentes)

- **Botón ✏️ en Finanzas → Descuentos**: se pueden editar modo, valor, motivo y duración de cualquier descuento o bonificación vigente (incluidas las permanentes y las de N meses). El cliente y el tipo no cambian. Los ya finalizados o anulados no se editan.
- **Los meses anteriores nunca se tocan.** Un cambio rige siempre desde el mes actual hacia adelante. Si el descuento viene de meses anteriores se **parte en dos**: el viejo se cierra en el último mes que no cambia (conserva sus aplicaciones y valores congelados) y se crea uno nuevo (`reemplazaA`) con los valores editados.
- **Si el mes actual ya se cobró**, antes de guardar se pregunta:
  - **Corregir también el cobro de este mes** (se cobró por error): el neto congelado del cobro se ajusta con la diferencia (valor cobrado → valor nuevo), se recalcula si queda completo, parcial o con vuelto, y el cobro anota la edición (`ediciones[]`). Muestra de antemano el neto resultante y el estado del cobro.
  - **Solo desde el mes siguiente**: este mes queda como se cobró y el valor nuevo rige desde el próximo mes. Solo se ofrece si el descuento continúa el mes próximo (permanentes y de N meses con meses por delante); los puntuales y de «1 solo pago» ya cobrados solo admiten corregir.
- Sin cobro este mes, el cambio rige desde este mes y no pregunta. Si el descuento se creó este mes, se edita en su sitio.
- «N meses» en el formulario cuenta desde que el cambio empieza a regir (se precarga con los meses que le quedan).
- Auditoría: nuevo evento `descuento_editar` con valores antes/después.
- Sin cambios en el esquema de datos (campos opcionales nuevos: `reemplazaA`, `reemplazadoPor`, `cobro.ediciones`). Pruebas nuevas (333/333).
- **VERSION**: `APP_VERSION` sube de `5.50.0` a `5.51.0`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.50.0 — Administradores, colas MikroTik (Limit At) y capacidad por Limit At

- **Cliente administrador** (casilla «Administrador (no paga)»): acepta precio 0 (solo con la casilla; el resto de clientes sigue dando error), estado propio `admin`, mora siempre 0, y queda fuera de cobros, alertas, notificaciones, WhatsApp, estadísticas y cobranza. Sus megas cuentan para la red pero se muestran aparte («X M de administración»). `clientesActivos()` ahora excluye admins; `clientesEnRed()` los incluye (capacidad).
- **Cola MikroTik** (`js/red/cola-mikrotik.js`): Max Limit, Limit At y prioridad por reglas editables en Ajustes (plus ≥8M 45 % prio 3; 5–7M 35 % prio 4; 4M prio 6; 3M prio 7; <3M prio 8; redondeo a 50k; admins prio 1 con Limit At manual obligatorio). Botón «Copiar comando» en la ficha y en la lista. La IP es obligatoria y válida (/32) para clientes con cola. Los admins no llevan `max-limit` en el comando. La app NO se conecta al router. Sintaxis del comando sin probar en RouterOS: probar con un solo cliente.
- **Capacidad por Limit At**: `estadoCapacidad` = suma de Limit At de activos (admins incluidos) contra tope = paquete − reserva; aviso al 80 %, alerta al excederse; «cuántos caben»; pantalla «Resumen de capacidad» y script completo. «Sobreventa» pasa a «reserva» (`reservaMegas`, 1M por defecto). Megas vendidos quedan como dato informativo.
- **Esquema de datos 10 → 11**: solo agrega valores por defecto de config; los clientes existentes no se modifican (`esAdmin` / `limitAtManual` ausentes).
- Pruebas nuevas (288/288).
- **VERSION**: `APP_VERSION` sube de `5.49.0` a `5.50.0`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.49.0 — Redondeo del resto en CUP de pagos mixtos (USD + CUP), configurable

- Cuando el cliente paga con **USD + CUP**, el resto en CUP se redondea al múltiplo de 100 según el modo elegido en **Ajustes → «Redondeo del resto en CUP»**: **a favor del cliente** (por defecto: hacia abajo), **a mi favor** (hacia arriba) o **exacto**. Ej.: debe 10.50 USD, paga 10 USD y faltan ≈269 CUP → paga 200 CUP y el cobro queda **completo**.
- Solo afecta pagos con USD de por medio: todo en CUP o todo en USD no se redondea. Si lo que falta es menos de 100 CUP, se da por saldado.
- La diferencia no se pierde: el cobro guarda `ajusteRedondeo` (+ perdonado / − cobrado de más) y `modoRedondeo`; el ingreso de servicio (`monto`) es lo realmente recibido, así que caja y reportes cuadran. `precioNetoAplicado` y el estado del mes no cambian.
- Se muestra en el modal de cobro (estado y hint del campo CUP), en el aviso al registrar, en el recibo y, en Ajustes, un resumen del mes (perdonado / cobrado de más).
- Solo afecta pagos nuevos: los cobros ya registrados no cambian. Pruebas nuevas (232/232).
- **VERSION**: `APP_VERSION` sube de `5.48.0` a `5.49.0`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.48.0 — Precio fijo en USD por mega (con regla de tasa a tiempo / tarde)

- **Cliente Personalizado → «Moneda del precio por mega»**: `CUP` (como siempre) o `USD`. Con USD el precio fijo es megas × USD por mega (ej. 10 × 3.5 = 35 USD) y el CUP del mes se **deriva de la tasa** y se redondea **hacia arriba al múltiplo de 100**.
- **Regla de tasa** (`RN.calc.infoTasa`): la tasa del mensaje es la vigente cuando se envía el recordatorio del mes (se guarda la 1.ª vez en `cliente.tasasMensaje[mes]`). **A tiempo** (hasta el día de pago/corte del cliente, inclusive) paga con la **menor** entre la del mensaje y la de hoy; **tarde** con la **mayor**. Sin mensaje enviado: tasa de hoy.
- **Mensaje de WhatsApp**: para clientes USD, `{precioNeto}` y `{precioBase}` salen en ambas monedas («35.00 USD o 18,800.00 CUP (1 USD = 537 CUP)»). Marcadores nuevos: `{precioUSD}`, `{precioCUP}`, `{tasa}`.
- **Cobro**: el modal muestra el precio en USD, la tasa aplicada y el motivo; pagar exactamente el neto en USD cubre el neto en CUP (aunque se haya redondeado hacia arriba). El historial guarda `tasaBaseUsd`, `tasaMensajeUsd`, `tasaHoyUsd`, `motivoTasa` y `precioNetoUSD`.
- Los descuentos por porcentaje/días se calculan sobre el CUP ya convertido (con el redondeo a 100 de v5.47.2); el fijo sigue en CUP.
- Los clientes en CUP y los de plan no cambian. Pruebas nuevas en `tests-calculo.js` (215/215).
- **VERSION**: `APP_VERSION` sube de `5.47.3` a `5.48.0`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.47.3 — Lote de descuentos: clientes marcados bien visibles

- En **Descuento por lote → Clientes (toca para marcar)** no se distinguía qué clientes estaban marcados: la regla global `appearance:none` de los `input` quitaba el visto nativo del checkbox.
- Ahora cada checkbox tiene **visto propio** (azul con ✓), la **fila marcada se resalta** y el nombre pasa a negrita.
- Contador **«N marcados»** y botones **Todos / Ninguno**.
- La selección que se aplica no cambia (`guardarLote` sigue leyendo los checkbox marcados).
- **VERSION**: `APP_VERSION` sube de `5.47.2` a `5.47.3`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.47.2 — Descuentos calculados redondeados a múltiplos de 100

- Los descuentos calculados por **porcentaje** o por **días de interrupción** se redondean ahora **hacia abajo al múltiplo de 100**, sin centavos: el descuento nunca supera al calculado (siempre a favor del negocio) y el cliente paga una cifra redonda. Ejemplos: 988 → 900; 250 → 200; 95 → 0.
- Como las mensualidades son múltiplos de 100, el neto a cobrar también queda en múltiplo de 100 (p. ej. 2500 con 10% → descuento 200, cobra 2300).
- El modo **fijo** no se redondea (lo escribe el usuario).
- Un solo punto de cambio: `RN.calc.redondearDescuento` + `RN.calc.valorDescuento` (`js/core/calculations.js`); vista previa, cobro, recibos y reportes lo heredan. Pruebas actualizadas/añadidas en `tests-calculo.js`.
- **VERSION**: `APP_VERSION` sube de `5.47.1` a `5.47.2`, sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle`.

## v5.47.1 — Corrección ortográfica del teclado en los campos de texto

- Los campos de **texto libre** (notas de cobro, conceptos de gastos/caja/cuadre/inversión, motivos de descuentos, material y notas de inventario, nombre y dirección del cliente, nombre de paquete y proveedor, modelo y ubicación de equipos, plantillas de WhatsApp) activan ahora `spellcheck="true"`, `autocorrect="on"` y `autocapitalize="sentences"`: el teclado del sistema (Gboard, Samsung Keyboard, etc.) subraya faltas de ortografía y sugiere correcciones según el diccionario y los ajustes de ortografía del propio Android, que no se modifican.
- Los campos **técnicos** quedan protegidos contra la autocorrección (evita que "corrija" direcciones IPs, números de teléfono o seriales): teléfono e IP del cliente, serial de equipos, y la URL/token de Google Drive (ya protegidos desde antes).
- Los campos numéricos y de búsqueda no varían su comportamiento.
- **VERSION**: `APP_VERSION` sube de `5.47.0` a `5.47.1` (`js/version.js`), sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle` (`versionName 5.47.1` / `versionCode 5471`).

## v5.47.0 — Vista de descuentos reorganizada

- La sección **Finanzas → Descuentos** se divide en dos grupos por estado: **"🏷️ Vigentes y pendientes"** (siempre visible, ordenado por urgencia: vence este mes → 1 solo pago → vence el mes próximo → otros N meses → permanentes) y **"🗄️ Finalizadas"** (Aplicado/Anulado), que queda **colapsada por defecto** con contador y se despliega tocando su cabecera; el histórico deja de mezclarse con lo vivo sin desaparecer.
- **Chips de filtro rápido** con contador encima de la tabla: `Activas` (por defecto), `Vigentes este mes`, `Finalizadas` y `Todas`, combinables con los filtros de mes/tipo/estado.
- **Búsqueda** por nombre de cliente o motivo en la propia sección (`filter-desc-buscar`).
- **Badges de vencimiento**: la columna Vigencia avisa con "⚠ vence este mes" (rojo) y "vence el mes próximo" (ámbar) en las bonificaciones de N meses vivas.
- **Lote de descuentos táctil**: el `<select multiple>` de clientes (requería Ctrl/Cmd, imposible en Android) se sustituye por una lista de checkboxes con áreas táctiles de 44 px.
- Sin migración ni cambio de esquema: se reutilizan intactos los helpers de vigencia de v5.14.4 (`vigenteEnMes`, `venceEnMes`, `rangoVigencia`) y el formato del CSV no varía.
- **VERSION**: `APP_VERSION` sube de `5.46.0` a `5.47.0` (`js/version.js`), sincronizada con `package.json`, `package-lock.json`, `version.json` y `android/app/build.gradle` (`versionName 5.47.0` / `versionCode 5470`). El Service Worker invalida la caché automáticamente al detectar la nueva versión.

## v5.46.0 — Submenú plegable con cierre automático

- Al tocar **🏠 Operación**, **💰 Finanzas** o **📊 Análisis** se despliega el menú de ese grupo (con animación suave) y se pliega solo tras **3 segundos sin actividad**. Cuenta como actividad tocar o arrastrar en la barra, desplazar el submenú o usar el teclado; elegir una sección navega y reinicia los 3 s.
- Tocar el grupo ya abierto lo pliega; tocar fuera de la barra o pulsar Esc lo pliega de inmediato. Cambiar de grupo navega a su primera vista y abre su menú. Navegar desde otros puntos de la app (notificaciones, botones) no despliega el menú; el indicador "Estás en:" sigue mostrando dónde estás.
- Los grupos muestran un ▾ que gira al abrirse y son accesibles (`role="button"`, `aria-expanded`, Enter/Espacio).
- `tools/sync-version.py` ahora también sincroniza y verifica `package-lock.json` (quedaba atrasado en 5.41.5).
- Prueba nueva `tools/test-tabs-menu.js` (jsdom, 30 comprobaciones con reloj falso; `npm run test:ui`) integrada en el workflow de CI.

## v5.45.0 — Lote 4: arquitectura y documentación

- **`render.js` dividido** (1.256 → 261 líneas): las vistas pasan a `js/ui/views/` (`dashboard`, `clientes`, `cobros`, `realizados`, `finanzas`, `reportes`). Es un movimiento puro: el código no cambió (verificado comparando las 30 funciones de `RN.render` antes y después) y siguen colgando de `RN.render.*`. Registradas en `index.html` y en la precaché de `sw.js`.
- **JSDoc:** tipos `Cliente`, `Cobro` y `ResumenCliente` y firmas documentadas en las funciones clave de `calculations.js`, `modal-cobro.js` y `cuadre.js`.
- **MODELO.md:** nueva sección "Esquema de datos" (cliente, cobro, gasto, descuento y movimientos de caja, con campos obligatorios y opcionales).
- **Changelog unificado:** los 36 `CHANGELOG_v*.md` pasaron a `docs/historial/` (con índice); `DEPENDENCIAS.md` y `README.md` actualizados.

## v5.44.0 — Lote 3: interfaz y accesibilidad

- **Panel:** nueva tarjeta "Caja ahora" (saldos físicos CUP y USD, total equivalente, botones "Cuadrar caja" y "Cobrar ahora"). En "Requiere tu atención": chips de filtro (Morosos, Por cobrar hoy, Parciales, Inactivos con deuda, con contador) y lista de clientes priorizada: mora más alta → vence hoy → vence mañana → parcial, con botón "Cobrar" (`RN.calc.clientesAtencion`).
- **Búsqueda** en Clientes y Cobros: por nombre, dirección, IP, teléfono (solo dígitos), nombre del plan y `deuda>500` / `deuda>=500` / `deuda<100`; los términos se combinan (`ana hogar deuda>300`). `RN.calc.filtrarClientes`.
- **Cuadre de caja:** teclado numérico decimal y campos grandes, botón "Usar saldo calculado" por moneda, el sobrante se muestra en azul (exacto verde, faltante rojo).
- **Navegación:** indicador "Estás en: Operación → Cobros".
- **Accesibilidad:** contraste WCAG AA en badges del tema claro, áreas táctiles ≥ 44 px en botones críticos, `prefers-reduced-motion` global.
- 12 tests nuevos (184/184).

## v5.43.1 — Lote 2: índice de pagos y tests en CI

- **Índice de pagos por cliente** (`RN.calc.indexPagos()`): agrupa una sola vez los cobros de servicio por cliente y mes, y se reconstruye solo cuando cambia el historial (firma automática + `RN.calc.invalidarIndicePagos()` en los puntos que agregan cobros o cargan datos). Lo usan `getMora`, `getStatus`, `netoEsperadoMes` y `cobranzaMes`. Medición con 200 clientes y 9.000 cobros (20 pasadas de status+mora+cobranza): ~1.480 ms antes → ~150 ms ahora.
  - Regla: si se edita EN SITIO el `mes` o el `clienteId` de un cobro existente, llamar a `RN.calc.invalidarIndicePagos()`.
- **Tests en CI:** `tools/run-tests.js` ejecuta la suite en Node (`npm test`, sale con código 1 si falla) y el workflow `.github/workflows/tests.yml` lo corre en cada push/PR junto con la revisión de sintaxis y `sync-version.py --check`.
- 11 tests nuevos del índice (172/172).

## v5.43.0 — Lote 1: mora como ingreso, inactivos con deuda, caja y cierre de mes

- **Mora cobrada = ingreso real y entra a la caja:** el cobro guarda `montoMoraCobrada` (completo/excedente: toda la mora; parcial: orden servicio → mora → equipo). `RN.calc.ingresoCobro()` suma servicio + equipo + mora cobrada y lo usan ingresos del mes/totales, fondo de caja, reportes, auditoría, recibo, WhatsApp y CSV (nueva columna `moraCobrada`). El estado del mes (`getStatus`) sigue mirando solo el servicio. Los cobros anteriores no cambian (no traen el campo).
- **Interruptor "Incluir inactivos con deuda"** (Ajustes, apagado por defecto): los inactivos con mora aparecen en Cobranza y Morosos como morosos; deben solo su mora (no el mes en curso). `RN.calc.clientesCobrables()`.
- **Retiro en USD sin dólares físicos:** si alcanzan los pesos, se ofrece convertir CUP→USD a la tasa actual (con confirmación) y registrar el retiro.
- **Cuadre:** aviso "USD no contado" / "CUP no contado" cuando una moneda con saldo se deja vacía.
- **Tasa histórica:** `tasaAlMomento` en depósitos, retiros, cambios y cuadres; `RN.calc.tasaMovimiento()` la usa al convertir.
- **Descuentos por días:** usan los días reales del mes (feb 28/29, etc.) en vez de siempre 30.
- **Modal de cobro:** indicador "Bonificación permanente aplicada: −X".
- **Cierre de mes:** el snapshot guarda `resumenCierre` (clientes en mora, mora generada y cobrada, descuentos a anular, saldos de caja) y la confirmación lo muestra.
- 31 tests nuevos en total desde v5.42.0 (160/160).

## v5.42.0 — Mora mes a mes, neto congelado y desglose de mora en el cobro

- **Mora mes a mes:** `RN.calc.detalleMora()` suma el neto real de cada mes en atraso (antes: neto actual × meses). Usado en `deudaTotalCliente`, `resumenCliente` (`moraMonto`, `detalleMora`), Cobranza, Morosos y modal de cobro.
- **Neto congelado:** el cobro guarda `precioNetoAplicado` (y `detalleMora`); `RN.calc.netoEsperadoMes()` lo usa en `getStatus`, ingreso esperado del mes, panel y auditoría. Cambiar el precio del plan ya no convierte un mes cobrado en "parcial".
- **Modal de cobro:** la línea de mora muestra el total real y un desplegable "Ver detalle mes a mes".
- 14 tests nuevos (129/129 pasan; correr `RN.tests.ejecutar()`). Sin cambios de esquema.

## v5.20.0 — Fix crítico: importar contacto del teléfono dejaba nombre y dirección en blanco

### Resumen
Al agregar un cliente y usar el botón **📍 Contactos** para importar un contacto del teléfono, **solo se rellenaba el número** y los campos **Nombre** y **Dirección** quedaban en blanco. Ocurría siempre que se abría un diálogo intermedio (contacto con **varios números** → prompt, o **nombre ya escrito** → confirm). Causa: el sistema de pila de modales (`ui-components.js`) restauraba el formulario desde `innerHTML`, que **no conserva los valores escritos por JS** (`input.value = ...`), borrando el nombre y la dirección recién llenados. Solución: `ui-components.js` ahora **captura y re-aplica los valores vivos** de los campos al apilar/restaurar modales (fix global), y `modal-cliente.js` re-aplica los datos del contacto en los callbacks. Verificado con 15/15 tests end-to-end (jsdom). Sin cambios de esquema (sigue 10).

Detalle completo en `CHANGELOG_v5.20.0.md`.

## v5.15.0 — Gestión centralizada de bonificaciones/descuentos

### Resumen
Las **bonificaciones/descuentos** dejan de crearse dentro del modal de cobro y pasan a un **centro de gestión** en **Finanzas → Descuentos** (botón "🎁 + Nueva bonificación" con selector de cliente, "Por lote" mudado a esa vista, mini-resumen de KPIs: activas · pendientes · impacto CUP del mes) más un **botón 🎁 de acceso rápido por cliente** en "Cobros del mes" (destacado en verde con contador y tooltip de impacto cuando hay bonificaciones vigentes). El modal de cobro queda en **solo lectura** para descuentos y, al anular desde él, la tabla se refresca **in-place** sin reconstruir el modal — se corrige así la pérdida de datos tecleados (USD/CUP/notas) al anular desde el propio cobro. Nuevo **registro de eventos** (`descuento_crear`/`descuento_anular`) en la ventana de Auditoría. Sin cambios de modelo ni de esquema (los backups v5.14.x cargan directo).

Detalle completo en `CHANGELOG_v5.15.md`.

## v5.14.4 — Bonificaciones permanentes y de N meses

### Resumen
Las **bonificaciones** dejan de limitarse a "un mes o un solo pago": ahora soportan **Duración** *permanente* (aplica todos los meses hasta anularla), *N meses* (rango de calendario, ej. jun–ago 2025) y *1 solo pago* (el viejo `soloPago`). Cada mes cobrado se registra en `aplicaciones[]` con el **valor congelado** (los cobros ya emitidos no cambian si luego se edita el descuento). La condición de vigencia — antes duplicada en 4 sitios — se centraliza en `RN.descuentos.vigenteEnMes()` con fallbacks que mantienen operativos los backups del esquema 7 (migración 7→8). El cierre de mes ya no anula permanentes/N-meses; anular una bonificación aplicada revierte **todos** los cobros afectados. 7 tests nuevos (115/115 pasan).

Detalle completo en `CHANGELOG_v5.14.4.md`.

## v5.14.3 — Historial de cobros (Reportes) agrupado por mes y colapsable

### Resumen
En la sección **Reportes → "Historial de cobros"**, la tabla plana que mostraba solo 50 cobros se sustituye por una vista **agrupada por mes en cintillas colapsables**, donde cada mes aparece contraído por defecto (solo el más reciente queda abierto) y cada cobro es una tarjeta colapsable. El modal "Ver todos" se actualiza al mismo formato. (Entrada añadida a este archivo en v5.14.4; el detalle vivía hasta ahora solo en `CHANGELOG_v5.14.3.md`.)

## v5.14.2 — Auditoría de Reportes: 22 de 23 hallazgos corregidos

### Resumen
Se implementaron todas las correcciones de `AUDITORIA_Reportes_v5_13_20.md`: los 7 BUG (estado del calendario en meses pasados/futuros, código muerto, semáforo confuso, comparaciones engañosas), los 4 LOG, los 4 DUP (extraídos a helpers compartidos: `RN.chart`, `RN.export.toCSV`, `RN.calc.clientePorId`, `RN.calc.listaMeses`/`mesesConDatos`), los 4 CODE (incluye BOM UTF-8 en CSV) y 3 de 4 UI (la leyenda de colores del calendario, UI-4, ya existía desde v5.13.11).

El cambio de mayor impacto: **`RN.calc.getStatus()` ahora acepta un mes opcional**, lo que repara el color/estado de las celdas del calendario al navegar a meses pasados o futuros, además de `cobranzaMes()` y todos los reportes que dependen de ella.

Detalle completo en `CHANGELOG_v5.14.2.md`.

## v5.14.1 — Cuadre de caja

### Resumen
Nueva funcionalidad de **Cuadre de caja**: permite introducir el saldo real contado físicamente; la diferencia contra el saldo calculado por la app se registra automáticamente con la categoría dedicada **"Descuadre de caja"** (nunca mezclada con "Gasto personal" ni "Retiro de caja"), siguiendo la recomendación evaluada en `recomendacion_cuadre_caja.txt`.

- **Faltante** (real < calculado): se registra como gasto (categoría "Descuadre de caja").
- **Sobrante** (real > calculado): se registra como ajuste de ingreso (mismo módulo, monto negativo internamente) que suma al fondo.
- Nuevos botones "🧮 Cuadre de caja" e "Historial de cuadres" en la vista de Gastos.
- Los cuadres se muestran en el listado de gastos con su propio ícono y badge (Faltante/Sobrante), en vez de aparecer como un "Gasto" genérico.
- Permite eliminar un cuadre si el usuario se equivocó al contar.

Detalle completo en `CHANGELOG_v5.14.1.md`.

## v5.13.20 — El mes operativo SIEMPRE es el mes real del reloj

### Resumen
Se rediseó el sistema de mes operativo para que **siempre coincida con el mes real del reloj del sistema**. El mes ya no se puede adelantar al cerrar — avanza solo con el calendario. Se añadió validación de **doble cierre**: si ya existe un snapshot del mes actual, se bloquea el cierre.

- **`mesActualStr()` siempre usa el reloj:** Ya no prioriza `RN.state.mesActual`. Es idéntica a `mesRealStr()`.
- **`monthReset.confirmar()` no adelanta el mes:** Solo genera snapshot, anula descuentos y aplica `paquetePendiente`. El mes cambia automáticamente cuando avanza el calendario.
- **Validación de doble cierre:** Si ya hay un snapshot del mes actual, el botón "Cerrar mes" muestra un aviso y bloquea la acción.
- **Sincronización al arrancar:** `init.js` llama `sincronizarMesReal()` al inicio para que `mesActual` refleje el mes del calendario.
- **Eliminado `avisoSincronizarMes` (v5.13.19):** Ya no se necesita; el mes siempre es el real.

Detalle completo en `CHANGELOG_v5.13.20.md`.

## v5.13.19 — Sincronización automática de mes operativo

### Resumen
El mes operativo no cambiaba automáticamente al avanzar el mes calendario real. Era 100% manual (botón "Cerrar mes"). Ahora la app **detecta al arrancar** si el mes real está por delante del mes operativo y ofrece sincronizar, generando **snapshots automáticos** para cada mes intermedio.

- **Mejora UX:** Aviso modal al arrancar con resumen de KPIs por mes a cerrar. Opciones: sincronizar (con snapshot automático) o mantener el mes operativo actual.
- **Multi-mes:** Si hay varios meses de diferencia (ej: operativo=Julio, real=Septiembre), se cierran todos los meses intermedios en una sola acción, generando un snapshot por cada mes.
- **Paquete pendiente:** Se aplica correctamente al sincronizar, igual que el cierre manual.

Detalle completo en `CHANGELOG_v5.13.19.md`.

## v5.13.18 — Bug crítico: importar contactos del teléfono cerraba el modal de cliente

### Resumen
Al usar el botón "Contactos" para importar un contacto guardado del teléfono dentro del modal de cliente, el modal **se cerraba** al agregar el nombre o número de teléfono, perdiéndose el formulario entero.

- **BUG-CRÍTICO:** El sistema de modales no soportaba modales anidados. `confirm()`/`prompt()` sobrescribían el modal-box destruyendo el formulario del cliente, y al cerrar el diálogo se ocultaba el overlay entero.
- **Solución:** Se implementó un **sistema de pila de modales** en `ui-components.js` que preserva y restaura el modal padre. Se reestructuró `importarDeContactos()` para llenar campos directos antes de abrir diálogos, y los callbacks re-query los elementos por ID.
- **Beneficio global:** Cualquier `confirm()`/`prompt()` llamado desde dentro de un modal (descuentos, exportación, inventario, etc.) ahora preserva el modal padre.

Detalle completo en `CHANGELOG_v5.13.18.md`.

## v5.13.16 — Auditoría Inversiones (24 hallazgos) + Bug crítico persistencia de configuración

### Resumen
- **Auditoría Inversiones:** 24 hallazgos implementados (5 bugs, 4 lógica, 3 duplicados, 6 UI, 5 código) de la auditoría v5.13.15.
- **BUG-CRÍTICO (post-auditoría):** La configuración (incluido `paquetePendiente`) se perdía al reabrir la app. Causa: `STORAGE_KEYS.CONFIG` quedó desactualizada tras ISSUE #22/#4, y `init.js` paso 4b re-aplicaba la config stale sobre la config fresca de `STORAGE_KEYS.DATA`. Fix: eliminado paso 4b, sincronización de ambas claves en `guardar()`.

Detalle completo en `CHANGELOG_v5.13.16.md`.

## v5.13.15 — Arreglos en Realizados (cintilla expandible + separación KPIs)

### Resumen
Dos arreglos en la sección **Cobros realizados**:
- **BUG-1 (crítico):** Las agrupaciones por mes (cintillas) no se expandían ni
  contraían al tocarlas. La causa era un patrón de escaping de `onclick`
  (`String.fromCharCode(0x5c)`) que generaba JavaScript inválido
  (`SyntaxError: Invalid or unexpected token`), por lo que el handler nunca
  disparaba. El mismo bug afectaba a 4 handlers de la vista (toggleCintillaMes,
  toggleCard de cobro, ver recibo y abrir historial del cliente). Corregido con
  el patrón inline `'\\''` consistente con el resto de la app.
- **UI-1:** La barra de búsqueda estaba pegada a la cuadrícula de KPIs de arriba.
  Se añadió `margin-bottom: 14px` a `.kpi-grid` para separar visualmente el
  widget del contenido inferior en todas las vistas.

Detalle completo en `CHANGELOG_v5.13.15.md`.

## v5.13.6 — Correcciones del Panel (Dashboard)

### Resumen
Revisión exhaustiva de la sección **Panel del negocio** que corrigió **5 bugs**,
**4 casos de código duplicado/performance** y **3 mejoras de UI**.

### Bugs corregidos
- **BUG-1:** Comentario `/**` duplicado en `calculations.js` eliminado.
- **BUG-2:** `;;` doble tras `esc()` en `render.js` eliminado.
- **BUG-3:** Emoji 📈 corrupto (CESU-8) en `barraRecuperacion()` corregido a UTF-8.
- **BUG-5:** `tasaCob` ahora usa nueva función `ingresosServicioMes()` (solo servicio del mes, sin equipo ni mora) para no superar 100% de forma engañosa.
- **BUG-6:** `getStatus()` ahora devuelve `'inactivo'` para clientes con `activo: false` (antes devolvía `'ok'`). Badge "Inactivo" añadido.

### Código duplicado / performance
- **DUP-1:** `clientesActivos()` cacheado en `dashboard()` (antes 3 llamadas).
- **DUP-2:** `montoPaqueteProveedor()` reutilizado vía `costoPaquete` (antes 2 llamadas).
- **DUP-3:** `totalInvertido/totalRecuperado/porcentajeRecuperacion` cacheados (antes 4×/3×/2×). `barraRecuperacion()` acepta parámetros opcionales.
- **CODE-6:** Nueva función `RN.render.descPaquete()` extrae el string "M × CUP/M".

### Mejoras UI
- **UI-3:** Estado vacío con botón "Registrar inversión" en card de recuperación (antes se ocultaba).
- **UI-5:** Badge del mes operativo visible en el header del panel ("Mes: agosto 2026" o "⚠ Mes operativo" si difiere del real).
- **UI-6:** Equivalencia USD con badge visual distintivo (`.usd-badge` con fondo y borde).

### Verificación
- `node --check` en los 61 archivos JS: 0 errores.
- Screenshot del dashboard confirma todos los cambios visuales.

---

## v5.13.5 — Corrección exhaustiva de 26 issues de auditoría

### Resumen
Se implementaron las **26 correcciones** identificadas en la auditoría exhaustiva
del código v5.13.4: 1 crítica (pérdida de datos), 2 altas (lógica financiera),
13 medias y 10 bajas.

### Destacados
- **ISSUE #14 (crítico):** Se evita la pérdida de datos al guardar sin PIN — la
  verificación ahora ocurre antes de `createWritable()`.
- **ISSUE #6/#7:** El pago parcial respeta el monto de equipo ingresado por el
  usuario.
- **ISSUE #11:** Las ventas de inventario usan `monto` (no `montoEquipo`) con
  tipo `venta-inventario`; recibo ajustado.
- **Patrón timezone (4 archivos):** `new Date(fecha).toISOString()` →
  `fecha + 'T00:00:00'` en caja, inversión, gastos y paquete proveedor.
- **Patrón doble guardado (3 archivos):** Eliminados `persistir()` redundantes.
- **Patrón confirm/prompt nativos (3 archivos):** Migrados a
  `RN.uiComponents.confirm()`/`prompt()` con soporte de `onCancel`.

Ver detalles completos en `CHANGELOG_v5.13.5.md`.

## v5.13.3 — Fusión visual Inversión + Deudas

### Interfaz unificada (fusión visual del Paso 5)
- **Eliminada la subpestaña "Deudas"** del grupo Finanzas. Ahora existe una sola subpestaña "Inversiones y deudas".
- **Fusionadas las dos vistas** (`view-inversion` + `view-deudas`) en una única sección con 3 bloques: inversiones, deudas activas, deudas concluidas.
- **KPIs combinados**: 8 indicadores en una sola grid (4 de inversión + 4 de deudas).
- **Render unificado**: `render.inversion()` ahora pinta todo (inversiones + deudas + KPIs combinados). `renderDeudas()` delega en `render.inversion()`.
- **Navegación limpia**: eliminado `case 'deudas'` de render.js y `deudas: 'finanzas'` de tabs.js.

Ver detalles en `CHANGELOG_v5.13.3.md`.

## v5.13.2 — Fusión Deuda + Inversión

### Refactorización arquitectónica (sin cambios visuales ni de datos)
- **Fusión de `deudas.js` en `inversion.js`**: Los dos módulos gestionaban el mismo modelo de datos (`RN.state.investments`) con solo un filtro de diferencia. Se unifican en un solo módulo. `deudas.js` eliminado (−201 líneas).
- **Devoluciones movidas de `caja.js` a `inversion.js`**: `caja.js` mezclaba retiros de caja con devoluciones de préstamo. Ahora `caja.js` tiene responsabilidad única (solo retiros). 421 → 212 líneas (−50%).
- **Helpers compartidos en `investment.js`**: Extraídos `_cobrosClienteDesde()` y `_margenMensualClientes()`, eliminando 6 funciones duplicadas (filtro de cobros 3×, bucle de margen 3×).
- **Helper `_filaDetalle()` en `render.js`**: Centraliza las ~22 filas de detalle condicionales de las tarjetas de inversión, reemplazando ternarios inline por `{ cond: … }`.
- **Bug corregido en `eliminar()`**: La versión de `deudas.js` SIEMPRE borraba las devoluciones asociadas, incluso para capital propio. Ahora la función unificada solo borra devoluciones cuando es préstamo externo.

### Archivos modificados
- `js/version.js` — versión 5.13.1 → 5.13.2
- `js/core/models/investment.js` — 2 helpers extraídos, 6 funciones simplificadas (646 → 638 líneas)
- `js/cobros/inversion.js` — absorbe lógica de deudas + devoluciones (módulo unificado)
- `js/cobros/deudas.js` — **ELIMINADO** (fusionado en inversion.js)
- `js/cobros/caja.js` — devoluciones movidas a inversion.js (421 → 212 líneas)
- `js/ui/render.js` — helper `_filaDetalle()` + 22 filas refactorizadas + referencias actualizadas
- `index.html` — eliminado `<script src="js/cobros/deudas.js">`
- `CHANGELOG_v5.13.2.md` — changelog detallado de esta versión

### Verificación
- Sintaxis JS: 0 errores en todos los archivos.
- Referencias rotas: 0 (cero referencias a `RN.deudas`, `RN.caja.devolucion*` o `deudas.js` en código ejecutable).
- Compatibilidad: total (sin cambios en modelo de datos ni persistencia).

---

## v5.13.1 — Corrección de 18 bugs de auditoría

Versión de corrección de errores detectados en la auditoría de v5.13.0. Se corrigen 18 bugs sin cambiar la arquitectura ni el modelo de datos. Ver `CHANGELOG_v5.13.1.md` para el detalle completo de cada bug.

### Bugs principales corregidos
- `mesActual` guardado pero nunca leído (cálculos usaban reloj del sistema).
- Pago parcial mezclaba servicio y equipo en `h.monto` (doble conteo).
- Descuento de equipo no aplicaba en pago parcial.
- `actualizarTasaAuto()` podía sobreescribir tasa con valor inválido.
- `eliminar()` divergente entre `deudas.js` e `inversion.js`.
- Validación de IPs con puntos, migración de datos, y 12 bugs más.

---

## v5.13.0 — 27 ago 2026

### Tasa USD: persistencia robusta
- **Fix `moneda.js` `actualizarTasaAuto()`**: Ahora se valida que la tasa recibida de la API automática (mdiv.pro) sea un número realista (mayor que 0 y menor que 100000) antes de sobreescribir la tasa configurada. Esto evita que una respuesta inválida o corrupta borre la tasa que el usuario configuró manualmente.
- **Fix `storage-local.js` `_aplicarData()`**: Al cargar datos desde un archivo de respaldo o backup, la configuración de tasa USD se preserva desde `STORAGE_KEYS.CONFIG` (la fuente autoritativa) si es más reciente que la del blob de datos. Esto evita que cargar un backup antiguo sobreescriba la tasa actual.

### Deudas personales — nueva sección en Finanzas
- **Nueva subpestaña "Deudas"** en el grupo Finanzas, junto a Inversión, Inventario, Gastos y Descuentos.
- **Vista de deudas personales**: Muestra los préstamos externos (capital a devolver) separados en dos grupos:
  - **Deudas activas**: Préstamos con saldo pendiente (saldoADevolver > 0)
  - **Historial de deudas concluidas**: Préstamos totalmente liquidados (saldoADevolver = 0)
- **KPIs de deudas**: Deudas activas, Saldo por devolver, Ya devuelto (activas), Concluidas (cantidad + total).
- **Tarjetas de deuda**: Cada deuda muestra estado (activa/concluida), fecha de creación, fecha de conclusión (si aplica), monto del préstamo, total devuelto, saldo por devolver o saldo final, % devuelto con barra de progreso visual, pago de la compra, historial de devoluciones, y botones de acción (Devolver préstamo, Ver devoluciones, Editar, Eliminar).
- **Auto-conclusión automática**: Cuando se registra una devolución que liquida completamente el saldo (saldoADevolver = 0), la deuda se marca automáticamente como concluida (`deudaConcluida = true`, `fechaConclusion = timestamp`) y pasa al historial de deudas concluidas. Se muestra un toast de confirmación: "¡Deuda liquidada! Trasladada al historial de deudas concluidas."

### Deudas personales: editables y eliminables
- **Editar**: Cualquier deuda personal (activa o concluida) puede editarse usando el botón "Editar", que abre el mismo formulario de inversión con los datos cargados.
- **Eliminar desde Deudas**: El botón 🗑 en la vista de Deudas elimina la deuda personal Y todas sus devoluciones asociadas, con un diálogo de confirmación que muestra cuántas devoluciones se eliminarán y el monto total.
- **Eliminar desde Inversión mejorado**: `RN.inversion.eliminar()` ahora, para préstamos externos, también elimina las devoluciones asociadas (antes se conservaban). El mensaje de confirmación se adapta según si es préstamo o capital propio.

### Archivos modificados
- `js/version.js` — versión 5.12.9 → 5.13.0
- `js/core/moneda.js` — `actualizarTasaAuto()`: validación de tasa antes de sobreescribir
- `js/storage/storage-local.js` — `_aplicarData()`: preservar config autoritativa de tasa USD
- `js/core/models/investment.js` — nuevas funciones: `deudasActivas()`, `deudasConcluidas()`, `verificarConclusion()`, `totalDevueltoConcluidas()`
- `js/cobros/caja.js` — `guardarDevolucion()`: auto-conclusión de deuda + re-render de deudas
- `js/cobros/inversion.js` — `eliminar()`: limpia devoluciones asociadas para préstamos externos
- `js/cobros/deudas.js` — **NUEVO**: módulo `RN.deudas` con render de deudas activas/concluidas y eliminar
- `js/ui/render.js` — `vista()`: case 'deudas' → `RN.deudas.render()`
- `js/ui/tabs.js` — `_vistaAGrupo`: mapeo `deudas: 'finanzas'`
- `index.html` — nueva sección `view-deudas`, subtab "Deudas", script tag `deudas.js`
- `sw.js` — Service Worker con `importScripts('js/version.js')` (cache key usa versión real)

---

## v5.12.9 — Calendario interactivo + Recuperación de inversión rediseñada

### Calendario interactivo con días de corte
- Calendario mensual con días de corte configurables por cliente
- Click en un día de corte abre modal con clientes a cobrar, monto total, botones de cobro y WhatsApp
- Botón "Recordar a todos" para enviar recordatorios masivos

### Recuperación de inversión: origen del capital
- Nuevo campo "Origen del capital": Capital propio vs Préstamo externo
- Préstamo externo: lleva saldo a devolver, permite registrar devoluciones desde la caja
- Aporte extra del mes: porcentaje configurable de la ganancia neta se destina a acelerar la recuperación
- Funciones: `origenCapital()`, `saldoADevolver()`, `totalDevuelto()`, `recuperadoNetoInv()`, `aporteExtraMes()`, `recuperadoEfectivo()`

### Service Worker fix
- `sw.js` ahora usa `importScripts('js/version.js')` para que el cache key use la versión real
- `version.js` y `sw.js` son network-first; el resto es cache-first

## v5.13.12 — Botón de versión para forzar actualización + FIX botones (31 ago 2025)
El badge de versión del header ahora es clickeable: busca y aplica actualizaciones de la app (Service Worker) de forma manual. Indicador visual animado cuando hay una actualización pendiente. **FIX crítico:** `ReferenceError: abiertas is not defined` en `RN.render.clientes` (v5.13.7, latente) abortaba `arrancar()` antes de conectar los botones del header, dejándolos todos sin funcionar. Ver `CHANGELOG_v5.13.12.md`.

## v5.13.14 — Fix del fondo de la cintilla de mes / tabla (estética) (31 ago 2025)
La cintilla de mes del historial de cobros (vista Realizados) aparecía con fondo gris claro (#f5f5f5) sobre el tema oscuro, rompiendo la estética. Causa: la variable CSS `--bg-alt` se usaba en toda la app pero nunca se definía, cayendo en un fallback hardcoded claro. Ahora se define `--bg-alt` en ambos temas (#eef2f7 claro, #172033 oscuro), arreglando también desgloses, badges USD y avisos de capacidad. Ver `CHANGELOG_v5.13.14.md`.
