import 'server-only'
import { notFound } from 'next/navigation'
import { sql } from './db'
import { podeVerObra, type Sessao } from './sessao'
import { brl } from './regras'
import { resumirProposta, menorPorItem, type Proposta } from './cotacao'

export type ItemCotacao = {
  id: number
  descricao: string
  quantidade: number
  unidade: string
  subetapaId: number
  itemChave: string | null
  escolhido: number | null
  etapa: string
  subetapa: string
  orcado: number | null // preço unitário no orçamento vigente
}
export type FornecedorCotacao = {
  id: number // cotacao_fornecedores.id
  fornecedorId: number
  nome: string
  whatsapp: string | null
  iaPausada: boolean
  situacao: string
  frete: number | null
  prazoEntrega: number | null
  prazos: number[] | null
  observacao: string | null
}
export type Recomendacao = { escolhas: Record<number, number>; explicacao: string }

export async function carregarCotacao(s: Sessao, id: number) {
  const [c] = await sql<{ id: number; obraId: number; obra: string; titulo: string; situacao: string; prazoResposta: string; recomendacao: Recomendacao | null; motivoEscolha: string | null; economia: number | null; criadaEm: Date }[]>`
    select c.id, c.obra_id as "obraId", o.nome as obra, c.titulo, c.situacao, c.prazo_resposta as "prazoResposta",
           c.recomendacao, c.motivo_escolha as "motivoEscolha", c.economia, c.criada_em as "criadaEm"
    from cotacoes c join obras o on o.id = c.obra_id where c.id = ${id}`
  if (!c || !podeVerObra(s, c.obraId)) notFound()
  return c
}

export async function dadosCotacao(id: number) {
  const [itens, fornecedores, precos] = await Promise.all([
    sql<ItemCotacao[]>`
      select ci.id, ci.descricao, ci.quantidade, ci.unidade, ci.subetapa_id as "subetapaId", ci.item_chave as "itemChave",
             ci.fornecedor_escolhido as escolhido, e.nome as etapa, s.nome as subetapa,
             (select i.preco_unitario from orcamento_itens i join v_orcamento_vigente o on o.id = i.orcamento_id
               where i.chave = ci.item_chave) as orcado
      from cotacao_itens ci join subetapas s on s.id = ci.subetapa_id join etapas e on e.id = s.etapa_id
      where ci.cotacao_id = ${id} order by ci.id`,
    sql<FornecedorCotacao[]>`
      select cf.id, cf.fornecedor_id as "fornecedorId", f.nome, f.whatsapp, f.ia_pausada as "iaPausada", cf.situacao,
             cf.frete, cf.prazo_entrega_dias as "prazoEntrega", cf.prazos_pagamento as prazos, cf.observacao
      from cotacao_fornecedores cf join fornecedores f on f.id = cf.fornecedor_id
      where cf.cotacao_id = ${id} order by f.nome`,
    sql<{ cf: number; item: number; preco: number | null }[]>`
      select cp.cotacao_fornecedor_id as cf, cp.cotacao_item_id as item, cp.preco_unitario as preco
      from cotacao_precos cp join cotacao_fornecedores cf on cf.id = cp.cotacao_fornecedor_id where cf.cotacao_id = ${id}`,
  ])
  const propostas: Proposta[] = fornecedores.map((f) => ({
    fornecedorId: f.fornecedorId,
    frete: f.frete,
    precos: Object.fromEntries(precos.filter((p) => p.cf === f.id).map((p) => [p.item, p.preco])),
  }))
  return { itens, fornecedores, propostas }
}

const prazosTexto = (p: number[] | null) => (p?.length ? `${p.join('/')} dias` : 'não informado')

// O que a IA recebe para comparar: os números já vêm calculados pelo sistema.
export function resumoParaIA(itens: ItemCotacao[], fornecedores: FornecedorCotacao[], propostas: Proposta[]) {
  const linhasItens = itens.map(
    (i) => `- item ${i.id}: ${i.quantidade} ${i.unidade} de ${i.descricao}${i.orcado !== null ? ` (orçado ${brl(i.orcado)} por ${i.unidade})` : ' (fora do orçamento)'}`,
  )
  const linhasProp = fornecedores.map((f) => {
    const p = propostas.find((x) => x.fornecedorId === f.fornecedorId)!
    const r = resumirProposta(itens, p)
    const precos = itens.map((i) => {
      const v = p.precos[i.id]
      return v === undefined ? `item ${i.id} sem resposta` : v === null ? `item ${i.id} não tem` : `item ${i.id} ${brl(v)}/${i.unidade} (${brl(v * i.quantidade)})`
    })
    return `Fornecedor ${f.fornecedorId} (${f.nome}): ${precos.join('; ')}. Subtotal ${brl(r.subtotal)}, frete ${f.frete === null ? 'não informado' : brl(f.frete)}, total ${brl(r.total)}; entrega ${f.prazoEntrega === null ? 'não informada' : `${f.prazoEntrega} dias`}; pagamento ${prazosTexto(f.prazos)}.`
  })
  const menor = menorPorItem(itens, propostas)
  const linhasMenor = itens.map((i) => `- item ${i.id}: ${menor[i.id] ? `fornecedor ${menor[i.id]}` : 'ninguém cotou'}`)
  return `Itens da cotação:\n${linhasItens.join('\n')}\n\nPropostas:\n${linhasProp.join('\n')}\n\nMenor preço unitário por item (sem considerar frete):\n${linhasMenor.join('\n')}`
}
