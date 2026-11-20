import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GeminiChatService } from './gemini-chat.service';
import { GeminiTokenService } from './gemini-token.service';
import { SupabaseService } from './supabase.service';
import { Esp32LocalService } from './esp32-local.service';
import {
  AlertaItem,
  ConfiguracionSistema,
  EstadoTanque,
  HistorialTanque
} from '../models/tanque.model';

function crearEstadoMock(): EstadoTanque {
  return {
    id: 1,
    updated_at: '2026-11-20T15:00:00Z',
    modo_prototipo: true,
    uptime_seg: 7200,
    distancia_cm: 18.5,
    altura_agua_cm: 14.2,
    litros_disponibles: 4.55,
    porcentaje_nivel: 65.0,
    turbidez_ntu: 6.4,
    turbidez_referencia_ntu: 1.5,
    tapa_abierta: false,
    segundos_tapa_abierta: 0,
    dias_autonomia: 2.3,
    consumo_promedio_diario_l: 1.98,
    tasa_consumo_l_h: 0.12,
    horas_almacenada: 14.5,
    alerta_nivel_bajo: false,
    alerta_tapa_abierta: false,
    alerta_turbidez_alta: true,
    alerta_fuga: false,
    alerta_estancada: false,
    recomendacion_sugerida: 'Revisar turbidez por superar 5.0 UNT.'
  };
}

function crearHistorialMock(): HistorialTanque[] {
  return [
    {
      id: 2,
      created_at: '2026-11-20T15:00:00Z',
      distancia_cm: 18.5,
      altura_agua_cm: 14.2,
      litros_disponibles: 4.55,
      porcentaje_nivel: 65.0,
      turbidez_ntu: 6.4,
      tapa_abierta: false,
      tasa_consumo_l_h: 0.12,
      dias_autonomia: 2.3,
      horas_almacenada: 14.5,
      alerta_nivel_bajo: false,
      alerta_tapa_abierta: false,
      alerta_turbidez_alta: true,
      alerta_fuga: false,
      alerta_estancada: false
    },
    {
      id: 1,
      created_at: '2026-11-20T14:45:00Z',
      distancia_cm: 16.0,
      altura_agua_cm: 16.7,
      litros_disponibles: 5.25,
      porcentaje_nivel: 75.0,
      turbidez_ntu: 2.1,
      tapa_abierta: false,
      tasa_consumo_l_h: 0.15,
      dias_autonomia: 2.6,
      horas_almacenada: 14.25,
      alerta_nivel_bajo: false,
      alerta_tapa_abierta: false,
      alerta_turbidez_alta: false,
      alerta_fuga: false,
      alerta_estancada: false
    }
  ];
}

describe('GeminiChatService', () => {
  let supabaseMock: {
    estadoActual: ReturnType<typeof signal<EstadoTanque | null>>;
    historial: ReturnType<typeof signal<HistorialTanque[]>>;
    alertasActivas: ReturnType<typeof signal<AlertaItem[]>>;
    calidadAgua: ReturnType<typeof signal<{ estado: string; etiqueta: string; color: string }>>;
    capacidadNominalLitros: ReturnType<typeof signal<number>>;
    configuracion: ReturnType<typeof signal<ConfiguracionSistema>>;
    cargarHistorial: ReturnType<typeof vi.fn>;
  };

  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    localStorage.clear();

    supabaseMock = {
      estadoActual: signal<EstadoTanque | null>(crearEstadoMock()),
      historial: signal<HistorialTanque[]>(crearHistorialMock()),
      alertasActivas: signal<AlertaItem[]>([
        {
          id: 'turbidez_alta',
          titulo: 'Turbidez Excesiva',
          mensaje: 'Turbidez actual de 6.4 UNT supera el limite seguro permitido de 5.0 UNT.',
          severidad: 'critica',
          activa: true,
          normativa: 'D.S. 031-2010-SA'
        }
      ]),
      calidadAgua: signal({
        estado: 'critica',
        etiqueta: 'Alerta Sanitaria (> 5 UNT)',
        color: 'var(--color-danger)'
      }),
      capacidadNominalLitros: signal(7),
      configuracion: signal<ConfiguracionSistema>({
        supabaseUrl: 'https://example.supabase.co',
        supabaseAnonKey: 'anon-key',
        esp32Ip: '',
        intervaloRefrescoSeg: 15,
        modoTanque: 'prototipo_7l'
      }),
      cargarHistorial: vi.fn().mockResolvedValue(undefined)
    };

    TestBed.configureTestingModule({
      providers: [
        { provide: SupabaseService, useValue: supabaseMock },
        {
          provide: Esp32LocalService,
          useValue: { ultimoResultado: signal(null) }
        }
      ]
    });

    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('debe inyectar estado actual, alertas, historial y advertencia MINSA en el system prompt', () => {
    const chatService = TestBed.inject(GeminiChatService);
    const prompt = chatService.construirSystemPrompt();

    expect(prompt).toContain('65% (4.55 L disponibles)');
    expect(prompt).toContain('6.4 UNT');
    expect(prompt).toContain('Turbidez Excesiva');
    expect(prompt).toContain('Muestras analizadas: 2');
    expect(prompt).toContain('Bajando (-10.0%)');
    expect(prompt).toContain('NO certifica potabilidad');
    expect(prompt).toContain('D.S. 031-2010-SA');
  });

  it('debe enviar el request a gemini-3.8-flash con cabecera x-goog-api-key y system_instruction', async () => {
    const tokenService = TestBed.inject(GeminiTokenService);
    const chatService = TestBed.inject(GeminiChatService);
    tokenService.guardarToken('AIzaSyMockKeyGemini38Flash');

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          candidates: [
            {
              content: {
                parts: [{ text: 'El tanque esta al 65% con alerta de turbidez en 6.4 UNT.' }]
              }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await chatService.enviarMensaje('Cual es el estado actual?');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent'
    );
    expect((options?.headers as Record<string, string>)['x-goog-api-key']).toBe(
      'AIzaSyMockKeyGemini38Flash'
    );

    const body = JSON.parse(String(options?.body));
    expect(body.system_instruction.parts[0].text).toContain('<telemetria_actual>');
    expect(body.contents.at(-1).parts[0].text).toBe('Cual es el estado actual?');

    const msgs = chatService.mensajes();
    expect(msgs).toHaveLength(2);
    expect(msgs[0].rol).toBe('usuario');
    expect(msgs[1].rol).toBe('asistente');
    expect(msgs[1].texto).toContain('6.4 UNT');
  });

  it('debe bloquear envio si no existe token valido', async () => {
    const chatService = TestBed.inject(GeminiChatService);

    await chatService.enviarMensaje('Hola');

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(chatService.errorChat()).toContain('token de Gemini');
    expect(chatService.mensajes()).toHaveLength(0);
  });

  it('debe informar error claro ante HTTP 401 y HTTP 429', async () => {
    const tokenService = TestBed.inject(GeminiTokenService);
    const chatService = TestBed.inject(GeminiChatService);
    tokenService.guardarToken('AIzaSyInvalidKeyTest1234');

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'API key not valid' } }), { status: 401 })
    );
    await chatService.enviarMensaje('Prueba 401');
    expect(chatService.mensajes().at(-1)?.rol).toBe('error');
    expect(chatService.mensajes().at(-1)?.texto).toContain('401');

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Rate limit' } }), { status: 429 })
    );
    await chatService.enviarMensaje('Prueba 429');
    expect(chatService.mensajes().at(-1)?.rol).toBe('error');
    expect(chatService.mensajes().at(-1)?.texto).toContain('429');
  });

  it('debe validar conectividad del token con GET al modelo sin consumir cuota', async () => {
    const chatService = TestBed.inject(GeminiChatService);
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({ name: 'models/gemini-3.8-flash' }), { status: 200 }));

    const res = await chatService.probarConexionToken('AIzaSyValidCheckToken123');
    expect(res.ok).toBe(true);
    expect(res.mensaje).toContain('gemini-3.8-flash');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash',
      expect.objectContaining({ method: 'GET' })
    );
  });
});
