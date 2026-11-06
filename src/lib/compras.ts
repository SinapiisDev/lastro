import 'server-only'
import type { Tx } from './db'
import { faixaDaCompra, situacaoInicial, centavos } from './regras'

export type NovaCompra = {
  obraId: number
  fornecedorId: number
  descricao: string
  justificativa: string | null
  itens: { subetapaId: number; itemChave: string | null; descricao: string; quantidade: number | null; unidade: string | null; valor: number }[]
  parcelas: { valor: number; vencimento: string }[]
  cotacaoId?: number
  tetos: { tetoBaixo: number; tetoMedio: number }
}

// Única porta de entrada de compras: a faixa de aprovação sai do valor total, sempre.
export async function registrarCompra(tx: Tx, c: NovaCompra) {
  const valor = c.itens.reduce((t, i) => t + centavos(i.valor), 0) / 100
  if (!(valor > 0)) throw new Error('Compra sem valor')
  if (c.parcelas.reduce((t, p) => t + centavos(p.valor), 0) !== centavos(valor)) throw new Error('Parcelas não batem com o total')
  const faixa = faixaDaCompra(valor, c.tetos.tetoBaixo, c.tetos.tetoMedio)
  const situacao = situacaoInicial[faixa]
  const [compra] = await tx<{ id: number }[]>`
    insert into compras (obra_id, fornecedor_id, descricao, valor, justificativa, faixa, situacao, cotacao_id)
    values (${c.obraId}, ${c.fornecedorId}, ${c.descricao}, ${valor}, ${c.justificativa}, ${faixa}, ${situacao}, ${c.cotacaoId ?? null})
    returning id`
  for (const i of c.itens) {
    await tx`
      insert into compra_itens (compra_id, subetapa_id, item_chave, descricao, quantidade, unidade, valor)
      values (${compra.id}, ${i.subetapaId}, ${i.itemChave}, ${i.descricao}, ${i.quantidade}, ${i.unidade}, ${i.valor})`
  }
  for (const [n, p] of c.parcelas.entries()) {
    await tx`insert into parcelas (compra_id, numero, valor, vencimento) values (${compra.id}, ${n + 1}, ${p.valor}, ${p.vencimento})`
  }
  return { id: compra.id, faixa, situacao, valor }
}

export type NovoDocumento = {
  obraId: number
  fornecedorId: number
  subetapaId: number
  descricao: string
  natureza: string
  tipoDocumento: string | null
  numeroDocumento: string | null
  emissao: string | null
  valor: number
  parcelas: { valor: number; vencimento: string }[]
  tetos: { tetoBaixo: number; tetoMedio: number }
}

// Documento a pagar lançado pelo financeiro: já nasce aprovado (não passa pelos tetos).
// A faixa fica gravada só como informação.
export async function registrarDocumento(tx: Tx, d: NovoDocumento) {
  if (!(d.valor > 0)) throw new Error('Documento sem valor')
  if (d.parcelas.reduce((t, p) => t + centavos(p.valor), 0) !== centavos(d.valor)) throw new Error('Parcelas não batem com o total')
  const [doc] = await tx<{ id: number }[]>`
    insert into compras (obra_id, fornecedor_id, descricao, valor, faixa, situacao, origem, natureza, tipo_documento, numero_documento, emissao)
    values (${d.obraId}, ${d.fornecedorId}, ${d.descricao}, ${d.valor}, ${faixaDaCompra(d.valor, d.tetos.tetoBaixo, d.tetos.tetoMedio)},
            'aprovada', 'financeiro', ${d.natureza}, ${d.tipoDocumento}, ${d.numeroDocumento}, ${d.emissao})
    returning id`
  await tx`insert into compra_itens (compra_id, subetapa_id, descricao, valor) values (${doc.id}, ${d.subetapaId}, ${d.descricao}, ${d.valor})`
  for (const [n, p] of d.parcelas.entries()) {
    await tx`insert into parcelas (compra_id, numero, valor, vencimento) values (${doc.id}, ${n + 1}, ${p.valor}, ${p.vencimento})`
  }
  return doc.id
}
