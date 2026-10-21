import type { ComponentProps, ReactNode } from 'react'

// Rótulo acima (12/600), campo 44 px, raio 14, fundo surface-2. Erro: borda vermelha + o que fazer.
export function Campo({
  rotulo,
  erro,
  ajuda,
  children,
  className = '',
  ocultarRotulo = false,
}: {
  rotulo: ReactNode
  erro?: string | null
  ajuda?: ReactNode
  children: ReactNode
  className?: string
  ocultarRotulo?: boolean
}) {
  return (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <span className={`${ocultarRotulo ? 'sr-only' : ''} text-label font-semibold ${erro ? 'text-neg' : 'text-ink-2'}`}>{rotulo}</span>
      {children}
      {erro ? (
        <span className="text-caption font-semibold text-neg">{erro}</span>
      ) : ajuda ? (
        <span className="text-caption text-ink-3">{ajuda}</span>
      ) : null}
    </label>
  )
}

type Comum = { invalido?: boolean }

export function Entrada({ invalido, className = '', ...resto }: ComponentProps<'input'> & Comum) {
  return <input className={`ds-campo ${className}`} aria-invalid={invalido || undefined} {...resto} />
}

export function Selecao({ invalido, className = '', ...resto }: ComponentProps<'select'> & Comum) {
  return <select className={`ds-campo ${className}`} aria-invalid={invalido || undefined} {...resto} />
}

export function AreaTexto({ invalido, className = '', ...resto }: ComponentProps<'textarea'> & Comum) {
  return <textarea className={`ds-campo ${className}`} aria-invalid={invalido || undefined} {...resto} />
}

// Valor em R$: prefixo fixo, número alinhado à direita.
export function EntradaDinheiro({ invalido, className = '', ...resto }: ComponentProps<'input'> & Comum) {
  return (
    <span className="relative flex">
      <span aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-ink-3">
        R$
      </span>
      <input
        type="number"
        step="0.01"
        inputMode="decimal"
        className={`ds-campo pl-11 text-right font-semibold ${className}`}
        aria-invalid={invalido || undefined}
        {...resto}
      />
    </span>
  )
}
