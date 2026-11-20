import {
  Component,
  ElementRef,
  effect,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService } from '../../core/services/supabase.service';
import { GroqTokenService } from '../../core/services/groq-token.service';
import { GroqChatService } from '../../core/services/groq-chat.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [FormsModule, DatePipe, DecimalPipe],
  templateUrl: './chat.component.html',
  styleUrl: './chat.component.css'
})
export class ChatComponent {
  readonly supabase = inject(SupabaseService);
  readonly tokenService = inject(GroqTokenService);
  readonly chatService = inject(GroqChatService);

  readonly diasVigencia = environment.groqTokenTtlDias;

  // Estado local del formulario de mensaje y gestion de token
  readonly textoPregunta = signal<string>('');
  readonly tokenInput = signal<string>('');
  readonly mostrarTokenTexto = signal<boolean>(false);
  readonly editandoToken = signal<boolean>(false);

  readonly probandoToken = signal<boolean>(false);
  readonly resultadoPrueba = signal<string | null>(null);
  readonly exitoPrueba = signal<boolean>(false);
  readonly avisoToken = signal<string | null>(null);

  readonly consultasRapidas: readonly string[] = [
    'Dame un resumen del estado actual del tanque',
    'Que indica la turbidez actual segun la norma MINSA? El agua es potable?',
    'Cuantos dias de autonomia quedan y hay indicios de fuga o estancamiento?',
    'Analiza la tendencia de nivel y turbidez del historial reciente'
  ];

  private readonly mensajesContainer = viewChild<ElementRef<HTMLDivElement>>('mensajesContainer');

  constructor() {
    this.tokenService.verificarVigencia();

    // Desplaza automaticamente al ultimo mensaje cuando cambia el hilo o el estado de envio
    effect(() => {
      this.chatService.mensajes();
      this.chatService.enviando();
      queueMicrotask(() => {
        const el = this.mensajesContainer()?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

  async enviar(): Promise<void> {
    const texto = this.textoPregunta().trim();
    if (!texto || this.chatService.enviando()) return;

    this.textoPregunta.set('');
    await this.chatService.enviarMensaje(texto);
  }

  async usarConsultaRapida(consulta: string): Promise<void> {
    if (this.chatService.enviando()) return;
    await this.chatService.enviarMensaje(consulta);
  }

  manejarTeclaComposer(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.enviar();
    }
  }

  cambiarModelo(modelo: string): void {
    this.chatService.seleccionarModelo(modelo);
  }

  abrirEditorToken(): void {
    this.tokenInput.set('');
    this.resultadoPrueba.set(null);
    this.avisoToken.set(null);
    this.editandoToken.set(true);
  }

  cancelarEditorToken(): void {
    this.tokenInput.set('');
    this.resultadoPrueba.set(null);
    this.avisoToken.set(null);
    this.editandoToken.set(false);
  }

  async probarTokenIngresado(): Promise<void> {
    const valor = this.tokenInput().trim();
    if (!valor) return;

    this.probandoToken.set(true);
    this.resultadoPrueba.set(null);
    this.avisoToken.set(null);

    try {
      const res = await this.chatService.probarConexionToken(valor);
      this.exitoPrueba.set(res.ok);
      this.resultadoPrueba.set(res.mensaje);
    } finally {
      this.probandoToken.set(false);
    }
  }

  guardarToken(): void {
    const ok = this.tokenService.guardarToken(this.tokenInput());
    if (!ok) {
      this.avisoToken.set('Ingresa una API Key valida de Groq (debe iniciar con gsk_ y tener al menos 20 caracteres).');
      return;
    }

    this.tokenInput.set('');
    this.mostrarTokenTexto.set(false);
    this.resultadoPrueba.set(null);
    this.avisoToken.set(null);
    this.editandoToken.set(false);
    this.chatService.errorChat.set(null);
  }

  eliminarTokenActual(): void {
    this.tokenService.eliminarToken();
    this.tokenInput.set('');
    this.resultadoPrueba.set(null);
    this.editandoToken.set(false);
  }

  refrescarContexto(): void {
    this.supabase.cargarEstadoActual();
    this.supabase.cargarHistorial(25);
  }
}
