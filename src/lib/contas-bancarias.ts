import 'server-only'
import { sql } from './db.ts'

export type ContaBancaria = {
  id: number
  nome: string
  banco: string | null
  agencia: string | null
  numero: string | null
  saldoInicial: number
  saldoEm: string
  saldoBanco: number | null
  saldoBancoEm: string | null
  ativa: boolean
  saldo: number // hoje, pelo que está no sistema
  saldoNaDataDoBanco: number | null // pelo sistema, no dia do último saldo que veio no extrato
}

// Saldo da conta = saldo informado + recebimentos − pagamentos nela depois daquele dia + avulsos do extrato.
export const listarContas = () => sql<ContaBancaria[]>`
  with mov as (
    select conta_id, recebida_em as data, valor from entradas where conta_id is not null and recebida_em is not null and not cancelada
    union all
    select conta_id, paga_em, -valor from parcelas where conta_id is not null and paga_em is not null
    union all
    select conta_id, data, valor from extrato where situacao = 'avulso'
  )
  select c.id, c.nome, c.banco, c.agencia, c.numero, c.saldo_inicial as "saldoInicial", c.saldo_em as "saldoEm",
    c.saldo_banco as "saldoBanco", c.saldo_banco_em as "saldoBancoEm", c.ativa,
    c.saldo_inicial + coalesce((select sum(m.valor) from mov m where m.conta_id = c.id and m.data > c.saldo_em), 0) as saldo,
    case when c.saldo_banco_em is not null then
      c.saldo_inicial + coalesce((select sum(m.valor) from mov m where m.conta_id = c.id and m.data > c.saldo_em and m.data <= c.saldo_banco_em), 0)
    end as "saldoNaDataDoBanco"
  from contas_bancarias c
  order by c.ativa desc, c.nome`

/**
 * Conta escolhida no formulário de pagamento ou recebimento. Sem conta cadastrada, segue sem conta (null);
 * com conta, ela é obrigatória e precisa ser uma das ativas.
 */
export async function contaDoFormulario(d: FormData, erro = 'Escolha a conta.'): Promise<number | null | { erro: string }> {
  const ativas = await sql<{ id: number }[]>`select id from contas_bancarias where ativa`
  if (!ativas.length) return null
  const id = Number(d.get('conta'))
  return ativas.some((c) => c.id === id) ? id : { erro }
}
