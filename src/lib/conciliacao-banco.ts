import 'server-only'
import { sql, type Tx } from './db.ts'
import { somarDias } from './regras.ts'
import type { ExtratoOfx } from './ofx.ts'
import type { Candidato, LinhaExtrato } from './conciliacao.ts'

const LOTE = 500
const BAIXADA_MAXIMO = 3 // igual a conciliacao.ts: parcela já paga até 3 dias da linha

export type LinhaPendente = LinhaExtrato & { documento: string | null }
export type CandidatoDetalhe = Candidato & { compraId: number | null; parcela: string; obra: string }
export type Conferida = {
  id: number
  data: string
  valor: number
  descricao: string
  nome: string | null
  situacao: string
  observacao: string | null
  vinculo: string | null
  compraId: number | null
}
export type Par = { linha: number; tipo: 'parcela' | 'entrada'; id: number }

// Guarda as linhas novas do extrato (a mesma linha não entra duas vezes) e o saldo do banco, se for mais novo.
export async function gravarExtrato(tx: Tx, contaId: number, e: ExtratoOfx) {
  let novas = 0
  for (let i = 0; i < e.lancamentos.length; i += LOTE) {
    const linhas = e.lancamentos.slice(i, i + LOTE).map((l) => ({
      conta_id: contaId,
      fitid: l.fitid.slice(0, 120),
      data: l.data,
      valor: l.valor,
      descricao: l.descricao.slice(0, 300),
      nome: l.nome?.slice(0, 300) ?? null,
      documento: l.documento?.slice(0, 60) ?? null,
    }))
    novas += (await tx`insert into extrato ${tx(linhas)} on conflict (conta_id, fitid) do nothing returning id`).length
  }
  // Conta cadastrada sem agência ou número: completa com o que veio no extrato.
  await tx`
    update contas_bancarias set
      agencia = coalesce(agencia, ${e.agencia}), numero = coalesce(numero, ${e.conta}),
      saldo_banco = case when ${e.saldo?.em ?? null}::date >= coalesce(saldo_banco_em, '1900-01-01') then ${e.saldo?.valor ?? null}::numeric else saldo_banco end,
      saldo_banco_em = greatest(saldo_banco_em, ${e.saldo?.em ?? null}::date)
    where id = ${contaId}`
  return novas
}

// O que a tela precisa: linhas a conferir, as últimas conferidas e os candidatos (em aberto ou baixados sem extrato).
export async function dadosConciliacao(contaId: number) {
  const [linhas, conferidas] = await Promise.all([
    sql<LinhaPendente[]>`
      select id, data, valor, descricao, nome, documento from extrato
      where conta_id = ${contaId} and situacao = 'pendente' order by data, id`,
    sql<Conferida[]>`
      select x.id, x.data, x.valor, x.descricao, x.nome, x.situacao, x.observacao,
        coalesce(f.nome || ' · ' || p.numero || 'ª parcela', o.nome || ' · ' || e.descricao) as vinculo, p.compra_id as "compraId"
      from extrato x
      left join parcelas p on p.id = x.parcela_id left join compras c on c.id = p.compra_id left join fornecedores f on f.id = c.fornecedor_id
      left join entradas e on e.id = x.entrada_id left join obras o on o.id = e.obra_id
      where x.conta_id = ${contaId} and x.situacao <> 'pendente'
      order by x.data desc, x.id desc limit 40`,
  ])
  const saidas = [...new Set(linhas.filter((l) => l.valor < 0).map((l) => -l.valor))]
  const entradas = [...new Set(linhas.filter((l) => l.valor > 0).map((l) => l.valor))]
  const de = linhas.length ? somarDias(linhas[0].data, -BAIXADA_MAXIMO) : ''
  const ate = linhas.length ? somarDias(linhas.at(-1)!.data, BAIXADA_MAXIMO) : ''
  const [parcelas, recebimentos] = await Promise.all([
    saidas.length
      ? sql<CandidatoDetalhe[]>`
          select 'parcela' as tipo, p.id, p.valor, p.vencimento, p.agendada_para as "agendadaPara", p.paga_em as "baixadaEm",
            p.conta_id as "contaId", f.nome, f.cnpj, c.id as "compraId", o.nome as obra,
            p.numero || '/' || (select count(*) from parcelas x where x.compra_id = p.compra_id) as parcela
          from parcelas p join compras c on c.id = p.compra_id join fornecedores f on f.id = c.fornecedor_id join obras o on o.id = c.obra_id
          where c.situacao = 'aprovada' and p.valor in ${sql(saidas)}
            and (p.paga_em is null or (p.paga_em between ${de} and ${ate} and not exists (select 1 from extrato x where x.parcela_id = p.id)))`
      : [],
    entradas.length
      ? sql<CandidatoDetalhe[]>`
          select 'entrada' as tipo, e.id, e.valor, e.previsto_para as vencimento, null as "agendadaPara", e.recebida_em as "baixadaEm",
            e.conta_id as "contaId", o.nome || ' ' || e.descricao as nome, null as cnpj, null as "compraId", o.nome as obra, e.descricao as parcela
          from entradas e join obras o on o.id = e.obra_id
          where not e.cancelada and e.valor in ${sql(entradas)}
            and (e.recebida_em is null or (e.recebida_em between ${de} and ${ate} and not exists (select 1 from extrato x where x.entrada_id = e.id)))`
      : [],
  ])
  return { linhas, conferidas, candidatos: [...parcelas, ...recebimentos] }
}

/**
 * Confirma os pares. Parcela em aberto vira paga na data do extrato, nesta conta; parcela já paga à mão só é
 * ligada à linha. Cada par confere de novo valor, conta e situação; o que mudou fica de fora. Devolve quantos entraram.
 */
export async function conciliarPares(tx: Tx, contaId: number, pares: Par[]) {
  let n = 0
  for (const p of pares) {
    const [l] = await tx<{ data: string; valor: number }[]>`
      select data, valor from extrato where id = ${p.linha} and conta_id = ${contaId} and situacao = 'pendente' for update`
    if (!l) continue
    const [r] =
      p.tipo === 'parcela' && l.valor < 0
        ? await tx<{ baixou: boolean }[]>`
            update parcelas x set paga_em = coalesce(x.paga_em, ${l.data}::date), conta_id = coalesce(x.conta_id, ${contaId}), agendada_para = null
            from parcelas antes join compras c on c.id = antes.compra_id
            where antes.id = x.id and x.id = ${p.id} and c.situacao = 'aprovada' and x.valor = ${-l.valor}
              and coalesce(x.conta_id, ${contaId}) = ${contaId}
              and (x.paga_em is null or abs(x.paga_em - ${l.data}::date) <= ${BAIXADA_MAXIMO})
              and not exists (select 1 from extrato e where e.parcela_id = x.id)
            returning antes.paga_em is null as baixou`
        : p.tipo === 'entrada' && l.valor > 0
          ? await tx<{ baixou: boolean }[]>`
              update entradas x set recebida_em = coalesce(x.recebida_em, ${l.data}::date), conta_id = coalesce(x.conta_id, ${contaId})
              from entradas antes
              where antes.id = x.id and x.id = ${p.id} and not x.cancelada and x.valor = ${l.valor}
                and coalesce(x.conta_id, ${contaId}) = ${contaId}
                and (x.recebida_em is null or abs(x.recebida_em - ${l.data}::date) <= ${BAIXADA_MAXIMO})
                and not exists (select 1 from extrato e where e.entrada_id = x.id)
              returning antes.recebida_em is null as baixou`
          : []
    if (!r) continue
    await tx`
      update extrato set situacao = 'conciliado', baixou = ${r.baixou},
        parcela_id = ${p.tipo === 'parcela' ? p.id : null}, entrada_id = ${p.tipo === 'entrada' ? p.id : null}
      where id = ${p.linha}`
    n++
  }
  return n
}

// Volta a linha para "a conferir". Se foi a conciliação que pagou a parcela (ou recebeu a entrada), ela volta a ficar em aberto.
export async function desfazerConferencia(tx: Tx, linhaId: number) {
  const [l] = await tx<{ contaId: number; parcelaId: number | null; entradaId: number | null; baixou: boolean; valor: number }[]>`
    select conta_id as "contaId", parcela_id as "parcelaId", entrada_id as "entradaId", baixou, valor from extrato
    where id = ${linhaId} and situacao <> 'pendente' for update`
  if (!l) return null
  await tx`update extrato set situacao = 'pendente', parcela_id = null, entrada_id = null, baixou = false, observacao = null where id = ${linhaId}`
  if (l.baixou && l.parcelaId) await tx`update parcelas set paga_em = null, conta_id = null where id = ${l.parcelaId}`
  if (l.baixou && l.entradaId) await tx`update entradas set recebida_em = null, conta_id = null where id = ${l.entradaId}`
  return l
}
