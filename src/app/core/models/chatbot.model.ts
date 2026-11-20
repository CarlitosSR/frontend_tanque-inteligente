// Registro persistido localmente en el navegador para el token de Groq API
export interface GroqTokenRegistro {
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
  modeloUsado?: string;
}

// Resultado de validacion de conectividad contra Groq API
export interface ResultadoPruebaToken {
  ok: boolean;
  mensaje: string;
}

// Contratos REST compatibles con OpenAI Chat Completions (Groq API)
export type GroqRol = 'system' | 'user' | 'assistant';

export interface GroqMensajeApi {
  role: GroqRol;
  content: string;
}

export interface GroqChatRequest {
  model: string;
  messages: GroqMensajeApi[];
  temperature?: number;
  max_completion_tokens?: number;
  stream: false;
}

export interface GroqChatResponse {
  id?: string;
  model?: string;
  choices?: Array<{
    index?: number;
    message?: {
      role?: string;
      content?: string | null;
      reasoning?: string | null;
    };
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}

export interface GroqModelsResponse {
  data?: Array<{
    id: string;
  }>;
  error?: {
    message?: string;
    type?: string;
    code?: string;
  };
}
