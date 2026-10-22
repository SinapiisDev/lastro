import type { ReactNode } from 'react'

export type TomCartao = 'padrao' | 'escuro' | 'noite' | 'aviso' | 'vinho' | 'suave'
const TONS: Record<TomCartao, string> = {
  padrao: 'bg-surface text-ink',
  escuro: 'bg-ink text-on-ink',
  noite: 'bg-night text-night-ink',
  aviso: 'bg-warn-bg text-ink',
  vinho: 'bg-vinho-bg text-ink',
  suave: 'bg-surface-2 text-ink',
}

/** Cartão: raio 22, padding 20 (16 no celular), quase plano. */
export function Cartao({ tom = 'padrao', className = '', children, as: Tag = 'section' }: { tom?: TomCartao; className?: string; children: ReactNode; as?: 'section' | 'div' | 'aside' }) {
  return <Tag className={`rounded-lg p-4 sm:p-5 ${TONS[tom]} ${className}`}>{children}</Tag>
}

/** Cartão com título (h2 Outfit 22) e ação à direita. */
export function Secao({ titulo, acao, children, className = '', tom = 'padrao' }: { titulo: ReactNode; acao?: ReactNode; children: ReactNode; className?: string; tom?: TomCartao }) {
  return (
    <Cartao tom={tom} className={`flex min-w-0 flex-col gap-3 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="font-display text-h2 font-normal">{titulo}</h2>
        {acao}
      </div>
      {children}
    </Cartao>
  )
}

/** Indicador: rótulo → valor (Outfit 300) → detalhe. Um número em destaque por cartão. */
export function Kpi({
  rotulo,
  valor,
  detalhe,
  tom = 'padrao',
  corDetalhe,
  pequeno = false,
}: {
  rotulo: ReactNode
  valor: ReactNode
  detalhe?: ReactNode
  tom?: TomCartao
  corDetalhe?: 'acento' | 'aviso' | 'vinho' | 'neg' | 'ok'
  pequeno?: boolean
}) {
  const rotuloCor = { padrao: 'text-ink-3', escuro: 'opacity-65', noite: 'text-night-ink-3', aviso: 'text-warn', vinho: 'text-vinho-ink', suave: 'text-ink-3' }[tom]
  const detalheCor = corDetalhe
    ? { acento: tom === 'escuro' || tom === 'noite' ? 'text-accent-night' : 'text-accent-ink', aviso: 'text-warn', vinho: 'text-vinho-ink', neg: 'text-neg', ok: 'text-ok' }[corDetalhe]
    : rotuloCor
  return (
    <Cartao tom={tom} as="div" className="flex min-w-0 flex-col gap-2">
      <span className={`text-label font-semibold ${rotuloCor}`}>{rotulo}</span>
      <span className={`font-display font-light tracking-[-0.01em] whitespace-nowrap ${pequeno ? 'text-[24px] leading-8' : 'text-kpi'}`}>{valor}</span>
      {detalhe && <span className={`text-label font-semibold ${detalheCor}`}>{detalhe}</span>}
    </Cartao>
  )
}

/** Cabeçalho de tela: linha de contexto, título (Outfit 300, 40) e ações à direita. */
export function CabecalhoTela({ contexto, titulo, situacao, acoes, children }: { contexto?: ReactNode; titulo: ReactNode; situacao?: ReactNode; acoes?: ReactNode; children?: ReactNode }) {
  return (
    <section className="flex flex-wrap items-end justify-between gap-4 px-1 pt-2">
      <div className="flex min-w-0 flex-col gap-1.5">
        {contexto && <span className="text-label font-semibold text-ink-3">{contexto}</span>}
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-[30px] leading-[1.05] font-light tracking-[-0.02em] sm:text-titulo">{titulo}</h1>
          {situacao}
        </div>
        {children}
      </div>
      {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
    </section>
  )
}
