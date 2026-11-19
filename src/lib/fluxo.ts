import 'server-only'
import { sql, lerConfig, hoje } from './db'
import type { Movimento } from './regras'
import type { LinhaFluxo } from './fluxo-analitico'
import { listarContas } from './contas-bancarias'

// Saldo de hoje. Com contas bancárias cadastradas, é a soma delas; sem, o saldo informado (fim do dia) + o que
// entrou e saiu depois daquele dia.
export async function saldoHoje() {
  const contas = await listarContas()
  if (contas.length) return Math.round(contas.reduce((t, c) => t + c.saldo * 100, 0)) / 100
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
    select coalesce(p.agendada_para, p.vencimento), -p.valor from parcelas p join v_compras c on c.id = p.compra_id
    where c.situacao = 'aprovada' and p.paga_em is null ${daObra('obra_id')}`
}

export type FiltrosFluxo = {
  inicio: string
  fim: string
  obraId?: number
  contaId?: number
  fornecedorId?: number
  natureza?: 'provisao' | 'previsao'
  aguardando: boolean // inclui compras que ainda esperam aprovação
}

/**
 * Linhas do fluxo analítico: o que foi pago/recebido no período e tudo que está em aberto (de qualquer data, para o
 * cálculo do atraso). Mais o saldo realizado no fim do dia anterior ao início: das contas bancárias (ou da conta
 * filtrada); sem conta cadastrada, o saldo em caixa informado. Filtrado por obra ou fornecedor, o acumulado começa em zero.
 */
export async function dadosDoFluxo(f: FiltrosFluxo) {
  const contas = await sql<{ id: number; nome: string; saldoInicial: number; saldoEm: string }[]>`
    select id, nome, saldo_inicial as "saldoInicial", saldo_em as "saldoEm" from contas_bancarias
    where true ${f.contaId ? sql`and id = ${f.contaId}` : sql``} order by ativa desc, nome`
  const temContas = contas.length > 0
  const dia = new Date(Date.parse(f.inicio + 'T12:00:00Z') - 86_400_000).toISOString().slice(0, 10)

  const naObra = (col: string) => (f.obraId ? sql`and ${sql(col)} = ${f.obraId}` : sql``)
  const daConta = (col: string) => (f.contaId ? sql`and ${sql(col)} = ${f.contaId}` : sql``)
  const daNatureza = (col: string) => (f.natureza ? sql`and ${sql(col)} = ${f.natureza}` : sql``)
  const doFornecedor = f.fornecedorId ? sql`and c.fornecedor_id = ${f.fornecedorId}` : sql``
  const semFornecedor = f.fornecedorId ? sql`and false` : sql`` // entradas não têm fornecedor
  const situacoes = f.aguardando ? ['aprovada', 'aguardando_financeiro', 'aguardando_chefe'] : ['aprovada']

  const linhas = await sql<LinhaFluxo[]>`
    select case when p.paga_em is not null then 'realizado' when c.situacao = 'aprovada' then 'previsto' else 'aguardando' end as tipo,
      coalesce(p.paga_em, p.agendada_para, p.vencimento) as data, -p.valor as valor,
      ${temContas} and p.paga_em is not null and p.conta_id is null as "foraDoSaldo",
      o.nome as obra, fo.nome as fornecedor, c.descricao, c.numero_documento as documento, cb.nome as conta, c.id as "compraId",
      p.numero || '/' || (select count(*) from parcelas x where x.compra_id = c.id) as parcela
    from parcelas p join compras c on c.id = p.compra_id join obras o on o.id = c.obra_id join fornecedores fo on fo.id = c.fornecedor_id
      left join contas_bancarias cb on cb.id = p.conta_id
    where ((p.paga_em between ${f.inicio} and ${f.fim} and c.situacao = 'aprovada') or (p.paga_em is null and c.situacao in ${sql(situacoes)}))
      ${naObra('c.obra_id')} ${daConta('p.conta_id')} ${daNatureza('c.natureza')} ${doFornecedor}
    union all
    select case when e.recebida_em is not null then 'realizado' else 'previsto' end, coalesce(e.recebida_em, e.previsto_para), e.valor,
      ${temContas} and e.recebida_em is not null and e.conta_id is null, o.nome, null, e.descricao, e.numero_documento, cb.nome, null, null
    from entradas e join obras o on o.id = e.obra_id left join contas_bancarias cb on cb.id = e.conta_id
    where not e.cancelada and (e.recebida_em between ${f.inicio} and ${f.fim} or e.recebida_em is null)
      ${naObra('e.obra_id')} ${daConta('e.conta_id')} ${daNatureza('e.natureza')} ${semFornecedor}
    union all
    select 'realizado', x.data, x.valor, false, null, null, coalesce(nullif(x.descricao, ''), 'Movimento do banco'), x.documento, cb.nome, null, null
    from extrato x join contas_bancarias cb on cb.id = x.conta_id
    where x.situacao = 'avulso' and x.data between ${f.inicio} and ${f.fim} ${daConta('x.conta_id')}
      ${f.obraId || f.fornecedorId || f.natureza ? sql`and false` : sql``}`

  // Saldo de um dia a partir de um saldo conhecido em outro: soma o que veio depois, desconta o que veio entre um e outro.
  const mov = sql`
    select conta_id, recebida_em as data, valor from entradas where recebida_em is not null and not cancelada
    union all
    select p.conta_id, p.paga_em, -p.valor from parcelas p join compras c on c.id = p.compra_id where p.paga_em is not null and c.situacao = 'aprovada'
    union all
    select conta_id, data, valor from extrato where situacao = 'avulso'`
  let saldosContas: { nome: string; saldo: number }[] = []
  let saldoInicial = 0
  if (!f.obraId && !f.fornecedorId) {
    if (temContas) {
      saldosContas = await sql<{ nome: string; saldo: number }[]>`
        with mov as (${mov})
        select c.nome, c.saldo_inicial
          + coalesce((select sum(m.valor) from mov m where m.conta_id = c.id and m.data > c.saldo_em and m.data <= ${dia}), 0)
          - coalesce((select sum(m.valor) from mov m where m.conta_id = c.id and m.data > ${dia} and m.data <= c.saldo_em), 0) as saldo
        from contas_bancarias c where c.id in ${sql(contas.map((x) => x.id))} order by c.ativa desc, c.nome`
      saldoInicial = saldosContas.reduce((t, x) => t + Math.round(x.saldo * 100), 0) / 100
    } else {
      const [{ saldo }] = await sql<{ saldo: number }[]>`
        with mov as (${mov})
        select c.saldo_caixa
          + coalesce((select sum(m.valor) from mov m where m.data > c.saldo_caixa_em and m.data <= ${dia}), 0)
          - coalesce((select sum(m.valor) from mov m where m.data > ${dia} and m.data <= c.saldo_caixa_em), 0) as saldo
        from config c`
      saldoInicial = saldo
    }
  }
  return { linhas, saldoInicial, saldosContas, temContas, diaAnterior: dia }
}

export async function contextoFluxo(obraId?: number) {
  const [config, dia, movimentos, saldo] = await Promise.all([lerConfig(), hoje(), movimentosEmAberto(obraId), saldoHoje()])
  // Filtrado por obra, o acumulado começa em zero: mostra só o que a obra movimenta.
  return { config, hoje: dia, movimentos, saldo: obraId ? 0 : saldo }
}
