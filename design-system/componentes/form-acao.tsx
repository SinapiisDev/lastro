'use client'

import { useActionState, type ReactNode } from 'react'
import { Botao, type VarianteBotao, type TamanhoBotao } from './botao'
import { Toast } from './mensagem'

export type Estado = { erro?: string; ok?: string } | null
export type Acao = (estado: Estado, dados: FormData) => Promise<Estado>

/**
 * Formulário ligado a uma server action. Botão com estado "Salvando…" e, embaixo,
 * a confirmação (verde) ou o erro (vermelho) que a action devolveu.
 */
export function FormAcao({
  action,
  botao,
  children,
  className = '',
  variante = 'secundario',
  tamanho = 'md',
  largura = false,
  toast = false,
  noturno = false,
}: {
  action: Acao
  botao: string
  children?: ReactNode
  className?: string
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  /** botão na largura toda (celular) */
  largura?: boolean
  /** confirmação vira aviso flutuante em vez de texto */
  toast?: boolean
  /** dentro da faixa escura: mensagens em lima e vermelho claro */
  noturno?: boolean
}) {
  // Cada envio ganha um número: o aviso flutuante reaparece mesmo com a mesma mensagem.
  const [estado, enviar, enviando] = useActionState(async (anterior: (Estado & { n?: number }) | null, dados: FormData) => {
    const r = await action(anterior, dados)
    return r && { ...r, n: (anterior?.n ?? 0) + 1 }
  }, null)

  return (
    <form action={enviar} className={className}>
      {children}
      <div className={`flex flex-wrap items-center gap-3 ${largura ? 'w-full' : ''}`}>
        <Botao variante={variante} tamanho={tamanho} carregando={enviando} className={largura ? 'w-full' : ''}>
          {botao}
        </Botao>
        <p
          aria-live="polite"
          className={`text-[12.5px] font-semibold ${estado?.erro ? (noturno ? 'text-neg-night' : 'text-neg') : noturno ? 'text-accent' : 'text-ok'}`}
        >
          {estado?.erro ?? (!toast && estado?.ok)}
        </p>
      </div>
      {toast && estado?.ok && <Toast key={estado.n} texto={estado.ok} />}
    </form>
  )
}
