'use client'

import { classesBotao, type VarianteBotao } from './botao'

export function BotaoImprimir({ texto = 'Imprimir ou salvar em PDF', variante = 'secundario' }: { texto?: string; variante?: VarianteBotao }) {
  return (
    <button type="button" className={`${classesBotao(variante)} print:hidden`} onClick={() => window.print()}>
      {texto}
    </button>
  )
}
