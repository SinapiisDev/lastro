import 'server-only'
import { sql, lerConfig, hoje } from './db'
import type { Movimento } from './regras'

// Saldo de hoje = saldo informado (fim do dia) + o que entrou e saiu depois daquele dia.
export async function saldoHoje() {
  const [{ saldo }] = await sql<{ saldo: number }[]>`
    select c.saldo_caixa
      + coalesce((select sum(valor) from entradas where not cancelada and recebida_em > c.saldo_caixa_em), 0)
      - coalesce((select sum(p.valor) from parcelas p join compras co on co.id = p.compra_id
                  where co.situacao = 'aprovada' and p.paga_em > c.saldo_caixa_em), 0) as saldo
    from config c`
  return saldo
}

// O que ainda vai entrar (entradas não recebidas) e sair (parcelas aprovadas não pagas).
export async function movimentosEmAberto(obraId?: number) {
  const daObra = (coluna: string) => (obraId ? sql`and ${sql(coluna)} = ${obraId}` : sql``)
  return sql<Movimento[]>`
    select previsto_para as data, valor from entradas
    where not cancelada and recebida_em is null ${daObra('obra_id')}
    union all
    select p.vencimento, -p.valor from parcelas p join v_compras c on c.id = p.compra_id
    where c.situacao = 'aprovada' and p.paga_em is null ${daObra('obra_id')}`
}

export async function contextoFluxo(obraId?: number) {
  const [config, dia, movimentos, saldo] = await Promise.all([lerConfig(), hoje(), movimentosEmAberto(obraId), saldoHoje()])
  // Filtrado por obra, o acumulado começa em zero: mostra só o que a obra movimenta.
  return { config, hoje: dia, movimentos, saldo: obraId ? 0 : saldo }
}
