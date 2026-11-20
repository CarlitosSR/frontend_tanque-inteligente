# Vistas y Componentes del Frontend

Este documento detalla el funcionamiento tecnico y operativo de cada pantalla de la aplicacion web, sus componentes reutilizables y las interacciones disponibles para el operador.

---

## 1. Vista Monitor (`/dashboard`)

Implementada en [dashboard.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/dashboard/dashboard.component.ts), constituye el panel principal de supervision en tiempo real del tanque.

### Barra de Estacion y Diagnostico LAN
- Muestra el identificador del nodo (`AI-Thinker ESP32-CAM #ID: 01`), la hora de ultima sincronizacion en horario de Peru (`-0500`) y el boton **Sincronizar** para forzar `supabase.cargarEstadoActual()`.
- Si existe una `esp32Ip` configurada en **Ajustes**, habilita una barra secundaria LAN con dos acciones directas:
  - **Consultar `/api/estado`**: Lee la telemetria en vivo directamente desde el servidor web del ESP32.
  - **Forzar Turbidez TS-300B**: Dispara `POST /api/medir-turbidez` y luego recarga el estado desde Supabase.

### Columna Izquierda: Visualizador Volumetrico (`TankGaugeComponent`)
Definido en [tank-gauge.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/dashboard/components/tank-gauge/tank-gauge.component.ts), representa graficamente el deposito:
- **Encabezado:** Indica el modo volumetrico activo (`Prototipo PET 7 L` o `Rotoplas 1100 L`) y el badge del sensor magnetico de tapa **MC-38** (`ABIERTA` con contador en segundos, o `CERRADA`).
- **Cilindro HMI:** Escala graduada lateral (`0%`, `25%`, `50%`, `75%`, `100%`), cabezal superior con representacion del haz acustico del sensor ultrasonico **JSN-SR04T**, columna de liquido con menisco y lectura superpuesta de porcentaje y litros disponibles.
- **Sonda inferior:** Muestra la lectura en vivo del sensor optico **TS-300B** en UNT y especifica columna neta (`cm`), zona libre (`%`) y clasificacion de calidad fisica.
- Debajo del visualizador, la tarjeta de diagnostico resume el protocolo nube (`HTTPS PostgREST RPC`), el estado del canal (`WebSocket (ACTIVO)` o `Polling 15s`) y el aislamiento ADC2/WiFi.

### Columna Derecha: Instrumentacion y Alarmas

#### Tarjetas de Medicion (`MetricCardComponent`)
Componente reutilizable en [metric-card.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/dashboard/components/metric-card/metric-card.component.ts) con indicador lateral de estado (`normal`, `exito`, `advertencia`, `alerta`) y etiqueta de hardware:

| Canal | Titulo en Pantalla | Origen / Pin | Subtitulo e Indicador de Estado |
| :--- | :--- | :--- | :--- |
| 1 | `Turbidez Fisica` | `IO14 TS-300B` | Compara contra referencia de entrada y limite `5.0 UNT` |
| 2 | `Autonomia de Reserva` | `CALCULADO` | Litros disponibles; advertencia si `< 1` dia |
| 3 | `Tasa de Consumo` | `DERIVADO` | Media diaria (`L/dia`); alerta si `alerta_fuga` |
| 4 | `Nivel Hidraulico` | `IO12/13 JSN-SR04T` | Distancia ultrasonica (`cm`); alerta si `alerta_nivel_bajo` |
| 5 | `Tiempo de Almacenamiento` | `CONTADOR` | Advertencia si supera 3 dias (`>= 72 h`) |
| 6 | `Uptime Microcontrolador` | `SYS TICK` | Formato `Xd Yh Zm` calculado desde `uptime_seg` |

#### Panel de Vigilancia Sanitaria (`AlertsPanelComponent`)
Definido en [alerts-panel.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/dashboard/components/alerts-panel/alerts-panel.component.ts), despliega el conteo de alarmas activas evaluadas segun normativa MINSA (**D.S. 031-2010-SA**), tarjetas por severidad (`critica` o `advertencia`) o estado nominal sin alarmas, ademas de la `recomendacion_sugerida` generada por el firmware.

---

## 2. Vista Historial (`/history`)

Implementada en [history.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/history/history.component.ts), consulta `public.historial_tanque` ordenado descendentemente por `created_at`.

- **Controles de barra superior:**
  - Selector de muestras: `10`, `25` (por defecto), `50` o `100` registros.
  - Boton **Recargar**: Vuelve a consultar la serie temporal en Supabase.
  - Boton **CSV**: Exporta los registros actualmente cargados en un archivo `telemetria_tanque_YYYY-MM-DD.csv`, incluyendo la columna calculada `fecha_hora_peru` formateada con `America/Lima` junto a `created_at_utc`.
- **Cinta estadistica (`computed`):** Calcula en tiempo real la cantidad de muestras, el nivel promedio (`%`), la turbidez promedio (`UNT`) y el total de registros que presentaron al menos una alerta.
- **Diseno responsivo dual:**
  - En escritorio (`> 768px`) renderiza una tabla SCADA con barra proporcional de nivel, pildoras cromaticas de turbidez y chips de alarmas (`Nivel`, `Tapa`, `Turbidez`, `Fuga`, `Estancada`, `OK`).
  - En movil (`<= 768px`) sustituye la tabla por tarjetas verticales ergonomicas (`.mobile-log-card`) para evitar desplazamiento horizontal forzado.

---

## 3. Vista Asistente IA (`/chat`)

Implementada en [chat.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/chat/chat.component.ts), integra el chatbot sobre **Groq API** con inyeccion dinamica de telemetria y renderizado Markdown GFM.

Sus componentes visuales principales son:
1. **Barra superior (`chat-toolbar`):** Etiqueta `IA · GROQ`, selector de modelo (`openai/gpt-oss-120b` o `qwen/qwen3.8-27b`), indicador del token activo enmascarado con su tiempo restante (`2d 23h`), boton **Gestionar token** y boton **Limpiar chat**.
2. **Cinta de contexto (`context-strip`):** Muestra los datos vivos que se inyectaran en el siguiente mensaje (nivel %, litros, turbidez UNT, estado de tapa, alertas activas y muestras en historial) y un boton **Sincronizar datos**.
3. **Panel de credencial (`token-gate`):** Se muestra automaticamente cuando no existe un token vigente o al pulsar **Gestionar token**. Permite probar conectividad, guardar el token por 3 dias o eliminarlo.
4. **Hilo conversacional (`chat-panel`):** Sugiere 4 consultas rapidas al iniciar, desplaza el scroll automaticamente al final en cada mensaje y estiliza las respuestas del asistente mediante [markdown-chat.pipe.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/chat/markdown-chat.pipe.ts).

Para el detalle tecnico completo del flujo de IA y seguridad, consultar [asistente-ia-groq.md](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/docs/docs_frontend/asistente-ia-groq.md).

---

## 4. Vista Ajustes (`/settings`)

Implementada en [settings.component.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/settings/settings.component.ts), organiza la configuracion en tres paneles independientes:

| Tarjeta | Nombre | Parametros y Acciones |
| :--- | :--- | :--- |
| **01** | `Enlace Supabase Cloud` | Edicion de `supabaseUrl`, `supabaseAnonKey` y prueba **Probar Conexion Supabase** (verifica lectura de fila `id=1`). |
| **02** | `Nodo ESP32-CAM y Dimensiones` | Configuracion de `esp32Ip` (LAN), `intervaloRefrescoSeg` (5 a 120 s), escala geometrica (`prototipo_7l` / `real_1100l`) y prueba **Probar Conexion LAN**. |
| **03** | `Asistente IA (Groq API)` | Muestra estado/expiracion del token local, selector de modelo activo, ingreso de API Key (`gsk_...`) y botones **Probar Token Groq**, **Guardar Token (3 dias)** y **Eliminar Token**. |

Los cambios de las tarjetas `01` y `02` se aplican y persisten en `localStorage` mediante **Guardar y Aplicar Ajustes** o se revierten a `environment` con **Restablecer Valores Iniciales** (sin borrar el token de Groq de la tarjeta `03`).
