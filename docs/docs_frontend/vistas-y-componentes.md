# Vistas y Componentes del Frontend

Este documento detalla el funcionamiento técnico y operativo de cada pantalla de la aplicación web, sus componentes reutilizables y las interacciones disponibles para el operador.

---

## 1. Vista Monitor (`/dashboard`)

Implementada en [`dashboard.component.ts`](../../src/app/features/dashboard/dashboard.component.ts), constituye el panel principal de supervisión en tiempo real del tanque.

### Barra de Estación, Estado de Enlace y Diagnóstico LAN
- Muestra el identificador del nodo (`ESP32 DevKit V1 #ID: 01`), el badge de frescura del nodo (`EN LÍNEA` o `SIN SEÑAL · hace ...`), la fecha y hora completas de última sincronización en horario de Perú (`dd/MM/yyyy HH:mm:ss -0500`) y el botón **Sincronizar** para forzar `supabase.cargarEstadoActual()`.
- Si `distancia_cm > 0 && distancia_cm < 25`, despliega una franja ámbar no intrusiva advirtiendo que la medición cae dentro de la **zona ciega del JSN-SR04T** (`< 25 cm`).
- Si existe una `esp32Ip` configurada en **Ajustes**, habilita una barra secundaria LAN con dos acciones directas:
  - **Consultar `/api/estado`**: Lee la telemetría en vivo directamente desde el servidor web del ESP32.
  - **Forzar Turbidez TS-300B**: Dispara `POST /api/medir-turbidez` y luego recarga el estado desde Supabase.

### Columna Izquierda: Visualizador Volumétrico (`TankGaugeComponent`)
Definido en [`tank-gauge.component.ts`](../../src/app/features/dashboard/components/tank-gauge/tank-gauge.component.ts), representa gráficamente el depósito:
- **Encabezado:** Indica el modo volumétrico activo (`Prototipo PET 7 L` o `Rotoplas 1100 L`) y el badge del sensor magnético de tapa **MC-38** (`ABIERTA` con contador en segundos, o `CERRADA`).
- **Cilindro HMI:** Escala graduada lateral en litros equivalente a `0%`, `25%`, `50%`, `75%` y `100%` de `capacidadTotal`, cabezal superior con representación del haz acústico del sensor ultrasónico **JSN-SR04T** (`GPIO27 / GPIO26`), columna de líquido con menisco y lectura superpuesta de porcentaje y litros disponibles.
- **Sonda inferior:** Muestra la lectura en vivo del sensor óptico **TS-300B** (`GPIO33 ADC1`) en UNT y especifica columna neta (`cm`), zona libre (`%`) y clasificación de calidad física (`Agua clara`, `Regular` o `Turbia (>5 UNT)`), evitando el término "Potable" para mantener coherencia sanitaria.
- Debajo del visualizador, la tarjeta de diagnóstico resume el protocolo nube (`HTTPS PostgREST RPC`), el estado del canal (`WebSocket (ACTIVO)` o `Polling <N>s` según configuración) y el muestreo sin cortes (`GPIO33 · WiFi Sin Cortes`).

### Columna Derecha: Instrumentación y Alarmas

#### Tarjetas de Medición (`MetricCardComponent`)
Componente reutilizable en [`metric-card.component.ts`](../../src/app/features/dashboard/components/metric-card/metric-card.component.ts) con indicador lateral de estado (`normal`, `exito`, `advertencia`, `alerta`) y etiqueta de hardware:

| Canal | Título en Pantalla | Origen / Pin | Subtítulo e Indicador de Estado |
| :--- | :--- | :--- | :--- |
| 1 | `Turbidez Fisica` | `GPIO33 TS-300B` | Compara contra referencia de entrada y límite `5.0 UNT` |
| 2 | `Autonomia de Reserva` | `CALCULADO` | Litros disponibles; advertencia si `< 1` día |
| 3 | `Tasa de Consumo` | `DERIVADO` | Media diaria (`L/dia`); alerta si `alerta_fuga` |
| 4 | `Nivel Hidraulico` | `GPIO27/26 JSN-SR04T` | Distancia ultrasónica (`cm`); alerta si `alerta_nivel_bajo` |
| 5 | `Tiempo de Almacenamiento` | `CONTADOR` | Advertencia si supera 3 días (`>= 72 h`) |
| 6 | `Uptime Microcontrolador` | `SYS TICK` | Formato `Xd Yh Zm` calculado desde `uptime_seg` |

#### Panel de Vigilancia Sanitaria (`AlertsPanelComponent`)
Definido en [`alerts-panel.component.ts`](../../src/app/features/dashboard/components/alerts-panel/alerts-panel.component.ts), despliega el conteo de alarmas activas evaluadas según normativa MINSA (**D.S. 031-2010-SA**), tarjetas por severidad (`critica` o `advertencia`) o estado nominal sin alarmas, además de la `recomendacion_sugerida` generada por el firmware.

---

## 2. Vista Historial (`/history`)

Implementada en [`history.component.ts`](../../src/app/features/history/history.component.ts), consulta `public.historial_tanque` ordenado descendentemente por `created_at`.

- **Controles de barra superior:**
  - Selector de muestras: `10`, `25` (por defecto), `50` o `100` registros.
  - Botón **Recargar**: Vuelve a consultar la serie temporal en Supabase.
  - Botón **CSV**: Exporta los registros actualmente cargados en `telemetria_tanque_YYYY-MM-DD.csv` (con fecha local de `America/Lima` y BOM UTF-8 `\uFEFF`), incluyendo `fecha_hora_peru` junto a `created_at_utc`.
  - Botón **JSON**: Descarga `telemetria_tanque_YYYY-MM-DD.json` con metadatos de exportación y todos los registros enriquecidos con `fecha_hora_peru`.
- **Cinta estadística (`computed`):** Calcula en tiempo real la cantidad de muestras, el nivel promedio (`%`), la turbidez promedio (`UNT`) y el total de registros que presentaron al menos una alerta.
- **Diseño responsivo dual:**
  - En escritorio (`> 768px`) renderiza una tabla SCADA con barra proporcional de nivel, píldoras cromáticas de turbidez y chips de alarmas (`Nivel`, `Tapa`, `Turbidez`, `Fuga`, `Estancada`, `OK`).
  - En móvil (`<= 768px`) sustituye la tabla por tarjetas verticales ergonómicas (`.mobile-log-card`) para evitar desplazamiento horizontal forzado.

---

## 3. Vista Asistente IA (`/chat`)

Implementada en [`chat.component.ts`](../../src/app/features/chat/chat.component.ts), integra el chatbot sobre **Groq API** con inyección dinámica de telemetría y renderizado Markdown GFM.

Sus componentes visuales principales son:
1. **Barra superior (`chat-toolbar`):** Etiqueta `IA · GROQ`, selector de modelo (`openai/gpt-oss-120b` o `qwen/qwen3.8-27b`), indicador del token activo enmascarado con su tiempo restante (`2d 23h`), botón **Gestionar token** y botón **Limpiar chat**.
2. **Cinta de contexto (`context-strip`):** Muestra los datos vivos que se inyectarán en el siguiente mensaje (nivel %, litros, turbidez UNT, estado de tapa, alertas activas y muestras en historial) y un botón **Sincronizar datos**.
3. **Panel de credencial (`token-gate`):** Se muestra automáticamente cuando no existe un token vigente o al pulsar **Gestionar token**. Permite probar conectividad, guardar el token por 3 días o eliminarlo.
4. **Hilo conversacional (`chat-panel`):** Sugiere 4 consultas rápidas al iniciar, desplaza el scroll automaticamente al final en cada mensaje y estiliza las respuestas del asistente mediante [`markdown-chat.pipe.ts`](../../src/app/features/chat/markdown-chat.pipe.ts).

Para el detalle técnico completo del flujo de IA y seguridad, consultar [asistente-ia-groq.md](./asistente-ia-groq.md).

---

## 4. Vista Ajustes (`/settings`)

Implementada en [`settings.component.ts`](../../src/app/features/settings/settings.component.ts), organiza la configuración en tres paneles independientes:

| Tarjeta | Nombre | Parámetros y Acciones |
| :--- | :--- | :--- |
| **01** | `Enlace Supabase Cloud` | Edición de `supabaseUrl`, `supabaseAnonKey` y prueba **Probar Conexion Supabase** (verifica lectura de fila `id=1` usando un cliente temporal con las credenciales ingresadas). |
| **02** | `Nodo ESP32 DevKit V1 y Dimensiones` | Configuración de `esp32Ip` (LAN), `intervaloRefrescoSeg` (5 a 120 s), escala geométrica (`prototipo_7l` / `real_1100l`) y prueba **Probar Conexion LAN**. |
| **03** | `Asistente IA (Groq API)` | Muestra estado/expiración del token local, selector de modelo activo, ingreso de API Key (`gsk_...`) y botones **Probar Token Groq**, **Guardar Token (3 dias)** y **Eliminar Token**. |

Los cambios de las tarjetas `01` y `02` se clonan, validan y persisten en `localStorage` mediante **Guardar y Aplicar Ajustes** (recargando también el historial) o se revierten a `environment` con **Restablecer Valores Iniciales** (sin borrar el token de Groq de la tarjeta `03`).
