'use server'

import { refresh } from 'next/cache'
import { sql, escrever } from '@/lib/db'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import type { Estado } from '@/components/form-acao'

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const dataValida = (x: string) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !isNaN(Date.parse(x + 'T00:00:00Z'))

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

export async function criarEntrada(_: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const obraId = Number(d.get('obra'))
  const descricao = texto(d, 'descricao')
  const valor = Number(d.get('valor'))
  const previsto = texto(d, 'previsto_para')
  const [o] = await sql`select 1 from obras where id = ${obraId}`
  if (!o) return { erro: 'Escolha a obra.' }
  if (!descricao) return { erro: 'Descreva a entrada (por exemplo, 3ª medição).' }
  if (!(valor > 0)) return { erro: 'Informe o valor.' }
  if (!dataValida(previsto)) return { erro: 'Informe a data prevista.' }
  await escrever(nomePerfil(s), (tx) => tx`
    insert into entradas (obra_id, descricao, valor, previsto_para) values (${obraId}, ${descricao}, ${valor}, ${previsto})`)
  refresh()
  return { ok: 'Entrada lançada.' }
}

export async function receberEntrada(id: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const data = texto(d, 'recebida_em')
  if (!dataValida(data)) return { erro: 'Informe a data.' }
  const r = await escrever(nomePerfil(s), (tx) => tx`
    update entradas set recebida_em = ${data} where id = ${id} and recebida_em is null and not cancelada`)
  if (!r.count) return { erro: 'Essa entrada já foi recebida ou cancelada.' }
  refresh()
  return { ok: 'Recebida.' }
}

export async function cancelarEntrada(id: number): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const r = await escrever(nomePerfil(s), (tx) => tx`
    update entradas set cancelada = true where id = ${id} and recebida_em is null and not cancelada`)
  if (!r.count) return { erro: 'Essa entrada já foi recebida ou cancelada.' }
  refresh()
  return null
}
