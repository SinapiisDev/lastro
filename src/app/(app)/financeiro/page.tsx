import Link from 'next/link'
import {
  BotaoLink,
  CabecalhoTela,
  Campo,
  Cartao,
  Dinheiro,
  EntradaDinheiro,
  Entrada,
  EstadoVazio,
  FaixaEscura,
  FormAcao,
  Kpi,
  Legenda,
  BarrasMensais,
  Secao,
  Segmentado,
  SeletorPilula,
  Selecao,
  Situacao,
  Tabela,
  Td,
  Th,
  Tr,
  dinheiroCurto,
} from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { dataBR, mesBR, projetarFluxo, somarDias } from '@/lib/regras'
import { contextoFluxo, saldoHoje } from '@/lib/fluxo'
import { TabelaFluxo } from '@/components/tabela-fluxo'
import { salvarSaldo, criarEntrada, receberEntrada, cancelarEntrada } from './acoes'

type Fila = { id: number; obra: string; fornecedor: string; descricao: string; valor: number; criadaEm: Date; situacao: string }

const PERIODOS = [
  ['mes', 'Este mês'],
  ['30', '30 dias'],
  ['60', '60 dias'],
  ['90', '90 dias'],
] as const
const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()]
const fimDoMes = (iso: string) => new Date(Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7), 0)).toISOString().slice(0, 10)
const quando = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

export default async function Financeiro({ searchParams }: PageProps<'/financeiro'>) {
  const s = await exigirSessao('financeiro', 'chefe')
  const q = await searchParams
  const obraId = Number(q.obra) || 0
  const periodo = PERIODOS.find(([k]) => k === q.periodo)?.[0] ?? '30'

  const [{ config, hoje, movimentos, saldo }, saldoEmpresa, obras, fila, entradas] = await Promise.all([
    contextoFluxo(obraId || undefined),
    saldoHoje(),
    sql<{ id: number; nome: string; ativa: boolean }[]>`select id, nome, ativa from obras order by ativa desc, nome`,
    sql<Fila[]>`
      select id, obra, fornecedor, descricao, valor, criada_em as "criadaEm", situacao
      from v_compras where situacao in ('aguardando_financeiro', 'aguardando_chefe')
        ${obraId ? sql`and obra_id = ${obraId}` : sql``}
      order by id`,
    sql<{ id: number; obra: string; descricao: string; valor: number; previstoPara: string }[]>`
      select e.id, o.nome as obra, e.descricao, e.valor, e.previsto_para as "previstoPara"
      from entradas e join obras o on o.id = e.obra_id
      where e.recebida_em is null and not e.cancelada ${obraId ? sql`and e.obra_id = ${obraId}` : sql``}
      order by e.previsto_para`,
  ])
  const aPagar = await sql<{ id: number; compraId: number; numero: number; total: number; obra: string; fornecedor: string; valor: number; vencimento: string }[]>`
    select p.id, p.compra_id as "compraId", p.numero, (select count(*) from parcelas x where x.compra_id = p.compra_id)::int as total,
      c.obra, c.fornecedor, p.valor, p.vencimento
    from parcelas p join v_compras c on c.id = p.compra_id
    where c.situacao = 'aprovada' and p.paga_em is null and p.vencimento <= ${somarDias(hoje, 30)}
      ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
    order by p.vencimento, p.id`

  // O financeiro libera a faixa média; o chefe também vê o que espera por ele.
  const minhaFila = fila.filter((c) => c.situacao === 'aguardando_financeiro' || s.perfil === 'chefe')
  const limite = periodo === 'mes' ? fimDoMes(hoje) : somarDias(hoje, Number(periodo))
  const noPeriodo = movimentos.filter((m) => m.data <= limite)
  const saidas = noPeriodo.filter((m) => m.valor < 0)
  const chegadas = noPeriodo.filter((m) => m.valor > 0)
  const nomePeriodo = PERIODOS.find(([k]) => k === periodo)![1].toLowerCase()
  const linhas = projetarFluxo(saldo, movimentos, hoje, 6)
  const nomeObra = obras.find((o) => o.id === obraId)?.nome
  const semana = Array.from({ length: 7 }, (_, i) => somarDias(hoje, i))
  const vencidas = aPagar.filter((p) => p.vencimento < hoje)
  const deHoje = aPagar.filter((p) => p.vencimento === hoje)
  const proximas = aPagar.filter((p) => p.vencimento > hoje)
  const href = (o: Record<string, string | number>) => {
    const p = new URLSearchParams({ ...(obraId ? { obra: String(obraId) } : {}), periodo, ...Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])) })
    return `/financeiro?${p}`
  }

  return (
    <>
      <CabecalhoTela
        contexto={new Date(hoje + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).replace(/^./, (c) => c.toUpperCase())}
        titulo={nomeObra ? `Painel · ${nomeObra}` : 'Painel financeiro'}
        acoes={
          <>
            <form className="flex items-center gap-2">
              <input type="hidden" name="periodo" value={periodo} />
              <label className="sr-only" htmlFor="obra-painel">
                Obra
              </label>
              <SeletorPilula id="obra-painel" name="obra" defaultValue={obraId || ''} ativo={!!obraId} className="bg-surface">
                <option value="">Todas as obras</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                    {!o.ativa && ' (encerrada)'}
                  </option>
                ))}
              </SeletorPilula>
              <button className="h-10 rounded-full bg-surface px-4 text-[13px] font-semibold hover:bg-surface-2">Ver</button>
            </form>
            <Segmentado fundo="surface" opcoes={PERIODOS.map(([k, r]) => ({ href: href({ periodo: k }), rotulo: r, ativo: k === periodo }))} />
          </>
        }
      />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tom="escuro" rotulo="Saldo em caixa" valor={<Dinheiro valor={saldoEmpresa} />} detalhe={`informado em ${dataBR(config.saldoCaixaEm)}, mais o que entrou e saiu depois`} corDetalhe="acento" />
        <Kpi
          rotulo={`A pagar · ${nomePeriodo}`}
          valor={<Dinheiro valor={-saidas.reduce((t, m) => t + m.valor, 0)} />}
          detalhe={`${saidas.length} ${saidas.length === 1 ? 'parcela' : 'parcelas'}`}
        />
        <Kpi
          rotulo={`Entradas previstas · ${nomePeriodo}`}
          valor={<Dinheiro valor={chegadas.reduce((t, m) => t + m.valor, 0)} />}
          detalhe={`${chegadas.length} ${chegadas.length === 1 ? 'entrada' : 'entradas'}`}
          corDetalhe="acento"
        />
        <Kpi
          tom="aviso"
          rotulo="Aguardando liberação"
          valor={<Dinheiro valor={fila.reduce((t, c) => t + c.valor, 0)} />}
          detalhe={`${fila.length} ${fila.length === 1 ? 'compra' : 'compras'} · ${fila.filter((c) => c.situacao === 'aguardando_chefe').length} acima do teto`}
          corDetalhe="aviso"
        />
      </section>

      <Cartao className="ds-sem-barra flex items-center gap-2 overflow-x-auto px-4 py-3.5 sm:px-4">
        <span className="flex-none px-2 text-label font-semibold text-ink-3">
          Vencimentos
          <br />
          da semana
        </span>
        {semana.map((dia) => {
          const doDia = aPagar.filter((p) => p.vencimento === dia)
          const ehHoje = dia === hoje
          return (
            <div key={dia} className={`flex min-w-[104px] flex-1 flex-col gap-1 rounded-[16px] px-3 py-2.5 ${ehHoje ? 'bg-ink text-on-ink' : 'bg-surface-2'}`}>
              <div className="flex items-baseline gap-1.5">
                <span className="font-display text-[24px] font-light">{dia.slice(8)}</span>
                <span className="text-[11px] font-semibold opacity-60">{diaSemana(dia)}</span>
              </div>
              <span className="text-[12.5px] font-bold">
                <Dinheiro valor={doDia.reduce((t, p) => t + p.valor, 0)} />
              </span>
              <div className="flex gap-[3px]">
                {doDia.map((p) => (
                  <span key={p.id} className={`size-1.5 rounded-full ${ehHoje ? 'bg-accent' : 'bg-ink-3'}`} />
                ))}
              </div>
            </div>
          )
        })}
      </Cartao>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <Secao titulo={`Compras aguardando liberação (${minhaFila.length})`} acao={<Link href="/compras?status=aguardando_financeiro" className="text-[12.5px] font-bold no-underline">Ver todas ›</Link>}>
          {minhaFila.length === 0 ? (
            <EstadoVazio titulo="Nada esperando liberação">Quando o engenheiro registrar uma compra na faixa média, ela aparece aqui.</EstadoVazio>
          ) : (
            <Tabela minimo={760}>
              <thead>
                <tr>
                  <Th>Compra</Th>
                  <Th>Item · obra</Th>
                  <Th>Fornecedor</Th>
                  <Th num>Valor</Th>
                  <Th>Situação</Th>
                  <Th />
                </tr>
              </thead>
              <tbody>
                {minhaFila.map((c) => (
                  <Tr key={c.id}>
                    <Td forte>Nº {c.id}</Td>
                    <Td>
                      <span className="flex flex-col gap-0.5">
                        <span className="line-clamp-1 font-semibold" title={c.descricao}>
                          {c.descricao}
                        </span>
                        <span className="text-caption text-ink-3">
                          {c.obra} · {quando(c.criadaEm)}
                        </span>
                      </span>
                    </Td>
                    <Td className="text-ink-2">{c.fornecedor}</Td>
                    <Td num forte>
                      <Dinheiro valor={c.valor} />
                    </Td>
                    <Td>
                      <Situacao status={c.situacao} />
                    </Td>
                    <Td className="text-right">
                      <BotaoLink href={`/compras/${c.id}`} tamanho="sm">
                        Analisar
                      </BotaoLink>
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Secao>

        <Secao
          titulo="Parcelas a vencer"
          acao={
            <Link href="/financeiro/pagar" className="text-[12.5px] font-bold no-underline">
              próximos 30 dias · Contas a pagar ›
            </Link>
          }
        >
          {aPagar.length === 0 && <EstadoVazio titulo="Nada para pagar">Nenhuma parcela vence nos próximos 30 dias.</EstadoVazio>}
          {(
            [
              ['Vencidas', vencidas, 'text-neg'],
              ['Hoje', deHoje, 'text-ink'],
              ['Próximos dias', proximas, 'text-ink-2'],
            ] as const
          )
            .filter(([, itens]) => itens.length)
            .map(([nome, itens, cor]) => (
              <div key={nome} className="flex flex-col">
                <div className={`flex justify-between pt-2 pb-1.5 text-label font-bold ${cor}`}>
                  <span>{nome}</span>
                  <Dinheiro valor={(nome === 'Vencidas' ? -1 : 1) * itens.reduce((t, p) => t + p.valor, 0)} />
                </div>
                {itens.map((p) => (
                  <Link
                    key={p.id}
                    href={`/compras/${p.compraId}`}
                    className="grid grid-cols-[52px_1fr_auto] items-center gap-3 border-t border-line py-2.5 no-underline hover:bg-surface-2"
                  >
                    <span className={`text-label font-semibold ${p.vencimento < hoje ? 'text-neg' : 'text-ink-2'}`}>{dataBR(p.vencimento).slice(0, 5)}</span>
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="truncate text-table font-semibold">{p.fornecedor}</span>
                      <span className="truncate text-caption text-ink-3">
                        Nº {p.compraId} · {p.numero}/{p.total} · {p.obra}
                      </span>
                    </span>
                    <span className={`text-table font-bold ${p.vencimento < hoje ? 'text-neg' : ''}`}>
                      <Dinheiro valor={p.vencimento < hoje ? -p.valor : p.valor} />
                    </span>
                  </Link>
                ))}
              </div>
            ))}
        </Secao>
      </section>

      <FaixaEscura className="grid gap-6 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-[28px] font-light">{obraId ? 'Fluxo de caixa da obra' : 'Fluxo de caixa'}</h2>
            <Legenda
              itens={[
                { cor: 'acento', texto: 'Entradas' },
                { cor: 'neutro', texto: 'Saídas' },
                { cor: 'neg', texto: 'Saldo negativo' },
              ]}
            />
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[560px]">
              <BarrasMensais
                meses={linhas.map((l, i) => ({
                  rotulo: `${mesBR(l.mes)}${i === 0 ? ' · atual' : ' · prev.'}`,
                  a: l.entradas,
                  b: l.saidas,
                  destaque: i === 0,
                  previsao: i > 0,
                  rodape: <span className={`text-[12.5px] font-bold whitespace-nowrap ${l.acumulado < 0 ? 'text-neg-night' : ''}`}>{dinheiroCurto(l.acumulado)}</span>,
                }))}
              />
            </div>
          </div>
          <span className="text-label text-night-ink-3">
            {obraId
              ? 'Só o que esta obra vai receber e pagar; o acumulado começa em zero.'
              : 'Saldo acumulado no fim de cada mês: parcelas aprovadas a pagar e entradas previstas. Atrasados entram no mês atual.'}
          </span>
          <details className="rounded-md bg-night-2 p-4">
            <summary className="cursor-pointer text-[13px] font-semibold text-night-ink-2">Ver em tabela</summary>
            <div className="mt-3">
              <TabelaFluxo linhas={linhas} noturno />
            </div>
          </details>
          {!obraId && (
            <details className="rounded-md bg-night-2 p-4">
              <summary className="cursor-pointer text-[13px] font-semibold text-night-ink-2">Atualizar o saldo em caixa</summary>
              <FormAcao action={salvarSaldo} botao="Salvar saldo" variante="acento" noturno className="mt-3 grid gap-3 sm:grid-cols-[14rem_12rem_auto] sm:items-end">
                <Campo rotulo={<span className="text-night-ink-2">Saldo no fim do dia</span>}>
                  <EntradaDinheiro name="valor" required defaultValue={config.saldoCaixa} min={undefined} />
                </Campo>
                <Campo rotulo={<span className="text-night-ink-2">Dia</span>}>
                  <Entrada name="data" type="date" required defaultValue={hoje} />
                </Campo>
              </FormAcao>
            </details>
          )}
        </div>

        <div className="flex flex-col gap-2.5">
          <div className="mb-1.5 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-[28px] font-light">Entradas previstas</h2>
            <Link href="/financeiro/receber" className="text-[12.5px] font-bold text-accent-night no-underline">
              Receber em parte · Contas a receber ›
            </Link>
          </div>
          {entradas.length === 0 && <p className="text-[13px] text-night-ink-3">Nenhuma entrada prevista. Lance os aportes do investidor e as medições logo abaixo.</p>}
          {entradas.map((e) => (
            <div key={e.id} className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-[16px] bg-night-2 px-4 py-3.5">
              <span className="text-table font-semibold">{e.descricao}</span>
              <span className="text-right text-body font-bold">
                <Dinheiro valor={e.valor} />
              </span>
              <span className="text-label text-night-ink-3">
                {e.obra} · {dataBR(e.previstoPara)}
              </span>
              <span className={`text-right text-label font-semibold ${e.previstoPara < hoje ? 'text-neg-night' : 'text-warn-night'}`}>
                {e.previstoPara < hoje ? 'Atrasada' : 'Aguardando'}
              </span>
              <div className="col-span-2 mt-2 flex flex-wrap items-end gap-2">
                <FormAcao action={receberEntrada.bind(null, e.id)} botao="Recebida" variante="acento" tamanho="sm" noturno className="flex items-end gap-2">
                  <Campo rotulo="Recebida em" ocultarRotulo>
                    <Entrada name="recebida_em" type="date" required defaultValue={hoje} className="min-h-8 py-1 text-label" />
                  </Campo>
                </FormAcao>
                <FormAcao action={cancelarEntrada.bind(null, e.id)} botao="Cancelar" variante="secundario" tamanho="sm" noturno />
              </div>
            </div>
          ))}
          <details className="rounded-[16px] bg-night-2 p-4">
            <summary className="cursor-pointer text-[13px] font-semibold text-night-ink-2">Lançar entrada</summary>
            <FormAcao action={criarEntrada} botao="Lançar entrada" variante="acento" noturno className="mt-3 grid gap-3">
              <Campo rotulo={<span className="text-night-ink-2">Obra</span>}>
                <Selecao name="obra" required defaultValue={obraId || ''}>
                  <option value="" disabled>
                    Escolha a obra
                  </option>
                  {obras
                    .filter((o) => o.ativa)
                    .map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                </Selecao>
              </Campo>
              <Campo rotulo={<span className="text-night-ink-2">Descrição</span>}>
                <Entrada name="descricao" required placeholder="Ex.: Aporte do investidor, 3ª medição" />
              </Campo>
              <div className="grid gap-3 sm:grid-cols-2">
                <Campo rotulo={<span className="text-night-ink-2">Valor</span>}>
                  <EntradaDinheiro name="valor" min="0.01" required />
                </Campo>
                <Campo rotulo={<span className="text-night-ink-2">Data prevista</span>}>
                  <Entrada name="previsto_para" type="date" required />
                </Campo>
              </div>
            </FormAcao>
          </details>
        </div>
      </FaixaEscura>
    </>
  )
}
