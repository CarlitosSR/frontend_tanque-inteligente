# Desarrollo, Compilación y Pruebas

Esta guía documenta los requisitos del entorno de desarrollo, los scripts de ejecución, las restricciones de empaquetado de Angular 22 y la cobertura de pruebas unitarias del frontend.

---

## 1. Requisitos Previos e Instalación

- **Node.js:** Versión `20.x` o superior.
- **npm:** Versión `10.x` o superior (`packageManager: npm@11.13.0` en [`package.json`](../../package.json)).
- **Navegador:** Navegador moderno compatible con WebSockets, `fetch` con `AbortSignal.timeout` y `localStorage`.

Instalación inicial de dependencias:

```bash
npm install
```

---

## 2. Scripts Disponibles (`package.json`)

| Comando | Script Subyacente | Propósito |
| :--- | :--- | :--- |
| `npm start` | `ng serve` | Levanta el servidor de desarrollo local en `http://localhost:4200/` |
| `npm run build` | `ng build` | Compila el bundle de producción en `dist/frontend_tanque-inteligente` |
| `npm run watch` | `ng build --watch --configuration development` | Compilación incremental de desarrollo en modo observador |
| `npm test -- --watch=false` | `ng test --watch=false` | Ejecuta una corrida única de toda la suite unitaria en Vitest |

---

## 3. Presupuestos de Compilación y Despliegue (`angular.json` y `vercel.json`)

La configuración de producción en [`angular.json`](../../angular.json) aplica los siguientes límites para mantener la carga ligera en dispositivos móviles:

- **Bundle inicial (`initial`):** Advertencia a `750 kB`, error a `1.5 MB`.
- **Hojas de estilo por componente (`anyComponentStyle`):** Advertencia a `8 kB`, error a `16 kB`.

Por esta razón, los estilos extensos del renderizado Markdown (`.scada-md`) se ubican en [`src/styles.css`](../../src/styles.css) y no dentro de `chat.component.css`, evitando alertas de presupuesto por componente y manteniendo encapsulada la vista de chat.

Para el alojamiento en Vercel, [`vercel.json`](../../vercel.json) define el rewrite SPA (`/(.*) -> /index.html`) y cabeceras HTTP de seguridad (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`).

---

## 4. Suite de Pruebas Unitarias (Vitest)

Las pruebas unitarias operan sobre `jsdom` mediante `@angular/build:unit-test` (con [`src/test-setup.ts`](../../src/test-setup.ts) para garantizar disponibilidad de `localStorage` en memoria bajo Node `v25+`/`v26+`) y cubren los servicios de telemetría local y asistente IA, el renderizador Markdown, las vistas principales y el componente raíz (`27` casos en `7` archivos):

| Archivo de Prueba | Alcance Verificado | Casos |
| :--- | :--- | :---: |
| [`app.spec.ts`](../../src/app/app.spec.ts) | Creación de `App` y renderizado del título `Tanque Inteligente IoT` | 2 |
| [`esp32-local.service.spec.ts`](../../src/app/core/services/esp32-local.service.spec.ts) | Rechazo de IP vacía, normalización URL, `GET /api/estado`, `POST /api/medir-turbidez` y errores HTTP | 4 |
| [`groq-token.service.spec.ts`](../../src/app/core/services/groq-token.service.spec.ts) | Persistencia con prefijo `gsk_`, rechazo de formatos inválidos, expiración exacta a 72 h con `vi.useFakeTimers()`, limpieza de clave heredada de Gemini y revocación manual | 4 |
| [`groq-chat.service.spec.ts`](../../src/app/core/services/groq-chat.service.spec.ts) | Inyección de tono amigable, telemetría, estado del nodo `ESP32 DevKit V1`, alertas, historial y normativa MINSA en `system`; envío `POST` con `Bearer` y limpieza de `<think>`; fallback automático ante `HTTP 503`; bloqueo sin token y errores `401`/`429`; validación `GET /models` | 5 |
| [`markdown-chat.pipe.spec.ts`](../../src/app/features/chat/markdown-chat.pipe.spec.ts) | Renderizado de negritas y listas mixtas anidadas, tablas GFM en `.md-table-wrap` y código, neutralización XSS de `<script>`/`<img>`/`javascript:`, enlaces `https://` seguros y entradas vacías | 5 |
| [`tank-gauge.component.spec.ts`](../../src/app/features/dashboard/components/tank-gauge/tank-gauge.component.spec.ts) | Clasificación física (`Agua clara` sin afirmar potabilidad, `Regular`, `Turbia (>5 UNT)`), acotado `0–100 %`, modo volumétrico y tooltips `GPIO27 / GPIO26` y `GPIO33 ADC1` | 4 |
| [`history.component.spec.ts`](../../src/app/features/history/history.component.spec.ts) | Cálculos de `promedioNivel`, `promedioTurbidez`, `totalAlertas`, cambio de límite de muestras y exportación CSV / JSON | 3 |

---

## 5. Buenas Prácticas para Nuevos Cambios

- Mantener las credenciales sensibles de IA exclusivamente en el navegador mediante `GroqTokenService`, sin incorporar API keys en `src/environments/` ni en el control de versiones.
- Conservar la separación de capas: modelos en `src/app/core/models/`, estado e integraciones en `src/app/core/services/` y vistas lazy-loaded en `src/app/features/`.
- Si se modifican reglas del `system prompt`, los umbrales visuales o el renderizado de respuestas, actualizar los casos correspondientes en los archivos `.spec.ts` antes de ejecutar `npm test -- --watch=false` y `npm run build`.
