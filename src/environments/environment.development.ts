// Configuracion de entorno para desarrollo local
export const environment = {
  production: false,
  supabaseUrl: 'https://qdiscbtpsbvpbrndjsnb.supabase.co',
  supabaseAnonKey: 'sb_publishable_ZT_wFhxYrDnJgxucb-WBfQ_FDElItcX',
  esp32DefaultIp: '',
  tanquePrototipoCapacidadLitros: 7.0,
  tanqueRealCapacidadLitros: 1100.0,
  limiteMinsaTurbidezNtu: 5.0,
  groqApiBaseUrl: 'https://api.groq.com/openai/v1',
  groqDefaultModel: 'openai/gpt-oss-120b',
  groqAvailableModels: ['openai/gpt-oss-120b', 'qwen/qwen3.8-27b'] as readonly string[],
  groqTokenTtlDias: 3
};
