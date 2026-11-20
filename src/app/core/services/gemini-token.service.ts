import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { environment } from '../../../environments/environment';
import { GeminiTokenRegistro } from '../models/chatbot.model';

export const STORAGE_KEY_GEMINI_TOKEN = 'tanque_inteligente_gemini_token';
const MS_POR_DIA = 24 * 60 * 60 * 1000;
export const GEMINI_TOKEN_TTL_MS = environment.geminiTokenTtlDias * MS_POR_DIA;

@Injectable({
  providedIn: 'root'
})
export class GeminiTokenService {
  private readonly destroyRef = inject(DestroyRef);

  // Registro activo en memoria sincronizado con localStorage
  private readonly registro = signal<GeminiTokenRegistro | null>(this.cargarDesdeStorage());

  // Marca de tiempo reactiva para recalcular vigencia sin recargar la pagina
  private readonly ahoraMs = signal<number>(Date.now());
  private vigenciaTimer: number | null = null;

  // Indica si existe un token vigente (no expirado)
  readonly tieneTokenActivo = computed<boolean>(() => {
    const reg = this.registro();
    if (!reg) return false;
    return this.ahoraMs() < reg.expiraEn;
  });

  // Fecha exacta de expiracion del token actual
  readonly expiraEnDate = computed<Date | null>(() => {
    const reg = this.registro();
    if (!reg || this.ahoraMs() >= reg.expiraEn) return null;
    return new Date(reg.expiraEn);
  });

  // Representacion enmascarada segura para mostrar en la interfaz
  readonly tokenEnmascarado = computed<string>(() => {
    const reg = this.registro();
    if (!reg || this.ahoraMs() >= reg.expiraEn) return '';
    const t = reg.token;
    if (t.length < 10) return '****';
    return `${t.slice(0, 4)}...${t.slice(-4)}`;
  });

  // Texto legible con el tiempo restante hasta la expiracion de 3 dias
  readonly tiempoRestanteTexto = computed<string>(() => {
    const reg = this.registro();
    if (!reg) return '';
    const restanteMs = reg.expiraEn - this.ahoraMs();
    if (restanteMs <= 0) return 'Expirado';

    const totalMinutos = Math.floor(restanteMs / 60000);
    const dias = Math.floor(totalMinutos / (60 * 24));
    const horas = Math.floor((totalMinutos % (60 * 24)) / 60);
    const minutos = totalMinutos % 60;

    if (dias > 0) return `${dias}d ${horas}h`;
    if (horas > 0) return `${horas}h ${minutos}m`;
    if (minutos > 0) return `${minutos}m`;
    return '< 1m';
  });

  constructor() {
    this.iniciarControlVigencia();

    this.destroyRef.onDestroy(() => {
      if (this.vigenciaTimer !== null) {
        clearInterval(this.vigenciaTimer);
        this.vigenciaTimer = null;
      }
    });
  }

  // Guarda el token unicamente en el navegador con caducidad de 3 dias
  guardarToken(tokenRaw: string): boolean {
    const limpio = tokenRaw.trim();
    if (limpio.length < 10) {
      return false;
    }

    const ahora = Date.now();
    const nuevoRegistro: GeminiTokenRegistro = {
      token: limpio,
      creadoEn: ahora,
      expiraEn: ahora + GEMINI_TOKEN_TTL_MS
    };

    try {
      localStorage.setItem(STORAGE_KEY_GEMINI_TOKEN, JSON.stringify(nuevoRegistro));
    } catch {
      return false;
    }

    this.ahoraMs.set(ahora);
    this.registro.set(nuevoRegistro);
    return true;
  }

  // Devuelve el token solo si sigue vigente; si expiro lo purga de inmediato
  obtenerTokenValido(): string | null {
    const ahora = Date.now();
    this.ahoraMs.set(ahora);

    const reg = this.registro();
    if (!reg) {
      return null;
    }

    if (ahora >= reg.expiraEn) {
      this.eliminarToken();
      return null;
    }

    return reg.token;
  }

  // Elimina el token del almacenamiento local y limpia las senales
  eliminarToken(): void {
    try {
      localStorage.removeItem(STORAGE_KEY_GEMINI_TOKEN);
    } catch {
      // Ignorar errores de acceso al almacenamiento
    }
    this.registro.set(null);
    this.ahoraMs.set(Date.now());
  }

  // Refresca el reloj y purga automaticamente si el token vencio
  verificarVigencia(): void {
    const ahora = Date.now();
    this.ahoraMs.set(ahora);
    const reg = this.registro();
    if (reg && ahora >= reg.expiraEn) {
      this.eliminarToken();
    }
  }

  // Lee y valida el registro guardado en localStorage al iniciar el servicio
  private cargarDesdeStorage(): GeminiTokenRegistro | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_GEMINI_TOKEN);
      if (!raw) return null;

      const parsed = JSON.parse(raw) as Partial<GeminiTokenRegistro>;
      if (
        typeof parsed.token !== 'string' ||
        typeof parsed.creadoEn !== 'number' ||
        typeof parsed.expiraEn !== 'number' ||
        parsed.token.trim().length < 10
      ) {
        localStorage.removeItem(STORAGE_KEY_GEMINI_TOKEN);
        return null;
      }

      if (Date.now() >= parsed.expiraEn) {
        localStorage.removeItem(STORAGE_KEY_GEMINI_TOKEN);
        return null;
      }

      return {
        token: parsed.token.trim(),
        creadoEn: parsed.creadoEn,
        expiraEn: parsed.expiraEn
      };
    } catch {
      try {
        localStorage.removeItem(STORAGE_KEY_GEMINI_TOKEN);
      } catch {
        // Ignorar fallo secundario
      }
      return null;
    }
  }

  // Revisa cada minuto si el token guardado ha superado las 72 horas
  private iniciarControlVigencia(): void {
    if (typeof window === 'undefined') return;
    this.vigenciaTimer = window.setInterval(() => {
      this.verificarVigencia();
    }, 60000);
  }
}
