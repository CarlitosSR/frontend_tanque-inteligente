# Especificación del Firmware y Algoritmos (ESP32 DevKit V1)

Este documento detalla la estructura lógica, algoritmos de procesamiento de señales y arquitectura del firmware [`tanque_devkit_v1_.ino`](../../firmware/tanque_devkit_v1_.ino) cargado en la placa **ESP32 DevKit V1**.

---

## Estructura Modular del Archivo `.ino`

El código fuente está organizado en secciones claramente demarcadas:

1. **Configuración de Red y Nube:** Credenciales Wi-Fi, URL del endpoint RPC de Supabase (`sincronizar_tanque`), clave pública `anon` e instancia `Preferences` para NVS.
2. **Definición de Pines (ESP32 DevKit V1):** `GPIO27` (`TRIG`), `GPIO26` (`ECHO`), `GPIO33` (`ADC1_CH5` turbidez) y `GPIO25` (`MC-38` tapa).
3. **Parámetros Geométricos del Tanque:** Prototipo de laboratorio (`7.00 L`, diámetro `16.80 cm`, altura útil `31.60 cm`, altura inicial sensor `50.00 cm`) y tanque real doméstico (`1100.0 L`, diámetro `110.0 cm`, altura útil `115.0 cm`, altura sensor `140.0 cm`).
4. **Constantes Eléctricas y Umbrales:** Divisor resistivo (`1.50`), umbrales sanitarios MINSA (`5.0 UNT`, `2.5 UNT`, `20 %`, `0.50 L/h`, `30 s`, `72 h`) y tiempos de muestreo/reconexión Wi-Fi.
5. **Estado Global y Persistencia NVS (`Preferences`):** Estructura `EstadoTanque` y funciones `cargarCalibracionesNVS()`, `guardarCalibracionAlturaNVS()`, `guardarCalibracionTurbidezNVS()` y `restablecerCalibracionesNVS()` en el namespace `"tanque"`.
6. **Funciones de Sensores, Cascada y Comandos Serial:**
   - `medirDistanciaJSNSR04T()`: mediana de 5 lecturas (`2–450 cm`).
   - `leerVoltajeSensorTS300B()` y `medirTurbidezTS300B()`: promedio de 20 muestras usando `analogReadMilliVolts(PIN_TURB_AO)` (calibración eFuse) sin apagar la radio Wi-Fi.
   - `actualizarNivelYCascada()`: descarte de lecturas en zona ciega (`< 25 cm`), banda muerta contra ruido, confirmación de 2 descensos consecutivos para fuga y limpieza automática al estabilizarse.
   - `procesarComandoSerial()`: lectura no bloqueante para `H<cm>`, `T` y `R`.
7. **Generación de Payload JSON y Envío HTTPS:** `construirJSONEstado()` y `enviarDatosANube()` con timeout de `5000 ms`.
8. **Servidor Web Local (Puerto 80):** `/`, `/api/estado` y `/api/medir-turbidez` con soporte CORS (`GET, POST, OPTIONS`).
9. **Setup y Loop Principal:** Inicialización, fallback AP automático y orquestación no bloqueante con `millis()`.

---

## Concurrencia y Temporización No Bloqueante

```text
Intervalos de Muestreo en el Firmware:
┌─────────────────────────────┬────────────────────┬───────────────────────────────────────────┐
│ Tarea                       │ Intervalo (ms)     │ Propósito                                 │
├─────────────────────────────┼────────────────────┼───────────────────────────────────────────┤
│ Vigilancia de Tapa (MC-38)  │ 1,000 ms (1 s)     │ Respuesta inmediata ante apertura         │
│ Nivel y Cascada (JSN-SR04T) │ 10,000 ms (10 s)   │ Detección de fluctuaciones de volumen     │
│ Reporte Web y Nube          │ 15,000 ms (15 s)   │ Transmisión HTTPS y actualización JSON    │
│ Reconexión Wi-Fi            │ 30,000 ms (30 s)   │ Reintento en segundo plano si cae enlace  │
│ Turbidez Periódica (TS300B) │ 3,600,000 ms (1 h) │ Inspección regular o al entrar agua       │
│ Turbidez Agua Estancada     │ 300,000 ms (5 min) │ Remuestreo frecuente si supera 3 días     │
└─────────────────────────────┴────────────────────┴───────────────────────────────────────────┘
```

---

## Algoritmos de Procesamiento de Señales

### 1. Filtrado Estadístico por Mediana y Protección de Zona Ciega (`JSN-SR04T`)
1. Se dispara un pulso de `12 µs` en `GPIO27` (`TRIG`) y se mide el eco en `GPIO26` con `pulseIn(..., 30000UL)`.
2. $\text{Distancia (cm)} = \frac{\text{Duración}(\mu s) \cdot 0.0343}{2}$, tomando la mediana de hasta 5 muestras válidas (`2–450 cm`).
3. **Protección de zona ciega (`< 25 cm`):** si `dist < 25.0f`, el firmware marca `enZonaCiegaUltrasonico = true`, registra `distanciaSensorCm = dist`, resetea `tasaConsumoLitrosHora = 0` y retorna sin contaminar volumen ni disparar falsas alarmas de fuga o nivel `0 %`.
4. **Cálculo de volumen:** $h_{\text{agua}} = \text{clamp}(h_{\text{sensor}} - d, 0, h_{\max})$ y $\text{Litros} = \frac{\pi \cdot r^2 \cdot h_{\text{agua}}}{1000}$.

### 2. Muestreo Analógico Calibrado en `ADC1` (`TS-300B` en `GPIO33`)
1. Al utilizar `GPIO33` (`ADC1_CH5`), la radio Wi-Fi permanece encendida durante todo el muestreo.
2. Se promedian 20 lecturas mediante `analogReadMilliVolts(PIN_TURB_AO)` (que aplica la calibración eFuse de fábrica del ESP32) y se reconstruye la tensión del sensor:
   $$V_{\text{sensor}} = \left(\frac{\text{mV}_{\text{prom}}}{1000}\right) \cdot 1.50$$
3. Se aplica la compensación frente a la referencia basal calibrada (`T` en agua limpia, por defecto `4.20 V`):
   $$V_{\text{cal}} = V_{\text{sensor}} \cdot \frac{4.20}{V_{\text{limpia\_ref}}}$$
4. Curva característica estándar: $\text{NTU} = -1120.4 \cdot V_{\text{cal}}^2 + 5742.3 \cdot V_{\text{cal}} - 4352.9$, acotada a `0.5 UNT` para $V_{\text{cal}} \ge 4.20\text{ V}$ y a `3000.0 UNT` para $V_{\text{cal}} \le 2.50\text{ V}$.

### 3. Detección en Cascada, Antirruido de Fugas y Comandos Serial
- **Entrada de agua ($\Delta \ge +0.25\text{ L}$):** reinicia `timestampEntradaAguaMs`, limpia `alertaPosibleFuga`, pone `tasaConsumoLitrosHora = 0` y mide turbidez de referencia.
- **Consumo y fuga ($\Delta < -0.08\text{ L}$ en prototipo / $-0.50\text{ L}$ en tanque real):** calcula la tasa real usando el tiempo transcurrido entre mediciones válidas, acota picos extremos para la media móvil (`0.85 / 0.15`) y exige **2 descensos consecutivos** por encima de `0.50 L/h` para activar `alertaPosibleFuga`.
- **Nivel estable:** limpia `tasaConsumoLitrosHora = 0` y **restablece `alertaPosibleFuga = false`**.
- **Comandos Serial (`115200` baudios, no bloqueante):** `H<cm>` recalibra altura del sensor y la guarda en NVS; `T` calibra referencia basal de agua limpia en NVS; `R` restablece valores iniciales.

---

## Evaluación Determinista de Reglas Fijas Sanitarias

| Regla | Condición Matemática / Lógica | Base Normativa o Técnica |
| :--- | :--- | :--- |
| **Nivel Bajo** | `nivelValido && porcentajeNivel <= 20.0` | Prevención de desabastecimiento |
| **Tapa Abierta** | `tapaAbierta && (tiempoAbierta >= 30 s)` | Prevención de vector *Aedes aegypti* (Dengue) |
| **Turbidez Alta** | `turbidezActual > 5.0 UNT` o `(turbidezActual - turbidezReferencia) >= 2.5 UNT` | D.S. 031-2010-SA (Reglamento MINSA para Agua Humana) |
| **Agua Estancada** | `horasAlmacenada >= (3 días * 24 h)` | Proliferación de biopelículas y bacterias |
| **Posible Fuga** | `2 descensos consecutivos con tasa > 0.50 L/h` | Detección continua de rotura o goteo |

---

## Formato del Payload JSON y Transmisión a Supabase

`construirJSONEstado()` genera el objeto JSON con `"dispositivo": "ESP32_DevKitV1_Tanque_Inteligente"`, los bloques `mediciones`, `autonomia_y_consumo`, `alertas_reglas_fijas` y `contexto_chatbot` (conservando el nombre de clave `"voltaje_pin_io14_v"` en el contrato JSON por retrocompatibilidad con `Esp32EstadoRespuesta`).

En `enviarDatosANube()`, se utiliza `WiFiClientSecure` con `client.setInsecure()` y `http.setTimeout(5000)`, empaquetando el cuerpo como `{"payload": ...}` hacia `POST /rest/v1/rpc/sincronizar_tanque`. Además, una llamada a `POST /api/medir-turbidez` marca `envioInmediatoPendiente = true` para sincronizar el nuevo valor con Supabase en el siguiente ciclo de `loop()`.
