'use server'

import { redirect, notFound } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever, lerConfig } from '@/lib/db'
import { exigirSessao, podeVerObra, nomePerfil, obraDeTrabalho, type Sessao } from '@/lib/sessao'
import { faixaDaCompra, centavos, brl } from '@/lib/regras'
import { registrarCompra } from '@/lib/compras'
import { enviarPedido } from '@/lib/conversa'
import { validarArquivo, enviarArquivo } from '@/lib/storage'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const dataValida = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x + 'T00:00:00Z'))
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIPOS_ANEXO =['nota_fiscal', 'orcamento', 'pedido', 'boleto', 'comprovante', 'outro']

async function carregarCompra(s: Sessao, id: number) {
  const [c] = await sql<{ obraId: number; situacao: string }[]>`
    select obra_id as "obraId", situacao from v_compras where id = ${id}`
  if (!c || !podeVerObra(s, c.obraId)) notFound()
  return c
}

export async function criarCompra(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('obra', 'compras')
  const obraId = await obraDeTrabalho(s, d.get('obra'))
  if (!obraId) return { erro: 'Escolha a obra da compra.' }

  const subetapaId = Number(d.get('subetapa'))
  const [sub] = await sql`
    select 1 from subetapas s join etapas e on e.id = s.etapa_id where s.id = ${subetapaId} and e.obra_id = ${obraId}`
  if (!sub) return { erro: 'Escolha a etapa da obra a que a compra pertence.' }

  // Item do orçamento vigente, na mesma subetapa; vazio = compra fora do orçamento.
  const itemChave = texto(d, 'item') || null
  if (itemChave) {
    const [i] = UUID.test(itemChave)
      ? await sql`
          select 1 from orcamento_itens i join v_orcamento_vigente o on o.id = i.orcamento_id
          where i.chave = ${itemChave} and i.subetapa_id = ${subetapaId} and o.obra_id = ${obraId}`
      : []
    if (!i) return { erro: 'Esse item não está no orçamento desta subetapa.' }
  }

  const descricao = texto(d, 'descricao')
  if (!descricao) return { erro: 'Descreva o que está sendo comprado.' }
  const valor = Number(d.get('valor'))
  if (!(valor > 0)) return { erro: 'Informe o valor total.' }

  const valores = d.getAll('parcela_valor').map(Number)
  const vencimentos = d.getAll('parcela_vencimento').map(String)
  if (!valores.length || valores.length !== vencimentos.length) return { erro: 'Informe as parcelas.' }
  if (valores.some((v) => !(v > 0)) || vencimentos.some((v) => !dataValida(v)))
    return { erro: 'Cada parcela precisa de valor e data de vencimento.' }
  const soma = valores.reduce((t, v) => t + centavos(v), 0)
  if (soma !== centavos(valor))
    return { erro: `A soma das parcelas (${brl(soma / 100)}) não bate com o valor total (${brl(valor)}).` }

  const config = await lerConfig()
  const faixa = faixaDaCompra(valor, config.tetoBaixo, config.tetoMedio)
  const justificativa = texto(d, 'justificativa')
  if (faixa === 'alta' && !justificativa)
    return { erro: 'Acima do teto médio a compra vai para o dono: escreva o motivo da compra.' }

  const fornecedorId = Number(d.get('fornecedor')) || 0
  const novoFornecedor = texto(d, 'fornecedor_nome')
  if (!fornecedorId && !novoFornecedor) return { erro: 'Escolha o fornecedor ou cadastre um novo.' }

  const arquivo = validarArquivo(d.get('arquivo'))
  if (typeof arquivo === 'string') return { erro: arquivo }
  const tipoArquivo = TIPOS_ANEXO.includes(texto(d, 'arquivo_tipo')) ? texto(d, 'arquivo_tipo') : 'orcamento'
  const caminho = arquivo ? await enviarArquivo(`obra-${obraId}`, arquivo) : null

  const id = await escrever(nomePerfil(s), async (tx) => {
    let fid = fornecedorId
    if (!fid) {
      const [f] = await tx<{ id: number }[]>`
        insert into fornecedores (nome, cnpj, telefone)
        values (${novoFornecedor}, ${texto(d, 'fornecedor_cnpj') || null}, ${texto(d, 'fornecedor_telefone') || null})
        on conflict (empresa_id, nome) do update set nome = excluded.nome
        returning id`
      fid = f.id
    }
    const c = await registrarCompra(tx, {
      obraId,
      fornecedorId: fid,
      descricao,
      justificativa: justificativa || null,
      itens: [{ subetapaId, itemChave, descricao, quantidade: null, unidade: null, valor }],
      parcelas: valores.map((v, i) => ({ valor: v, vencimento: vencimentos[i] })),
      tetos: config,
    })
    if (arquivo && caminho) {
      await tx`insert into anexos (compra_id, tipo, nome, caminho) values (${c.id}, ${tipoArquivo}, ${arquivo.name}, ${caminho})`
    }
    return c.id
  })
  redirect(`/compras/${id}`)
}

export async function decidir(compraId: number, aprovar: boolean, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const c = await carregarCompra(s, compraId)
  const minhaVez = c.situacao === 'aguardando_financeiro' || (c.situacao === 'aguardando_chefe' && s.perfil === 'chefe')
  if (!minhaVez) return { erro: 'Essa compra não está aguardando a sua aprovação.' }
  const motivo = texto(d, 'motivo')
  if (!aprovar && !motivo) return { erro: 'Escreva o motivo da recusa. Ele volta para o engenheiro.' }
  const r = await escrever(nomePerfil(s), (tx) => tx`
    update compras set situacao = ${aprovar ? 'aprovada' : 'recusada'}, motivo = ${aprovar ? null : motivo}
    where id = ${compraId} and situacao = ${c.situacao}`)
  if (!r.count) return { erro: 'A compra mudou enquanto você analisava. Recarregue a página.' }
  // Compra que veio de cotação: só agora o pedido vai para o fornecedor.
  const aviso = aprovar ? await enviarPedido(compraId) : null
  refresh()
  return aprovar ? { ok: aviso ? `Compra liberada. ${aviso}` : 'Compra liberada.' } : { ok: 'Compra recusada.' }
}

// Para quando o pedido não saiu (ex.: o WhatsApp do fornecedor foi cadastrado depois).
export async function reenviarPedido(compraId: number): Promise<Estado> {
  const s = await exigirSessao()
  await carregarCompra(s, compraId)
  const aviso = await enviarPedido(compraId)
  refresh()
  return aviso && !aviso.startsWith('Pedido') ? { erro: aviso } : { ok: aviso ?? 'Nada a enviar.' }
}

export async function cancelar(compraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCompra(s, compraId)
  const motivo = texto(d, 'motivo')
  if (!motivo) return { erro: 'Escreva o motivo do cancelamento.' }
  const pode = c.situacao.startsWith('aguardando') || (c.situacao === 'aprovada' && (s.perfil === 'financeiro' || s.perfil === 'chefe'))
  if (!pode) return { erro: 'Essa compra não pode ser cancelada.' }
  const r = await escrever(nomePerfil(s), (tx) => tx`
    update compras set situacao = 'cancelada', motivo = ${motivo}
    where id = ${compraId} and situacao = ${c.situacao}
      and not exists (select 1 from parcelas where compra_id = ${compraId} and paga_em is not null)`)
  if (!r.count) return { erro: 'Não dá para cancelar: já existe parcela paga ou a compra mudou.' }
  refresh()
  return { ok: 'Compra cancelada.' }
}

export async function registrarPagamento(parcelaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const [p] = await sql<{ compraId: number; obraId: number; situacao: string; numero: number }[]>`
    select p.compra_id as "compraId", c.obra_id as "obraId", c.situacao, p.numero
    from parcelas p join v_compras c on c.id = p.compra_id where p.id = ${parcelaId}`
  if (!p) notFound()
  if (p.situacao !== 'aprovada') return { erro: 'Só dá para pagar parcela de compra aprovada.' }
  const data = texto(d, 'paga_em')
  if (!dataValida(data)) return { erro: 'Informe a data do pagamento.' }

  const arquivos: [string, File][] = []
  for (const tipo of ['boleto', 'comprovante']) {
    const a = validarArquivo(d.get(tipo))
    if (typeof a === 'string') return { erro: a }
    if (a) arquivos.push([tipo, a])
  }
  const enviados = await Promise.all(arquivos.map(async ([tipo, a]) => [tipo, a.name, await enviarArquivo(`obra-${p.obraId}`, a)]))

  const pagou = await escrever(nomePerfil(s), async (tx) => {
    const r = await tx`update parcelas set paga_em = ${data} where id = ${parcelaId} and paga_em is null`
    if (!r.count) return false
    for (const [tipo, nome, caminho] of enviados) {
      await tx`insert into anexos (compra_id, parcela_id, tipo, nome, caminho) values (${p.compraId}, ${parcelaId}, ${tipo}, ${nome}, ${caminho})`
    }
    return true
  })
  if (!pagou) return { erro: 'Essa parcela já estava paga.' }
  refresh()
  return { ok: `Parcela ${p.numero} paga.` }
}

export async function anexar(compraId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao()
  const c = await carregarCompra(s, compraId)
  const tipo = texto(d, 'tipo')
  if (!TIPOS_ANEXO.includes(tipo)) return { erro: 'Escolha o tipo do documento.' }
  const parcelaId = Number(d.get('parcela')) || null
  if (parcelaId) {
    const [p] = await sql`select 1 from parcelas where id = ${parcelaId} and compra_id = ${compraId}`
    if (!p) return { erro: 'Parcela inválida.' }
  }
  const arquivo = validarArquivo(d.get('arquivo'))
  if (typeof arquivo === 'string') return { erro: arquivo }
  if (!arquivo) return { erro: 'Escolha o arquivo.' }
  const caminho = await enviarArquivo(`obra-${c.obraId}`, arquivo)
  await escrever(nomePerfil(s), (tx) => tx`
    insert into anexos (compra_id, parcela_id, tipo, nome, caminho)
    values (${compraId}, ${parcelaId}, ${tipo}, ${arquivo.name}, ${caminho})`)
  refresh()
  return { ok: 'Documento anexado.' }
}
