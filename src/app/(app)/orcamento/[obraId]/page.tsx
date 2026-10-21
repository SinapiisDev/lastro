import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  BotaoImprimir,
  BotaoLink,
  CabecalhoTela,
  Campo,
  Cartao,
  Dinheiro,
  Entrada,
  EstadoVazio,
  FormAcao,
  Marca,
  Passos,
  Secao,
  Selecao,
  Situacao,
  Tabela,
  Td,
  Th,
  type EstadoPasso,
} from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { brl, comBdi } from '@/lib/regras'
import { quando } from '@/lib/historico'
import { TIPOS_ITEM } from '@/components/rotulos'
import {
  iniciarOrcamento,
  salvarInvestidor,
  salvarBdi,
  adicionarItem,
  salvarItem,
  removerItem,
  mudarSituacao,
  criarRevisao,
} from '../acoes'

type Versao = { id: number; versao: number; situacao: string; bdi: number; motivo: string | null; criadoEm: Date; aprovadoEm: Date | null }
type Item = { id: number; subetapaId: number; descricao: string; unidade: string; quantidade: number; preco: number; tipo: string; total: number; comprado: number }
type Sub = { id: number; nome: string; etapaId: number; etapa: string }

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const pct = (parte: number, todo: number) => (todo > 0 ? `${((parte / todo) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%` : '—')
const dois = (n: number) => String(n).padStart(2, '0')

export default async function OrcamentoObra({ params, searchParams }: PageProps<'/orcamento/[obraId]'>) {
  const s = await exigirSessao()
  const obraId = Number((await params).obraId)
  if (!Number.isInteger(obraId) || !podeVerObra(s, obraId)) notFound()
  const q = await searchParams
  const editor = s.perfil !== 'obra'

  const [obra] = await sql<{ nome: string; investidor: string | null; contato: string | null }[]>`
    select nome, investidor, investidor_contato as contato from obras where id = ${obraId}`
  if (!obra) notFound()
  const versoes = await sql<Versao[]>`
    select id, versao, situacao, bdi, motivo, criado_em as "criadoEm", aprovado_em as "aprovadoEm"
    from orcamentos where obra_id = ${obraId} order by versao desc`

  // Sem versão pedida: quem edita vê a versão em edição; o engenheiro vê a que vale (aprovada).
  const emEdicao = versoes.find((v) => v.situacao === 'rascunho' || v.situacao === 'enviado')
  const aprovada = versoes.find((v) => v.situacao === 'aprovado')
  const sel =
    versoes.find((v) => v.versao === Number(q.versao)) ?? (editor ? (emEdicao ?? aprovada) : (aprovada ?? emEdicao)) ?? versoes[0]
  const codObra = `OB-${String(obraId).padStart(3, '0')}`

  if (!sel) {
    return (
      <>
        <CabecalhoTela contexto={codObra} titulo={`Orçamento · ${obra.nome}`} />
        <Cartao className="max-w-2xl">
          <EstadoVazio
            titulo="Esta obra ainda não tem orçamento"
            acao={editor && <FormAcao action={iniciarOrcamento.bind(null, obraId)} botao="Começar orçamento" variante="primario" />}
          >
            {editor
              ? 'Ao começar, ele usa as etapas e subetapas da obra; você inclui os itens em cada uma.'
              : 'A construtora ainda não montou o orçamento desta obra.'}
          </EstadoVazio>
        </Cartao>
      </>
    )
  }

  const [subs, itens, [{ fora }], config] = await Promise.all([
    sql<Sub[]>`
      select s.id, s.nome, e.id as "etapaId", e.nome as etapa from subetapas s join etapas e on e.id = s.etapa_id
      where e.obra_id = ${obraId} order by e.ordem, e.id, s.ordem, s.id`,
    sql<Item[]>`
      select i.id, i.subetapa_id as "subetapaId", i.descricao, i.unidade, i.quantidade, i.preco_unitario as preco, i.tipo,
        round(i.quantidade * i.preco_unitario, 2) as total,
        coalesce((select sum(ci.valor) from compra_itens ci join compras c on c.id = ci.compra_id
                  where ci.item_chave = i.chave and c.situacao = 'aprovada'), 0) as comprado
      from orcamento_itens i where i.orcamento_id = ${sel.id} order by i.id`,
    sql<{ fora: number }[]>`
      select coalesce(sum(ci.valor), 0) as fora from compra_itens ci join compras c on c.id = ci.compra_id
      where c.obra_id = ${obraId} and c.situacao = 'aprovada' and ci.item_chave is null`,
    lerConfig(),
  ])

  const editando = editor && sel.situacao === 'rascunho' && q.editar === '1'
  const etapas = [...new Set(subs.map((x) => x.etapaId))].map((id) => {
    const daEtapa = subs.filter((x) => x.etapaId === id)
    const comItens = daEtapa.map((sub) => ({ ...sub, itens: itens.filter((i) => i.subetapaId === sub.id) }))
    const todos = comItens.flatMap((x) => x.itens)
    return {
      id,
      nome: daEtapa[0].etapa,
      subs: comItens,
      total: todos.reduce((t, i) => t + i.total, 0),
      comprado: todos.reduce((t, i) => t + i.comprado, 0),
    }
  })
  const custo = itens.reduce((t, i) => t + i.total, 0)
  const comprado = itens.reduce((t, i) => t + i.comprado, 0)
  const valorInvestidor = comBdi(custo, sel.bdi)
  const comItens = etapas.filter((e) => e.total > 0 || e.subs.some((x) => x.itens.length))
  const bdiTexto = `${sel.bdi.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

  const ordem = ['rascunho', 'enviado', 'aprovado']
  const posicao = sel.situacao === 'substituido' ? 3 : ordem.indexOf(sel.situacao)
  const passo = (i: number): EstadoPasso => (i < posicao || (i === 2 && posicao >= 2) ? 'feito' : i === posicao ? 'atual' : 'pendente')

  return (
    <>
      <div className="contents print:hidden">
        <CabecalhoTela
          contexto={`${codObra} · Orçamento v${sel.versao}${obra.investidor ? ` · Investidor: ${obra.investidor}${obra.contato ? `, ${obra.contato}` : ''}` : ''}`}
          titulo={`Orçamento · ${obra.nome}`}
          situacao={<Situacao status={sel.situacao} grande />}
          acoes={
            <>
              {editor && sel.situacao === 'rascunho' && (
                <BotaoLink href={editando ? `/orcamento/${obraId}` : `/orcamento/${obraId}?editar=1`}>{editando ? 'Terminar edição' : 'Editar itens'}</BotaoLink>
              )}
              <BotaoImprimir />
              {editor && sel.situacao === 'rascunho' && (
                <FormAcao action={mudarSituacao.bind(null, sel.id, 'enviado')} botao="Enviar ao investidor" variante="primario" className="flex items-center gap-2" />
              )}
              {editor && sel.situacao === 'enviado' && (
                <FormAcao action={mudarSituacao.bind(null, sel.id, 'rascunho')} botao="Voltar a rascunho" className="flex items-center gap-2" />
              )}
              {editor && (sel.situacao === 'rascunho' || sel.situacao === 'enviado') && (
                <FormAcao action={mudarSituacao.bind(null, sel.id, 'aprovado')} botao="Registrar aprovação" variante="acento" className="flex items-center gap-2" />
              )}
            </>
          }
        >
          {sel.motivo && <span className="text-table text-ink-3">Motivo desta versão: {sel.motivo}</span>}
        </CabecalhoTela>

        <Passos
          itens={[
            { titulo: 'Rascunho', detalhe: 'Itens e margem em edição', estado: passo(0) },
            { titulo: 'Enviado ao investidor', detalhe: posicao >= 1 ? 'Aguardando a resposta' : 'pendente', estado: passo(1) },
            {
              titulo: 'Aprovado',
              detalhe: sel.aprovadoEm ? `Contrato assinado em ${quando(sel.aprovadoEm)}` : posicao >= 2 ? 'Contrato assinado' : 'pendente',
              estado: passo(2),
            },
          ]}
        />
        {sel.situacao === 'enviado' && (
          <Cartao tom="suave" as="div" className="text-table font-medium text-ink-2">
            Enviado ao investidor. Itens e margem ficam bloqueados; para mudar algo, volte a rascunho.
          </Cartao>
        )}
        {sel.situacao === 'aprovado' && (
          <Cartao tom="suave" as="div" className="text-table font-medium text-ink-2">
            Aprovado: está travado e é a base de controle da obra. Alterações geram uma nova versão.
          </Cartao>
        )}
        {sel.situacao === 'substituido' && (
          <Cartao tom="suave" as="div" className="text-table font-medium text-ink-2">
            Versão antiga, mantida só para consulta.
          </Cartao>
        )}

        {editando ? (
          <Editor orcamentoId={sel.id} etapas={etapas} />
        ) : (
          <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <Cartao className="min-w-0">
              {itens.length === 0 ? (
                <EstadoVazio titulo="Nenhum item ainda">{editor && sel.situacao === 'rascunho' ? 'Use Editar itens para incluir.' : undefined}</EstadoVazio>
              ) : (
                <Tabela minimo={980}>
                  <thead>
                    <tr>
                      <Th className="w-16">Código</Th>
                      <Th>Descrição</Th>
                      <Th>Tipo</Th>
                      <Th>Un.</Th>
                      <Th num>Qtd.</Th>
                      <Th num>Custo unit.</Th>
                      <Th num>Custo total</Th>
                      <Th num>% obra</Th>
                      <Th num>Comprado</Th>
                      <Th num>Sobra</Th>
                    </tr>
                  </thead>
                  {comItens.map((e, ei) => {
                    let n = 0
                    return (
                      <tbody key={e.id}>
                        <tr className="bg-surface-2 font-bold [&>td]:px-2 [&>td]:py-3 [&>td:first-child]:rounded-l-md [&>td:last-child]:rounded-r-md">
                          <td className="text-ink-3">{dois(ei + 1)}</td>
                          <td colSpan={5}>{e.nome}</td>
                          <td className="text-right">
                            <Dinheiro valor={e.total} />
                          </td>
                          <td className="text-right text-ink-2">{pct(e.total, custo)}</td>
                          <td className="text-right font-semibold text-ink-2">
                            <Dinheiro valor={e.comprado} />
                          </td>
                          <td className="text-right">
                            <Dinheiro valor={e.total - e.comprado} />
                          </td>
                        </tr>
                        {e.subs
                          .filter((x) => x.itens.length)
                          .map((x) => [
                            <tr key={`s${x.id}`}>
                              <td />
                              <td colSpan={9} className="px-2 pt-3 pb-1 text-label font-semibold text-ink-3">
                                {x.nome}
                              </td>
                            </tr>,
                            ...x.itens.map((i) => (
                              <tr key={i.id} className="hover:bg-surface-2">
                                <Td className="text-ink-3">
                                  {dois(ei + 1)}.{dois(++n)}
                                </Td>
                                <Td>{i.descricao}</Td>
                                <Td className="text-ink-2">{TIPOS_ITEM[i.tipo]}</Td>
                                <Td className="text-ink-2">{i.unidade}</Td>
                                <Td num>{qtd(i.quantidade)}</Td>
                                <Td num>
                                  <Dinheiro valor={i.preco} />
                                </Td>
                                <Td num forte>
                                  <Dinheiro valor={i.total} />
                                </Td>
                                <Td num className="text-ink-3">
                                  {pct(i.total, custo)}
                                </Td>
                                <Td num className="text-ink-2">
                                  <Dinheiro valor={i.comprado} />
                                </Td>
                                <Td num>
                                  <Dinheiro valor={i.total - i.comprado} />
                                </Td>
                              </tr>
                            )),
                          ])}
                      </tbody>
                    )
                  })}
                  <tfoot>
                    <tr className="bg-surface-2 font-bold [&>td]:px-2 [&>td]:py-3.5 [&>td:first-child]:rounded-l-sm [&>td:last-child]:rounded-r-sm">
                      <td colSpan={6}>Custo direto total</td>
                      <td className="text-right">
                        <Dinheiro valor={custo} />
                      </td>
                      <td className="text-right">100%</td>
                      <td className="text-right text-ink-2">
                        <Dinheiro valor={comprado} />
                      </td>
                      <td className="text-right">
                        <Dinheiro valor={custo - comprado} />
                      </td>
                    </tr>
                  </tfoot>
                </Tabela>
              )}
              {fora > 0 && <p className="mt-3 text-table font-semibold text-warn">Compras fora do orçamento nesta obra: {brl(fora)}.</p>}
            </Cartao>

            <aside className="grid items-start gap-4 md:grid-cols-2 2xl:sticky 2xl:top-4 2xl:grid-cols-1">
              <Cartao as="div" className="flex flex-col gap-3.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-label font-semibold text-ink-3">Margem da construtora (BDI)</span>
                  <span className="font-display text-[24px] font-light">{bdiTexto}</span>
                </div>
                {editor && sel.situacao === 'rascunho' ? (
                  <FormAcao action={salvarBdi.bind(null, sel.id)} botao="Salvar margem" className="grid gap-3">
                    <Campo rotulo="Alterar a margem (%)">
                      <Entrada name="bdi" type="number" min={0} step="0.01" defaultValue={sel.bdi} className="text-right" />
                    </Campo>
                  </FormAcao>
                ) : (
                  <span className="text-label font-medium text-ink-3">Bloqueada nesta situação do orçamento.</span>
                )}
              </Cartao>
              <Cartao tom="noite" as="div" className="flex flex-col gap-3 p-[22px]!">
                <div className="flex justify-between gap-3 text-table font-medium text-night-ink-2">
                  <span>Custo direto</span>
                  <Dinheiro valor={custo} />
                </div>
                <div className="flex justify-between gap-3 text-table font-medium text-night-ink-2">
                  <span>BDI {bdiTexto}</span>
                  <Dinheiro valor={valorInvestidor - custo} />
                </div>
                <div className="h-px bg-night-3" />
                <span className="text-label font-semibold text-night-ink-3">Valor ao investidor</span>
                <span className="font-display text-[36px] leading-tight font-light text-accent">
                  <Dinheiro valor={valorInvestidor} />
                </span>
              </Cartao>
            </aside>
          </section>
        )}

        {editor && (
          <div className="grid gap-4 lg:grid-cols-2">
            {sel.situacao === 'aprovado' && (
              <Secao titulo="Revisão">
                <FormAcao action={criarRevisao.bind(null, sel.id)} botao="Criar revisão" className="grid gap-3">
                  <p className="text-table text-ink-3">
                    Para mudar, crie uma revisão. Ela começa como cópia desta versão, e esta continua valendo até a revisão ser aprovada.
                  </p>
                  <Campo rotulo="Motivo da revisão">
                    <Entrada name="motivo" required placeholder="Ex.: aditivo de contrato, mudança de projeto" />
                  </Campo>
                </FormAcao>
              </Secao>
            )}
            <Secao titulo="Investidor">
              <FormAcao action={salvarInvestidor.bind(null, obraId)} botao="Salvar investidor" className="grid gap-3">
                <Campo rotulo="Nome">
                  <Entrada name="investidor" defaultValue={obra.investidor ?? ''} />
                </Campo>
                <Campo rotulo="Contato (telefone ou e-mail)">
                  <Entrada name="contato" defaultValue={obra.contato ?? ''} />
                </Campo>
              </FormAcao>
            </Secao>
          </div>
        )}

        {versoes.length > 1 && (
          <Secao titulo="Versões">
            <ul className="flex flex-col">
              {versoes.map((v) => (
                <li key={v.id} className="flex flex-wrap items-center gap-3 border-b border-line py-2.5 last:border-0">
                  <Link href={`/orcamento/${obraId}?versao=${v.versao}`} className={v.id === sel.id ? 'font-bold' : 'font-semibold text-ink-2'}>
                    Versão {v.versao}
                  </Link>
                  <Situacao status={v.situacao} />
                  <span className="text-label text-ink-3">
                    criada em {quando(v.criadoEm)}
                    {v.motivo && `: ${v.motivo}`}
                  </span>
                </li>
              ))}
            </ul>
          </Secao>
        )}
      </div>

      {/* Documento A4 para o investidor: só aparece ao imprimir ou salvar em PDF. */}
      <article className="hidden text-fixed-ink print:block">
        <header className="flex items-start justify-between gap-6 border-b-2 border-fixed-ink pb-4">
          <div className="flex items-center gap-3">
            <Marca tamanho={30} comNome={false} />
            <span className="text-[15px] font-bold">{config.nomeEmpresa}</span>
          </div>
          <div className="flex flex-col items-end gap-0.5 text-label">
            <span className="font-bold">
              ORÇAMENTO Nº {codObra}/v{sel.versao}
            </span>
            <span>Emitido em {quando(new Date())}</span>
          </div>
        </header>
        <div className="flex items-end justify-between gap-6 py-5">
          <div className="flex flex-col gap-1">
            <h1 className="font-display text-[28px] leading-tight font-light">{obra.nome}</h1>
            {obra.investidor && <span className="text-table">Investidor: {obra.investidor}</span>}
          </div>
          <span className="text-label font-bold uppercase">
            {sel.situacao === 'aprovado' && sel.aprovadoEm ? `Aprovado · ${quando(sel.aprovadoEm)}` : sel.situacao === 'enviado' ? 'Proposta' : 'Rascunho'}
          </span>
        </div>
        <table className="w-full border-collapse text-[11.5px]">
          <thead>
            <tr className="border-b border-fixed-ink text-left [&>th]:py-1.5 [&>th]:font-bold">
              <th className="w-12">Cód.</th>
              <th>Descrição</th>
              <th>Un.</th>
              <th className="text-right">Qtd.</th>
              <th className="text-right">Unitário</th>
              <th className="text-right">Total</th>
            </tr>
          </thead>
          {comItens.map((e, ei) => {
            let n = 0
            return (
              <tbody key={e.id} className="break-inside-avoid">
                <tr className="font-bold [&>td]:pt-3 [&>td]:pb-1">
                  <td>{dois(ei + 1)}</td>
                  <td colSpan={4}>{e.nome}</td>
                  <td className="text-right">{brl(e.total)}</td>
                </tr>
                {e.subs.flatMap((x) =>
                  x.itens.map((i) => (
                    <tr key={i.id} className="border-b border-fixed-ink/15 [&>td]:py-1">
                      <td>
                        {dois(ei + 1)}.{dois(++n)}
                      </td>
                      <td>{i.descricao}</td>
                      <td>{i.unidade}</td>
                      <td className="text-right">{qtd(i.quantidade)}</td>
                      <td className="text-right">{brl(i.preco)}</td>
                      <td className="text-right">{brl(i.total)}</td>
                    </tr>
                  )),
                )}
              </tbody>
            )
          })}
          <tfoot>
            <tr className="border-t-2 border-fixed-ink font-bold [&>td]:py-2">
              <td colSpan={5}>Custo direto total</td>
              <td className="text-right">{brl(custo)}</td>
            </tr>
            <tr className="[&>td]:py-1">
              <td colSpan={5}>Margem da construtora (BDI) {bdiTexto}</td>
              <td className="text-right">{brl(valorInvestidor - custo)}</td>
            </tr>
          </tfoot>
        </table>
        <div className="mt-6 flex items-center justify-between gap-6 rounded-md border-2 border-fixed-ink px-5 py-4 break-inside-avoid">
          <span className="text-label font-bold tracking-wide">VALOR TOTAL AO INVESTIDOR</span>
          <span className="font-display text-[26px] font-light">{brl(valorInvestidor)}</span>
        </div>
        <div className="mt-16 grid grid-cols-2 gap-12 text-label break-inside-avoid">
          <div className="flex flex-col gap-0.5 border-t border-fixed-ink pt-2">
            <span className="font-bold">{config.nomeEmpresa}</span>
            <span>Construtora</span>
          </div>
          <div className="flex flex-col gap-0.5 border-t border-fixed-ink pt-2">
            <span className="font-bold">{obra.investidor ?? 'Investidor'}</span>
            <span>Investidor</span>
          </div>
        </div>
        <footer className="mt-8 text-caption">
          Gestão de Obras · {codObra}/v{sel.versao}
        </footer>
      </article>
    </>
  )
}

function Editor({
  orcamentoId,
  etapas,
}: {
  orcamentoId: number
  etapas: { id: number; nome: string; total: number; subs: (Sub & { itens: Item[] })[] }[]
}) {
  return (
    <div className="flex flex-col gap-4">
      {etapas.map((e) => (
        <Cartao key={e.id} className="grid gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-h2 font-normal">{e.nome}</h2>
            <span className="text-body font-bold">
              <Dinheiro valor={e.total} />
            </span>
          </div>
          {e.subs.map((x) => (
            <div key={x.id} className="grid gap-3 border-l-4 border-line pl-4">
              <p className="text-table font-semibold">{x.nome}</p>
              {x.itens.map((i) => (
                <div key={i.id} className="flex flex-wrap items-end gap-2 border-b border-line pb-3">
                  <FormAcao action={salvarItem.bind(null, i.id)} botao="Salvar" className="grid flex-1 items-end gap-2.5 sm:grid-cols-[1fr_9rem_5rem_6rem_8rem_auto]">
                    <CamposItem item={i} />
                  </FormAcao>
                  <FormAcao action={removerItem.bind(null, i.id)} botao="Remover" variante="perigo" />
                </div>
              ))}
              <FormAcao
                action={adicionarItem.bind(null, orcamentoId, x.id)}
                botao="Incluir item"
                variante="suave"
                className="grid items-end gap-2.5 sm:grid-cols-[1fr_9rem_5rem_6rem_8rem_auto]"
              >
                <CamposItem />
              </FormAcao>
            </div>
          ))}
        </Cartao>
      ))}
    </div>
  )
}

function CamposItem({ item }: { item?: Item }) {
  return (
    <>
      <Campo rotulo="Item">
        <Entrada name="descricao" required defaultValue={item?.descricao} placeholder={item ? undefined : 'Ex.: Cimento CP-II 50 kg'} />
      </Campo>
      <Campo rotulo="Tipo">
        <Selecao name="tipo" defaultValue={item?.tipo ?? 'material'}>
          {Object.entries(TIPOS_ITEM).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Un.">
        <Entrada name="unidade" required defaultValue={item?.unidade} placeholder={item ? undefined : 'saco'} />
      </Campo>
      <Campo rotulo="Qtd.">
        <Entrada name="quantidade" type="number" min="0.001" step="0.001" required defaultValue={item?.quantidade} />
      </Campo>
      <Campo rotulo="Preço unit. (R$)">
        <Entrada name="preco_unitario" type="number" min={0} step="0.01" required defaultValue={item?.preco} />
      </Campo>
    </>
  )
}
