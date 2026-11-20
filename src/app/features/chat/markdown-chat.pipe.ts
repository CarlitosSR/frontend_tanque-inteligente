import { Pipe, PipeTransform } from '@angular/core';
import { Marked, Renderer, RendererObject, Tokens } from 'marked';

// Escapa caracteres HTML reservados para neutralizar etiquetas crudas
function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Verifica que una URL use exclusivamente esquemas web seguros
function esUrlSegura(href: string): boolean {
  try {
    const parsed = new URL(href.trim());
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

// Renderer GFM personalizado (objeto plano para Marked#use) con prevencion XSS
const scadaRenderer: RendererObject = {
  html(token: Tokens.HTML | Tokens.Tag): string {
    return escaparHtml(token.raw);
  },

  link(token: Tokens.Link): string {
    const contenido = this.parser.parseInline(token.tokens);
    const href = token.href ?? '';
    if (!esUrlSegura(href)) {
      return contenido;
    }

    const tituloAttr = token.title ? ` title="${escaparHtml(token.title)}"` : '';
    return `<a href="${escaparHtml(href)}"${tituloAttr} target="_blank" rel="noopener noreferrer">${contenido}</a>`;
  },

  table(token: Tokens.Table): string {
    const tablaBase = Renderer.prototype.table.call(this, token);
    return `<div class="md-table-wrap">${tablaBase}</div>`;
  }
};

const markedScada = new Marked({
  gfm: true,
  breaks: false,
  async: false
});
markedScada.use({ renderer: scadaRenderer });

// Normaliza saltos extras y espacios finales tipicos de modelos como gpt-oss-120b
function normalizarMarkdown(entrada: string): string {
  return entrada
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

@Pipe({
  name: 'markdownChat',
  standalone: true,
  pure: true
})
export class MarkdownChatPipe implements PipeTransform {
  transform(valor: string | null | undefined): string {
    if (!valor || !valor.trim()) {
      return '';
    }

    const limpio = normalizarMarkdown(valor);
    return markedScada.parse(limpio) as string;
  }
}
