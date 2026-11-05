import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarraEtapa, BarrasMensais, Campo, Cartao, Dinheiro, Entrada, Etiqueta, FaixaEscura, FormAcao, Kpi, Legenda, Predio3D, type Progresso } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { brl, dataBR, progressoEtapa, gastoNaFrente } from '@/lib/regras'
import { SITUACOES_OBRA } from '@/components/rotulos'
import {
  salvarProgresso,
  salvarEtapa,
  removerEtapa,
  adicionarEtapa,
  salvarSubetapa,
  removerSubetapa,
  adicionarSubetapa,
} from '../acoes'

type Sub = { id: number; etapaId: number; nome: string; ordem: number; progresso: number; previsto: number; gasto: number; vinculos: number }

const situacaoEtapa = (pct: number) => (pct === 0 ? 'Não iniciada' : pct === 100 ? 'Concluída' : 'Em andamento')
const pctTexto = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`

// Cada parte do prédio 3D acompanha a etapa de nome correspondente; etapas sem par (preliminares, limpeza) não aparecem no modelo.
const PARTES: [keyof Progresso, RegExp][] = [
  ['fundacao', /funda/],
  ['estrutura', /estrutura/],
  ['alvenaria', /alvenaria|veda/],
  ['instalacoes', /instala/],
  ['cobertura', /cobertura|telhado/],
  ['acabamento', /acabamento/],
]

function progresso3D(etapas: { nome: string; pct: number }[]): Progresso {
  const p: Progresso = { fundacao: 0, estrutura: 0, alvenaria: 0, instalacoes: 0, cobertura: 0, acabamento: 0 }
  for (const [parte, padrao] of PARTES) {
    const e = etapas.find((x) => padrao.test(x.nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()))
    if (e) p[parte] = e.pct
  }
  return p
}

export default async function Obra({ params, searchParams }: PageProps<'/obras/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || !podeVerObra(s, id)) notFound()
  const editar = (await searchParams).editar === '1'

  const [obra] = await sql<
    {
      nome: string
      endereco: string | null
      investidor: string | null
      cidade: string | null
      inicio: string | null
      termino: string | null
      categoria: string | null
      situacao: string
      medido: number | null
      orcamentoAntigo: string | null
      controlaEstoque: boolean
    }[]
  >`
    select nome, endereco, investidor, cidade, inicio, termino, categoria, situacao, medido,
      orcamento_antigo as "orcamentoAntigo", controla_estoque as "controlaEstoque"
    from obras where id = ${id}`
  if (!obra) notFound()
  const etapas = await sql<{ id: number; nome: string; ordem: number }[]>`
    select id, nome, ordem from etapas where obra_id = ${id} order by ordem, id`
  // Previsto vem do orçamento vigente; gasto, dos itens de compras aprovadas.
  const subs = await sql<Sub[]>`
    select s.id, s.etapa_id as "etapaId", s.nome, s.ordem, s.progresso,
      coalesce((select previsto from v_previsto p where p.subetapa_id = s.id), 0) as previsto,
      coalesce((select sum(ci.valor) from compra_itens ci join compras c on c.id = ci.compra_id
                where ci.subetapa_id = s.id and c.situacao = 'aprovada'), 0) as gasto,
      ((select count(*) from compra_itens ci where ci.subetapa_id = s.id)
        + (select count(*) from orcamento_itens i where i.subetapa_id = s.id))::int as vinculos
    from subetapas s
    join etapas e on e.id = s.etapa_id
    where e.obra_id = ${id}
    order by s.ordem, s.id`

  const lista = etapas.map((e) => {
    const filhas = subs.filter((x) => x.etapaId === e.id)
    return {
      ...e,
      subs: filhas,
      previsto: filhas.reduce((t, x) => t + x.previsto, 0),
      gasto: filhas.reduce((t, x) => t + x.gasto, 0),
      pct: progressoEtapa(filhas.map((x) => x.progresso)),
    }
  })
  const previstoTotal = lista.reduce((t, e) => t + e.previsto, 0)
  const gastoTotal = lista.reduce((t, e) => t + e.gasto, 0)
  const pctObra = progressoEtapa(lista.filter((e) => e.subs.length).map((e) => e.pct))
  const pctGasto = previstoTotal > 0 ? (gastoTotal / previstoTotal) * 100 : 0
  const emAlerta = lista.filter((e) => gastoNaFrente(e.gasto, e.previsto, e.pct)).length
  const concluidas = lista.filter((e) => e.subs.length && e.pct === 100).length
  const atualizaProgresso = s.perfil === 'obra' || s.perfil === 'chefe'
  const emAndamento = lista.find((e) => e.subs.length && e.pct < 100)

  return (
    <>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,1fr)]">
        <div className="relative h-[460px] overflow-hidden rounded-xl bg-surface sm:h-[600px]">
          <div className="absolute inset-0">
            <Predio3D progresso={progresso3D(lista)} enquadreX={0.24} enquadreY={0.04} rotulo={`Prédio em 3D: ${pctObra}% do serviço feito na obra`} />
          </div>
          <div className="pointer-events-none relative flex max-w-[420px] flex-col gap-2.5 p-6 sm:p-7">
            <span className="flex flex-wrap items-center gap-2 text-label font-semibold text-ink-3">
              Obra {String(id).padStart(3, '0')}
              {obra.categoria && ` · ${obra.categoria}`}
              <Etiqueta tom={SITUACOES_OBRA[obra.situacao][1]}>{SITUACOES_OBRA[obra.situacao][0]}</Etiqueta>
            </span>
            <h1 className="font-display text-[30px] leading-[1.05] font-light tracking-[-0.02em] sm:text-titulo">{obra.nome}</h1>
            {obra.endereco && <span className="text-[13px] font-medium text-ink-2">{obra.endereco}</span>}
          </div>
          <div className="pointer-events-none absolute top-44 left-6 w-44 rounded-[18px] border border-surface/70 bg-surface/55 px-4 py-3.5 shadow-2 backdrop-blur-md">
            <div className="flex items-baseline justify-between">
              <span className="text-caption font-semibold text-ink-2">Físico</span>
              <span className="font-display text-[30px] font-light">
                {pctObra}
                <span className="text-[15px]">%</span>
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-ink" style={{ width: `${pctObra}%` }} />
            </div>
            <div className="mt-2 text-[11px] font-semibold text-ink-2">{emAndamento ? `Em andamento: ${emAndamento.nome}` : 'Obra concluída'}</div>
          </div>
          <div className="absolute inset-x-5 bottom-5 flex flex-wrap items-center gap-2 rounded-[20px] bg-night px-4 py-3.5 text-night-ink">
            <div className="mr-auto flex flex-col gap-0.5">
              <span className="text-[11px] font-semibold text-night-ink-3">Serviço feito na obra</span>
              <span className="text-body font-medium">
                {concluidas} de {lista.filter((e) => e.subs.length).length} etapas concluídas
              </span>
            </div>
            <Link href={`/orcamento/${id}`} className="inline-flex h-8 items-center rounded-full border border-night-3 px-3.5 text-label font-semibold text-night-ink no-underline hover:bg-night-2">
              Orçamento
            </Link>
            <Link href={`/compras?obra=${id}`} className="inline-flex h-8 items-center rounded-full border border-night-3 px-3.5 text-label font-semibold text-night-ink no-underline hover:bg-night-2">
              Compras da obra
            </Link>
            <Link href={`/obras/${id}/diario`} className="inline-flex h-8 items-center rounded-full border border-night-3 px-3.5 text-label font-semibold text-night-ink no-underline hover:bg-night-2">
              Diário de obra
            </Link>
            <Link href={`/obras/${id}/fotos`} className="inline-flex h-8 items-center rounded-full border border-night-3 px-3.5 text-label font-semibold text-night-ink no-underline hover:bg-night-2">
              Fotos
            </Link>
            <Link
              href={editar ? `/obras/${id}` : `/obras/${id}?editar=1`}
              className="inline-flex h-8 items-center rounded-full bg-accent px-3.5 text-label font-bold text-on-accent no-underline hover:brightness-95"
            >
              {editar ? 'Fechar edição' : 'Editar etapas'}
            </Link>
          </div>
        </div>

        <div className="grid content-start gap-4 sm:grid-cols-2">
          <Cartao as="div" className="sm:col-span-2">
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              {(
                [
                  ['Cliente', obra.investidor],
                  ['Cidade', obra.cidade],
                  ['Prazo', obra.inicio || obra.termino ? `${obra.inicio ? dataBR(obra.inicio) : '?'} até ${obra.termino ? dataBR(obra.termino) : '?'}` : null],
                  ['Medido no sistema antigo', obra.medido !== null ? `${obra.medido.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%` : null],
                  ['Orçamento no sistema antigo', obra.orcamentoAntigo && `nº ${obra.orcamentoAntigo}`],
                  ['Estoque', obra.controlaEstoque ? 'Controla estoque' : 'Não controla'],
                ] as [string, string | null][]
              )
                .filter(([, v]) => v)
                .map(([rotulo, valor]) => (
                  <div key={rotulo} className="flex min-w-0 flex-col gap-0.5">
                    <dt className="text-caption font-semibold text-ink-3">{rotulo}</dt>
                    <dd className="text-table font-semibold">{valor}</dd>
                  </div>
                ))}
            </dl>
          </Cartao>
          <Cartao as="div" className="flex flex-col gap-3.5 sm:col-span-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-label font-semibold text-ink-3">Gasto x previsto</span>
              {emAlerta > 0 ? (
                <Etiqueta tom="aviso">
                  {emAlerta} {emAlerta === 1 ? 'etapa em alerta' : 'etapas em alerta'}
                </Etiqueta>
              ) : (
                <Etiqueta tom="ok">Gasto dentro do feito</Etiqueta>
              )}
            </div>
            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-display text-[32px] font-light tracking-[-0.02em] sm:text-titulo">
                <Dinheiro valor={gastoTotal} />
              </span>
              <span className="text-body font-medium text-ink-3">de {brl(previstoTotal)}</span>
            </div>
            <div
              role="img"
              aria-label={`${pctTexto(pctGasto)} do previsto gasto; ${pctObra}% do serviço feito`}
              className="relative h-7 overflow-hidden rounded-full bg-surface-3"
            >
              <div
                className="absolute inset-y-0 left-0 flex items-center justify-end rounded-full bg-ink pr-2.5 text-label font-bold whitespace-nowrap text-on-ink"
                style={{ width: `${Math.min(100, pctGasto)}%` }}
              >
                {pctGasto >= 22 && `${pctTexto(pctGasto)} gasto`}
              </div>
              <div className="absolute inset-y-0 w-0.5 bg-accent-ink" style={{ left: `${Math.min(99.6, pctObra)}%` }} />
            </div>
            <span className="text-label font-medium text-ink-2">
              Físico executado {pctObra}%
              {previstoTotal > 0 &&
                (pctGasto > pctObra + 0.5
                  ? ` — custo ${pctTexto(pctGasto - pctObra)} acima do avanço.`
                  : ` — custo ${pctTexto(pctObra - pctGasto)} abaixo do avanço.`)}
            </span>
          </Cartao>
          <Kpi pequeno rotulo="Saldo do orçamento" valor={<Dinheiro valor={previstoTotal - gastoTotal} />} detalhe={previstoTotal > 0 ? `${pctTexto(100 - pctGasto)} disponível` : 'Sem orçamento aprovado'} />
          <Kpi pequeno rotulo="Serviço feito" valor={`${pctObra}%`} detalhe={emAndamento ? `Em andamento: ${emAndamento.nome}` : 'Todas as etapas concluídas'} />
        </div>
      </section>

      {editar ? (
        <Editor obraId={id} etapas={lista} />
      ) : (
        <section className="flex flex-col gap-2.5">
          <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2 pb-1">
            <h2 className="font-display text-[24px] font-normal">Etapas</h2>
            <div className="flex flex-wrap items-center gap-4 text-label font-semibold text-ink-2">
              <span className="inline-flex items-center gap-2">
                <span className="h-2.5 w-[18px] rounded-full bg-accent" />
                Feito
              </span>
              <span className="inline-flex items-center gap-2">
                <span className="ds-hachura h-2.5 w-[18px] rounded-full" />
                Gasto acima do feito
              </span>
            </div>
          </div>
          <div className="hidden grid-cols-[28px_minmax(150px,1.1fr)_minmax(220px,2fr)_150px_150px_28px] gap-4 px-5 text-label font-semibold text-ink-3 lg:grid">
            <span />
            <span>Etapa</span>
            <span>Executado</span>
            <span className="text-right">Gasto</span>
            <span className="text-right">Previsto</span>
            <span />
          </div>
          {lista.map((e, i) => (
            <details key={e.id} className="group overflow-hidden rounded-lg bg-surface">
              <summary className="grid cursor-pointer grid-cols-[28px_1fr_28px] items-center gap-x-4 gap-y-3 px-5 py-4 hover:bg-surface-2 lg:grid-cols-[28px_minmax(150px,1.1fr)_minmax(220px,2fr)_150px_150px_28px]">
                <span className="flex size-7 items-center justify-center rounded-full bg-surface-2 text-label font-bold text-ink-2">{i + 1}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[15px] font-semibold">{e.nome}</span>
                  <span className="text-label font-medium text-ink-3">
                    {e.subs.length} {e.subs.length === 1 ? 'subetapa' : 'subetapas'} · {situacaoEtapa(e.pct)}
                  </span>
                </span>
                <span className="col-span-3 row-start-2 lg:col-span-1 lg:row-start-auto">
                  <BarraEtapa feito={e.pct} gastoPct={e.previsto > 0 ? (e.gasto / e.previsto) * 100 : undefined} />
                </span>
                <span className="col-span-3 flex justify-between text-body lg:col-span-2 lg:grid lg:grid-cols-2 lg:gap-4">
                  <span className="text-right font-semibold">
                    <span className="text-ink-3 lg:hidden">Gasto </span>
                    <Dinheiro valor={e.gasto} />
                  </span>
                  <span className="text-right font-medium text-ink-2">
                    <span className="text-ink-3 lg:hidden">Previsto </span>
                    <Dinheiro valor={e.previsto} />
                  </span>
                </span>
                <span
                  aria-hidden
                  className="col-start-3 row-start-1 flex size-7 items-center justify-center rounded-full border border-line text-[16px] font-medium text-ink-2 lg:col-start-auto lg:row-start-auto"
                >
                  <span className="group-open:hidden">+</span>
                  <span className="hidden group-open:inline">−</span>
                </span>
              </summary>
              <div className="flex flex-col px-5 pb-4 lg:pl-16">
                {e.subs.length === 0 && <p className="border-t border-line py-2.5 text-table text-ink-3">Sem subetapas. Use Editar etapas para incluir.</p>}
                {e.subs.map((x) => (
                  <div
                    key={x.id}
                    className="grid items-center gap-x-4 gap-y-2 border-t border-line py-2.5 lg:grid-cols-[minmax(150px,1.1fr)_minmax(220px,2fr)_150px_150px_28px]"
                  >
                    <span className="text-table font-medium">{x.nome}</span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="min-w-32 flex-1">
                        <BarraEtapa feito={x.progresso} tamanho="fina" />
                      </span>
                      {atualizaProgresso && (
                        <FormAcao action={salvarProgresso.bind(null, x.id)} botao="Salvar" tamanho="sm" className="flex items-center gap-2">
                          <label className="flex items-center gap-1 text-label font-semibold text-ink-2">
                            <span className="sr-only">Serviço feito em {x.nome}</span>
                            <Entrada name="progresso" type="number" min={0} max={100} step={5} defaultValue={x.progresso} className="h-8 min-h-8 w-20 px-2.5 text-right" />%
                          </label>
                        </FormAcao>
                      )}
                    </div>
                    <span className="text-table lg:text-right">
                      <span className="text-ink-3 lg:hidden">Gasto </span>
                      <span className="font-semibold">
                        <Dinheiro valor={x.gasto} />
                      </span>
                    </span>
                    <span className="text-table text-ink-2 lg:text-right">
                      <span className="text-ink-3 lg:hidden">Previsto </span>
                      <Dinheiro valor={x.previsto} />
                    </span>
                    <span className="hidden lg:block" />
                  </div>
                ))}
              </div>
            </details>
          ))}
        </section>
      )}

      {lista.some((e) => e.subs.length) && (
        <FaixaEscura>
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-display text-[26px] font-light">Físico x financeiro</h2>
              <span className="text-label font-semibold text-night-ink-3">por etapa · % do previsto</span>
            </div>
            <div className="ds-sem-barra overflow-x-auto">
              <div className="min-w-[640px]">
                <BarrasMensais
                  altura={150}
                  series={['Físico executado', 'Gasto do previsto']}
                  meses={lista
                    .filter((e) => e.subs.length)
                    .map((e) => ({
                      rotulo: e.nome,
                      a: e.pct,
                      b: e.previsto > 0 ? Math.min(100, (e.gasto / e.previsto) * 100) : 0,
                      destaque: gastoNaFrente(e.gasto, e.previsto, e.pct),
                    }))}
                />
              </div>
            </div>
            <Legenda
              itens={[
                { cor: 'acento', texto: 'Físico executado' },
                { cor: 'neutro', texto: 'Gasto do previsto' },
              ]}
            />
          </div>
        </FaixaEscura>
      )}
    </>
  )
}

function Editor({
  obraId,
  etapas,
}: {
  obraId: number
  etapas: { id: number; nome: string; ordem: number; previsto: number; subs: Sub[] }[]
}) {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3 px-1 pt-2">
        <h2 className="font-display text-[24px] font-normal">Editar etapas</h2>
        <p className="text-table text-ink-3">
          O valor previsto de cada etapa vem do{' '}
          <Link href={`/orcamento/${obraId}`} className="underline">
            orçamento da obra
          </Link>
          .
        </p>
      </div>
      {etapas.map((e) => (
        <Cartao key={e.id} className="grid gap-4">
          <FormAcao action={salvarEtapa.bind(null, e.id)} botao="Salvar etapa" className="grid items-end gap-3 sm:grid-cols-[6rem_1fr_11rem_auto]">
            <Campo rotulo="Ordem">
              <Entrada name="ordem" type="number" defaultValue={e.ordem} />
            </Campo>
            <Campo rotulo="Etapa">
              <Entrada name="nome" defaultValue={e.nome} required className="font-semibold" />
            </Campo>
            <p className="pb-3 text-table text-ink-3">Previsto: {brl(e.previsto)}</p>
          </FormAcao>

          <div className="grid gap-3 border-l-4 border-line pl-4">
            {e.subs.map((x) => (
              <div key={x.id} className="flex flex-wrap items-end gap-2">
                <FormAcao action={salvarSubetapa.bind(null, x.id)} botao="Salvar" className="grid flex-1 items-end gap-3 sm:grid-cols-[6rem_1fr_auto]">
                  <Campo rotulo="Ordem">
                    <Entrada name="ordem" type="number" defaultValue={x.ordem} />
                  </Campo>
                  <Campo rotulo="Subetapa">
                    <Entrada name="nome" defaultValue={x.nome} required />
                  </Campo>
                </FormAcao>
                {x.vinculos === 0 && <FormAcao action={removerSubetapa.bind(null, x.id)} botao="Remover" variante="perigo" />}
              </div>
            ))}
            <FormAcao action={adicionarSubetapa.bind(null, e.id)} botao="Adicionar subetapa" variante="suave" className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Campo rotulo={`Nova subetapa em ${e.nome}`}>
                  <Entrada name="nome" required />
                </Campo>
              </div>
            </FormAcao>
          </div>

          {e.subs.every((x) => x.vinculos === 0) && (
            <div>
              <FormAcao action={removerEtapa.bind(null, e.id)} botao={`Remover a etapa ${e.nome}`} variante="perigo" />
            </div>
          )}
        </Cartao>
      ))}

      <Cartao>
        <FormAcao action={adicionarEtapa.bind(null, obraId)} botao="Adicionar etapa" variante="primario" className="flex flex-wrap items-end gap-3">
          <div className="min-w-56 flex-1">
            <Campo rotulo="Nova etapa">
              <Entrada name="nome" required />
            </Campo>
          </div>
        </FormAcao>
      </Cartao>
    </section>
  )
}
