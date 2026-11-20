import { MarkdownChatPipe } from './markdown-chat.pipe';

describe('MarkdownChatPipe', () => {
  const pipe = new MarkdownChatPipe();

  it('debe renderizar negritas, listas anidadas y listas numeradas dentro de vinetas', () => {
    const respuestaModelo = [
      '**Resumen del estado actual del tanque (2026-11-17 21:01 UTC)**  ',
      '',
      '',
      '- **Turbidez:** 664.1 UNT.  ',
      '  - **Clasificacion:** Alerta Sanitaria.  ',
      '- **Recomendacion del firmware:**  ',
      '  1. El agua presenta turbidez excesiva (> 5 UNT).  ',
      '  2. Programe el lavado del tanque.'
    ].join('\n');

    const html = pipe.transform(respuestaModelo);

    expect(html).toContain('<strong>Resumen del estado actual del tanque (2026-11-17 21:01 UTC)</strong>');
    expect(html).toContain('<ul>');
    expect(html).toContain('<strong>Clasificacion:</strong>');
    expect(html).toContain('<ol>');
    expect(html).toContain('Programe el lavado del tanque.');
  });

  it('debe envolver tablas GFM en .md-table-wrap y renderizar codigo', () => {
    const md = [
      '| Parametro | Valor | Limite |',
      '| :--- | ---: | ---: |',
      '| Turbidez | `6.40 UNT` | 5.00 UNT |'
    ].join('\n');

    const html = pipe.transform(md);

    expect(html).toContain('<div class="md-table-wrap"><table>');
    expect(html).toContain('>Parametro</th>');
    expect(html).toContain('<code>6.40 UNT</code>');
  });

  it('debe neutralizar HTML crudo y enlaces con protocolo javascript', () => {
    const malicioso = 'Texto <script>alert(1)</script> y <img src=x onerror=alert(2)> y [clic](javascript:alert(3))';
    const html = pipe.transform(malicioso);

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('&lt;script&gt;');
  });

  it('debe renderizar enlaces https seguros con target _blank y rel noopener noreferrer', () => {
    const html = pipe.transform('Ver [Groq Console](https://console.groq.com/keys)');

    expect(html).toContain('href="https://console.groq.com/keys"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it('debe devolver cadena vacia para entradas nulas o en blanco', () => {
    expect(pipe.transform('')).toBe('');
    expect(pipe.transform('   ')).toBe('');
    expect(pipe.transform(null)).toBe('');
  });
});
