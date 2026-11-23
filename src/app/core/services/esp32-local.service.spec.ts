import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { Esp32LocalService } from './esp32-local.service';
import { Esp32EstadoRespuesta } from '../models/tanque.model';

function crearRespuestaMock(): Esp32EstadoRespuesta {
  return {
    dispositivo: 'ESP32_DevKitV1_Tanque_Inteligente',
    modo_prototipo_7L: true,
    uptime_seg: 240,
    mediciones: {
      distancia_sensor_cm: 36.2,
      altura_agua_cm: 13.8,
      litros_disponibles: 3.06,
      porcentaje_nivel: 43.7,
      en_zona_ciega_jsn: false,
      turbidez_actual_ntu: 1.2,
      turbidez_referencia_entrada_ntu: 1.1,
      voltaje_pin_io14_v: 2.85,
      voltaje_sensor_ts300b_v: 4.28,
      tapa_abierta: false,
      segundos_tapa_abierta: 0
    },
    autonomia_y_consumo: {
      dias_restantes_estimados: 1.4,
      consumo_promedio_diario_litros: 2.1,
      tasa_consumo_actual_l_h: 0.05,
      horas_agua_almacenada: 4.0
    },
    alertas_reglas_fijas: {
      nivel_bajo: false,
      tapa_abierta_prolongada: false,
      turbidez_alta: false,
      posible_fuga: false,
      agua_estancada: false
    },
    contexto_chatbot: {
      limite_minsa_ntu: 5.0,
      certifica_potabilidad: false,
      nota_limites: 'Solo turbidez fisica',
      recomendacion_sugerida: 'Condiciones normales.'
    }
  };
}

describe('Esp32LocalService', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    TestBed.resetTestingModule();
  });

  it('debe rechazar IP vacia sin llamar a fetch', async () => {
    const service = TestBed.inject(Esp32LocalService);
    const res = await service.obtenerEstadoLocal('   ');

    expect(res).toBeNull();
    expect(service.errorLocal()).toContain('Ingresa la direccion IP');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('debe normalizar la URL y consultar GET /api/estado', async () => {
    const service = TestBed.inject(Esp32LocalService);
    const mock = crearRespuestaMock();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mock), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const res = await service.obtenerEstadoLocal('192.168.1.50/');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.50/api/estado',
      expect.objectContaining({ method: 'GET' })
    );
    expect(res?.dispositivo).toBe('ESP32_DevKitV1_Tanque_Inteligente');
    expect(service.ultimoResultado()?.mediciones.litros_disponibles).toBe(3.06);
    expect(service.cargandoLocal()).toBe(false);
  });

  it('debe disparar POST /api/medir-turbidez y actualizar ultimoResultado', async () => {
    const service = TestBed.inject(Esp32LocalService);
    const mock = crearRespuestaMock();
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify(mock), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const res = await service.forzarMedicionTurbidez('http://192.168.1.50/');

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://192.168.1.50/api/medir-turbidez',
      expect.objectContaining({ method: 'POST' })
    );
    expect(res?.mediciones.turbidez_actual_ntu).toBe(1.2);
    expect(service.errorLocal()).toBeNull();
  });

  it('debe capturar errores HTTP y limpiar cargandoLocal', async () => {
    const service = TestBed.inject(Esp32LocalService);
    fetchSpy.mockResolvedValueOnce(new Response('Error', { status: 500, statusText: 'Internal Server Error' }));

    const res = await service.obtenerEstadoLocal('192.168.1.50');

    expect(res).toBeNull();
    expect(service.errorLocal()).toContain('HTTP 500');
    expect(service.cargandoLocal()).toBe(false);
  });
});
