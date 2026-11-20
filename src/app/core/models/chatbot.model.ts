// Registro persistido localmente en el navegador para el token de Gemini
export interface GeminiTokenRegistro {
  token: string;
  creadoEn: number;
  expiraEn: number;
}

// Mensaje individual de la conversacion en la interfaz del chatbot
export interface ChatMensaje {
  id: string;
  rol: 'usuario' | 'asistente' | 'error';
  texto: string;
  timestamp: Date;
  contextoTimestamp?: string | null;
}

// Resultado de validacion de conectividad contra el endpoint de Gemini
export interface ResultadoPruebaToken {
  ok: boolean;
  mensaje: string;
}

// Estructuras de contrato REST para Gemini API v1beta generateContent
export interface GeminiParte {
  text: string;
}

export interface GeminiContenido {
  role: 'user' | 'model';
  parts: GeminiParte[];
}

export interface GeminiGenerateRequest {
  system_instruction: {
    parts: GeminiParte[];
  };
  contents: GeminiContenido[];
  generationConfig?: {
    temperature?: number;
    maxOutputTokens?: number;
  };
}

export interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  error?: {
    code?: number;
    message?: string;
    status?: string;
  };
}
