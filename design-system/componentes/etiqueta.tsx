import type { ReactNode } from 'react'

export type TomEtiqueta = 'neutro' | 'aviso' | 'rosa' | 'ok' | 'paga' | 'neg' | 'info'

const TONS: Record<TomEtiqueta, string> = {
  neutro: 'bg-surface-3 text-ink-2',
  aviso: 'bg-warn-bg text-warn',
  rosa: 'bg-pink-bg text-pink-ink',
  ok: 'bg-ok-bg text-ok',
  paga: 'bg-accent text-fixed-ink',
  neg: 'bg-neg-bg text-neg',
  info: 'bg-info-bg text-info',
}

// Pílula 24 px: ponto + texto, fundo suave da família semântica.
export function Etiqueta({ tom = 'neutro', children, grande = false }: { tom?: TomEtiqueta; children: ReactNode; grande?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full whitespace-nowrap font-bold ${grande ? 'h-[26px] px-3 text-label' : 'h-6 px-2.5 text-caption'} ${TONS[tom]}`}
    >
      <span aria-hidden className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  )
}

// Situações do sistema (chave do banco → texto e tom), conforme DESIGN.md §3.
const SITUACOES: Record<string, [string, TomEtiqueta]> = {
  // compra
  aguardando_financeiro: ['Aguardando financeiro', 'aviso'],
  aguardando_chefe: ['Aguardando chefe', 'rosa'],
  aprovada: ['Aprovada', 'ok'],
  paga: ['Paga', 'paga'],
  recusada: ['Recusada', 'neg'],
  cancelada: ['Cancelada', 'neutro'],
  // orçamento
  rascunho: ['Rascunho', 'neutro'],
  enviado: ['Enviado ao investidor', 'info'],
  aprovado: ['Aprovado', 'ok'],
  substituido: ['Substituído', 'neutro'],
  // cotação
  cot_rascunho: ['Montando', 'neutro'],
  cot_aguardando: ['Aberta', 'info'],
  cot_concluida: ['Fechada', 'ok'],
  cot_cancelada: ['Cancelada', 'neutro'],
  // proposta do fornecedor numa cotação
  forn_pendente: ['Não pedido', 'neutro'],
  forn_pedido_enviado: ['Sem resposta', 'neutro'],
  forn_respondeu: ['Respondida', 'aviso'],
  forn_recusou: ['Recusou', 'neg'],
}

export function Situacao({ status, grande }: { status: string; grande?: boolean }) {
  const [texto, tom] = SITUACOES[status] ?? [status, 'neutro']
  return (
    <Etiqueta tom={tom} grande={grande}>
      {texto}
    </Etiqueta>
  )
}
