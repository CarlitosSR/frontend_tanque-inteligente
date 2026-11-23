# Asistente IA con Groq API e Inyección de Contexto

Este documento especifica la arquitectura, seguridad de credenciales, inyección dinámica de contexto (*prompt injection* controlado), renderizado Markdown y guía operativa del módulo de Inteligencia Artificial del frontend.

---

## 1. Arquitectura de Comunicación y Modelos

El modulo de chat ejecuta peticiones HTTPS directas desde el navegador hacia el endpoint compatible con OpenAI Chat Completions de **Groq API**, utilizando `fetch` nativo sin dependencias SDK externas:

- **Endpoint de completación:** `POST https://api.groq.com/openai/v1/chat/completions`
- **Endpoint de validación:** `GET https://api.groq.com/openai/v1/models`
- **Autenticación:** Cabecera `Authorization: Bearer <GROQ_API_KEY>`
- **Parámetros de inferencia:** `temperature: 0.3`, `max_completion_tokens: 2048`, `stream: false`, `AbortSignal.timeout(20000)` (`20 s`).

### Modelos Soportados y Fallback Automático

| Modelo | Rol en la Aplicación | Comportamiento |
| :--- | :--- | :--- |
| `openai/gpt-oss-120b` | Modelo por defecto | Razonamiento avanzado; el servicio elimina etiquetas `<think>...</think>` si aparecen en `content`. |
| `qwen/qwen3.8-27b` | Modelo alternativo seleccionable | Alta velocidad y respuestas compactas. |

En [`groq-chat.service.ts`](../../src/app/core/services/groq-chat.service.ts), si el modelo seleccionado devuelve un error HTTP `404`, `502`, `503` o `504`, el servicio ejecuta automáticamente un reintento único contra el modelo alternativo de `groqAvailableModels` y registra en la burbuja de respuesta el identificador exacto del modelo efectivo que contestó (`msg.modeloUsado`).

---

## 2. Diagrama de Flujo del Chatbot

```mermaid
sequenceDiagram
    actor Op as Operador
    participant UI as ChatComponent (/chat)
    participant Tok as GroqTokenService (localStorage)
    participant Sup as SupabaseService / Esp32LocalService
    participant Chat as GroqChatService
    participant API as Groq API (api.groq.com)

    Op->>UI: Abre /chat o envia consulta
    UI->>Tok: obtenerTokenValido()
    alt Token ausente o >= 72 horas
        Tok-->>UI: null (purga localStorage)
        UI-->>Op: Solicita API Key (gsk_...) por 3 dias
        Op->>UI: Ingresa clave y guarda
        UI->>Tok: guardarToken(key) -> TTL 3 dias
    end

    Op->>Chat: enviarMensaje(pregunta)
    Chat->>Sup: Lee estadoActual, alertasActivas, historial, LAN
    Chat->>Chat: construirSystemPrompt() con telemetria en vivo
    Chat->>API: POST /chat/completions (system + ultimos 10 mensajes + pregunta)
    alt Modelo principal retorna 404 / 502 / 503 / 504
        Chat->>API: Reintento automatico con modelo alternativo
    end
    API-->>Chat: choices[0].message.content
    Chat->>Chat: Limpia bloques <think> y actualiza signal mensajes()
    UI->>UI: MarkdownChatPipe (marked + DomSanitizer) -> .scada-md
    UI-->>Op: Muestra respuesta estilizada
```

---

## 3. Gestión de Credencial en Frontend (BYOK por 3 Días)

Para garantizar que ninguna clave de IA quede expuesta en el repositorio ni en los archivos compilados, [`groq-token.service.ts`](../../src/app/core/services/groq-token.service.ts) implementa el modelo **BYOK (*Bring Your Own Key*)**:

1. **Validación de formato (`esFormatoValido`):** Exige que la clave inicie con `gsk_` y tenga al menos `20` caracteres tras recortar espacios.
2. **Almacenamiento aislado:** Persiste un JSON `{ token, creadoEn, expiraEn }` únicamente en el `localStorage` del navegador bajo la clave `tanque_inteligente_groq_token`, con `expiraEn = creadoEn + (3 * 24 * 60 * 60 * 1000)` (72 horas exactas).
3. **Caducidad y purga automática:**
   - Al inicializar el servicio (`cargarDesdeStorage`), descarta y borra cualquier registro vencido o malformado.
   - Un temporizador cada `60000` ms (`1 min`) ejecuta `verificarVigencia()`.
   - Cada llamada a `obtenerTokenValido()` comprueba `Date.now() >= reg.expiraEn`; si venció, elimina la clave de inmediato y solicita una nueva en la interfaz.
4. **Privacidad en pantalla:** `tokenEnmascarado` expone solo `gsk_...xxxx` (primeros 4 y ultimos 4 caracteres).
5. **Prueba sin costo de cuota:** `GroqChatService.probarConexionToken()` consulta `GET /openai/v1/models` (timeout `8 s`) para verificar validez de la clave y disponibilidad del modelo seleccionado sin generar tokens de salida.

---

## 4. Inyección Dinámica de Contexto (*Prompt Injection* Controlado)

En cada envío de mensaje, `GroqChatService.construirSystemPrompt()` genera un mensaje `role: 'system'` actualizado al instante con los datos vivos del backend y la red local:

### Estructura del Prompt Inyectado

1. **Personalidad y Tono Accesible:**
   - Instruye al modelo a responder en español cálido, cercano y fácil de entender para cualquier persona (sin emojis).
   - Solicita iniciar con un resumen cotidiano claro indicando si el tanque está bien o requiere atención.
   - Evita jerga técnica (como SCADA, uptime, firmware o ADC2) salvo que el usuario pregunte explícitamente por detalles técnicos, y explica unidades como `UNT` o `L/h` en palabras simples.
2. **Guía de Formato:**
   - Pide respuestas en Markdown (GFM) compacto: párrafos cortos, negritas, listas con pasos accionables y tablas simples cuando ayuden a comparar lecturas. Prohíbe HTML crudo y fórmulas LaTeX complejas.
3. **Reglas Sanitarias y Normativas Obligatorias (MINSA):**
   - Límite de turbidez física según D.S. 031-2010-SA: `5.0 UNT`.
   - **Restricción crítica de potabilidad:** Recuerda explícitamente al modelo que el sensor óptico TS-300B mide solo turbidez física y **NO certifica potabilidad microbiológica ni química** (no detecta bacterias, virus, cloro residual ni metales pesados).
   - Reglas deterministas del firmware: nivel bajo `<= 20%`, tapa abierta prolongada `>= 30 s` (riesgo *Aedes aegypti*), turbidez alta `> 5.0 UNT` o salto `>= 2.5 UNT`, posible fuga `> 0.50 L/h` y agua estancada `>= 72 horas`.
4. **Delimitación de Seguridad del Contexto:**
   - Encapsula los datos de sensores en etiquetas XML explícitas (`<telemetria_actual>`, `<historial_reciente>`, `<diagnostico_lan>`) e instruye al modelo a tratarlos estrictamente como datos de lectura y nunca como instrucciones ejecutables.
5. **Bloques de Datos Inyectados:**
   - **`<telemetria_actual>`:** Última sincronización UTC, estado de enlace del nodo (`En linea` o `Sin reporte reciente`), alerta de zona ciega (`< 25 cm`), modo configurado y reportado, capacidad nominal, porcentaje y litros, altura y distancia ultrasónica, turbidez actual y de referencia, clasificación sanitaria, estado de tapa y segundos abierta, días de autonomía, consumo medio diario y tasa actual, horas almacenada, uptime del **ESP32 DevKit V1**, `recomendacion_sugerida` del firmware y lista detallada de `alertasActivas()`.
   - **`<historial_reciente>`:** Si `historial()` está vacío al preguntar, el servicio solicita `cargarHistorial(25)` antes de llamar a Groq. Resume cantidad de muestras, rango temporal, min/max/promedio de nivel y turbidez, tendencia calculada (`Subiendo`, `Bajando` o `Estable`), total de lecturas con alarma y las **últimas 5 lecturas** detalladas.
   - **`<diagnostico_lan>`:** Si hubo una lectura previa vía `Esp32LocalService`, adjunta nombre de dispositivo, indicador `en_zona_ciega_jsn` y voltajes de pin `GPIO33 (ADC1)` y sensor `TS-300B`.

### Memoria Conversacional y Consumo de Tokens
Para optimizar el limite de tokens por minuto (TPM) de Groq, `construirHistorialApi()` envía únicamente los últimos **10 mensajes válidos** (`user` / `assistant`) de la sesión junto al `system` regenerado y la consulta actual del operador.

---

## 5. Renderizado Markdown (GFM) y Protección XSS

Las respuestas del asistente (`rol === 'asistente'`) se transforman mediante [`markdown-chat.pipe.ts`](../../src/app/features/chat/markdown-chat.pipe.ts) y se estilizan con el bloque global `.scada-md` de [`styles.css`](../../src/styles.css):

- **Normalización previa:** Unifica saltos `\r\n`, limpia espacios finales de línea y colapsa `3+` saltos de línea consecutivos emitidos por modelos como `gpt-oss-120b`.
- **Especificidad CSS controlada:** En [`chat.component.css`](../../src/app/features/chat/chat.component.css), `.msg-body.scada-md` restablece `white-space: normal` sobre la regla encapsulada `.msg-body` (`white-space: pre-wrap`), evitando que los saltos `\n` entre etiquetas HTML generados por `marked` aparezcan como espacios dobles.
- **Tablas responsivas:** El renderer personalizado envuelve cada tabla GFM en `<div class="md-table-wrap">` con scroll horizontal para pantallas móviles.
- **Doble capa anti-XSS:**
  1. En `scadaRenderer` (`RendererObject` registrado con `markedScada.use({ renderer: scadaRenderer })`), `html()` escapa etiquetas HTML crudas (`escaparHtml`) y `link()` bloquea cualquier esquema distinto de `http:` o `https:` (`esUrlSegura`, agregando `target="_blank" rel="noopener noreferrer"` a enlaces válidos).
  2. El template enlaza el HTML resultante a `[innerHTML]` sin utilizar `bypassSecurityTrustHtml`, activando automáticamente el `DomSanitizer` nativo de Angular 22. Los mensajes del operador y de error se muestran como texto plano interpolado (`{{ msg.texto }}`).

---

## 6. Guía Rápida de Uso y Catálogo de Errores Controlados

### Pasos para el Operador
1. Generar una API Key gratuita (`gsk_...`) en [Groq Console](https://console.groq.com/keys).
2. Abrir la pestaña **Asistente** (`/chat`) o la tarjeta **03** de **Ajustes** (`/settings`).
3. Pegar la clave, presionar **Probar token** para confirmar acceso y luego **Guardar por 3 dias**.
4. Usar las consultas rápidas sugeridas o escribir cualquier pregunta sobre el agua, alertas, autonomía o tendencias; presionar `Enter` para enviar (`Shift + Enter` para salto de línea).

### Catálogo de Errores Controlados

| Condición / Código | Mensaje Mostrado al Operador | Acción Recomendada |
| :--- | :--- | :--- |
| Sin token o expirado (`>= 72 h`) | Solicita ingresar una clave `gsk_...` vigente | Registrar un nuevo token en el panel |
| `HTTP 401` / `403` | Token de Groq inválido, revocado o sin permisos | Verificar o regenerar la clave en `console.groq.com` |
| `HTTP 404` | Modelo no disponible en Groq (tras fallo del fallback) | Seleccionar el otro modelo disponible en cabecera |
| `HTTP 429` | Límite de cuota o solicitudes por minuto alcanzado | Esperar unos segundos o cambiar a `qwen/qwen3.8-27b` |
| `HTTP >= 500` | Error temporal en los servidores de Groq (tras fallback) | Reintentar en unos segundos |
| `TimeoutError` (`20 s` / `8 s`) | Tiempo de espera agotado al contactar Groq API | Verificar conexión a internet y reintentar |
