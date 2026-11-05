'use server'

import { notFound, redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever, type Tx } from '@/lib/db'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import type { Estado } from '@ds'
import { TIPOS_ITEM } from '@/components/rotulos'

// Orçamento é montado pelo chefe e pelo financeiro; o engenheiro só consulta.
const exigir = () => exigirSessao('chefe', 'financeiro')
const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()

async function carregar(orcamentoId: number) {
  const [o] = await sql<{ obraId: number; versao: number; situacao: string }[]>`
    select obra_id as "obraId", versao, situacao from orcamentos where id = ${orcamentoId}`
  if (!o) notFound()
  return o
}

// O banco recusa mexer em itens fora do rascunho (gatilho travar_orcamento); traduz o erro.
async function gravar(perfil: string, fn: (tx: Tx) => Promise<unknown>): Promise<Estado> {
  try {
    await escrever(perfil, fn)
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === 'P0001') return { erro: err.message ?? 'Operação não permitida.' }
    if (err.code === '23505') return { erro: 'Já existe uma versão em edição para esta obra.' }
    throw e
  }
  refresh()
  return null
}

function lerItem(d: FormData) {
  const item = {
    descricao: texto(d, 'descricao'),
    unidade: texto(d, 'unidade'),
    quantidade: Number(d.get('quantidade')),
    preco: Number(d.get('preco_unitario')),
    tipo: texto(d, 'tipo'),
  }
  if (!item.descricao) return 'Descreva o item.'
  if (!item.unidade) return 'Informe a unidade (m³, saco, m², diária…).'
  if (!(item.quantidade > 0)) return 'A quantidade precisa ser maior que zero.'
  if (!(item.preco >= 0)) return 'Informe o preço unitário.'
  if (!Object.hasOwn(TIPOS_ITEM, item.tipo)) return 'Escolha o tipo do item.'
  return item
}

export async function iniciarOrcamento(obraId: number): Promise<Estado> {
  const s = await exigir()
  const [o] = await sql`select 1 from obras where id = ${obraId}`
  if (!o) notFound()
  const r = await gravar(nomePerfil(s), (tx) => tx`
    insert into orcamentos (obra_id, versao)
    select ${obraId}, 1 where not exists (select 1 from orcamentos where obra_id = ${obraId})`)
  if (r) return r
  redirect(`/orcamento/${obraId}?editar=1`)
}

export async function salvarInvestidor(obraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigir()
  await escrever(nomePerfil(s), (tx) => tx`
    update obras set investidor = ${texto(d, 'investidor') || null}, investidor_contato = ${texto(d, 'contato') || null}
    where id = ${obraId}`)
  refresh()
  return { ok: 'Salvo.' }
}

export async function salvarBdi(orcamentoId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigir()
  const o = await carregar(orcamentoId)
  if (o.situacao !== 'rascunho') return { erro: 'A margem só muda com o orçamento em rascunho.' }
  const bdi = Number(d.get('bdi'))
  if (!(bdi >= 0) || texto(d, 'bdi') === '') return { erro: 'Informe a margem em %, por exemplo 25.' }
  return (await gravar(nomePerfil(s), (tx) => tx`update orcamentos set bdi = ${bdi} where id = ${orcamentoId}`)) ?? { ok: 'Margem salva.' }
}

export async function adicionarItem(orcamentoId: number, subetapaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigir()
  const o = await carregar(orcamentoId)
  const [sub] = await sql`
    select 1 from subetapas s join etapas e on e.id = s.etapa_id where s.id = ${subetapaId} and e.obra_id = ${o.obraId}`
  if (!sub) notFound()
  const item = lerItem(d)
  if (typeof item === 'string') return { erro: item }
  return (
    (await gravar(nomePerfil(s), (tx) => tx`
      insert into orcamento_itens (orcamento_id, subetapa_id, descricao, unidade, quantidade, preco_unitario, tipo)
      values (${orcamentoId}, ${subetapaId}, ${item.descricao}, ${item.unidade}, ${item.quantidade}, ${item.preco}, ${item.tipo})`)) ?? {
      ok: 'Item incluído.',
    }
  )
}

export async function salvarItem(itemId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigir()
  const item = lerItem(d)
  if (typeof item === 'string') return { erro: item }
  return (
    (await gravar(nomePerfil(s), (tx) => tx`
      update orcamento_itens set descricao = ${item.descricao}, unidade = ${item.unidade}, quantidade = ${item.quantidade},
        preco_unitario = ${item.preco}, tipo = ${item.tipo}
      where id = ${itemId}`)) ?? { ok: 'Salvo.' }
  )
}

export async function removerItem(itemId: number): Promise<Estado> {
  const s = await exigir()
  return gravar(nomePerfil(s), (tx) => tx`delete from orcamento_itens where id = ${itemId}`)
}

const TRANSICOES: Record<string, string[]> = {
  enviado: ['rascunho'],
  rascunho: ['enviado'],
  aprovado: ['rascunho', 'enviado'],
}

export async function mudarSituacao(orcamentoId: number, para: 'rascunho' | 'enviado' | 'aprovado'): Promise<Estado> {
  const s = await exigir()
  const o = await carregar(orcamentoId)
  if (!TRANSICOES[para]?.includes(o.situacao)) return { erro: 'Essa mudança não é possível na situação atual.' }
  const [{ itens }] = await sql<{ itens: number }[]>`select count(*)::int as itens from orcamento_itens where orcamento_id = ${orcamentoId}`
  if (para !== 'rascunho' && itens === 0) return { erro: 'Inclua pelo menos um item antes.' }
  return gravar(nomePerfil(s), async (tx) => {
    // Aprovar uma revisão aposenta a versão aprovada anterior.
    if (para === 'aprovado') {
      await tx`update orcamentos set situacao = 'substituido' where obra_id = ${o.obraId} and situacao = 'aprovado'`
    }
    await tx`
      update orcamentos set situacao = ${para}, aprovado_em = case when ${para} = 'aprovado' then now() end
      where id = ${orcamentoId} and situacao = ${o.situacao}`
  })
}

export async function criarRevisao(orcamentoId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigir()
  const o = await carregar(orcamentoId)
  if (o.situacao !== 'aprovado') return { erro: 'Revisão parte do orçamento aprovado.' }
  const motivo = texto(d, 'motivo')
  if (!motivo) return { erro: 'Escreva o motivo da revisão (por exemplo, aditivo de contrato).' }
  const r = await gravar(nomePerfil(s), async (tx) => {
    const [nova] = await tx<{ id: number }[]>`
      insert into orcamentos (obra_id, versao, bdi, motivo)
      select obra_id, (select max(versao) + 1 from orcamentos where obra_id = ${o.obraId}), bdi, ${motivo}
      from orcamentos where id = ${orcamentoId}
      returning id`
    // A chave do item continua a mesma: compras já feitas seguem ligadas a ele.
    await tx`
      insert into orcamento_itens (orcamento_id, chave, subetapa_id, descricao, unidade, quantidade, preco_unitario, tipo)
      select ${nova.id}, chave, subetapa_id, descricao, unidade, quantidade, preco_unitario, tipo
      from orcamento_itens where orcamento_id = ${orcamentoId} order by id`
  })
  if (r) return r
  redirect(`/orcamento/${o.obraId}?editar=1`)
}
