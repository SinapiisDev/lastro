import type { ReactNode } from 'react'

export type EstadoPasso = 'feito' | 'atual' | 'pendente' | 'erro'

/** Andamento em etapas (rascunho → enviado → aprovado; criada → financeiro → chefe → pagamento). */
export function Passos({ itens, tomAtual = 'escuro' }: { itens: { titulo: ReactNode; detalhe?: ReactNode; estado: EstadoPasso }[]; tomAtual?: 'escuro' | 'vinho' }) {
  return (
    <ol className="grid gap-2 rounded-lg bg-surface p-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(170px, 1fr))` }}>
      {itens.map((p, i) => {
        const atual = p.estado === 'atual'
        const fundo = atual ? (tomAtual === 'vinho' ? 'bg-vinho-bg text-ink' : 'bg-ink text-on-ink') : p.estado === 'pendente' ? 'text-ink-3' : 'text-ink'
        const ponto =
          p.estado === 'erro'
            ? 'bg-neg text-surface'
            : p.estado === 'feito'
              ? 'bg-accent text-on-accent'
              : atual
                ? tomAtual === 'vinho'
                  ? 'bg-vinho text-on-ink'
                  : 'bg-accent text-on-accent'
                : 'bg-surface-3 text-ink-2'
        return (
          <li key={i} aria-current={atual ? 'step' : undefined} className={`flex items-center gap-3 rounded-[16px] px-3.5 py-3 ${fundo}`}>
            <span className={`flex size-7 flex-none items-center justify-center rounded-full text-label font-bold ${ponto}`}>
              {p.estado === 'erro' ? '×' : p.estado === 'feito' ? '✓' : i + 1}
            </span>
            <span className="flex flex-col gap-px">
              <span className="text-table font-semibold">{p.titulo}</span>
              {p.detalhe && <span className="text-caption opacity-70">{p.detalhe}</span>}
            </span>
          </li>
        )
      })}
    </ol>
  )
}
