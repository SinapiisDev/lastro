'use server'

import { refresh } from 'next/cache'
import { redirect } from 'next/navigation'
import { sql, escrever } from '@/lib/db'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import { lerOfx, decodificarOfx, mesmaConta, ErroOfx, type ExtratoOfx } from '@/lib/ofx'
import { gravarExtrato, conciliarPares, desfazerConferencia, type Par } from '@/lib/conciliacao-banco'
import { dataBR } from '@/lib/regras'
import type { Estado } from '@ds'

const MAXIMO = 5 * 1024 * 1024

// Depois de conferir, a linha sai da lista (e a mensagem do formulário iria junto): o aviso volta pelo endereço.
const voltar = (contaId: number, feito: string) => redirect(`/financeiro/conciliacao?conta=${contaId}&feito=${feito}`)

// Extrato OFX da conta: guarda as linhas novas e o saldo do banco.
export async function importarExtrato(contaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const [conta] = await sql<{ nome: string; numero: string | null }[]>`select nome, numero from contas_bancarias where id = ${contaId} and ativa`
  if (!conta) return { erro: 'Conta não encontrada ou desativada.' }
  const f = d.get('extrato')
  if (!(f instanceof File) || f.size === 0) return { erro: 'Escolha o arquivo do extrato (.ofx).' }
  if (f.size > MAXIMO) return { erro: 'Arquivo maior que 5 MB. Baixe um período menor.' }
  let e: ExtratoOfx
  try {
    e = lerOfx(decodificarOfx(new Uint8Array(await f.arrayBuffer())))
  } catch (erro) {
    if (erro instanceof ErroOfx) return { erro: erro.message }
    return { erro: 'Não consegui ler o arquivo. Baixe o extrato de novo em OFX.' }
  }
  if (!mesmaConta(e.conta, conta.numero)) return { erro: `Este extrato é da conta ${e.conta}, não da conta ${conta.numero} (${conta.nome}).` }
  if (!e.lancamentos.length && !e.saldo) return { erro: 'O extrato não tem nenhum lançamento.' }

  const novas = await escrever(nomePerfil(s), (tx) => gravarExtrato(tx, contaId, e))
  refresh()
  const repetidas = e.lancamentos.length - novas
  const periodo = e.inicio && e.fim ? ` de ${dataBR(e.inicio)} a ${dataBR(e.fim)}` : ''
  return {
    ok: `Extrato${periodo}: ${novas} ${novas === 1 ? 'lançamento novo' : 'lançamentos novos'}${repetidas ? `, ${repetidas} já ${repetidas === 1 ? 'tinha vindo' : 'tinham vindo'} antes` : ''}.`,
  }
}

// Confirma os pares marcados ou escolhidos ("linha:parcela:id" ou "linha:entrada:id").
export async function conciliar(contaId: number, _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const pares: Par[] = d
    .getAll('par')
    .map((x) => String(x).match(/^(\d+):(parcela|entrada):(\d+)$/))
    .filter((m): m is RegExpMatchArray => !!m)
    .map((m) => ({ linha: Number(m[1]), tipo: m[2] as Par['tipo'], id: Number(m[3]) }))
  if (!pares.length) return { erro: 'Marque ou escolha pelo menos um par.' }
  if (new Set(pares.map((p) => `${p.tipo}${p.id}`)).size !== pares.length) return { erro: 'A mesma parcela foi escolhida para duas linhas do extrato.' }

  const feitos = await escrever(nomePerfil(s), (tx) => conciliarPares(tx, contaId, pares))
  if (!feitos) return { erro: 'Nenhum par foi confirmado: as parcelas já foram pagas ou mudaram. Recarregue a página.' }
  voltar(contaId, `pares-${feitos}-${pares.length - feitos}`)
  return null
}

// Linha só do banco: "avulso" entra no saldo da conta (tarifa, juros); "ignorado" não conta.
export async function marcarLinha(linhaId: number, situacao: 'avulso' | 'ignorado', _: Estado, d: FormData): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  if (situacao !== 'avulso' && situacao !== 'ignorado') return { erro: 'Ação inválida.' }
  const observacao = String(d.get('observacao') ?? '').trim().slice(0, 200) || null
  const [r] = await escrever(nomePerfil(s), (tx) => tx<{ contaId: number }[]>`
    update extrato set situacao = ${situacao}, observacao = ${observacao} where id = ${linhaId} and situacao = 'pendente'
    returning conta_id as "contaId"`)
  if (!r) return { erro: 'Essa linha já foi conferida. Recarregue a página.' }
  voltar(r.contaId, situacao === 'avulso' ? 'saldo' : 'ignorada')
  return null
}

export async function desfazerLinha(linhaId: number): Promise<Estado> {
  const s = await exigirSessao('financeiro', 'chefe')
  const l = await escrever(nomePerfil(s), (tx) => desfazerConferencia(tx, linhaId))
  if (!l) return { erro: 'Essa linha já estava a conferir.' }
  voltar(l.contaId, 'desfeito')
  return null
}
