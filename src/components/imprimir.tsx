'use client'

export function Imprimir({ texto = 'Imprimir ou salvar em PDF' }: { texto?: string }) {
  return (
    <button type="button" className="btn print:hidden" onClick={() => window.print()}>
      {texto}
    </button>
  )
}
