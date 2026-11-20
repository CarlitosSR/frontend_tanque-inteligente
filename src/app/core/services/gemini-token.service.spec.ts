import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  GeminiTokenService,
  GEMINI_TOKEN_TTL_MS,
  STORAGE_KEY_GEMINI_TOKEN
} from './gemini-token.service';

describe('GeminiTokenService', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-20T12:00:00Z'));
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    vi.useRealTimers();
    localStorage.clear();
  });

  it('debe guardar el token en localStorage con vigencia exacta de 3 dias', () => {
    const service = TestBed.inject(GeminiTokenService);

    const guardado = service.guardarToken('AIzaSyTestToken1234567890');
    expect(guardado).toBe(true);
    expect(service.tieneTokenActivo()).toBe(true);
    expect(service.obtenerTokenValido()).toBe('AIzaSyTestToken1234567890');
    expect(service.tokenEnmascarado()).toBe('AIza...7890');

    const raw = localStorage.getItem(STORAGE_KEY_GEMINI_TOKEN);
    expect(raw).toBeTruthy();

    const parsed = JSON.parse(raw!);
    expect(parsed.expiraEn - parsed.creadoEn).toBe(GEMINI_TOKEN_TTL_MS);
    expect(GEMINI_TOKEN_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('debe expirar y purgar automaticamente el token tras cumplir 3 dias', () => {
    const service = TestBed.inject(GeminiTokenService);
    service.guardarToken('AIzaSyExpiringToken987654');

    // A los 2 dias y 23 horas aun debe ser valido
    vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
    expect(service.obtenerTokenValido()).toBe('AIzaSyExpiringToken987654');
    expect(service.tieneTokenActivo()).toBe(true);

    // Al cruzar las 72 horas exactas debe expirar y borrarse de localStorage
    vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
    expect(service.obtenerTokenValido()).toBeNull();
    expect(service.tieneTokenActivo()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_GEMINI_TOKEN)).toBeNull();
  });

  it('debe rechazar tokens demasiado cortos y permitir eliminacion manual', () => {
    const service = TestBed.inject(GeminiTokenService);

    expect(service.guardarToken('corto')).toBe(false);
    expect(service.tieneTokenActivo()).toBe(false);

    service.guardarToken('AIzaSyValidTokenManualDelete');
    expect(service.tieneTokenActivo()).toBe(true);

    service.eliminarToken();
    expect(service.tieneTokenActivo()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_GEMINI_TOKEN)).toBeNull();
  });

  it('debe ignorar y limpiar un token ya vencido al inicializarse', () => {
    const vencido = {
      token: 'AIzaSyTokenYaExpirado123',
      creadoEn: Date.now() - 4 * 24 * 60 * 60 * 1000,
      expiraEn: Date.now() - 1000
    };
    localStorage.setItem(STORAGE_KEY_GEMINI_TOKEN, JSON.stringify(vencido));

    const service = TestBed.inject(GeminiTokenService);
    expect(service.tieneTokenActivo()).toBe(false);
    expect(service.obtenerTokenValido()).toBeNull();
    expect(localStorage.getItem(STORAGE_KEY_GEMINI_TOKEN)).toBeNull();
  });
});
