import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BotaoImprimir, BotaoLink, CabecalhoTela, Cartao, Dinheiro, EstadoVazio, Kpi, Tabela, Td, Th } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'

// Resumo da apropriação (modelo do sistema antigo): por fase, quanto estava previsto, quanto já foi gasto e quanto do serviço
// já foi medido, em reais. Medido = previsto de cada serviço × % feito dele.

type Linha = { previsto: number; realizado: number; medido: number }
type Sub = Linha & { id: number; etapaId: number; nome: string; grupo: string | null }

const pct = (parte: number, todo: number) => (todo > 0 ? (parte / todo) * 100 : 0)
const pctTexto = (v: number) => `${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
const soma = (xs: Linha[]): Linha => ({
  previsto: xs.reduce((t, x) => t + x.previsto, 0),
  realizado: xs.reduce((t, x) => t + x.realizado, 0),
  medido: xs.reduce((t, x) => t + x.medido, 0),
})

function Barra({ valor, estouro }: { valor: number; estouro?: boolean }) {
  return (
    <span className="relative mt-1 block h-3.5 min-w-24 overflow-hidden rounded-full bg-surface-3">
      <span className={`absolute inset-y-0 left-0 rounded-full ${estouro ? 'bg-neg' : 'bg-ok'}`} style={{ width: `${Math.min(100, valor)}%` }} />
      <span className="relative block pr-1.5 text-right text-[10px] leading-3.5 font-bold text-ink">{pctTexto(valor)}</span>
    </span>
  )
}

function Valores({ l, forte }: { l: Linha; forte?: boolean }) {
  const saldo = l.previsto - l.realizado
  return (
    <>
      <Td num forte={forte}>
        <Dinheiro valor={l.previsto} />
      </Td>
      <Td num forte={forte}>
        <Dinheiro valor={l.realizado} />
        <Barra valor={pct(l.realizado, l.previsto)} estouro={l.realizado > l.previsto} />
      </Td>
      <Td num forte={forte} className={saldo < 0 ? 'text-neg' : ''}>
        <Dinheiro valor={saldo} />
      </Td>
      <Td num forte={forte}>
        <Dinheiro valor={l.medido} />
        <Barra valor={pct(l.medido, l.previsto)} />
      </Td>
    </>
  )
}

export default async function Apropriacao({ params, searchParams }: PageProps<'/obras/[id]/apropriacao'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || !podeVerObra(s, id)) notFound()
  const abrir = (await searchParams).abrir === '1'

  const [obra] = await sql<{ nome: string; versao: number | null }[]>`
    select o.nome, (select v.versao from v_orcamento_vigente v where v.obra_id = o.id) as versao from obras o where o.id = ${id}`
  if (!obra) notFound()
  const [etapas, subs] = await Promise.all([
    sql<{ id: number; nome: string }[]>`select id, nome from etapas where obra_id = ${id} order by ordem, id`,
    sql<Sub[]>`
      select s.id, s.etapa_id as "etapaId", s.nome, s.grupo,
        coalesce(p.previsto, 0) as previsto,
        round(coalesce(p.previsto, 0) * s.progresso / 100.0, 2) as medido,
        coalesce((select sum(ci.valor) from compra_itens ci join compras c on c.id = ci.compra_id
                  where ci.subetapa_id = s.id and c.situacao = 'aprovada'), 0) as realizado
      from subetapas s join etapas e on e.id = s.etapa_id
      left join v_previsto p on p.subetapa_id = s.id
      where e.obra_id = ${id}
      order by s.ordem, s.id`,
  ])

  const lista = etapas.map((e) => {
    const filhas = subs.filter((x) => x.etapaId === e.id)
    return { ...e, subs: filhas, ...soma(filhas) }
  })
  const total = soma(lista)
  const grupos = new Set(subs.filter((x) => x.grupo).map((x) => `${x.etapaId}|${x.grupo}`)).size
  const contagem = `${etapas.length} ${etapas.length === 1 ? 'fase' : 'fases'} · ${grupos} ${grupos === 1 ? 'subfase' : 'subfases'} · ${subs.length} ${subs.length === 1 ? 'serviço' : 'serviços'}`

  return (
    <>
      <CabecalhoTela
        contexto={
          <>
            <Link href={`/obras/${id}`}>{obra.nome}</Link>
            {obra.versao !== null && ` · Orçamento v${obra.versao}`}
          </>
        }
        titulo="Resumo da apropriação"
        acoes={
          <>
            <BotaoLink href={abrir ? `/obras/${id}/apropriacao` : `/obras/${id}/apropriacao?abrir=1`}>{abrir ? 'Só as fases' : 'Abrir serviços'}</BotaoLink>
            <BotaoImprimir />
          </>
        }
      >
        <span className="text-table text-ink-3">{contagem}</span>
      </CabecalhoTela>

      {total.previsto === 0 && total.realizado === 0 ? (
        <Cartao>
          <EstadoVazio titulo="Sem orçamento nesta obra">
            O previsto de cada fase sai do <Link href={`/orcamento/${id}`}>orçamento da obra</Link>; o realizado, das compras aprovadas.
          </EstadoVazio>
        </Cartao>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi pequeno rotulo="Previsto" valor={<Dinheiro valor={total.previsto} />} detalhe="Orçamento vigente" />
            <Kpi
              pequeno
              rotulo="Realizado"
              valor={<Dinheiro valor={total.realizado} />}
              detalhe={`${pctTexto(pct(total.realizado, total.previsto))} do previsto`}
              corDetalhe={total.realizado > total.previsto ? 'neg' : undefined}
            />
            <Kpi
              pequeno
              rotulo="Saldo"
              valor={<Dinheiro valor={total.previsto - total.realizado} />}
              detalhe="Previsto menos realizado"
              corDetalhe={total.realizado > total.previsto ? 'neg' : undefined}
            />
            <Kpi pequeno rotulo="Medido" valor={<Dinheiro valor={total.medido} />} detalhe={`${pctTexto(pct(total.medido, total.previsto))} do previsto`} />
          </section>

          <Cartao className="flex min-w-0 flex-col gap-3">
            {(
              [
                ['Realizado / previsto', pct(total.realizado, total.previsto), total.realizado > total.previsto],
                ['Medido / previsto', pct(total.medido, total.previsto), false],
              ] as [string, number, boolean][]
            ).map(([rotulo, v, estouro]) => (
              <div key={rotulo} className="grid items-center gap-x-4 gap-y-1 sm:grid-cols-[11rem_1fr]">
                <span className="text-label font-semibold text-ink-2">{rotulo}</span>
                <Barra valor={v} estouro={estouro} />
              </div>
            ))}
          </Cartao>

          <Cartao className="min-w-0">
            <Tabela minimo={760}>
              <thead>
                <tr>
                  <Th>Nome</Th>
                  <Th num>Previsto</Th>
                  <Th num className="w-44">
                    Realizado
                  </Th>
                  <Th num>Saldo</Th>
                  <Th num className="w-44">
                    Medido
                  </Th>
                </tr>
              </thead>
              <tbody>
                {lista.map((e, ei) => [
                  <tr key={e.id} className={abrir ? 'bg-surface-2' : ''}>
                    <Td forte>
                      {ei + 1} - {e.nome}
                    </Td>
                    <Valores l={e} forte />
                  </tr>,
                  ...(abrir
                    ? e.subs.flatMap((x, si) => [
                        x.grupo && x.grupo !== e.subs[si - 1]?.grupo && (
                          <tr key={`g${x.id}`}>
                            <td colSpan={5} className="border-b border-line px-2 pt-3 pb-1 pl-6 text-label font-bold text-ink-2 uppercase">
                              {x.grupo}
                            </td>
                          </tr>
                        ),
                        <tr key={x.id}>
                          <Td className="pl-9 text-ink-2">{x.nome}</Td>
                          <Valores l={x} />
                        </tr>,
                      ])
                    : []),
                ])}
              </tbody>
              <tfoot>
                <tr className="bg-surface-2">
                  <Td forte>Totais</Td>
                  <Valores l={total} forte />
                </tr>
              </tfoot>
            </Tabela>
            <p className="mt-3 text-label text-ink-3">
              Realizado = compras aprovadas da obra. Medido = previsto de cada serviço × % feito marcado pelo engenheiro.
            </p>
          </Cartao>
        </>
      )}
    </>
  )
}
