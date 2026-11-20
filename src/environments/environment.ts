// Configuracion de entorno para produccion y ejecucion base
export const environment = {
  production: true,
  supabaseUrl: 'https://qdiscbtpsbvpbrndjsnb.supabase.co',
  supabaseAnonKey: 'sb_publishable_ZT_wFhxYrDnJgxucb-WBfQ_FDElItcX',
  esp32DefaultIp: '',
  tanquePrototipoCapacidadLitros: 7.0,
  tanqueRealCapacidadLitros: 1100.0,
  limiteMinsaTurbidezNtu: 5.0,
  geminiModel: 'gemini-3.8-flash',
  geminiApiBaseUrl: 'https://generativelanguage.googleapis.com/v1beta/models',
  geminiTokenTtlDias: 3
};
