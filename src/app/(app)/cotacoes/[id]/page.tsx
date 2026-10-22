import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AreaTexto, CabecalhoTela, Campo, Cartao, Dinheiro, Entrada, EstadoVazio, FormAcao, Marcacao, SeloIA, Secao, Selecao, Situacao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, dataBR } from '@/lib/regras'
import { carregarCotacao, dadosCotacao, type FornecedorCotacao, type ItemCotacao } from '@/lib/cotacoes'
import { resumirProposta, menorPorItem, type Proposta } from '@/lib/cotacao'
import { iaDisponivel } from '@/lib/ia'
import { Conversa } from '@/components/conversa'
import { enviarPedidos, adicionarFornecedor, salvarProposta, colarResposta, analisarCotacao, gerarCompras, cancelarCotacao } from '../acoes'

// Ler mensagens e comparar propostas com a IA leva alguns segundos.
export const maxDuration = 120

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const prazosTexto = (p: number[] | null) => (p?.length ? (p.length === 1 && p[0] === 0 ? 'à vista' : `${p.join('/')} dias`) : '—')
const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || nome.slice(0, 2).toUpperCase()

export default async function DetalheCotacao({ params }: PageProps<'/cotacoes/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const c = await carregarCotacao(s, id)
  const { itens, fornecedores, propostas } = await dadosCotacao(id)
  const [outros, compras] = await Promise.all([
    sql<{ id: number; nome: string }[]>`
      select id, nome from fornecedores where id not in (select fornecedor_id from cotacao_fornecedores where cotacao_id = ${id}) order by nome`,
    sql<{ id: number; fornecedor: string; valor: number; status: string; pedidoEnviado: Date | null }[]>`
      select id, fornecedor, valor, status, pedido_enviado_em as "pedidoEnviado" from v_compras where cotacao_id = ${id} order by id`,
  ])

  const aberta = c.situacao === 'rascunho' || c.situacao === 'aguardando'
  const menor = menorPorItem(itens, propostas)
  const indicada = c.recomendacao?.escolhas ?? null
  const temPreco = propostas.some((p) => Object.values(p.precos).some((v) => typeof v === 'number'))
  // Depois do primeiro envio, só conta quem ainda pode receber: fornecedor sem WhatsApp responde por fora.
  const pendentes = fornecedores.filter((f) => f.situacao === 'pendente' && (c.situacao === 'rascunho' || f.whatsapp)).length
  const responderam = propostas.filter((p) => Object.keys(p.precos).length > 0).length

  return (
    <>
      <CabecalhoTela
        contexto={`CT-${String(c.id).padStart(4, '0')} · ${c.obra} · aberta em ${c.criadaEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`}
        titulo={c.titulo}
        situacao={
          <span className="inline-flex items-center gap-2">
            <Situacao status={`cot_${c.situacao}`} grande />
            <span className="text-label font-semibold text-ink-3">
              {responderam} de {fornecedores.length} {fornecedores.length === 1 ? 'respondeu' : 'responderam'}
            </span>
          </span>
        }
        acoes={
          aberta && (
            <>
              <FormAcao action={cancelarCotacao.bind(null, c.id)} botao="Cancelar cotação" variante="perigo" className="flex items-center gap-2" />
              {/* Depois do envio o botão some, mas o formulário fica montado para a confirmação continuar visível. */}
              <FormAcao
                action={enviarPedidos.bind(null, c.id)}
                botao={c.situacao === 'rascunho' ? 'Pedir cotação aos fornecedores' : `Pedir a ${pendentes} fornecedor(es) novo(s)`}
                variante="primario"
                className={`flex flex-wrap items-center gap-2 ${pendentes > 0 ? '' : '[&_button]:hidden'}`}
              />
            </>
          )
        }
      >
        <span className="text-[13px] font-semibold text-ink-2">
          Fornecedores respondem até <b className="text-ink">{dataBR(c.prazoResposta)}</b>
        </span>
      </CabecalhoTela>

      <section className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_380px]">
        <Cartao className="min-w-0 pt-2!">
          <Comparacao itens={itens} fornecedores={fornecedores} propostas={propostas} menor={menor} indicada={indicada} />
        </Cartao>

        <aside className="grid items-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          {c.situacao === 'aguardando' && (
            <Cartao tom="noite" as="div" className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <SeloIA />
                <span className="text-[13px] font-semibold text-accent-night">Indicação</span>
              </div>
              {c.recomendacao ? (
                <p className="text-[13px] leading-[1.6] font-medium whitespace-pre-line text-night-ink-2">{c.recomendacao.explicacao}</p>
              ) : (
                <p className="text-[13px] leading-[1.6] font-medium text-night-ink-2">
                  {iaDisponivel()
                    ? temPreco
                      ? 'Quando os preços chegarem, peça a análise da IA. Na tabela já vem marcado o menor preço de cada item.'
                      : 'Aguardando os fornecedores passarem preço.'
                    : 'A IA está desligada (falta a chave ANTHROPIC_API_KEY). Na tabela vem marcado o menor preço de cada item.'}
                </p>
              )}
              {iaDisponivel() && temPreco && (
                <FormAcao
                  action={analisarCotacao.bind(null, c.id)}
                  botao={c.recomendacao ? 'Analisar de novo com a IA' : 'Analisar com a IA'}
                  variante="acento"
                  noturno
                  className="flex flex-wrap items-center gap-2"
                />
              )}
              <span className="text-caption font-medium text-night-ink-3">Baseado em preço, frete, prazo de entrega e condições de pagamento.</span>
            </Cartao>
          )}

          {c.situacao === 'aguardando' && temPreco && (
            <Escolha cotacaoId={c.id} itens={itens} fornecedores={fornecedores} propostas={propostas} padrao={indicada ?? menor} temIndicacao={!!indicada} />
          )}

          {c.situacao === 'concluida' && (
            <Secao titulo="Compras geradas">
              {c.economia !== null && c.economia > 0 && (
                <p className="rounded-md bg-ok-bg px-3 py-2.5 text-[12.5px] font-semibold text-ok">
                  Economia frente à proposta mais cara de cada item: {brl(c.economia)}.
                </p>
              )}
              {c.motivoEscolha && <p className="text-table text-ink-2">Motivo de escolher diferente da IA: {c.motivoEscolha}</p>}
              <ul className="flex flex-col">
                {compras.map((x) => (
                  <li key={x.id} className="flex flex-col gap-1 border-b border-line py-2.5 last:border-0">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <Link href={`/compras/${x.id}`} className="font-bold">
                        Compra nº {x.id}
                      </Link>
                      <Situacao status={x.status} />
                    </span>
                    <span className="text-table">
                      {x.fornecedor} · <Dinheiro valor={x.valor} className="font-semibold" />
                    </span>
                    <span className="text-caption text-ink-3">{x.pedidoEnviado ? 'pedido enviado ao fornecedor' : 'pedido sai quando a compra for aprovada'}</span>
                  </li>
                ))}
              </ul>
            </Secao>
          )}
        </aside>
      </section>

      <Secao titulo="Conversas com os fornecedores">
        <div className="flex flex-col gap-2.5">
          {fornecedores.map((f) => (
            <details key={f.id} className="group overflow-hidden rounded-lg border border-line" open={fornecedores.length === 1}>
              <summary className="grid cursor-pointer grid-cols-[40px_1fr_auto] items-center gap-3 px-3.5 py-3 hover:bg-surface-2 group-open:bg-surface-2">
                <span className="flex size-10 items-center justify-center rounded-full bg-surface-3 text-label font-bold text-ink-2">{iniciais(f.nome)}</span>
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{f.nome}</span>
                  {f.observacao && <span className="truncate text-caption text-ink-3">{f.observacao}</span>}
                </span>
                <Situacao status={`forn_${f.situacao}`} />
              </summary>
              <div className="grid gap-4 p-3.5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
                <Conversa fornecedor={{ id: f.fornecedorId, nome: f.nome, whatsapp: f.whatsapp, iaPausada: f.iaPausada }} podeSimular={s.perfil !== 'obra'} />
                {aberta && (
                  <div className="flex flex-col gap-4">
                    <FormAcao action={colarResposta.bind(null, f.id)} botao="A IA lê a resposta" className="flex flex-col gap-3">
                      <div className="flex flex-col gap-1">
                        <p className="text-body font-semibold">Resposta que chegou por fora</p>
                        <p className="text-label text-ink-3">WhatsApp pessoal, e-mail ou ligação: cole o texto ou anexe a foto/PDF, e a IA preenche a proposta.</p>
                      </div>
                      <Campo rotulo="Texto da resposta">
                        <AreaTexto name="texto" rows={3} />
                      </Campo>
                      <Campo rotulo="Foto ou PDF">
                        <Entrada name="arquivo" type="file" accept="application/pdf,image/*" className="py-2.5" />
                      </Campo>
                    </FormAcao>
                    <FormProposta f={f} itens={itens} proposta={propostas.find((p) => p.fornecedorId === f.fornecedorId)!} />
                  </div>
                )}
              </div>
            </details>
          ))}
          {fornecedores.length === 0 && <EstadoVazio titulo="Nenhum fornecedor nesta cotação" compacto />}
        </div>
        {aberta && outros.length > 0 && (
          <FormAcao action={adicionarFornecedor.bind(null, c.id)} botao="Incluir fornecedor" className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <Campo rotulo="Pedir preço também para" className="min-w-64">
              <Selecao name="fornecedor">
                {outros.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          </FormAcao>
        )}
      </Secao>
    </>
  )
}

function Comparacao({
  itens,
  fornecedores,
  propostas,
  menor,
  indicada,
}: {
  itens: ItemCotacao[]
  fornecedores: FornecedorCotacao[]
  propostas: Proposta[]
  menor: Record<number, number | null>
  indicada: Record<number, number> | null
}) {
  if (!fornecedores.length) return <EstadoVazio titulo="Inclua fornecedores para comparar" compacto />
  const prop = (f: FornecedorCotacao) => propostas.find((p) => p.fornecedorId === f.fornecedorId)!
  const resumo = (f: FornecedorCotacao) => resumirProposta(itens, prop(f))
  // A coluna de quem tem o menor total completo ganha o destaque (azul suave).
  const completos = fornecedores.filter((f) => resumo(f).cotados === itens.length && itens.length > 0)
  const melhor = completos.sort((a, b) => resumo(a).total - resumo(b).total)[0]?.id
  const col = (f: FornecedorCotacao) => (f.id === melhor ? 'bg-accent-bg' : '')
  const cel = 'border-b border-line px-3 py-2.5 text-right align-top'

  return (
    <>
      <div className="-mx-1 overflow-x-auto px-1">
        <table className="w-full border-separate border-spacing-x-1 border-spacing-y-0 text-table" style={{ minWidth: 340 + fornecedores.length * 170 }}>
          <thead>
            <tr>
              <th className="border-b border-line px-2 pt-3.5 pb-3 text-left align-bottom text-label font-semibold text-ink-3">Item</th>
              <th className="border-b border-line px-2 pt-3.5 pb-3 text-right align-bottom text-label font-semibold text-ink-3">Qtd.</th>
              {fornecedores.map((f) => (
                <th key={f.id} className={`rounded-t-[16px] border-b border-line px-3 pt-3 pb-3 text-left align-bottom ${col(f)}`}>
                  <span className="block text-[13.5px] font-bold">{f.nome}</span>
                  <span className="block text-caption font-medium text-ink-3">
                    {f.id === melhor ? 'Menor total completo' : `${resumo(f).cotados} de ${itens.length} itens cotados`}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itens.map((i) => (
              <tr key={i.id}>
                <td className="border-b border-line px-2 py-3 align-top">
                  <span className="block font-semibold">{i.descricao}</span>
                  <span className="block text-caption text-ink-3">{i.orcado !== null ? `orçado ${brl(i.orcado)}/${i.unidade}` : 'fora do orçamento'}</span>
                </td>
                <td className="border-b border-line px-2 py-3 text-right align-top whitespace-nowrap text-ink-2">
                  {qtd(i.quantidade)} {i.unidade}
                </td>
                {fornecedores.map((f) => {
                  const v = prop(f).precos[i.id]
                  const destaque = menor[i.id] === f.fornecedorId
                  return (
                    <td key={f.id} className={`${cel} ${col(f)}`}>
                      {v === undefined ? (
                        <span className="text-ink-3">—</span>
                      ) : v === null ? (
                        <span className="text-ink-3">não tem</span>
                      ) : (
                        <>
                          <span className={`inline-flex items-center rounded-xs px-2 py-0.5 font-semibold ${destaque ? '-mr-2 bg-accent text-on-accent' : ''}`}>
                            <Dinheiro valor={v * i.quantidade} />
                          </span>
                          <span className="block text-caption text-ink-3">{brl(v)}/{i.unidade}</span>
                        </>
                      )}
                      {indicada?.[i.id] === f.fornecedorId && <span className="mt-1 block text-caption font-bold text-accent-ink">indicado pela IA</span>}
                    </td>
                  )
                })}
              </tr>
            ))}
            {(
              [
                ['Frete', (f: FornecedorCotacao) => (f.frete === null ? '—' : brl(f.frete))],
                ['Entrega', (f: FornecedorCotacao) => (f.prazoEntrega === null ? '—' : `${f.prazoEntrega} dias`)],
                ['Pagamento', (f: FornecedorCotacao) => prazosTexto(f.prazos)],
              ] as const
            ).map(([rotulo, valor]) => (
              <tr key={rotulo}>
                <td colSpan={2} className="border-b border-line px-2 py-2.5 text-label font-semibold text-ink-2">
                  {rotulo}
                </td>
                {fornecedores.map((f) => (
                  <td key={f.id} className={`${cel} font-medium ${col(f)}`}>
                    {valor(f)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={2} className="px-2 py-4 text-body font-bold">
                Total com frete
              </td>
              {fornecedores.map((f) => {
                const r = resumo(f)
                return (
                  <td key={f.id} className={`rounded-b-[16px] px-3 py-3.5 text-right ${col(f)}`}>
                    <span className="block font-display text-[22px] font-light">{r.cotados ? <Dinheiro valor={r.total} /> : '—'}</span>
                    <span className={`block text-[11px] font-bold ${r.faltando ? 'text-warn' : 'text-ink-3'}`}>
                      {r.faltando ? `faltam ${r.faltando} ${r.faltando === 1 ? 'item' : 'itens'}` : 'todos os itens'}
                    </span>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-4 border-t border-line px-2 pt-3.5 text-label font-semibold text-ink-2">
        <span className="inline-flex items-center gap-2">
          <span className="h-3 w-[18px] rounded-[4px] bg-accent" />
          Menor preço do item
        </span>
        {melhor && (
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-[18px] rounded-[4px] bg-accent-bg" />
            Menor total completo
          </span>
        )}
      </div>
    </>
  )
}

function Escolha({
  cotacaoId,
  itens,
  fornecedores,
  propostas,
  padrao,
  temIndicacao,
}: {
  cotacaoId: number
  itens: ItemCotacao[]
  fornecedores: FornecedorCotacao[]
  propostas: Proposta[]
  padrao: Record<number, number | null>
  temIndicacao: boolean
}) {
  return (
    <Cartao as="div">
      <FormAcao action={gerarCompras.bind(null, cotacaoId)} botao="Gerar compras com esta escolha" variante="primario" largura className="flex flex-col gap-3.5">
        <span className="text-label font-semibold text-ink-3">Sua escolha</span>
        {itens.map((i) => {
          const cotaram = fornecedores.filter((f) => {
            const v = propostas.find((p) => p.fornecedorId === f.fornecedorId)?.precos[i.id]
            return typeof v === 'number' && v > 0
          })
          return (
            <Campo
              key={i.id}
              rotulo={
                <>
                  {i.descricao}{' '}
                  <span className="font-medium text-ink-3">
                    ({qtd(i.quantidade)} {i.unidade})
                  </span>
                </>
              }
            >
              <Selecao name={`escolha_${i.id}`} defaultValue={padrao[i.id] ?? ''}>
                <option value="">Não comprar agora</option>
                {cotaram.map((f) => (
                  <option key={f.id} value={f.fornecedorId}>
                    {f.nome}: {brl(propostas.find((p) => p.fornecedorId === f.fornecedorId)!.precos[i.id]!)}/{i.unidade}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )
        })}
        <Campo rotulo={`Motivo ${temIndicacao ? '(obrigatório se escolher diferente da IA)' : 'da compra (obrigatório se alguma compra passar do teto médio)'}`}>
          <AreaTexto name="motivo" rows={2} />
        </Campo>
        <p className="rounded-md bg-surface-2 px-3 py-2.5 text-label leading-normal font-medium text-ink-2">
          Vira uma compra por fornecedor, com o frete rateado entre os itens e as parcelas no prazo que ele ofereceu. Cada compra segue a aprovação por
          teto, e o pedido só vai ao fornecedor depois de aprovada.
        </p>
      </FormAcao>
    </Cartao>
  )
}

function FormProposta({ f, itens, proposta }: { f: FornecedorCotacao; itens: ItemCotacao[]; proposta: Proposta }) {
  return (
    <details className="rounded-md border border-line px-3.5 py-3">
      <summary className="cursor-pointer text-table font-semibold">Corrigir ou preencher a proposta à mão</summary>
      <FormAcao action={salvarProposta.bind(null, f.id)} botao="Salvar proposta" className="mt-3 flex flex-col gap-3">
        {itens.map((i) => {
          const v = proposta.precos[i.id]
          return (
            <div key={i.id} className="grid items-center gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <span className="text-table">
                {i.descricao} <span className="text-ink-3">({i.unidade})</span>
              </span>
              <label>
                <span className="sr-only">Preço de {i.descricao}</span>
                <Entrada name={`preco_${i.id}`} inputMode="decimal" defaultValue={typeof v === 'number' ? v : ''} placeholder="R$ / un." className="text-right" />
              </label>
              <Marcacao name={`nao_tem_${i.id}`} defaultChecked={v === null} rotulo="não tem" />
            </div>
          )
        })}
        <div className="grid gap-2.5 sm:grid-cols-3">
          <Campo rotulo="Frete (R$)">
            <Entrada name="frete" inputMode="decimal" defaultValue={f.frete ?? ''} />
          </Campo>
          <Campo rotulo="Entrega (dias)">
            <Entrada name="prazo_entrega" type="number" min={0} defaultValue={f.prazoEntrega ?? ''} />
          </Campo>
          <Campo rotulo="Pagamento (dias)">
            <Entrada name="prazos" defaultValue={f.prazos?.join('/') ?? ''} placeholder="30/60/90" />
          </Campo>
        </div>
      </FormAcao>
    </details>
  )
}
