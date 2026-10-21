import Link from 'next/link'
import { BotaoImprimir, CabecalhoTela, Cartao, Dinheiro, EstadoVazio, Etiqueta, LinhaTotal, Secao, SeletorPilula, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, dataBR, detectarFracionamento, projetarFluxo, somarDias } from '@/lib/regras'
import { contextoFluxo } from '@/lib/fluxo'
import { TabelaFluxo } from '@/components/tabela-fluxo'

const dataOk = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '')

export default async function Relatorios({ searchParams }: PageProps<'/relatorios'>) {
  await exigirSessao('financeiro', 'chefe')
  const q = await searchParams
  const obraId = Number(q.obra) || 0
  const de = dataOk(q.de)
  const ate = dataOk(q.ate)
  // Período vale para a data em que a compra foi registrada.
  const periodo = sql`
    ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
    ${de ? sql`and (c.criada_em at time zone 'America/Sao_Paulo')::date >= ${de}` : sql``}
    ${ate ? sql`and (c.criada_em at time zone 'America/Sao_Paulo')::date <= ${ate}` : sql``}`

  const [obras, fluxo, gastos, previstos, fornecedores, semAprovacao, vencidas, semNota] = await Promise.all([
    sql<{ id: number; nome: string }[]>`select id, nome from obras order by nome`,
    contextoFluxo(obraId || undefined),
    // Uma compra pode ter itens de várias etapas: pago e a pagar são divididos pela fração de cada item.
    sql<{ obraId: number; etapaId: number; pago: number; aPagar: number }[]>`
      select c.obra_id as "obraId", c.etapa_id as "etapaId",
        round(sum(c.fracao * coalesce((select sum(p.valor) from parcelas p where p.compra_id = c.compra_id and p.paga_em is not null), 0)), 2) as pago,
        round(sum(c.fracao * coalesce((select sum(p.valor) from parcelas p where p.compra_id = c.compra_id and p.paga_em is null), 0)), 2) as "aPagar"
      from v_compra_itens c
      where c.situacao = 'aprovada' ${periodo}
      group by c.obra_id, c.etapa_id`,
    sql<{ obraId: number; obra: string; etapaId: number; etapa: string; previsto: number }[]>`
      select o.id as "obraId", o.nome as obra, e.id as "etapaId", e.nome as etapa,
        coalesce((select sum(v.previsto) from v_previsto v join subetapas s on s.id = v.subetapa_id where s.etapa_id = e.id), 0) as previsto
      from etapas e join obras o on o.id = e.obra_id
      ${obraId ? sql`where o.id = ${obraId}` : sql``}
      order by o.nome, e.ordem, e.id`,
    sql<{ fornecedor: string; compras: number; total: number; obras: string }[]>`
      select c.fornecedor, count(*)::int as compras, sum(c.valor) as total, string_agg(distinct c.obra, ', ') as obras
      from v_compras c where c.situacao = 'aprovada' ${periodo}
      group by c.fornecedor order by total desc`,
    sql<{ id: number; obraId: number; obra: string; fornecedorId: number; fornecedor: string; descricao: string; valor: number; data: string }[]>`
      select c.id, c.obra_id as "obraId", c.obra, c.fornecedor_id as "fornecedorId", c.fornecedor, c.descricao, c.valor,
             (c.criada_em at time zone 'America/Sao_Paulo')::date as data
      from v_compras c where c.faixa = 'baixa' and c.situacao = 'aprovada' ${periodo}
      order by c.criada_em desc`,
    sql<{ id: number; compraId: number; numero: number; obra: string; fornecedor: string; valor: number; vencimento: string }[]>`
      select p.id, p.compra_id as "compraId", p.numero, c.obra, c.fornecedor, p.valor, p.vencimento
      from parcelas p join v_compras c on c.id = p.compra_id
      where c.situacao = 'aprovada' and p.paga_em is null and p.vencimento < hoje() ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
      order by p.vencimento`,
    sql<{ id: number; obra: string; fornecedor: string; valor: number }[]>`
      select c.id, c.obra, c.fornecedor, c.valor from v_compras c
      where c.situacao = 'aprovada'
        and exists (select 1 from parcelas p where p.compra_id = c.id and p.paga_em is not null)
        and not exists (select 1 from anexos a where a.compra_id = c.id and a.tipo = 'nota_fiscal')
        ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
      order by c.id`,
  ])

  // 1. Gasto: por etapa quando há obra escolhida, por obra quando não.
  const linhasGasto = previstos.map((p) => {
    const g = gastos.find((x) => x.etapaId === p.etapaId)
    return { ...p, pago: g?.pago ?? 0, aPagar: g?.aPagar ?? 0 }
  })
  const agrupado = obraId
    ? linhasGasto.map((l) => ({ chave: l.etapaId, nome: l.etapa, previsto: l.previsto, pago: l.pago, aPagar: l.aPagar }))
    : [...new Set(linhasGasto.map((l) => l.obraId))].map((id) => {
        const ls = linhasGasto.filter((l) => l.obraId === id)
        const soma = (k: 'previsto' | 'pago' | 'aPagar') => ls.reduce((t, l) => t + l[k], 0)
        return { chave: id, nome: ls[0].obra, previsto: soma('previsto'), pago: soma('pago'), aPagar: soma('aPagar') }
      })

  // 2. Janelas de 30/60/90 dias (atrasados entram em todas).
  const janelas = [30, 60, 90].map((dias) => {
    const limite = somarDias(fluxo.hoje, dias)
    const dentro = fluxo.movimentos.filter((m) => m.data <= limite)
    const entradas = dentro.filter((m) => m.valor > 0).reduce((t, m) => t + m.valor, 0)
    const saidas = -dentro.filter((m) => m.valor < 0).reduce((t, m) => t + m.valor, 0)
    return { dias, entradas, saidas, saldo: fluxo.saldo + entradas - saidas }
  })

  // 4. Possível fracionamento entre as compras sem aprovação.
  const suspeitas = detectarFracionamento(semAprovacao, fluxo.config.tetoBaixo)

  const total = agrupado.reduce((t, l) => ({ previsto: t.previsto + l.previsto, gasto: t.gasto + l.pago + l.aPagar }), { previsto: 0, gasto: 0 })
  const maiorFornecedor = Math.max(1, ...fornecedores.map((f) => f.total))
  const campoData = 'h-10 rounded-full border-0 bg-surface px-4 text-[13px] font-semibold'

  return (
    <>
      <CabecalhoTela
        contexto={`Dados até ${dataBR(fluxo.hoje)}`}
        titulo="Relatórios"
        acoes={
          <>
            <form className="flex flex-wrap items-center gap-2 print:hidden">
              <label className="sr-only" htmlFor="obra-relatorio">
                Obra
              </label>
              <SeletorPilula id="obra-relatorio" name="obra" defaultValue={obraId || ''} ativo={!!obraId} className={obraId ? '' : 'bg-surface'}>
                <option value="">Todas as obras</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </SeletorPilula>
              <label className="flex items-center gap-1.5 text-label font-semibold text-ink-3">
                Compras registradas de
                <input name="de" type="date" defaultValue={de} className={campoData} />
              </label>
              <label className="flex items-center gap-1.5 text-label font-semibold text-ink-3">
                até
                <input name="ate" type="date" defaultValue={ate} className={campoData} />
              </label>
              <button className="h-10 rounded-full bg-ink px-[18px] text-[13px] font-semibold text-on-ink hover:bg-ink-2">Aplicar</button>
            </form>
            <BotaoImprimir texto="Gerar PDF" />
          </>
        }
      />

      <Secao titulo={obraId ? 'Gasto por etapa' : 'Gasto por obra'} acao={<span className="text-label font-semibold text-ink-3">barra = gasto sobre o previsto</span>}>
        <Tabela minimo={860}>
          <thead>
            <tr>
              <Th>{obraId ? 'Etapa' : 'Obra'}</Th>
              <Th className="w-[28%]">Usado do previsto</Th>
              <Th num>Previsto</Th>
              <Th num>Gasto</Th>
              <Th num>Pago</Th>
              <Th num>A pagar</Th>
            </tr>
          </thead>
          <tbody>
            {agrupado.map((l) => {
              const gasto = l.pago + l.aPagar
              const usado = l.previsto > 0 ? Math.round((gasto / l.previsto) * 100) : null
              return (
                <Tr key={l.chave}>
                  <Td className="font-semibold">{l.nome}</Td>
                  <Td>
                    {usado === null ? (
                      <span className="text-ink-3">sem previsto</span>
                    ) : (
                      <span className="relative block h-5 overflow-hidden rounded-full bg-surface-3" role="img" aria-label={`${usado}% do previsto`}>
                        <span className={`absolute inset-y-0 left-0 rounded-full ${usado > 100 ? 'bg-neg' : 'bg-ink'}`} style={{ width: `${Math.min(100, usado)}%` }} />
                        <span
                          className={`absolute inset-y-0 flex items-center text-[11px] font-bold ${usado >= 18 ? 'pl-2.5 text-on-ink' : 'pl-1.5 text-ink'}`}
                          style={{ left: usado >= 18 ? 0 : `${usado}%` }}
                        >
                          {usado}%
                        </span>
                      </span>
                    )}
                  </Td>
                  <Td num className="text-ink-2">
                    <Dinheiro valor={l.previsto} />
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={gasto} />
                  </Td>
                  <Td num>
                    <Dinheiro valor={l.pago} />
                  </Td>
                  <Td num>
                    <Dinheiro valor={l.aPagar} />
                  </Td>
                </Tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr aria-hidden className="h-2" />
            <LinhaTotal>
              <td className="px-2">Total</td>
              <td className="px-2 text-ink-2">{total.previsto > 0 ? `${Math.round((total.gasto / total.previsto) * 100)}% do previsto` : ''}</td>
              <td className="px-2 text-right">
                <Dinheiro valor={total.previsto} />
              </td>
              <td className="px-2 text-right">
                <Dinheiro valor={total.gasto} />
              </td>
              <td colSpan={2} />
            </LinhaTotal>
          </tfoot>
        </Tabela>
      </Secao>

      <Cartao tom="noite" className="flex flex-col gap-4 rounded-xl p-6!">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-[28px] font-light">Fluxo de caixa dos próximos 30, 60 e 90 dias</h2>
          <span className="text-label font-semibold text-night-ink-3">
            {obraId ? 'resultado da obra' : `saldo inicial ${brl(fluxo.saldo)}`} em {dataBR(fluxo.hoje)}
          </span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          {janelas.map((j) => (
            <div key={j.dias} className="flex flex-col gap-3 rounded-lg bg-night-2 p-[18px]">
              <div className="flex items-baseline justify-between">
                <span className="font-display text-[20px]">Até {j.dias} dias</span>
                <span className="text-label font-semibold text-night-ink-3">até {dataBR(somarDias(fluxo.hoje, j.dias))}</span>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-table">
                <span className="text-night-ink-2">Entra</span>
                <span className="text-right font-bold text-accent">
                  <Dinheiro valor={j.entradas} />
                </span>
                <span className="text-night-ink-2">Sai</span>
                <span className="text-right font-bold">
                  <Dinheiro valor={j.saidas} />
                </span>
              </div>
              <div className="h-px bg-night-3" />
              <span className="text-label font-semibold text-night-ink-3">{obraId ? 'Resultado' : 'Saldo'} projetado</span>
              <span className="font-display text-[30px] leading-tight font-light">
                <Dinheiro valor={j.saldo} noturno />
              </span>
            </div>
          ))}
        </div>
        <details>
          <summary className="cursor-pointer text-label font-semibold text-night-ink-2">Ver mês a mês</summary>
          <div className="mt-3">
            <TabelaFluxo linhas={projetarFluxo(fluxo.saldo, fluxo.movimentos, fluxo.hoje, 4)} noturno />
          </div>
        </details>
      </Cartao>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <Secao titulo="Compras por fornecedor">
          {fornecedores.length === 0 ? (
            <EstadoVazio titulo="Nenhuma compra aprovada no período" compacto />
          ) : (
            <ol className="flex flex-col">
              {fornecedores.map((f, i) => (
                <li key={f.fornecedor} className="grid grid-cols-[24px_minmax(140px,1fr)_minmax(80px,1fr)_auto] items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <span className="text-label font-bold text-ink-3">{i + 1}</span>
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[13.5px] font-semibold">{f.fornecedor}</span>
                    <span className="truncate text-caption text-ink-3">
                      {f.compras} {f.compras === 1 ? 'compra' : 'compras'} · {f.obras}
                    </span>
                  </span>
                  <span className="block h-3 overflow-hidden rounded-full bg-surface-3" aria-hidden>
                    <span className="block h-full rounded-full bg-ink" style={{ width: `${(f.total / maiorFornecedor) * 100}%` }} />
                  </span>
                  <span className="text-right text-[13.5px] font-bold">
                    <Dinheiro valor={f.total} />
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Secao>

        <Secao titulo="Pendências" acao={<Etiqueta tom={vencidas.length + semNota.length ? 'aviso' : 'ok'}>{vencidas.length + semNota.length} abertas</Etiqueta>}>
          <h3 className="text-h3 font-semibold">Parcelas vencidas sem pagamento ({vencidas.length})</h3>
          {vencidas.length === 0 ? (
            <p className="text-table text-ink-3">Nenhuma.</p>
          ) : (
            <ul className="flex flex-col">
              {vencidas.map((p) => (
                <li key={p.id}>
                  <Link href={`/compras/${p.compraId}`} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md px-1 py-2.5 no-underline hover:bg-surface-2">
                    <span className="flex size-9 items-center justify-center rounded-[12px] bg-neg-bg text-label font-bold text-neg">{p.numero}ª</span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="text-[13.5px] font-semibold">
                        Compra nº {p.compraId}, {p.numero}ª parcela · <Dinheiro valor={p.valor} />
                      </span>
                      <span className="truncate text-caption text-ink-3">
                        <span className="font-semibold text-neg">venceu em {dataBR(p.vencimento)}</span> · {p.fornecedor} ({p.obra})
                      </span>
                    </span>
                    <span className="text-[16px] text-ink-3">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <h3 className="mt-2 text-h3 font-semibold">Compras com pagamento e sem nota fiscal ({semNota.length})</h3>
          {semNota.length === 0 ? (
            <p className="text-table text-ink-3">Nenhuma.</p>
          ) : (
            <ul className="flex flex-col">
              {semNota.map((c) => (
                <li key={c.id}>
                  <Link href={`/compras/${c.id}`} className="grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-md px-1 py-2.5 no-underline hover:bg-surface-2">
                    <span className="flex size-9 items-center justify-center rounded-[12px] bg-warn-bg text-label font-bold text-warn">NF</span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="text-[13.5px] font-semibold">
                        Compra nº {c.id} · <Dinheiro valor={c.valor} />
                      </span>
                      <span className="truncate text-caption text-ink-3">
                        {c.fornecedor} ({c.obra})
                      </span>
                    </span>
                    <span className="text-[16px] text-ink-3">›</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Secao>
      </section>

      <Secao titulo={`Compras sem aprovação (até ${brl(fluxo.config.tetoBaixo)})`}>
        {suspeitas.size > 0 && (
          <p className="rounded-md bg-warn-bg px-3.5 py-3 text-[12.5px] font-semibold text-warn">
            {suspeitas.size} compras marcadas: mesmo fornecedor e obra em até 7 dias, somando mais que o teto baixo. Pode ser uma compra grande dividida para
            fugir da aprovação.
          </p>
        )}
        {semAprovacao.length === 0 ? (
          <EstadoVazio titulo="Nenhuma compra dentro do teto baixo no período" compacto />
        ) : (
          <Tabela minimo={820}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Data</Th>
                <Th>Obra</Th>
                <Th>Fornecedor</Th>
                <Th>Descrição</Th>
                <Th num>Valor</Th>
              </tr>
            </thead>
            <tbody>
              {semAprovacao.map((c) => (
                <Tr key={c.id} className={suspeitas.has(c.id) ? 'bg-warn-bg hover:bg-warn-bg' : ''}>
                  <Td>
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/compras/${c.id}`} className="font-bold">
                        {c.id}
                      </Link>
                      {suspeitas.has(c.id) && <Etiqueta tom="aviso">⚠ possível fracionamento</Etiqueta>}
                    </span>
                  </Td>
                  <Td className="text-ink-2">{dataBR(c.data)}</Td>
                  <Td>{c.obra}</Td>
                  <Td>{c.fornecedor}</Td>
                  <Td className="max-w-xs truncate" title={c.descricao}>
                    {c.descricao}
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={c.valor} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </>
  )
}
