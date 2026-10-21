import type { ReactNode } from 'react'

export function Trena({ pct, alerta = false, fina = false }: { pct: number; alerta?: boolean; fina?: boolean }) {
  const estado = pct >= 100 && !alerta ? 'feito' : alerta ? 'alerta' : ''
  return (
    <div
      className={`trena ${estado} ${fina ? 'fina' : ''}`}
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={`${pct}% do serviço feito`}
    >
      <span style={{ width: `${pct}%` }} />
      <b>{pct}%</b>
    </div>
  )
}

const SITUACOES: Record<string, [string, string]> = {
  aguardando_financeiro: ['Aguardando financeiro', 'bg-amber-50 text-amber-900 border-amber-300'],
  aguardando_chefe: ['Aguardando chefe', 'bg-amber-50 text-amber-900 border-amber-300'],
  aprovada: ['Aprovada', 'bg-sky-50 text-sky-900 border-sky-300'],
  paga: ['Paga', 'bg-emerald-50 text-emerald-900 border-emerald-300'],
  recusada: ['Recusada', 'bg-red-50 text-red-900 border-red-300'],
  cancelada: ['Cancelada', 'bg-zinc-100 text-zinc-600 border-zinc-300'],
  // orçamento
  rascunho: ['Rascunho', 'bg-zinc-100 text-zinc-700 border-zinc-300'],
  enviado: ['Enviado ao investidor', 'bg-amber-50 text-amber-900 border-amber-300'],
  aprovado: ['Aprovado', 'bg-emerald-50 text-emerald-900 border-emerald-300'],
  substituido: ['Substituído', 'bg-zinc-100 text-zinc-600 border-zinc-300'],
  // cotação e proposta de fornecedor
  cot_rascunho: ['Montando', 'bg-zinc-100 text-zinc-700 border-zinc-300'],
  cot_aguardando: ['Recebendo preços', 'bg-amber-50 text-amber-900 border-amber-300'],
  cot_concluida: ['Concluída', 'bg-emerald-50 text-emerald-900 border-emerald-300'],
  cot_cancelada: ['Cancelada', 'bg-zinc-100 text-zinc-600 border-zinc-300'],
  forn_pendente: ['Não pedido', 'bg-zinc-100 text-zinc-700 border-zinc-300'],
  forn_pedido_enviado: ['Aguardando resposta', 'bg-amber-50 text-amber-900 border-amber-300'],
  forn_respondeu: ['Respondeu', 'bg-emerald-50 text-emerald-900 border-emerald-300'],
  forn_recusou: ['Recusou', 'bg-red-50 text-red-900 border-red-300'],
}

export const TIPOS_ITEM: Record<string, string> = { material: 'Material', mao_de_obra: 'Mão de obra', equipamento: 'Equipamento' }

export function Situacao({ status }: { status: string }) {
  const [texto, cor] = SITUACOES[status] ?? [status, '']
  return <span className={`tag ${cor}`}>{texto}</span>
}

export const FAIXAS = { baixa: 'Teto baixo (sem aprovação)', media: 'Teto médio (financeiro)', alta: 'Acima do teto médio (chefe)' }

export function Secao({ titulo, acao, children }: { titulo: string; acao?: ReactNode; children: ReactNode }) {
  return (
    <section className="cartao">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2>{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

export function Vazio({ children }: { children: ReactNode }) {
  return <p className="py-2 text-cinza">{children}</p>
}

export function Rolagem({ children }: { children: ReactNode }) {
  return <div className="-mx-1 overflow-x-auto px-1">{children}</div>
}
