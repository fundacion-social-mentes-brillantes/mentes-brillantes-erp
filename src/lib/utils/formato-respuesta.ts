// Las respuestas del Asistente IA vienen con marcas de Markdown: **negrita** y
// títulos con "#". En pantalla se veían los asteriscos y los numerales tal cual.
// Aquí se parten en pedazos de texto normal y de negrita para pintarlos como
// elementos de React, sin HTML: así ningún texto de la respuesta puede colarse
// como código en la página.

export type Pedazo = { texto: string; negrita: boolean }

/** Un renglón que empieza con "#", "##"... es un título: se muestra en negrita y sin los numerales. */
function sinMarcaDeTitulo(renglon: string): { texto: string; titulo: boolean } {
  const m = /^\s{0,3}#{1,6}\s+(.*)$/.exec(renglon)
  return m ? { texto: m[1].replace(/\s+#+\s*$/, ''), titulo: true } : { texto: renglon, titulo: false }
}

/** Parte un texto en pedazos normales y en negrita según los **dobles asteriscos**. */
export function partirNegrita(texto: string): Pedazo[] {
  const pedazos: Pedazo[] = []
  const renglones = texto.split('\n')
  renglones.forEach((crudo, i) => {
    const { texto: renglon, titulo } = sinMarcaDeTitulo(crudo)
    // Solo se toma como negrita lo que tiene apertura y cierre en el mismo renglón;
    // un asterisco suelto se deja como está.
    const partes = renglon.split(/(\*\*[^*\n]+?\*\*)/g)
    for (const parte of partes) {
      if (!parte) continue
      const esNegrita = parte.length > 4 && parte.startsWith('**') && parte.endsWith('**')
      pedazos.push({ texto: esNegrita ? parte.slice(2, -2) : parte, negrita: esNegrita || titulo })
    }
    if (i < renglones.length - 1) pedazos.push({ texto: '\n', negrita: false })
  })
  // Pedazos seguidos con el mismo formato se unen (menos elementos en pantalla).
  return pedazos.reduce<Pedazo[]>((acc, p) => {
    const ultimo = acc[acc.length - 1]
    if (ultimo && ultimo.negrita === p.negrita) ultimo.texto += p.texto
    else acc.push({ ...p })
    return acc
  }, [])
}
