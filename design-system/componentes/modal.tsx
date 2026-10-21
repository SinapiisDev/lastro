'use client'

import { useRef, type ReactNode } from 'react'
import { classesBotao, type VarianteBotao, type TamanhoBotao } from './botao'

/**
 * Confirmação em janela (DESIGN.md §2: shadow-2). Usa <dialog> nativo: fecha com Esc,
 * prende o foco e é acessível sem biblioteca.
 */
export function Modal({
  gatilho,
  variante = 'primario',
  tamanho = 'md',
  titulo,
  texto,
  children,
}: {
  gatilho: ReactNode
  variante?: VarianteBotao
  tamanho?: TamanhoBotao
  titulo: ReactNode
  texto?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  return (
    <>
      <button type="button" className={classesBotao(variante, tamanho)} onClick={() => ref.current?.showModal()}>
        {gatilho}
      </button>
      <dialog
        ref={ref}
        className="m-auto w-[min(480px,calc(100%-32px))] rounded-lg bg-surface p-6 text-ink shadow-2 backdrop:bg-night/45"
        onClick={(e) => e.target === ref.current && ref.current?.close()}
      >
        <div className="flex flex-col gap-3.5">
          <h3 className="font-display text-[24px] leading-8 font-normal">{titulo}</h3>
          {texto && <p className="text-table leading-[1.55] text-ink-2">{texto}</p>}
          {children}
          <button type="button" className={`${classesBotao('secundario')} self-end`} onClick={() => ref.current?.close()}>
            Fechar
          </button>
        </div>
      </dialog>
    </>
  )
}
