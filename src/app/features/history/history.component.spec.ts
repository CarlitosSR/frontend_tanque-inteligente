import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { HistoryComponent } from './history.component';
import { SupabaseService } from '../../core/services/supabase.service';
import { HistorialTanque } from '../../core/models/tanque.model';

function crearMuestrasMock(): HistorialTanque[] {
  return [
    {
      id: 2,
      created_at: '2026-11-21T15:00:00Z',
      distancia_cm: 35.0,
      altura_agua_cm: 15.0,
      litros_disponibles: 3.33,
      porcentaje_nivel: 47.6,
      turbidez_ntu: 1.8,
      tapa_abierta: false,
      tasa_consumo_l_h: 0.1,
      dias_autonomia: 1.9,
      horas_almacenada: 5.0,
      alerta_nivel_bajo: false,
      alerta_tapa_abierta: false,
      alerta_turbidez_alta: false,
      alerta_fuga: false,
      alerta_estancada: false
    },
    {
      id: 1,
      created_at: '2026-11-21T14:45:00Z',
      distancia_cm: 33.0,
      altura_agua_cm: 17.0,
      litros_disponibles: 3.77,
      porcentaje_nivel: 53.8,
      turbidez_ntu: 6.2,
      tapa_abierta: true,
      tasa_consumo_l_h: 0.0,
      dias_autonomia: 2.1,
      horas_almacenada: 4.75,
      alerta_nivel_bajo: false,
      alerta_tapa_abierta: false,
      alerta_turbidez_alta: true,
      alerta_fuga: false,
      alerta_estancada: false
    }
  ];
}

describe('HistoryComponent', () => {
  let supabaseMock: {
    historial: ReturnType<typeof signal<HistorialTanque[]>>;
    cargandoHistorial: ReturnType<typeof signal<boolean>>;
    cargarHistorial: ReturnType<typeof vi.fn>;
  };

  let origCreateObjectURL: typeof URL.createObjectURL;
  let origRevokeObjectURL: typeof URL.revokeObjectURL;

  beforeEach(async () => {
    origCreateObjectURL = URL.createObjectURL;
    origRevokeObjectURL = URL.revokeObjectURL;

    supabaseMock = {
      historial: signal<HistorialTanque[]>(crearMuestrasMock()),
      cargandoHistorial: signal(false),
      cargarHistorial: vi.fn().mockResolvedValue(undefined)
    };

    await TestBed.configureTestingModule({
      imports: [HistoryComponent],
      providers: [{ provide: SupabaseService, useValue: supabaseMock }]
    }).compileComponents();
  });

  afterEach(() => {
    URL.createObjectURL = origCreateObjectURL;
    URL.revokeObjectURL = origRevokeObjectURL;
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('debe calcular promedios de nivel, turbidez y conteo de muestras con alarma', () => {
    const fixture = TestBed.createComponent(HistoryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    expect(comp.promedioNivel()).toBeCloseTo(50.7, 1);
    expect(comp.promedioTurbidez()).toBeCloseTo(4.0, 2);
    expect(comp.totalAlertas()).toBe(1);
  });

  it('debe recargar el historial al cambiar el limite de muestras', () => {
    const fixture = TestBed.createComponent(HistoryComponent);
    const comp = fixture.componentInstance;

    comp.cambiarLimite(50);
    expect(comp.limiteSeleccionado()).toBe(50);
    expect(supabaseMock.cargarHistorial).toHaveBeenCalledWith(50);
  });

  it('debe exportar los registros cargados en CSV y JSON', () => {
    const fixture = TestBed.createComponent(HistoryComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance;

    const createSpy = vi.fn(() => 'blob:mock-url');
    const revokeSpy = vi.fn();
    URL.createObjectURL = createSpy;
    URL.revokeObjectURL = revokeSpy;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    comp.exportarCSV();
    comp.exportarJSON();

    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(revokeSpy).toHaveBeenCalledTimes(2);
    expect(fixture.nativeElement.textContent).toContain('CSV');
    expect(fixture.nativeElement.textContent).toContain('JSON');
  });
});
