'use client'

import { useEffect, useState, type ReactNode } from 'react'

// Confirmação (verde) e erro (vermelho, com lista do que corrigir). DESIGN.md §3.
export function Mensagem({ tom, titulo, children, itens }: { tom: 'ok' | 'erro'; titulo: ReactNode; children?: ReactNode; itens?: string[] }) {
  const ok = tom === 'ok'
  return (
    <div role={ok ? 'status' : 'alert'} className={`flex items-start gap-3 rounded-md px-4 py-3.5 ${ok ? 'bg-ok-bg' : 'bg-neg-bg'}`}>
      <span
        aria-hidden
        className={`flex size-[22px] flex-none items-center justify-center rounded-full text-label font-bold text-surface ${ok ? 'bg-ok' : 'bg-neg'}`}
      >
        {ok ? '✓' : '!'}
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className={`text-table font-bold ${ok ? 'text-ok' : 'text-neg'}`}>{titulo}</span>
        {children && <span className="text-[12.5px] text-ink-2">{children}</span>}
        {itens && itens.length > 0 && (
          <ul className="text-[12.5px] leading-[1.6] text-ink-2">
            {itens.map((i) => (
              <li key={i}>· {i}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

/** Aviso flutuante no canto inferior direito por 5 s, com ação opcional (ex.: Desfazer). */
export function Toast({ texto, acao, aoFechar, duracao = 5000 }: { texto: ReactNode; acao?: ReactNode; aoFechar?: () => void; duracao?: number }) {
  const [visivel, setVisivel] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => {
      setVisivel(false)
      aoFechar?.()
    }, duracao)
    return () => clearTimeout(t)
  }, [duracao, aoFechar])
  if (!visivel) return null
  return (
    <div
      role="status"
      className="fixed right-4 bottom-4 z-50 flex animate-[ds-entrar_.2s_ease-out] items-center gap-3.5 rounded-md bg-ink py-3 pr-3.5 pl-4 text-[13px] font-semibold text-on-ink shadow-2"
    >
      {texto}
      {acao && <span className="font-bold text-accent-night">{acao}</span>}
    </div>
  )
}
