// Regras puras da cotação (sem banco), testadas em cotacao.test.ts.
import { centavos, somarDias } from './regras.ts'

// Guarda só dígitos com DDI. Número brasileiro sem DDI (10 ou 11 dígitos) ganha o 55.
export function normalizarWhatsapp(entrada: string): string | null {
  let d = entrada.replace(/\D/g, '')
  if (d.length === 10 || d.length === 11) d = '55' + d
  return d.length >= 12 && d.length <= 15 ? d : null
}

// O WhatsApp às vezes entrega celular brasileiro sem o 9 depois do DDD (ou com ele): aceita os dois.
export function variantesWhatsapp(n: string): string[] {
  if (!n.startsWith('55')) return [n]
  if (n.length === 13 && n[4] === '9') return [n, n.slice(0, 4) + n.slice(5)]
  if (n.length === 12) return [n, n.slice(0, 4) + '9' + n.slice(4)]
  return [n]
}

// Divide o frete entre os itens na proporção do valor; a sobra de centavos vai para o maior item.
export function ratearFrete(valores: number[], frete: number): number[] {
  const cs = valores.map(centavos)
  const total = cs.reduce((a, b) => a + b, 0)
  const fc = centavos(frete)
  if (!fc || !total) return valores
  const partes = cs.map((c) => Math.floor((c * fc) / total))
  partes[cs.indexOf(Math.max(...cs))] += fc - partes.reduce((a, b) => a + b, 0)
  return cs.map((c, i) => (c + partes[i]) / 100)
}

// Parcelas iguais nos prazos do fornecedor (ex.: 30/60/90 dias); sem prazo informado, 30 dias.
export function parcelasPorPrazos(total: number, prazos: number[] | null, hoje: string) {
  const ps = prazos?.length ? [...prazos].sort((a, b) => a - b) : [30]
  const base = Math.floor(centavos(total) / ps.length)
  return ps.map((dias, i) => ({
    valor: (i === ps.length - 1 ? centavos(total) - base * (ps.length - 1) : base) / 100,
    vencimento: somarDias(hoje, dias),
  }))
}

export type ItemCotado = { id: number; quantidade: number }
// preco: número = cotou; null = não tem o item; ausente = não respondeu
export type Proposta = { fornecedorId: number; frete: number | null; precos: Record<number, number | null> }

export function resumirProposta(itens: ItemCotado[], p: Proposta) {
  const cotados = itens.filter((i) => typeof p.precos[i.id] === 'number')
  const subtotal = cotados.reduce((t, i) => t + centavos(p.precos[i.id]! * i.quantidade), 0) / 100
  return {
    subtotal,
    total: (centavos(subtotal) + centavos(p.frete ?? 0)) / 100,
    cotados: cotados.length,
    faltando: itens.length - cotados.length,
  }
}

// Fornecedor com o menor preço unitário de cada item (null se ninguém cotou).
export function menorPorItem(itens: ItemCotado[], propostas: Proposta[]) {
  const escolha: Record<number, number | null> = {}
  for (const i of itens) {
    const cotaram = propostas.filter((p) => typeof p.precos[i.id] === 'number')
    cotaram.sort((a, b) => a.precos[i.id]! - b.precos[i.id]!)
    escolha[i.id] = cotaram[0]?.fornecedorId ?? null
  }
  return escolha
}

// Quanto a escolha economizou frente à proposta mais cara de cada item.
export function economia(itens: ItemCotado[], propostas: Proposta[], escolhas: Record<number, number>) {
  let total = 0
  for (const i of itens) {
    const precos = propostas.map((p) => p.precos[i.id]).filter((x): x is number => typeof x === 'number')
    const escolhido = propostas.find((p) => p.fornecedorId === escolhas[i.id])?.precos[i.id]
    if (typeof escolhido === 'number' && precos.length) total += centavos((Math.max(...precos) - escolhido) * i.quantidade)
  }
  return total / 100
}

// ---- Checagem do que a IA devolve: nada é gravado sem passar por aqui. ----

export type ExtracaoIA = {
  propostas: {
    cotacao_id: number
    precos: { item_id: number; preco_unitario: number | null; nao_tem: boolean }[]
    frete: number | null
    prazo_entrega_dias: number | null
    prazos_pagamento_dias: number[] | null
    observacao: string | null
    completa: boolean
  }[]
  resposta: string | null
  precisa_pessoa: boolean
}

const numeroOk = (x: unknown, max: number) => typeof x === 'number' && Number.isFinite(x) && x >= 0 && x <= max

// Mantém só cotações e itens que este fornecedor realmente tem em aberto, com valores plausíveis.
export function validarExtracao(saida: ExtracaoIA, abertas: { id: number; itens: number[] }[]) {
  const propostas = saida.propostas.flatMap((p) => {
    const cot = abertas.find((c) => c.id === p.cotacao_id)
    if (!cot) return []
    return [
      {
        cotacaoId: p.cotacao_id,
        precos: p.precos
          .filter((x) => cot.itens.includes(x.item_id))
          .filter((x) => x.nao_tem || numeroOk(x.preco_unitario, 1e8))
          .map((x) => ({ itemId: x.item_id, preco: x.nao_tem ? null : x.preco_unitario })),
        frete: numeroOk(p.frete, 1e8) ? p.frete : null,
        prazoEntrega: numeroOk(p.prazo_entrega_dias, 365) ? Math.round(p.prazo_entrega_dias!) : null,
        prazosPagamento:
          p.prazos_pagamento_dias?.length && p.prazos_pagamento_dias.length <= 24 && p.prazos_pagamento_dias.every((d) => numeroOk(d, 720))
            ? p.prazos_pagamento_dias.map(Math.round)
            : null,
        observacao: p.observacao?.slice(0, 500) || null,
        completa: p.completa,
      },
    ]
  })
  const resposta = saida.resposta?.trim().slice(0, 1500) || null
  return { propostas, resposta, precisaPessoa: saida.precisa_pessoa }
}

// Só vale escolha de item desta cotação para fornecedor que cotou aquele item.
export function validarRecomendacao(
  escolhas: { item_id: number; fornecedor_id: number }[],
  itens: ItemCotado[],
  propostas: Proposta[],
) {
  const validas: Record<number, number> = {}
  for (const e of escolhas) {
    const p = propostas.find((x) => x.fornecedorId === e.fornecedor_id)
    if (itens.some((i) => i.id === e.item_id) && typeof p?.precos[e.item_id] === 'number') validas[e.item_id] = e.fornecedor_id
  }
  return validas
}
