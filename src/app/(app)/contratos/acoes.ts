'use server'

import { redirect, notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever, lerConfig, type Tx } from '@/lib/db'
import { exigirSessao, nomePerfil, obraDeTrabalho, podeMedir, type Sessao } from '@/lib/sessao'
import { faixaDaCompra, centavos, totalItem, brl, avancoMedido, itemDaMedicao } from '@/lib/regras'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const dataValida = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x + 'T00:00:00Z'))

async function carregarContrato(s: Sessao, id: number) {
  const [c] = await sql<{ obraId: number; fornecedorId: number; objeto: string }[]>`
    select obra_id as "obraId", fornecedor_id as "fornecedorId", objeto from contratos where id = ${id}`
  if (!c || (s.perfil === 'obra' && s.obraId !== c.obraId)) notFound()
  return c
}

type ItemLido = { subetapaId: number; descricao: string; unidade: string; quantidade: number; preco: number }

// Itens vêm em listas paralelas (uma linha por item no formulário); linha sem serviço é ignorada.
async function lerItens(d: FormData, obraId: number): Promise<ItemLido[] | string> {
  const subs = d.getAll('item_subetapa').map(Number)
  const descricoes = d.getAll('item_descricao').map((x) => String(x).trim())
  const unidades = d.getAll('item_unidade').map((x) => String(x).trim())
  const qtds = d.getAll('item_quantidade').map(Number)
  const precos = d.getAll('item_preco').map(Number)
  const itens: ItemLido[] = []
  for (const [i, subetapaId] of subs.entries()) {
    if (!subetapaId) continue
    const n = itens.length + 1
    if (!descricoes[i]) return `Item ${n}: descreva o serviço.`
    if (!unidades[i]) return `Item ${n}: informe a unidade (m², m, un…).`
    if (!(qtds[i] > 0)) return `Item ${n}: informe a quantidade contratada.`
    if (!(precos[i] >= 0) || isNaN(precos[i])) return `Item ${n}: informe o preço unitário.`
    itens.push({ subetapaId, descricao: descricoes[i], unidade: unidades[i], quantidade: qtds[i], preco: precos[i] })
  }
  if (!itens.length) return 'Inclua pelo menos um serviço no contrato.'
  const ids = [...new Set(itens.map((i) => i.subetapaId))]
  const validas = await sql`
    select s.id from subetapas s join etapas e on e.id = s.etapa_id where s.id in ${sql(ids)} and e.obra_id = ${obraId} and not e.importada`
  if (validas.length !== ids.length) return 'Algum serviço não é desta obra. Recarregue a página.'
  return itens
}

const gravarItens = (tx: Tx, contratoId: number, itens: ItemLido[], aditivo: boolean) =>
  Promise.all(
    itens.map(
      (i) => tx`
        insert into contrato_itens (contrato_id, subetapa_id, descricao, unidade, quantidade, preco_unitario, aditivo)
        values (${contratoId}, ${i.subetapaId}, ${i.descricao}, ${i.unidade}, ${i.quantidade}, ${i.preco}, ${aditivo})`,
    ),
  )

export async function criarContrato(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'compras', 'chefe')
  const obraId = await obraDeTrabalho(s, d.get('obra'))
  if (!obraId) return { erro: 'Escolha a obra do contrato.' }
  const objeto = texto(d, 'objeto')
  if (!objeto) return { erro: 'Descreva o objeto do contrato (ex.: pintura interna da torre A).' }
  const inicio = texto(d, 'inicio')
  if (!dataValida(inicio)) return { erro: 'Informe a data de início.' }
  const fornecedorId = Number(d.get('fornecedor')) || 0
  const novoFornecedor = texto(d, 'fornecedor_nome')
  if (!fornecedorId && !novoFornecedor) return { erro: 'Escolha o empreiteiro ou cadastre um novo.' }
  const itens = await lerItens(d, obraId)
  if (typeof itens === 'string') return { erro: itens }

  const id = await escrever(nomePerfil(s), async (tx) => {
    let fid = fornecedorId
    if (!fid) {
      const [f] = await tx<{ id: number }[]>`
        insert into fornecedores (nome, cnpj) values (${novoFornecedor}, ${texto(d, 'fornecedor_cnpj') || null})
        on conflict (empresa_id, nome) do update set nome = excluded.nome
        returning id`
      fid = f.id
    }
    const [c] = await tx<{ id: number }[]>`
      insert into contratos (obra_id, fornecedor_id, objeto, inicio) values (${obraId}, ${fid}, ${objeto}, ${inicio}) returning id`
    await gravarItens(tx, c.id, itens, false)
    return c.id
  })
  redirect(`/contratos/${id}`)
}

// Serviço que faltou, serviço novo ou mais quantidade, inclusive fora do orçamento. Só fica marcado como aditivo
// quando quem inclui diz que é (mudança combinada depois do contrato assinado).
export async function incluirItens(contratoId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'compras', 'chefe')
  const c = await carregarContrato(s, contratoId)
  const itens = await lerItens(d, c.obraId)
  if (typeof itens === 'string') return { erro: itens }
  const aditivo = d.get('aditivo') === 'on'
  await escrever(nomePerfil(s), (tx) => gravarItens(tx, contratoId, itens, aditivo))
  refresh()
  return { ok: aditivo ? 'Aditivo incluído no contrato.' : 'Serviço incluído no contrato.' }
}

/**
 * Medição: quanto foi executado de cada item. Vira conta a pagar já aprovada (quem mede é quem aprova) e
 * atualiza o % feito dos serviços medidos (nunca diminui o que já estava marcado).
 */
export async function lancarMedicao(contratoId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'chefe')
  const c = await carregarContrato(s, contratoId)
  if (!podeMedir(s, c.obraId)) return { erro: 'Só o engenheiro da obra ou o dono lançam medição.' }
  const data = texto(d, 'data')
  if (!dataValida(data)) return { erro: 'Informe a data da medição.' }
  const vencimento = texto(d, 'vencimento')
  if (!dataValida(vencimento)) return { erro: 'Informe quando o empreiteiro recebe (vencimento).' }

  const itens = await sql<{ id: number; subetapaId: number; descricao: string; unidade: string; quantidade: number; precoUnitario: number; medido: number }[]>`
    select id, subetapa_id as "subetapaId", descricao, unidade, quantidade, preco_unitario as "precoUnitario", medido
    from v_contrato_itens where contrato_id = ${contratoId} order by id`
  const modo = (['quantidade', 'percentual', 'valor'] as const).find((m) => m === texto(d, 'modo')) ?? 'quantidade'
  const medidos: { item: (typeof itens)[number]; quantidade: number; valor: number }[] = []
  for (const item of itens) {
    const bruto = texto(d, `medir_${item.id}`).replace(',', '.')
    if (!bruto) continue
    const m = itemDaMedicao(modo, Number(bruto), item)
    if (typeof m === 'string') return { erro: `${item.descricao}: ${m}.` }
    const saldo = item.quantidade - item.medido
    // 0,0001 de folga: medir o saldo inteiro por valor ou por % arredonda na 4ª casa
    if (m.quantidade > saldo + 1e-4)
      return {
        erro: `${item.descricao}: o saldo do contrato é ${saldo.toLocaleString('pt-BR')} ${item.unidade} (${brl(totalItem(saldo, item.precoUnitario))}). Para medir mais, inclua o serviço de novo no contrato.`,
      }
    medidos.push({ item, quantidade: Math.min(m.quantidade, saldo), valor: m.valor })
  }
  if (!medidos.length) return { erro: 'Informe quanto foi executado de pelo menos um item.' }
  const valor = medidos.reduce((t, m) => t + centavos(m.valor), 0) / 100
  if (!(valor > 0)) return { erro: 'A medição ficou sem valor: confira os preços do contrato.' }
  const config = await lerConfig()

  const numero = await escrever(nomePerfil(s), async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select coalesce(max(numero), 0) + 1 as n from medicoes where contrato_id = ${contratoId}`
    const [compra] = await tx<{ id: number }[]>`
      insert into compras (obra_id, fornecedor_id, descricao, valor, faixa, situacao, tipo_documento, numero_documento, emissao)
      values (${c.obraId}, ${c.fornecedorId}, ${`Medição ${n} · ${c.objeto}`}, ${valor}, ${faixaDaCompra(valor, config.tetoBaixo, config.tetoMedio)},
              'aprovada', 'contrato', ${`Contrato ${contratoId} · medição ${n}`}, ${data})
      returning id`
    await tx`insert into parcelas (compra_id, numero, valor, vencimento) values (${compra.id}, 1, ${valor}, ${vencimento})`
    const [m] = await tx<{ id: number }[]>`
      insert into medicoes (contrato_id, numero, data, compra_id) values (${contratoId}, ${n}, ${data}, ${compra.id}) returning id`
    for (const x of medidos) {
      await tx`
        insert into compra_itens (compra_id, subetapa_id, descricao, quantidade, unidade, valor)
        values (${compra.id}, ${x.item.subetapaId}, ${x.item.descricao}, ${x.quantidade}, ${x.item.unidade}, ${x.valor})`
      await tx`insert into medicao_itens (medicao_id, contrato_item_id, quantidade, valor) values (${m.id}, ${x.item.id}, ${x.quantidade}, ${x.valor})`
    }
    await atualizarAvanco(tx, [...new Set(medidos.map((x) => x.item.subetapaId))])
    return n
  })
  refresh()
  return { ok: `Medição ${numero} lançada: ${brl(valor)} a pagar ao empreiteiro, e o % feito dos serviços atualizado.` }
}

// % feito de cada serviço = tudo que já foi medido nele (todos os contratos) ÷ quantidade do orçamento.
async function atualizarAvanco(tx: Tx, subetapaIds: number[]) {
  const linhas = await tx<{ subetapaId: number; quantidade: number | null; unidade: string | null; unidadeMedida: string; medido: number }[]>`
    select s.id as "subetapaId", s.quantidade, s.unidade, ci.unidade as "unidadeMedida", sum(ci.medido) as medido
    from subetapas s join v_contrato_itens ci on ci.subetapa_id = s.id
    where s.id in ${tx(subetapaIds)}
    group by s.id, s.quantidade, s.unidade, ci.unidade`
  for (const id of subetapaIds) {
    const doServico = linhas.filter((l) => l.subetapaId === id)
    if (!doServico.length) continue
    const servico = doServico[0]
    const medido = doServico.filter((l) => avancoMedido(0, servico, l.unidadeMedida) !== null).reduce((t, l) => t + l.medido, 0)
    const pct = avancoMedido(medido, servico, servico.unidade ?? '')
    if (pct !== null) await tx`update subetapas set progresso = greatest(progresso, ${pct}) where id = ${id}`
  }
}
