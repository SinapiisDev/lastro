import type { ReactNode } from 'react'

export type AutorBalao = 'fornecedor' | 'pessoa' | 'ia' | 'sistema'

/**
 * Balão de conversa estilo WhatsApp (DESIGN.md §3):
 * fornecedor à esquerda (surface); pessoa da equipe à direita (ink); IA à esquerda (night, selo lima); sistema centralizado.
 */
export function Balao({
  autor,
  nome,
  hora,
  lido = false,
  rodape,
  children,
}: {
  autor: AutorBalao
  nome?: ReactNode
  hora?: string
  lido?: boolean
  rodape?: ReactNode
  children: ReactNode
}) {
  if (autor === 'sistema') {
    return (
      <li className="max-w-[90%] self-center rounded-full bg-surface-3 px-3 py-1 text-center text-[11px] font-semibold whitespace-pre-line text-ink-2">
        {children}
        {hora && <span className="font-medium text-ink-3"> · {hora}</span>}
      </li>
    )
  }
  const estilos = {
    fornecedor: 'self-start rounded-[16px_16px_16px_4px] bg-surface text-ink',
    pessoa: 'self-end rounded-[16px_16px_4px_16px] bg-ink text-on-ink',
    ia: 'self-start rounded-[16px_16px_16px_4px] bg-night text-night-ink',
  }[autor]
  return (
    <li className={`flex max-w-[82%] flex-col gap-0.5 px-3 pt-2.5 pb-1.5 ${estilos}`}>
      {autor === 'ia' ? (
        <span className="inline-flex items-center gap-1.5 text-caption font-bold text-accent">
          <SeloIA />
          {nome ?? 'Assistente'}
        </span>
      ) : (
        nome && <span className={`text-caption font-bold ${autor === 'pessoa' ? 'opacity-60' : 'text-info'}`}>{nome}</span>
      )}
      <span className="text-[13.5px] leading-[1.45] whitespace-pre-line">{children}</span>
      {rodape}
      {hora && (
        <span className={`self-end text-[10.5px] ${autor === 'fornecedor' ? 'text-ink-3' : autor === 'ia' ? 'text-night-ink-3' : 'opacity-60'}`}>
          {hora}
          {lido && ' ✓✓'}
        </span>
      )}
    </li>
  )
}

export function SeloIA() {
  return <span className="rounded-[5px] bg-accent px-1.5 py-px text-[10px] font-extrabold text-fixed-ink">IA</span>
}

export function ListaConversa({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <ol className={`flex flex-col gap-2.5 ${className}`}>{children}</ol>
}
