import { TestBed } from '@angular/core/testing';
import { TankGaugeComponent } from './tank-gauge.component';

describe('TankGaugeComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TankGaugeComponent]
    }).compileComponents();
  });

  it('debe clasificar turbidez <= 2.5 UNT como Agua clara y nunca como Potable', () => {
    const fixture = TestBed.createComponent(TankGaugeComponent);
    fixture.componentRef.setInput('turbidez', 1.4);
    fixture.detectChanges();

    const comp = fixture.componentInstance;
    expect(comp.etiquetaCalidad()).toBe('Agua clara');
    expect(fixture.nativeElement.textContent).toContain('Agua clara');
    expect(fixture.nativeElement.textContent).not.toContain('Potable');
  });

  it('debe clasificar turbidez moderada (> 2.5 UNT) y critica (> 5.0 UNT)', () => {
    const fixture = TestBed.createComponent(TankGaugeComponent);
    fixture.componentRef.setInput('turbidez', 3.4);
    fixture.detectChanges();
    expect(fixture.componentInstance.etiquetaCalidad()).toBe('Regular');

    fixture.componentRef.setInput('turbidez', 6.8);
    fixture.detectChanges();
    expect(fixture.componentInstance.etiquetaCalidad()).toBe('Turbia (>5 UNT)');
  });

  it('debe acotar el porcentaje normalizado entre 0 y 100', () => {
    const fixture = TestBed.createComponent(TankGaugeComponent);
    fixture.componentRef.setInput('porcentaje', -12);
    expect(fixture.componentInstance.porcentajeNormalizado()).toBe(0);

    fixture.componentRef.setInput('porcentaje', 135);
    expect(fixture.componentInstance.porcentajeNormalizado()).toBe(100);
  });

  it('debe mostrar pines ESP32 DevKit V1 y modo volumetrico segun capacidadTotal', () => {
    const fixture = TestBed.createComponent(TankGaugeComponent);
    fixture.componentRef.setInput('capacidadTotal', 7);
    fixture.detectChanges();

    const htmlProto = fixture.nativeElement.innerHTML as string;
    expect(htmlProto).toContain('Prototipo PET 7 L');
    expect(htmlProto).toContain('GPIO27 / GPIO26');
    expect(htmlProto).toContain('GPIO33 ADC1');

    fixture.componentRef.setInput('capacidadTotal', 1100);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Rotoplas 1100 L');
  });
});
