'use server'

import { redirect, notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever, lerConfig, hoje } from '@/lib/db'
import { exigirSessao, podeVerObra, nomePerfil, obraDeTrabalho } from '@/lib/sessao'
import { centavos, brl } from '@/lib/regras'
import { normalizarWhatsapp, ratearFrete, parcelasPorPrazos, economia, validarRecomendacao } from '@/lib/cotacao'
import { carregarCotacao, dadosCotacao, resumoParaIA, type ItemCotacao } from '@/lib/cotacoes'
import { registrarCompra } from '@/lib/compras'
import { pedirCotacao, registrarEntrada, processarFornecedor, enviarPedido } from '@/lib/conversa'
import { iaDisponivel, compararPropostas, ErroIA } from '@/lib/ia'
import { validarArquivo, enviarArquivo } from '@/lib/storage'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const dataValida = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x + 'T00:00:00Z'))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function criarCotacao(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'compras')
  const obraId = await obraDeTrabalho(s, d.get('obra'))
  if (!obraId) return { erro: 'Escolha a obra da cotação.' }
  const titulo = texto(d, 'titulo')
  const prazo = texto(d, 'prazo_resposta')
  if (!titulo) return { erro: 'Dê um nome para a cotação (ex.: Concreto da fundação).' }
  if (!dataValida(prazo) || prazo < (await hoje())) return { erro: 'Informe até quando os fornecedores podem responder.' }

  // Itens do orçamento vigente marcados, com a quantidade a cotar.
  const chaves = d.getAll('item').map(String).filter((c) => UUID.test(c))
  const doOrcamento = chaves.length
    ? await sql<{ chave: string; subetapaId: number; descricao: string; unidade: string }[]>`
        select i.chave, i.subetapa_id as "subetapaId", i.descricao, i.unidade
        from orcamento_itens i join v_orcamento_vigente o on o.id = i.orcamento_id
        where o.obra_id = ${obraId} and i.chave in ${sql(chaves)}`
    : []
  const itens = doOrcamento.map((i) => ({ ...i, quantidade: Number(d.get(`qtd_${i.chave}`)) }))
  // Itens fora do orçamento.
  const livres = d.getAll('livre_descricao').map((desc, k) => ({
    chave: null,
    descricao: String(desc).trim(),
    unidade: String(d.getAll('livre_unidade')[k] ?? '').trim(),
    quantidade: Number(d.getAll('livre_quantidade')[k]),
    subetapaId: Number(d.getAll('livre_subetapa')[k]),
  }))
  const todos = [...itens, ...livres.filter((l) => l.descricao)]
  if (!todos.length) return { erro: 'Escolha pelo menos um item para cotar.' }
  if (todos.some((i) => !(i.quantidade > 0) || !i.unidade)) return { erro: 'Cada item precisa de quantidade e unidade.' }
  if (todos.some((i) => !i.subetapaId)) return { erro: 'Escolha a etapa de cada item fora do orçamento.' }
  const subs = await sql<{ id: number }[]>`
    select s.id from subetapas s join etapas e on e.id = s.etapa_id
    where e.obra_id = ${obraId} and s.id in ${sql(todos.map((i) => i.subetapaId))}`
  if (todos.some((i) => !subs.some((x) => x.id === i.subetapaId))) return { erro: 'Escolha a etapa de cada item fora do orçamento.' }

  const fornecedores = d.getAll('fornecedor').map(Number).filter(Boolean)
  const novoNome = texto(d, 'novo_nome')
  const novoZap = texto(d, 'novo_whatsapp')
  if (novoZap && !normalizarWhatsapp(novoZap)) return { erro: 'WhatsApp do novo fornecedor inválido. Use DDD e número.' }
  if (!fornecedores.length && !novoNome) return { erro: 'Escolha pelo menos um fornecedor.' }

  const id = await escrever(nomePerfil(s), async (tx) => {
    if (novoNome) {
      const [f] = await tx<{ id: number }[]>`
        insert into fornecedores (nome, whatsapp) values (${novoNome}, ${normalizarWhatsapp(novoZap)})
        on conflict (empresa_id, nome) do update set whatsapp = coalesce(fornecedores.whatsapp, excluded.whatsapp)
        returning id`
      fornecedores.push(f.id)
    }
    const [c] = await tx<{ id: number }[]>`
      insert into cotacoes (obra_id, titulo, prazo_resposta) values (${obraId}, ${titulo}, ${prazo}) returning id`
    for (const i of todos) {
      await tx`
        insert into cotacao_itens (cotacao_id, subetapa_id, item_chave, descricao, quantidade, unidade)
        values (${c.id}, ${i.subetapaId}, ${i.chave}, ${i.descricao}, ${i.quantidade}, ${i.unidade})`
    }
    for (const f of new Set(fornecedores)) {
      await tx`insert into cotacao_fornecedores (cotacao_id, fornecedor_id) values (${c.id}, ${f})`
    }
    return c.id
  })
  redirect(`/cotacoes/${id}`)
}

export async function enviarPedidos(cotacaoId: number): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCotacao(s, cotacaoId)
  if (c.situacao === 'concluida' || c.situacao === 'cancelada') return { erro: 'Esta cotação já foi encerrada.' }
  const r = await pedirCotacao(cotacaoId, nomePerfil(s))
  refresh()
  const partes = [`Pedido enviado a ${r.enviados} fornecedor(es).`]
  if (r.semWhatsapp.length) partes.push(`Sem WhatsApp (cole a resposta deles aqui): ${r.semWhatsapp.join(', ')}.`)
  if (r.erros.length) partes.push(`Falhou: ${r.erros.join('; ')}.`)
  return r.erros.length ? { erro: partes.join(' ') } : { ok: partes.join(' ') }
}

export async function adicionarFornecedor(cotacaoId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCotacao(s, cotacaoId)
  if (c.situacao === 'concluida' || c.situacao === 'cancelada') return { erro: 'Esta cotação já foi encerrada.' }
  const fornecedorId = Number(d.get('fornecedor'))
  if (!fornecedorId) return { erro: 'Escolha o fornecedor.' }
  await escrever(nomePerfil(s), (tx) => tx`
    insert into cotacao_fornecedores (cotacao_id, fornecedor_id) values (${cotacaoId}, ${fornecedorId})
    on conflict do nothing`)
  refresh()
  return { ok: 'Fornecedor incluído. Use "Pedir cotação" para mandar a mensagem a ele.' }
}

async function carregarProposta(cfId: number) {
  const s = await exigirSessao()
  const [cf] = await sql<{ cotacaoId: number; fornecedorId: number }[]>`
    select cotacao_id as "cotacaoId", fornecedor_id as "fornecedorId" from cotacao_fornecedores where id = ${cfId}`
  if (!cf) notFound()
  const c = await carregarCotacao(s, cf.cotacaoId)
  return { s, c, cf }
}

// Correção ou preenchimento à mão: o engenheiro tem a palavra final sobre o que a IA leu.
export async function salvarProposta(cfId: number, _: Estado, d: FormData): Promise<Estado> {
  const { s, c } = await carregarProposta(cfId)
  if (c.situacao !== 'aguardando' && c.situacao !== 'rascunho') return { erro: 'Esta cotação já foi encerrada.' }
  const { itens } = await dadosCotacao(c.id)
  const precos: { item: number; preco: number | null | undefined }[] = []
  for (const i of itens) {
    const bruto = texto(d, `preco_${i.id}`)
    const naoTem = d.get(`nao_tem_${i.id}`) === 'on'
    const v = Number(bruto.replace(',', '.'))
    if (bruto && !(v >= 0)) return { erro: `Preço inválido em ${i.descricao}.` }
    precos.push({ item: i.id, preco: naoTem ? null : bruto ? v : undefined })
  }
  const frete = texto(d, 'frete')
  const prazo = texto(d, 'prazo_entrega')
  const prazos = texto(d, 'prazos')
  const listaPrazos = prazos ? prazos.split(/[\s/;,]+/).filter(Boolean).map(Number) : null
  if (listaPrazos && listaPrazos.some((x) => !Number.isInteger(x) || x < 0 || x > 720))
    return { erro: 'Pagamento: escreva os dias de cada parcela, como 30/60/90 (0 = à vista).' }
  const completa = precos.every((p) => p.preco !== undefined) && frete !== '' && prazo !== '' && !!listaPrazos

  await escrever(nomePerfil(s), async (tx) => {
    for (const p of precos) {
      if (p.preco === undefined) await tx`delete from cotacao_precos where cotacao_fornecedor_id = ${cfId} and cotacao_item_id = ${p.item}`
      else
        await tx`
          insert into cotacao_precos (cotacao_fornecedor_id, cotacao_item_id, preco_unitario) values (${cfId}, ${p.item}, ${p.preco})
          on conflict (cotacao_fornecedor_id, cotacao_item_id) do update set preco_unitario = excluded.preco_unitario`
    }
    await tx`
      update cotacao_fornecedores set frete = ${frete === '' ? null : Number(frete.replace(',', '.'))},
        prazo_entrega_dias = ${prazo === '' ? null : Number(prazo)}, prazos_pagamento = ${listaPrazos}::int[],
        situacao = case when ${completa} then 'respondeu' else situacao end
      where id = ${cfId}`
  })
  refresh()
  return { ok: 'Proposta salva.' }
}

// Resposta que chegou por fora (WhatsApp pessoal, e-mail, telefone): cola o texto ou anexa a foto/PDF e a IA lê.
export async function colarResposta(cfId: number, _: Estado, d: FormData): Promise<Estado> {
  const { c, cf } = await carregarProposta(cfId)
  if (c.situacao !== 'aguardando') return { erro: 'Primeiro use "Pedir cotação" para abrir a cotação.' }
  const conteudo = texto(d, 'texto')
  const arquivo = validarArquivo(d.get('arquivo'))
  if (typeof arquivo === 'string') return { erro: arquivo }
  if (!conteudo && !arquivo) return { erro: 'Cole o texto ou anexe a foto/PDF da resposta.' }
  const caminho = arquivo ? await enviarArquivo(`fornecedor-${cf.fornecedorId}`, arquivo) : null
  await registrarEntrada(cf.fornecedorId, {
    texto: conteudo || null,
    anexo: arquivo && caminho ? { caminho, tipo: arquivo.type } : undefined,
    autor: 'pessoa',
  })
  const aviso = await processarFornecedor(cf.fornecedorId, { responder: false })
  refresh()
  return aviso ? { erro: aviso } : { ok: 'A IA leu a resposta e preencheu a proposta. Confira os valores.' }
}

export async function analisarCotacao(cotacaoId: number): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCotacao(s, cotacaoId)
  if (c.situacao !== 'aguardando') return { erro: 'Só dá para analisar uma cotação em andamento.' }
  if (!iaDisponivel()) return { erro: 'A IA está desligada (falta a chave OPENAI_API_KEY). Use a sugestão de menor preço.' }
  const { itens, fornecedores, propostas } = await dadosCotacao(cotacaoId)
  if (!propostas.some((p) => Object.values(p.precos).some((v) => typeof v === 'number'))) return { erro: 'Nenhum fornecedor passou preço ainda.' }
  try {
    const r = await compararPropostas(resumoParaIA(itens, fornecedores, propostas))
    const escolhas = validarRecomendacao(r.escolhas, itens, propostas)
    await escrever(nomePerfil(s), (tx) => tx`
      update cotacoes set recomendacao = ${tx.json({ escolhas, explicacao: r.explicacao })} where id = ${cotacaoId}`)
  } catch (e) {
    if (e instanceof ErroIA) return { erro: e.message }
    throw e
  }
  refresh()
  return { ok: 'Análise pronta.' }
}

export async function gerarCompras(cotacaoId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCotacao(s, cotacaoId)
  if (c.situacao !== 'aguardando') return { erro: 'Esta cotação não está em andamento.' }
  const { itens, fornecedores, propostas } = await dadosCotacao(cotacaoId)

  const escolhas: Record<number, number> = {}
  for (const i of itens) {
    const f = Number(d.get(`escolha_${i.id}`)) || 0
    if (!f) continue
    const preco = propostas.find((p) => p.fornecedorId === f)?.precos[i.id]
    if (typeof preco !== 'number' || preco <= 0) return { erro: `O fornecedor escolhido não cotou ${i.descricao}.` }
    escolhas[i.id] = f
  }
  if (!Object.keys(escolhas).length) return { erro: 'Escolha de quem comprar pelo menos um item.' }

  const indicada = c.recomendacao?.escolhas
  const diferente = !!indicada && itens.some((i) => (indicada[i.id] ?? 0) !== (escolhas[i.id] ?? 0))
  const motivo = texto(d, 'motivo')
  if (diferente && !motivo) return { erro: 'Sua escolha é diferente da indicada pela IA: escreva o motivo.' }

  const [config, dia] = await Promise.all([lerConfig(), hoje()])
  const grupos = new Map<number, ItemCotacao[]>()
  for (const i of itens) if (escolhas[i.id]) grupos.set(escolhas[i.id], [...(grupos.get(escolhas[i.id]) ?? []), i])
  const pedidos = [...grupos].map(([fornecedorId, its]) => {
    const f = fornecedores.find((x) => x.fornecedorId === fornecedorId)!
    const p = propostas.find((x) => x.fornecedorId === fornecedorId)!
    const valores = ratearFrete(its.map((i) => centavos(p.precos[i.id]! * i.quantidade) / 100), f.frete ?? 0)
    return { f, its, valores, total: valores.reduce((t, v) => t + centavos(v), 0) / 100 }
  })
  const justificativa = motivo || c.recomendacao?.explicacao || null
  if (!justificativa && pedidos.some((p) => p.total > config.tetoMedio))
    return { erro: `Uma das compras passa ${brl(config.tetoMedio)} e vai para o dono: escreva o motivo da compra.` }

  const criadas = await escrever(nomePerfil(s), async (tx) => {
    const feitas = []
    for (const p of pedidos) {
      feitas.push(
        await registrarCompra(tx, {
          obraId: c.obraId,
          fornecedorId: p.f.fornecedorId,
          descricao: `Cotação nº ${cotacaoId}: ${p.its.map((i) => i.descricao).join(', ')}`,
          justificativa,
          itens: p.its.map((i, k) => ({
            subetapaId: i.subetapaId,
            itemChave: i.itemChave,
            descricao: i.descricao,
            quantidade: i.quantidade,
            unidade: i.unidade,
            valor: p.valores[k],
          })),
          parcelas: parcelasPorPrazos(p.total, p.f.prazos, dia),
          cotacaoId,
          tetos: config,
        }),
      )
      await tx`update cotacao_itens set fornecedor_escolhido = ${p.f.fornecedorId} where id in ${tx(p.its.map((i) => i.id))}`
    }
    await tx`
      update cotacoes set situacao = 'concluida', motivo_escolha = ${diferente ? motivo : null},
        economia = ${economia(itens, propostas, escolhas)}
      where id = ${cotacaoId}`
    return feitas
  })
  // Compra que já nasce aprovada (teto baixo) avisa o fornecedor na hora; as outras, quando forem aprovadas.
  const avisos = []
  for (const compra of criadas) if (compra.situacao === 'aprovada') avisos.push(await enviarPedido(compra.id))
  refresh()
  return { ok: [`${criadas.length} compra(s) criada(s).`, ...avisos.filter(Boolean)].join(' ') }
}

export async function cancelarCotacao(cotacaoId: number): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCotacao(s, cotacaoId)
  if (c.situacao === 'concluida' || c.situacao === 'cancelada') return { erro: 'Esta cotação já foi encerrada.' }
  if (!podeVerObra(s, c.obraId)) notFound()
  await escrever(nomePerfil(s), (tx) => tx`update cotacoes set situacao = 'cancelada' where id = ${cotacaoId}`)
  refresh()
  return { ok: 'Cotação cancelada.' }
}
