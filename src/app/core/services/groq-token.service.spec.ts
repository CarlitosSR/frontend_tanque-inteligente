import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import {
  GroqTokenService,
  GROQ_TOKEN_TTL_MS,
  STORAGE_KEY_GROQ_TOKEN
} from './groq-token.service';

describe('GroqTokenService', () => {
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

  it('debe guardar una API key gsk_ en localStorage con vigencia exacta de 3 dias', () => {
    const service = TestBed.inject(GroqTokenService);

    const guardado = service.guardarToken('gsk_test_groq_key_1234567890abcd');
    expect(guardado).toBe(true);
    expect(service.tieneTokenActivo()).toBe(true);
    expect(service.obtenerTokenValido()).toBe('gsk_test_groq_key_1234567890abcd');
    expect(service.tokenEnmascarado()).toBe('gsk_...abcd');

    const raw = localStorage.getItem(STORAGE_KEY_GROQ_TOKEN);
    expect(raw).toBeTruthy();

    const parsed = JSON.parse(raw!);
    expect(parsed.expiraEn - parsed.creadoEn).toBe(GROQ_TOKEN_TTL_MS);
    expect(GROQ_TOKEN_TTL_MS).toBe(3 * 24 * 60 * 60 * 1000);
  });

  it('debe rechazar claves sin prefijo gsk_ o demasiado cortas', () => {
    const service = TestBed.inject(GroqTokenService);

    expect(service.guardarToken('AIzaSyClaveDeGeminiInvalida123456')).toBe(false);
    expect(service.guardarToken('gsk_corta')).toBe(false);
    expect(service.tieneTokenActivo()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_GROQ_TOKEN)).toBeNull();
  });

  it('debe expirar y purgar automaticamente el token tras cumplir 3 dias', () => {
    const service = TestBed.inject(GroqTokenService);
    service.guardarToken('gsk_expiring_token_9876543210xyz');

    vi.advanceTimersByTime(3 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000);
    expect(service.obtenerTokenValido()).toBe('gsk_expiring_token_9876543210xyz');
    expect(service.tieneTokenActivo()).toBe(true);

    vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
    expect(service.obtenerTokenValido()).toBeNull();
    expect(service.tieneTokenActivo()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_GROQ_TOKEN)).toBeNull();
  });

  it('debe limpiar la clave heredada de Gemini al inicializarse y permitir eliminacion manual', () => {
    localStorage.setItem('tanque_inteligente_gemini_token', '{"token":"AIzaSyLegacy12345"}');

    const service = TestBed.inject(GroqTokenService);
    expect(localStorage.getItem('tanque_inteligente_gemini_token')).toBeNull();

    service.guardarToken('gsk_manual_delete_token_123456789');
    expect(service.tieneTokenActivo()).toBe(true);

    service.eliminarToken();
    expect(service.tieneTokenActivo()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEY_GROQ_TOKEN)).toBeNull();
  });
});
