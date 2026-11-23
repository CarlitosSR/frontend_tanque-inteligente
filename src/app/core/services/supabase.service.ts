import { Injectable, signal, computed, inject, DestroyRef } from '@angular/core';
import { createClient, SupabaseClient, RealtimeChannel } from '@supabase/supabase-js';
import { environment } from '../../../environments/environment';
import { EstadoTanque, HistorialTanque, AlertaItem, ConfiguracionSistema } from '../models/tanque.model';

const STORAGE_KEY_CONFIG = 'tanque_inteligente_config';

@Injectable({
  providedIn: 'root'
})
export class SupabaseService {
  private readonly destroyRef = inject(DestroyRef);

  // Configuracion activa persistida en localStorage o tomada de environment
  readonly configuracion = signal<ConfiguracionSistema>(this.cargarConfiguracionInicial());

  // Senales de estado reactivas
  readonly estadoActual = signal<EstadoTanque | null>(null);
  readonly historial = signal<HistorialTanque[]>([]);
  readonly cargando = signal<boolean>(false);
  readonly cargandoHistorial = signal<boolean>(false);
  readonly conectadoRealtime = signal<boolean>(false);
  readonly errorConexion = signal<string | null>(null);
  readonly ultimaActualizacion = signal<Date | null>(null);

  // Instancia de cliente Supabase y canal en tiempo real
  private supabaseClient: SupabaseClient | null = null;
  private realtimeChannel: RealtimeChannel | null = null;
  private pollingTimer: number | null = null;
  private relojTimer: number | null = null;
  private readonly ahoraMs = signal<number>(Date.now());

  // Evaluacion reactiva de estado en linea del nodo segun frescura de updated_at
  readonly nodoEnLinea = computed<boolean>(() => {
    const estado = this.estadoActual();
    if (!estado?.updated_at) return false;
    const syncMs = Date.parse(estado.updated_at);
    if (Number.isNaN(syncMs)) return false;
    const umbralSeg = Math.max(90, (this.configuracion().intervaloRefrescoSeg || 15) * 4);
    return (this.ahoraMs() - syncMs) < umbralSeg * 1000;
  });

  readonly tiempoSinSyncTexto = computed<string>(() => {
    const estado = this.estadoActual();
    if (!estado?.updated_at) return 'sin enlace';
    const syncMs = Date.parse(estado.updated_at);
    if (Number.isNaN(syncMs)) return 'sin enlace';
    const diffSeg = Math.max(0, Math.floor((this.ahoraMs() - syncMs) / 1000));
    if (diffSeg < 60) return `hace ${diffSeg}s`;
    const diffMin = Math.floor(diffSeg / 60);
    if (diffMin < 60) return `hace ${diffMin}m`;
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) return `hace ${diffHoras}h`;
    const diffDias = Math.floor(diffHoras / 24);
    return `hace ${diffDias}d`;
  });

  // Evaluacion reactiva de la calidad del agua segun norma MINSA (D.S. 031-2010-SA)
  readonly calidadAgua = computed(() => {
    const estado = this.estadoActual();
    if (!estado) {
      return { estado: 'desconocido', etiqueta: 'Sin datos', color: 'var(--text-tertiary)' };
    }

    const ntu = Number(estado.turbidez_ntu);
    if (estado.alerta_turbidez_alta || ntu > environment.limiteMinsaTurbidezNtu) {
      return { estado: 'critica', etiqueta: 'Alerta Sanitaria (> 5 UNT)', color: 'var(--status-crit)' };
    }
    if (ntu > 2.5) {
      return { estado: 'moderada', etiqueta: 'Calidad Regular (2.5 - 5 UNT)', color: 'var(--status-warn)' };
    }
    return { estado: 'optima', etiqueta: 'Agua Clara (< 2.5 UNT)', color: 'var(--status-normal)' };
  });

  // Lista calculada de alertas sanitarias activas
  readonly alertasActivas = computed<AlertaItem[]>(() => {
    const estado = this.estadoActual();
    if (!estado) return [];

    const items: AlertaItem[] = [];

    if (estado.alerta_nivel_bajo) {
      items.push({
        id: 'nivel_bajo',
        titulo: 'Nivel Critico Bajo',
        mensaje: `El nivel del tanque es del ${estado.porcentaje_nivel}%. Riesgo de desabastecimiento.`,
        severidad: 'critica',
        activa: true,
        normativa: 'Reserva Minima Requerida'
      });
    }

    if (estado.alerta_tapa_abierta) {
      items.push({
        id: 'tapa_abierta',
        titulo: 'Tapa Abierta Prolongada',
        mensaje: `Tapa abierta durante ${estado.segundos_tapa_abierta} segundos. Riesgo de ingreso de vectores (Dengue) o contaminantes.`,
        severidad: 'critica',
        activa: true,
        normativa: 'Prevencion Sanitaria MINSA'
      });
    }

    if (estado.alerta_turbidez_alta) {
      items.push({
        id: 'turbidez_alta',
        titulo: 'Turbidez Excesiva',
        mensaje: `Turbidez actual de ${estado.turbidez_ntu} UNT supera el limite seguro permitido de 5.0 UNT.`,
        severidad: 'critica',
        activa: true,
        normativa: 'D.S. 031-2010-SA'
      });
    }

    if (estado.alerta_fuga) {
      items.push({
        id: 'posible_fuga',
        titulo: 'Sospecha de Fuga de Agua',
        mensaje: `Tasa de flujo inusual de ${estado.tasa_consumo_l_h} L/h detectada sin recarga activa.`,
        severidad: 'advertencia',
        activa: true,
        normativa: 'Control de Perdidas Hidricas'
      });
    }

    if (estado.alerta_estancada) {
      items.push({
        id: 'agua_estancada',
        titulo: 'Agua Estancada',
        mensaje: `El agua ha permanecido almacenada durante ${estado.horas_almacenada} horas (> 3 dias). Riesgo de biopelicula.`,
        severidad: 'advertencia',
        activa: true,
        normativa: 'Control de Proliferacion Bacteriana'
      });
    }

    return items;
  });

  // Capacidad nominal segun el modo seleccionado
  readonly capacidadNominalLitros = computed(() => {
    const config = this.configuracion();
    return config.modoTanque === 'real_1100l'
      ? environment.tanqueRealCapacidadLitros
      : environment.tanquePrototipoCapacidadLitros;
  });

  constructor() {
    this.inicializarCliente();
    this.iniciarSuscripcion();
    this.cargarEstadoActual();
    this.cargarHistorial(25);
    this.configurarPolling();

    if (typeof window !== 'undefined') {
      this.relojTimer = window.setInterval(() => {
        this.ahoraMs.set(Date.now());
      }, 15000);
    }

    this.destroyRef.onDestroy(() => {
      this.destruirSuscripcion();
      if (this.relojTimer !== null) {
        clearInterval(this.relojTimer);
        this.relojTimer = null;
      }
    });
  }

  // Inicializa el cliente oficial de Supabase
  private inicializarCliente(): void {
    const conf = this.configuracion();
    if (!conf.supabaseUrl || !conf.supabaseAnonKey) {
      this.errorConexion.set('Faltan credenciales de conexion para Supabase');
      return;
    }

    try {
      this.supabaseClient = createClient(conf.supabaseUrl, conf.supabaseAnonKey, {
        auth: { persistSession: false },
        realtime: { params: { eventsPerSecond: 10 } }
      });
      this.errorConexion.set(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorConexion.set(`Error al instanciar cliente de Supabase: ${msg}`);
    }
  }

  // Suscripcion a cambios en tiempo real sobre la tabla de estado unico (id = 1)
  private iniciarSuscripcion(): void {
    if (!this.supabaseClient) return;

    try {
      this.realtimeChannel = this.supabaseClient
        .channel('canal-estado-tanque-live')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'estado_tanque',
            filter: 'id=eq.1'
          },
          (payload) => {
            if (payload.new && typeof payload.new === 'object') {
              this.estadoActual.set(payload.new as EstadoTanque);
              const ahora = new Date();
              this.ultimaActualizacion.set(ahora);
              this.ahoraMs.set(ahora.getTime());
              this.conectadoRealtime.set(true);
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            this.conectadoRealtime.set(true);
          } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
            this.conectadoRealtime.set(false);
          }
        });
    } catch (err) {
      this.conectadoRealtime.set(false);
    }
  }

  // Consulta manual o inicial del estado actual
  async cargarEstadoActual(): Promise<void> {
    if (!this.supabaseClient) return;

    this.cargando.set(true);
    try {
      const { data, error } = await this.supabaseClient
        .from('estado_tanque')
        .select('*')
        .eq('id', 1)
        .single();

      if (error) {
        this.errorConexion.set(error.message);
      } else if (data) {
        this.estadoActual.set(data as EstadoTanque);
        const ahora = new Date();
        this.ultimaActualizacion.set(ahora);
        this.ahoraMs.set(ahora.getTime());
        this.errorConexion.set(null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorConexion.set(`Fallo de consulta al estado: ${msg}`);
    } finally {
      this.cargando.set(false);
    }
  }

  // Consulta el historial de telemetria ordenado descendentemente
  async cargarHistorial(limite = 25): Promise<void> {
    if (!this.supabaseClient) return;

    this.cargandoHistorial.set(true);
    try {
      const { data, error } = await this.supabaseClient
        .from('historial_tanque')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limite);

      if (error) {
        this.errorConexion.set(error.message);
      } else if (data) {
        this.historial.set(data as HistorialTanque[]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.errorConexion.set(`Fallo al cargar historial: ${msg}`);
    } finally {
      this.cargandoHistorial.set(false);
    }
  }

  // Configura sondeo continuo como respaldo solo cuando WebSocket Realtime no esta activo
  private configurarPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
    }

    const conf = this.configuracion();
    const intervaloMs = Math.max(5, conf.intervaloRefrescoSeg || 15) * 1000;

    this.pollingTimer = window.setInterval(() => {
      if (!this.conectadoRealtime()) {
        this.cargarEstadoActual();
      }
    }, intervaloMs);
  }

  // Prueba credenciales candidatas en un cliente aislado sin modificar la sesion activa
  async probarCredenciales(url: string, anonKey: string): Promise<{ ok: boolean; mensaje: string }> {
    const cleanUrl = url.trim();
    const cleanKey = anonKey.trim();
    if (!cleanUrl || !cleanKey) {
      return { ok: false, mensaje: 'Ingresa la URL y la Anon Key de Supabase.' };
    }

    try {
      const tempClient = createClient(cleanUrl, cleanKey, {
        auth: { persistSession: false }
      });
      const { data, error } = await tempClient
        .from('estado_tanque')
        .select('id')
        .eq('id', 1)
        .single();

      if (error) {
        return { ok: false, mensaje: error.message };
      }
      if (data) {
        return { ok: true, mensaje: 'OK: Fila id=1 leida exitosamente' };
      }
      return { ok: false, mensaje: 'Sin datos de estado en fila id=1' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, mensaje: `Fallo de conexion con Supabase: ${msg}` };
    }
  }

  // Actualiza la configuracion y reinicia las conexiones
  actualizarConfiguracion(nuevaConfig: ConfiguracionSistema): void {
    const configNormalizada: ConfiguracionSistema = {
      ...nuevaConfig,
      supabaseUrl: nuevaConfig.supabaseUrl.trim(),
      supabaseAnonKey: nuevaConfig.supabaseAnonKey.trim(),
      esp32Ip: nuevaConfig.esp32Ip.trim(),
      intervaloRefrescoSeg: Math.min(120, Math.max(5, Number(nuevaConfig.intervaloRefrescoSeg) || 15))
    };
    this.configuracion.set(configNormalizada);
    try {
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(configNormalizada));
    } catch {
      // Ignorar fallo de almacenamiento local
    }

    this.destruirSuscripcion();
    this.inicializarCliente();
    this.iniciarSuscripcion();
    this.cargarEstadoActual();
    this.cargarHistorial(25);
    this.configurarPolling();
  }

  // Carga inicial de configuracion
  private cargarConfiguracionInicial(): ConfiguracionSistema {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          supabaseUrl: parsed.supabaseUrl || environment.supabaseUrl,
          supabaseAnonKey: parsed.supabaseAnonKey || environment.supabaseAnonKey,
          esp32Ip: parsed.esp32Ip || environment.esp32DefaultIp,
          intervaloRefrescoSeg: parsed.intervaloRefrescoSeg || 15,
          modoTanque: parsed.modoTanque || 'prototipo_7l'
        };
      }
    } catch {
      // Usar defaults si falla parseo
    }

    return {
      supabaseUrl: environment.supabaseUrl,
      supabaseAnonKey: environment.supabaseAnonKey,
      esp32Ip: environment.esp32DefaultIp,
      intervaloRefrescoSeg: 15,
      modoTanque: 'prototipo_7l'
    };
  }

  // Limpieza de recursos y timers
  private destruirSuscripcion(): void {
    if (this.realtimeChannel && this.supabaseClient) {
      this.supabaseClient.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }
}
