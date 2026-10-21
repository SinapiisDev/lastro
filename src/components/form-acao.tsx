'use client'

import { useActionState, type ReactNode } from 'react'

export type Estado = { erro?: string; ok?: string } | null
export type Acao = (estado: Estado, dados: FormData) => Promise<Estado>

// Formulário que chama uma server action e mostra o erro ou a confirmação dela.
export function FormAcao({
  action,
  botao,
  children,
  className = '',
  principal = false,
  perigo = false,
}: {
  action: Acao
  botao: string
  children?: ReactNode
  className?: string
  principal?: boolean
  perigo?: boolean
}) {
  const [estado, enviar, enviando] = useActionState(action, null)
  return (
    <form action={enviar} className={className}>
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <button className={`btn ${principal ? 'btn-principal' : ''} ${perigo ? 'btn-perigo' : ''}`} disabled={enviando}>
          {enviando ? 'Salvando…' : botao}
        </button>
        <p aria-live="polite" className={`text-sm ${estado?.erro ? 'text-erro' : 'text-feito'}`}>
          {estado?.erro ?? estado?.ok}
        </p>
      </div>
    </form>
  )
}
