'use server'

import { redirect } from 'next/navigation'
import { refresh } from 'next/cache'
import { sql, escrever, lerConfig } from '@/lib/db'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import { brl, centavos, dataBR, restanteDoPagamento } from '@/lib/regras'
import { registrarDocumento } from '@/lib/compras'
import { validarArquivo, enviarArquivo } from '@/lib/storage'
import { NATUREZAS, TIPOS_DOCUMENTO } from '@/components/rotulos'
import type { Estado } from '@ds'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const dataValida = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x + 'T00:00:00Z'))
const TIPOS_ANEXO = ['nota_fiscal', 'boleto', 'pedido', 'orcamento', 'comprovante', 'outro']

// Campos comuns aos documentos a pagar e a receber.
function lerDocumento(d: FormData) {
  const natureza = texto(d, 'natureza') || 'provisao'
  const tipoDocumento = texto(d, 'tipo_documento') || null
  const emissao = texto(d, 'emissao') || null
  if (!Object.hasOwn(NATUREZAS, natureza)) return 'Escolha o tipo: provisão, previsão ou adiantamento.'
  if (tipoDocumento && !Object.hasOwn(TIPOS_DOCUMENTO, tipoDocumento)) return 'Escolha o tipo de documento.'
  if (emissao && !dataValida(emissao)) return 'Data de emissão inválida.'
  return { natureza, tipoDocumento, numeroDocumento: texto(d, 'numero_documento') || null, emissao }
}

function lerParcelas(d: FormData, valor: number) {
  const valores = d.getAll('parcela_valor').map(Number)
  const vencimentos = d.getAll('parcela_vencimento').map(String)
  if (!valores.length || valores.length !== vencimentos.length) return 'Informe as parcelas.'
  if (valores.some((v) => !(v > 0)) || vencimentos.some((v) => !dataValida(v))) return 'Cada parcela precisa de valor e data de vencimento.'
  const soma = valores.reduce((t, v) => t + centavos(v), 0)
  if (soma !== centavos(valor)) return `A soma das parcelas (${brl(soma / 100)}) não bate com o valor total (${brl(valor)}).`
  return valores.map((v, i) => ({ valor: v, vencimento: vencimentos[i] }))
}

export async function salvarSaldo(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const valor = Number(d.get('valor'))
  const data = texto(d, 'data')
  if (texto(d, 'valor') === '' || !Number.isFinite(valor)) return { erro: 'Informe o saldo.' }
  if (!dataValida(data)) return { erro: 'Informe a data do saldo.' }
  await escrever(nomePerfil(s), (tx) => tx`update config set saldo_caixa = ${valor}, saldo_caixa_em = ${data}`)
  refresh()
  return { ok: 'Saldo atualizado.' }
}

// Documento a pagar lançado pelo financeiro: imposto, aluguel, nota de material… Já entra aprovado.
export async function criarDocumentoPagar(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const obraId = Number(d.get('obra'))
  const subetapaId = Number(d.get('subetapa'))
  const [sub] = obraId && subetapaId
    ? await sql`select 1 from subetapas s join etapas e on e.id = s.etapa_id join obras o on o.id = e.obra_id where s.id = ${subetapaId} and o.id = ${obraId}`
    : []
  if (!sub) return { erro: 'Escolha a obra e o serviço (etapa) a que o documento pertence.' }
  const doc = lerDocumento(d)
  if (typeof doc === 'string') return { erro: doc }
  const descricao = texto(d, 'descricao')
  if (!descricao) return { erro: 'Descreva o documento (por exemplo, Material pintura).' }
  const valor = Number(d.get('valor'))
  if (!(valor > 0)) return { erro: 'Informe o valor.' }
  const parcelas = lerParcelas(d, valor)
  if (typeof parcelas === 'string') return { erro: parcelas }
  const fornecedorId = Number(d.get('fornecedor')) || 0
  const novoFornecedor = texto(d, 'fornecedor_nome')
  if (!fornecedorId && !novoFornecedor) return { erro: 'Escolha o fornecedor ou cadastre um novo.' }

  const arquivo = validarArquivo(d.get('arquivo'))
  if (typeof arquivo === 'string') return { erro: arquivo }
  const tipoArquivo = TIPOS_ANEXO.includes(texto(d, 'arquivo_tipo')) ? texto(d, 'arquivo_tipo') : 'nota_fiscal'
  const caminho = arquivo ? await enviarArquivo(`obra-${obraId}`, arquivo) : null
  const tetos = await lerConfig()

  const id = await escrever(nomePerfil(s), async (tx) => {
    let fid = fornecedorId
    if (!fid) {
      const [f] = await tx<{ id: number }[]>`
        insert into fornecedores (nome, cnpj) values (${novoFornecedor}, ${texto(d, 'fornecedor_cnpj') || null})
        on conflict (empresa_id, nome) do update set nome = excluded.nome
        returning id`
      fid = f.id
    }
    const novo = await registrarDocumento(tx, { obraId, fornecedorId: fid, subetapaId, descricao, ...doc, valor, parcelas, tetos })
    if (arquivo && caminho) {
      await tx`insert into anexos (compra_id, tipo, nome, caminho) values (${novo}, ${tipoArquivo}, ${arquivo.name}, ${caminho})`
    }
    return novo
  })
  redirect(`/compras/${id}`)
}

// Documento a receber (aporte, medição, contrato): uma entrada por parcela.
export async function criarEntrada(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const obraId = Number(d.get('obra'))
  const descricao = texto(d, 'descricao')
  const valor = Number(d.get('valor'))
  const [o] = obraId ? await sql`select 1 from obras where id = ${obraId}` : []
  if (!o) return { erro: 'Escolha a obra.' }
  if (!descricao) return { erro: 'Descreva a entrada (por exemplo, 3ª medição).' }
  if (!(valor > 0)) return { erro: 'Informe o valor.' }
  const doc = lerDocumento(d)
  if (typeof doc === 'string') return { erro: doc }
  // Lançamento rápido do painel: uma data só.
  const previsto = texto(d, 'previsto_para')
  const parcelas = d.getAll('parcela_valor').length ? lerParcelas(d, valor) : dataValida(previsto) ? [{ valor, vencimento: previsto }] : 'Informe a data prevista.'
  if (typeof parcelas === 'string') return { erro: parcelas }
  await escrever(nomePerfil(s), async (tx) => {
    for (const [i, p] of parcelas.entries()) {
      const nome = parcelas.length > 1 ? `${descricao} (${i + 1}/${parcelas.length})` : descricao
      await tx`
        insert into entradas (obra_id, descricao, valor, previsto_para, natureza, tipo_documento, numero_documento, emissao)
        values (${obraId}, ${nome}, ${p.valor}, ${p.vencimento}, ${doc.natureza}, ${doc.tipoDocumento}, ${doc.numeroDocumento}, ${doc.emissao})`
    }
  })
  if (d.get('voltar')) redirect('/financeiro/receber')
  refresh()
  return { ok: parcelas.length > 1 ? `${parcelas.length} parcelas lançadas.` : 'Entrada lançada.' }
}

// Recebimento inteiro ou parcial: no parcial, a entrada fica com o valor recebido e o restante vira uma entrada nova.
export async function receberEntrada(id: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const data = texto(d, 'recebida_em')
  if (!dataValida(data)) return { erro: 'Informe a data.' }
  const [e] = await sql<{ valor: number }[]>`select valor from entradas where id = ${id} and recebida_em is null and not cancelada`
  if (!e) return { erro: 'Essa entrada já foi recebida ou cancelada.' }
  const recebido = texto(d, 'valor_recebido') ? Number(d.get('valor_recebido')) : e.valor
  const resto = restanteDoPagamento(e.valor, recebido)
  if (typeof resto === 'string') return { erro: resto.replace('pago', 'recebido') }
  const venceResto = texto(d, 'restante_vencimento')
  if (resto > 0 && !dataValida(venceResto)) return { erro: `Recebimento parcial: informe quando deve entrar o restante (${brl(resto)}).` }
  const r = await escrever(nomePerfil(s), async (tx) => {
    const r = await tx`
      update entradas set recebida_em = ${data}, valor = ${recebido}
      where id = ${id} and recebida_em is null and not cancelada and valor = ${e.valor}`
    if (r.count && resto > 0) {
      await tx`
        insert into entradas (obra_id, descricao, valor, previsto_para, natureza, tipo_documento, numero_documento, emissao, saldo_de)
        select obra_id, descricao, ${resto}, ${venceResto}, natureza, tipo_documento, numero_documento, emissao, id from entradas where id = ${id}`
    }
    return r.count
  })
  if (!r) return { erro: 'Essa entrada já foi recebida ou mudou. Recarregue a página.' }
  refresh()
  return { ok: resto > 0 ? `Recebido ${brl(recebido)}. O restante, ${brl(resto)}, ficou previsto para ${dataBR(venceResto)}.` : 'Recebida.' }
}

export async function cancelarEntrada(id: number): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const r = await escrever(nomePerfil(s), (tx) => tx`
    update entradas set cancelada = true where id = ${id} and recebida_em is null and not cancelada`)
  if (!r.count) return { erro: 'Essa entrada já foi recebida ou cancelada.' }
  refresh()
  return null
}
