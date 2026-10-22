import type { ComponentProps, ReactNode } from 'react'
import { brl } from '@/lib/regras'

// Tabela financeira (DESIGN.md §3): cabeçalho 12/600 cinza, valores à direita, linha 44 px, total em surface-2.

export function Tabela({ children, className = '', minimo }: { children: ReactNode; className?: string; minimo?: number }) {
  return (
    <div className="-mx-1 overflow-x-auto px-1">
      <table className={`w-full border-collapse text-table ${className}`} style={minimo ? { minWidth: minimo } : undefined}>
        {children}
      </table>
    </div>
  )
}

export function Th({ num, className = '', ...resto }: ComponentProps<'th'> & { num?: boolean }) {
  return (
    <th
      className={`border-b border-line px-2 py-2.5 text-label font-semibold whitespace-nowrap text-ink-3 ${num ? 'text-right' : 'text-left'} ${className}`}
      {...resto}
    />
  )
}

export function Td({ num, forte, className = '', ...resto }: ComponentProps<'td'> & { num?: boolean; forte?: boolean }) {
  return (
    <td
      className={`border-b border-line px-2 py-3 align-middle ${num ? 'text-right whitespace-nowrap' : ''} ${forte ? 'font-bold' : ''} ${className}`}
      {...resto}
    />
  )
}

/** Linha com hover; `selecionada` pinta de azul suave. */
export function Tr({ selecionada, className = '', ...resto }: ComponentProps<'tr'> & { selecionada?: boolean }) {
  return <tr className={`transition-colors ${selecionada ? 'bg-accent-bg' : 'hover:bg-surface-2'} ${className}`} {...resto} />
}

/** Linha de total: fundo surface-2, negrito, cantos arredondados. */
export function LinhaTotal({ children }: { children: ReactNode }) {
  return (
    <tr className="bg-surface-2 font-bold [&>td]:border-0 [&>td]:py-3.5 [&>td:first-child]:rounded-l-sm [&>td:last-child]:rounded-r-sm">
      {children}
    </tr>
  )
}

/** Valor em R$. Negativo com sinal de menos real (−, nunca hífen) e em vermelho; nunca só a cor. */
export function Dinheiro({ valor, sinal = false, className = '', noturno = false }: { valor: number; sinal?: boolean; className?: string; noturno?: boolean }) {
  const negativo = valor < -0.004
  const texto = negativo ? `−${brl(-valor)}` : sinal && valor > 0.004 ? `+${brl(valor)}` : brl(Math.abs(valor) < 0.005 ? 0 : valor)
  return <span className={`whitespace-nowrap ${negativo ? (noturno ? 'text-neg-night' : 'text-neg') : ''} ${className}`}>{texto}</span>
}

/** Valor resumido para gráficos e cartões pequenos: "+R$ 288 mil", "−R$ 1,2 mi". */
export function dinheiroCurto(valor: number, sinal = false) {
  const a = Math.abs(valor)
  const corpo = a >= 1e6 ? `${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : a >= 1e3 ? `${Math.round(a / 1e3).toLocaleString('pt-BR')} mil` : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
  return `${valor < -0.004 ? '−' : sinal && valor > 0.004 ? '+' : ''}R$ ${corpo}`
}

/** Mesmo formato do <Dinheiro>, como texto (para atributos e mensagens). */
export const textoDinheiro = (valor: number) => (valor < -0.004 ? `−${brl(-valor)}` : brl(valor))
