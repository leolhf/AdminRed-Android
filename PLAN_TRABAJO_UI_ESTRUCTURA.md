# Plan de trabajo — Estructura, visual y escritura en Android

**App:** AdminRed  
**Fecha:** 2026-10-15  
**Versión de referencia:** 5.53.7+  
**Objetivo:** Ordenar navegación y pantallas, unificar estados visuales y mejorar la experiencia de escritura (nombres, notas, WhatsApp) en Android.

---

## 1. Principios

1. **Operación diaria arriba** — lo que usas varias veces al día no se esconde en Análisis.
2. **Una acción primaria por pantalla** — un botón principal claro.
3. **Estados legibles** — color + texto (Hoy / En ciclo / Notificado / Mora).
4. **Dashboard corto** — máximo 4 bloques de “qué hacer ahora”.
5. **Escribir bien en el móvil** — teclado y campos pensados para español en Android.

---

## 2. Estructura de navegación

### 2.1 Situación actual
- 3 menús: **Operación**, **Finanzas**, **Análisis**
- Muchos submenús; a veces se mezcla cobrar con analizar.

### 2.2 Estructura objetivo

| Grupo | Contenido | Uso |
|-------|-----------|-----|
| **Inicio (Dashboard)** | Pendientes del ciclo, caja resumida, paquete/capacidad, accesos rápidos | Abrir la app y actuar |
| **Operación** | Clientes, Cobros, Cobranza, Realizados, Gastos rápidos | Trabajo del día |
| **Dinero / Finanzas** | Caja, Inversiones y deudas, Gastos, Cierre de mes | Flujo de dinero |
| **Red** (nuevo o sub de Operación) | Capacidad Limit At, comandos MikroTik, resumen de IPs | Router separado de cobros |
| **Análisis** | Reportes, margen, salud, historial, predicción | Consulta, no operación |
| **Ajustes** (engranaje fijo) | Tasa, paquete, colas, tema, versión, respaldo | Configuración |

### 2.3 Tareas de estructura

| ID | Tarea | Prioridad | Esfuerzo | Estado |
|----|--------|-----------|----------|--------|
| E1 | Revisar mapa actual de tabs vs uso real y documentar “qué va dónde” | Alta | Bajo | Pendiente |
| E2 | Acortar Dashboard a 4 bloques de acción del día | Alta | Medio | Pendiente |
| E3 | Mover capacidad/comandos MikroTik a sección **Red** visible | Media | Medio | Pendiente |
| E4 | Buscador global (nombre / IP / teléfono) desde el header | Alta | Medio | Pendiente |
| E5 | FAB contextual por pantalla (Cobros → Cobrar/WA; Clientes → + cliente) | Media | Bajo | Parcial |
| E6 | Onboarding 3 pasos (primera vez): paquete, tasa USD, cola padre LEO | Baja | Medio | Pendiente |

---

## 3. Mejoras visuales

### 3.1 Jerarquía de color (unificar en toda la app)

| Color / estilo | Significado |
|----------------|-------------|
| Primary (azul) | Acción principal: Cobrar, Guardar, Cerrar mes |
| Verde | Pagado, notificado WA, capacidad OK |
| Ámbar | Pendiente en ciclo, aviso |
| Rojo | Mora, forzar cierre, baja, peligro |
| Muted | IP, plan, fechas, ayuda |

### 3.2 Listas y modales

- **Cobros / Cobranza:** fila escaneable — nombre + plan; debajo IP/tel; a la derecha Cobrar / WhatsApp.
- **Notificado WA:** mismo borde/fondo verde en Cobros, Cobranza y avisos al abrir.
- **Modales:** header + cuerpo + footer fijos; primary a la derecha; peligro solo si destruye datos.
- **Tema claro:** subir contraste de badges warn/due si se ve poco.

### 3.3 Tareas visuales

| ID | Tarea | Prioridad | Esfuerzo | Estado |
|----|--------|-----------|----------|--------|
| V1 | Unificar CSS de estados: `.notificado-wa`, mora, ciclo, hoy | Alta | Bajo | Parcial |
| V2 | Rediseñar fila de lista de cobros (jerarquía tipográfica) | Alta | Medio | Pendiente |
| V3 | Limpiar Dashboard (quitar ruido, 4 bloques) | Alta | Medio | Pendiente |
| V4 | Reordenar ficha/modal de cliente: estado → plan/ciclo → IP+comando MT → tel/WA → equipo | Media | Bajo | Pendiente |
| V5 | Revisar tema claro (contraste badges y texto muted) | Baja | Bajo | Pendiente |
| V6 | Espaciado consistente entre secciones (menos divisores dobles) | Baja | Bajo | Pendiente |

### 3.4 Orden por defecto en Cobros
1. Hoy  
2. En ciclo  
3. Vencidos / mora  
4. Resto (p. ej. alfabético)

---

## 4. Corrección ortográfica y escritura en Android

### 4.1 Problema
En Android, si los `<input>` / `<textarea>` no declaran bien idioma y autocrección, el teclado:
- no sugiere bien en español,
- o desactiva corrección,
- o pone mayúsculas raras en nombres y notas.

### 4.2 Política de campos

| Tipo de campo | Atributos recomendados | Ejemplo |
|---------------|------------------------|---------|
| **Nombre de cliente, dirección, notas, incidencias, motivo de baja** | `lang="es"`, `spellcheck="true"`, `autocorrect="on"`, `autocapitalize="sentences"` (o `words` en nombres) | Nombre, dirección, descripción incidencia |
| **Teléfono, IP, montos, IDs** | `spellcheck="false"`, `autocorrect="off"`, `autocapitalize="off"`, `inputmode` adecuado | IP, teléfono, CUP, megas |
| **Mensajes WhatsApp (si hay plantilla editable)** | `lang="es"`, `spellcheck="true"`, `autocorrect="on"` | Texto libre del recordatorio |

### 4.3 Atributos HTML de referencia

```html
<!-- Texto en español (nombres, notas) -->
<input
  lang="es"
  spellcheck="true"
  autocorrect="on"
  autocapitalize="words"
  autocomplete="name"
>

<!-- Párrafo / notas -->
<textarea
  lang="es"
  spellcheck="true"
  autocorrect="on"
  autocapitalize="sentences"
></textarea>

<!-- IP / números (sin corrección) -->
<input
  spellcheck="false"
  autocorrect="off"
  autocapitalize="off"
  inputmode="decimal"
  autocomplete="off"
>
```

### 4.4 Capacitor / WebView (Android)

| ID | Tarea | Prioridad | Esfuerzo | Estado |
|----|--------|-----------|----------|--------|
| O1 | Auditoría de todos los `input`/`textarea` del `www/` y aplicar la política 4.2 | Alta | Medio | Pendiente |
| O2 | Asegurar `lang="es"` en `<html>` (ya suele estar) y en formularios largos | Alta | Bajo | Revisar |
| O3 | Nombres de cliente: `autocapitalize="words"` + `spellcheck="true"` | Alta | Bajo | Parcial |
| O4 | Notas, incidencias, motivo baja, conceptos de gasto: corrección ON | Alta | Bajo | Pendiente |
| O5 | IP, teléfono, montos, tasa: corrección OFF + `inputmode` correcto | Alta | Bajo | Parcial |
| O6 | Probar en WebView Android real (Gboard / teclado Samsung): sugerencias en español | Alta | Bajo | Pendiente |
| O7 | (Opcional) Ajuste Capacitor: no bloquear autocorrect del sistema en `capacitor.config` / estilos que fuerzan `user-select` raro | Media | Bajo | Pendiente |
| O8 | Plantillas WhatsApp: si el usuario edita el texto, campo con spellcheck en español | Media | Bajo | Pendiente |

### 4.5 Nota importante
La **corrección ortográfica la hace el teclado del sistema** (Gboard, etc.), no la app. AdminRed debe:
- **permitir** corrección en campos de texto libre,
- **no interferir** con el IME,
- y marcar bien `lang="es"` / `spellcheck`.

No hace falta un diccionario propio salvo que más adelante se quiera validar nombres de planes fijos.

---

## 5. Orden de implementación sugerido

### Fase A — Rápido impacto (1–2 sesiones)
1. **O1–O5** — Ortografía / atributos de escritura en Android  
2. **V1** — Unificar estados visuales notificado / mora / ciclo  
3. **E2 + V3** — Dashboard solo acción del día  

### Fase B — Uso diario
4. **V2** — Filas de cobros más claras  
5. **E4** — Buscador global  
6. **V4** — Ficha cliente reordenada + atajo comando MikroTik  

### Fase C — Organización
7. **E3** — Sección Red  
8. **E1** — Cerrar mapa de menús definitivo  
9. **V5–V6**, **E6** — Pulido y onboarding  

### Fase D — Opcional
10. Recibo compartible (Fase 8 del plan de producto)  
11. Más integración RouterBoard (solo si aporta al día a día)  

---

## 6. Criterios de “hecho”

| Área | Criterio |
|------|----------|
| Estructura | Un usuario encuentra Cobros, Caja y Capacidad en ≤ 2 toques desde Inicio |
| Visual | Mismos colores de estado en Cobros, Cobranza y avisos al abrir |
| Dashboard | ≤ 4 bloques; sin KPIs que no lleven a una acción |
| Ortografía | En Android, al escribir el nombre de un cliente, Gboard sugiere correcciones en español |
| IP / montos | El teclado no “corrige” la IP ni los números |

---

## 7. Fuera de alcance (por ahora)

- Rediseño total del CSS / nuevo motor de temas  
- Dashboard tipo business intelligence con muchas gráficas  
- Menús de cuarto nivel  
- Diccionario ortográfico embebido en la app  
- Conexión automática API al MikroTik (sigue siendo comando + pegar en terminal)  

---

## 8. Seguimiento

Ir marcando la columna **Estado** de cada tabla:

- `Pendiente` → `En curso` → `Hecho` (indicar versión, ej. v5.55.1.0)

**Documento vivo:** actualizar este archivo al cerrar cada fase.

---

*Generado como plan de trabajo a partir de las propuestas de estructura/visual (2026-10-15) e inclusión explícita de corrección ortográfica al escribir en Android.*
