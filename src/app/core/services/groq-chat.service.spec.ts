import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { GroqChatService } from './groq-chat.service';
import { GroqTokenService } from './groq-token.service';
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

describe('GroqChatService', () => {
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

  it('debe inyectar telemetria, alertas, historial y advertencia MINSA en el system prompt', () => {
    const chatService = TestBed.inject(GroqChatService);
    const prompt = chatService.construirSystemPrompt();

    expect(prompt).toContain('65% (4.55 L disponibles)');
    expect(prompt).toContain('6.4 UNT');
    expect(prompt).toContain('Turbidez Excesiva');
    expect(prompt).toContain('Muestras analizadas: 2');
    expect(prompt).toContain('Bajando (-10.0%)');
    expect(prompt).toContain('NO certifica potabilidad');
    expect(prompt).toContain('D.S. 031-2010-SA');
  });

  it('debe enviar el payload OpenAI-compatible a api.groq.com con Bearer token y limpiar bloques think', async () => {
    const tokenService = TestBed.inject(GroqTokenService);
    const chatService = TestBed.inject(GroqChatService);
    tokenService.guardarToken('gsk_mock_groq_key_1234567890abcd');

    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          model: 'openai/gpt-oss-120b',
          choices: [
            {
              message: {
                role: 'assistant',
                content: '<think>Razonamiento interno</think>El tanque esta al 65% con turbidez de 6.4 UNT.'
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
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((options?.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer gsk_mock_groq_key_1234567890abcd'
    );

    const body = JSON.parse(String(options?.body));
    expect(body.model).toBe('openai/gpt-oss-120b');
    expect(body.stream).toBe(false);
    expect(body.temperature).toBe(0.3);
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('<telemetria_actual>');
    expect(body.messages.at(-1)).toEqual({
      role: 'user',
      content: 'Cual es el estado actual?'
    });

    const msgs = chatService.mensajes();
    expect(msgs).toHaveLength(2);
    expect(msgs[1].rol).toBe('asistente');
    expect(msgs[1].texto).toBe('El tanque esta al 65% con turbidez de 6.4 UNT.');
    expect(msgs[1].modeloUsado).toBe('openai/gpt-oss-120b');
  });

  it('debe ejecutar fallback automatico a qwen/qwen3.8-27b si openai/gpt-oss-120b responde HTTP 503', async () => {
    const tokenService = TestBed.inject(GroqTokenService);
    const chatService = TestBed.inject(GroqChatService);
    tokenService.guardarToken('gsk_fallback_test_key_1234567890');

    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: 'Service Unavailable' } }), { status: 503 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            model: 'qwen/qwen3.8-27b',
            choices: [
              {
                message: {
                  role: 'assistant',
                  content: 'Respuesta servida por el modelo alternativo.'
                }
              }
            ]
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

    await chatService.enviarMensaje('Estado rapido');

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    const segundoBody = JSON.parse(String(fetchSpy.mock.calls[1][1]?.body));
    expect(segundoBody.model).toBe('qwen/qwen3.8-27b');

    const ultimo = chatService.mensajes().at(-1);
    expect(ultimo?.rol).toBe('asistente');
    expect(ultimo?.modeloUsado).toBe('qwen/qwen3.8-27b');
  });

  it('debe bloquear envio sin token y reportar errores HTTP 401 y 429 sin trabar el estado', async () => {
    const tokenService = TestBed.inject(GroqTokenService);
    const chatService = TestBed.inject(GroqChatService);

    await chatService.enviarMensaje('Sin token');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(chatService.errorChat()).toContain('token de Groq');

    tokenService.guardarToken('gsk_error_handling_key_123456789');

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), { status: 401 })
    );
    await chatService.enviarMensaje('Prueba 401');
    expect(chatService.mensajes().at(-1)?.rol).toBe('error');
    expect(chatService.mensajes().at(-1)?.texto).toContain('HTTP 401');
    expect(chatService.enviando()).toBe(false);

    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Rate limit exceeded' } }), { status: 429 })
    );
    await chatService.enviarMensaje('Prueba 429');
    expect(chatService.mensajes().at(-1)?.rol).toBe('error');
    expect(chatService.mensajes().at(-1)?.texto).toContain('HTTP 429');
    expect(chatService.enviando()).toBe(false);
  });

  it('debe validar el token contra GET /openai/v1/models sin consumir cuota', async () => {
    const chatService = TestBed.inject(GroqChatService);
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ id: 'openai/gpt-oss-120b' }, { id: 'qwen/qwen3.8-27b' }]
        }),
        { status: 200 }
      )
    );

    const res = await chatService.probarConexionToken('gsk_valid_check_key_1234567890ab');
    expect(res.ok).toBe(true);
    expect(res.mensaje).toContain('openai/gpt-oss-120b');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: { Authorization: 'Bearer gsk_valid_check_key_1234567890ab' }
      })
    );
  });
});
