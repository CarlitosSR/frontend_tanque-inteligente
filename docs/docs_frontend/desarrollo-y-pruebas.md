# Desarrollo, Compilacion y Pruebas

Esta guia documenta los requisitos del entorno de desarrollo, los scripts de ejecucion, las restricciones de empaquetado de Angular 22 y la cobertura de pruebas unitarias del frontend.

---

## 1. Requisitos Previos e Instalacion

- **Node.js:** Version 20.x o superior.
- **npm:** Version 10.x o superior (`packageManager: npm@11.13.0` en `package.json`).
- **Navegador:** Navegador moderno compatible con WebSockets, `fetch` con `AbortSignal.timeout` y `localStorage`.

Instalacion inicial de dependencias:

```bash
npm install
```

---

## 2. Scripts Disponibles (`package.json`)

| Comando | Script Subyacente | Proposito |
| :--- | :--- | :--- |
| `npm start` | `ng serve` | Levanta el servidor de desarrollo local en `http://localhost:4200/` |
| `npm run build` | `ng build` | Compila el bundle de produccion en `dist/frontend_tanque-inteligente` |
| `npm run watch` | `ng build --watch --configuration development` | Compilacion incremental de desarrollo en modo observador |
| `npm test -- --watch=false` | `ng test --watch=false` | Ejecuta una corrida unica de toda la suite unitaria en Vitest |

---

## 3. Presupuestos de Compilacion (`angular.json`)

La configuracion de produccion en [angular.json](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/angular.json) aplica los siguientes limites para mantener la carga ligera en dispositivos moviles:

- **Bundle inicial (`initial`):** Advertencia a `750 kB`, error a `1.5 MB`.
- **Hojas de estilo por componente (`anyComponentStyle`):** Advertencia a `8 kB`, error a `16 kB`.

Por esta razon, los estilos extensos del renderizado Markdown (`.scada-md`) se ubican en [styles.css](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/styles.css) y no dentro de `chat.component.css`, evitando alertas de presupuesto por componente y manteniendo encapsulada la vista de chat.

---

## 4. Suite de Pruebas Unitarias (Vitest)

Las pruebas unitarias operan sobre `jsdom` mediante `@angular/build:unit-test` y cubren los servicios de IA, el renderizador Markdown y el componente principal:

| Archivo de Prueba | Alcance Verificado | Casos |
| :--- | :--- | :--- |
| [app.spec.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/app.spec.ts) | Creacion de `App` y renderizado del titulo `Tanque Inteligente IoT` | 2 |
| [groq-token.service.spec.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/core/services/groq-token.service.spec.ts) | Persistencia con prefijo `gsk_`, rechazo de formatos invalidos, expiracion exacta a 72 h con `vi.useFakeTimers()`, limpieza de clave heredada de Gemini y revocacion manual | 4 |
| [groq-chat.service.spec.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/core/services/groq-chat.service.spec.ts) | Inyeccion de tono amigable, telemetria, alertas, historial y normativa MINSA en `system`; envio `POST` con `Bearer` y limpieza de `<think>`; fallback automatico ante `HTTP 503`; bloqueo sin token y errores `401`/`429`; validacion `GET /models` | 5 |
| [markdown-chat.pipe.spec.ts](file:///D:/Proyectos/UPN/Arq_Computador/frontend_tanque-inteligente/src/app/features/chat/markdown-chat.pipe.spec.ts) | Renderizado de negritas y listas mixtas anidadas, tablas GFM en `.md-table-wrap` y codigo, neutralizacion XSS de `<script>`/`<img>`/`javascript:`, enlaces `https://` seguros y entradas vacias | 5 |

---

## 5. Buenas Practicas para Nuevos Cambios

- Mantener las credenciales sensibles de IA exclusivamente en el navegador mediante `GroqTokenService`, sin incorporar API keys en `src/environments/` ni en el control de versiones.
- Conservar la separacion de capas: modelos en `src/app/core/models/`, estado e integraciones en `src/app/core/services/` y vistas lazy-loaded en `src/app/features/`.
- Si se modifican reglas del `system prompt` o el renderizado de respuestas, actualizar los casos correspondientes en `groq-chat.service.spec.ts` y `markdown-chat.pipe.spec.ts` antes de ejecutar `npm test -- --watch=false` y `npm run build`.
