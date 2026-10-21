import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, dataBR, detectarFracionamento, projetarFluxo, somarDias } from '@/lib/regras'
import { contextoFluxo } from '@/lib/fluxo'
import { Secao, Vazio, Rolagem } from '@/components/ui'
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

  return (
    <div className="grid gap-6">
      <h1>Relatórios</h1>
      <form className="flex flex-wrap items-end gap-2 print:hidden">
        <label>
          <span className="rotulo">Obra</span>
          <select name="obra" defaultValue={obraId || ''} className="campo">
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="rotulo">Compras registradas de</span>
          <input name="de" type="date" defaultValue={de} className="campo" />
        </label>
        <label>
          <span className="rotulo">até</span>
          <input name="ate" type="date" defaultValue={ate} className="campo" />
        </label>
        <button className="btn">Aplicar</button>
      </form>

      <Secao titulo={obraId ? 'Gasto por etapa' : 'Gasto por obra'}>
        <Rolagem>
          <table className="tabela">
            <thead>
              <tr>
                <th>{obraId ? 'Etapa' : 'Obra'}</th>
                <th className="num">Previsto</th>
                <th className="num">Gasto</th>
                <th className="num">Pago</th>
                <th className="num">A pagar</th>
                <th className="num">Usado do previsto</th>
              </tr>
            </thead>
            <tbody>
              {agrupado.map((l) => {
                const gasto = l.pago + l.aPagar
                const usado = l.previsto > 0 ? Math.round((gasto / l.previsto) * 100) : null
                return (
                  <tr key={l.chave}>
                    <td>{l.nome}</td>
                    <td className="num">{brl(l.previsto)}</td>
                    <td className="num">{brl(gasto)}</td>
                    <td className="num">{brl(l.pago)}</td>
                    <td className="num">{brl(l.aPagar)}</td>
                    <td className={`num ${usado !== null && usado > 100 ? 'font-semibold text-erro' : ''}`}>
                      {usado === null ? '—' : `${usado}%`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </Rolagem>
      </Secao>

      <Secao titulo="Fluxo de caixa dos próximos 30, 60 e 90 dias">
        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          {janelas.map((j) => (
            <div key={j.dias} className="rounded border border-linha p-3">
              <p className="font-medium">Até {j.dias} dias</p>
              <p className="text-sm">Entra {brl(j.entradas)}</p>
              <p className="text-sm">Sai {brl(j.saidas)}</p>
              <p className={`font-semibold ${j.saldo < 0 ? 'text-erro' : ''}`}>
                {obraId ? 'Resultado' : 'Saldo'} {brl(j.saldo)}
              </p>
            </div>
          ))}
        </div>
        <TabelaFluxo linhas={projetarFluxo(fluxo.saldo, fluxo.movimentos, fluxo.hoje, 4)} />
      </Secao>

      <Secao titulo="Compras por fornecedor">
        {fornecedores.length === 0 ? (
          <Vazio>Nenhuma compra aprovada no período.</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th className="num">Compras</th>
                  <th className="num">Total</th>
                  <th>Obras</th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.fornecedor}>
                    <td>{f.fornecedor}</td>
                    <td className="num">{f.compras}</td>
                    <td className="num">{brl(f.total)}</td>
                    <td>{f.obras}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </Secao>

      <Secao titulo={`Compras sem aprovação (até ${brl(fluxo.config.tetoBaixo)})`}>
        {suspeitas.size > 0 && (
          <p className="mb-3 font-medium text-alerta">
            {suspeitas.size} compras marcadas: mesmo fornecedor e obra em até 7 dias, somando mais que o teto baixo. Pode ser
            uma compra grande dividida para fugir da aprovação.
          </p>
        )}
        {semAprovacao.length === 0 ? (
          <Vazio>Nenhuma compra dentro do teto baixo no período.</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  <th>Obra</th>
                  <th>Fornecedor</th>
                  <th>Descrição</th>
                  <th className="num">Valor</th>
                </tr>
              </thead>
              <tbody>
                {semAprovacao.map((c) => (
                  <tr key={c.id} className={suspeitas.has(c.id) ? 'bg-orange-50' : ''}>
                    <td>
                      <Link href={`/compras/${c.id}`} className="underline">
                        {c.id}
                      </Link>
                      {suspeitas.has(c.id) && <span className="ml-1 text-alerta">⚠ possível fracionamento</span>}
                    </td>
                    <td>{dataBR(c.data)}</td>
                    <td>{c.obra}</td>
                    <td>{c.fornecedor}</td>
                    <td className="max-w-xs truncate" title={c.descricao}>
                      {c.descricao}
                    </td>
                    <td className="num">{brl(c.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </Secao>

      <Secao titulo="Pendências">
        <h3 className="mb-2 font-medium">Parcelas vencidas sem pagamento ({vencidas.length})</h3>
        {vencidas.length === 0 ? (
          <Vazio>Nenhuma.</Vazio>
        ) : (
          <ul className="mb-4 grid gap-1">
            {vencidas.map((p) => (
              <li key={p.id}>
                <Link href={`/compras/${p.compraId}`} className="underline">
                  Compra nº {p.compraId}, {p.numero}ª parcela
                </Link>{' '}
                <span className="text-erro">venceu em {dataBR(p.vencimento)}</span>, {brl(p.valor)}, {p.fornecedor} ({p.obra})
              </li>
            ))}
          </ul>
        )}
        <h3 className="mb-2 mt-4 font-medium">Compras com pagamento e sem nota fiscal ({semNota.length})</h3>
        {semNota.length === 0 ? (
          <Vazio>Nenhuma.</Vazio>
        ) : (
          <ul className="grid gap-1">
            {semNota.map((c) => (
              <li key={c.id}>
                <Link href={`/compras/${c.id}`} className="underline">
                  Compra nº {c.id}
                </Link>{' '}
                {brl(c.valor)}, {c.fornecedor} ({c.obra})
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  )
}
