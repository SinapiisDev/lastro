import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, dataBR } from '@/lib/regras'
import { carregarCotacao, dadosCotacao, type FornecedorCotacao, type ItemCotacao } from '@/lib/cotacoes'
import { resumirProposta, menorPorItem, type Proposta } from '@/lib/cotacao'
import { iaDisponivel } from '@/lib/ia'
import { FormAcao } from '@/components/form-acao'
import { Secao, Situacao, Rolagem, Vazio } from '@/components/ui'
import { Conversa } from '@/components/conversa'
import { enviarPedidos, adicionarFornecedor, salvarProposta, colarResposta, analisarCotacao, gerarCompras, cancelarCotacao } from '../acoes'

// Ler mensagens e comparar propostas com a IA leva alguns segundos.
export const maxDuration = 120

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const prazosTexto = (p: number[] | null) => (p?.length ? (p.length === 1 && p[0] === 0 ? 'à vista' : `${p.join('/')} dias`) : '—')

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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>
            Cotação nº {c.id}: {c.titulo}
          </h1>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-cinza">
            <span>Obra {c.obra}</span> <Situacao status={`cot_${c.situacao}`} /> <span>responder até {dataBR(c.prazoResposta)}</span>
          </p>
        </div>
        {aberta && (
          <div className="flex flex-wrap gap-2">
            {pendentes > 0 && (
              <FormAcao
                action={enviarPedidos.bind(null, c.id)}
                botao={c.situacao === 'rascunho' ? 'Pedir cotação aos fornecedores' : `Pedir a ${pendentes} fornecedor(es) novo(s)`}
                principal
              />
            )}
            <FormAcao action={cancelarCotacao.bind(null, c.id)} botao="Cancelar cotação" perigo />
          </div>
        )}
      </div>

      <Secao titulo="Comparação">
        <Comparacao itens={itens} fornecedores={fornecedores} propostas={propostas} menor={menor} indicada={indicada} />
      </Secao>

      {c.situacao === 'aguardando' && (
        <Secao
          titulo="Análise e escolha"
          acao={iaDisponivel() && temPreco ? <FormAcao action={analisarCotacao.bind(null, c.id)} botao={c.recomendacao ? 'Analisar de novo com a IA' : 'Analisar com a IA'} /> : undefined}
        >
          {c.recomendacao ? (
            <div className="mb-4 rounded border-l-4 border-sinal bg-amber-50/50 p-3">
              <p className="mb-1 font-medium">Indicação da IA</p>
              <p className="whitespace-pre-line">{c.recomendacao.explicacao}</p>
            </div>
          ) : (
            <p className="mb-4 text-sm text-cinza">
              {iaDisponivel()
                ? temPreco
                  ? 'Quando os preços chegarem, peça a análise da IA. Abaixo já vem marcado o menor preço de cada item.'
                  : 'Aguardando os fornecedores passarem preço.'
                : 'A IA está desligada (falta a chave ANTHROPIC_API_KEY). Abaixo vem marcado o menor preço de cada item.'}
            </p>
          )}
          {temPreco && <Escolha cotacaoId={c.id} itens={itens} fornecedores={fornecedores} propostas={propostas} padrao={indicada ?? menor} temIndicacao={!!indicada} />}
        </Secao>
      )}

      {c.situacao === 'concluida' && (
        <Secao titulo="Compras geradas">
          {c.economia !== null && c.economia > 0 && (
            <p className="mb-3 font-medium text-feito">Economia frente à proposta mais cara de cada item: {brl(c.economia)}.</p>
          )}
          {c.motivoEscolha && <p className="mb-3 text-sm">Motivo de escolher diferente da IA: {c.motivoEscolha}</p>}
          <ul className="grid gap-1">
            {compras.map((x) => (
              <li key={x.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/compras/${x.id}`} className="underline">
                  Compra nº {x.id}
                </Link>
                <span>
                  {x.fornecedor}, {brl(x.valor)}
                </span>
                <Situacao status={x.status} />
                <span className="text-sm text-cinza">{x.pedidoEnviado ? 'pedido enviado ao fornecedor' : 'pedido sai quando a compra for aprovada'}</span>
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <Secao titulo="Fornecedores">
        <div className="grid gap-3">
          {fornecedores.map((f) => (
            <details key={f.id} className="rounded border border-linha p-3" open={fornecedores.length === 1}>
              <summary className="flex cursor-pointer flex-wrap items-center gap-2">
                <span className="font-medium">{f.nome}</span> <Situacao status={`forn_${f.situacao}`} />
                {f.observacao && <span className="text-sm text-cinza">{f.observacao}</span>}
              </summary>
              <div className="mt-3 grid gap-5 lg:grid-cols-2">
                <Conversa fornecedor={{ id: f.fornecedorId, nome: f.nome, whatsapp: f.whatsapp, iaPausada: f.iaPausada }} podeSimular={s.perfil !== 'obra'} />
                {aberta && (
                  <div className="grid content-start gap-4">
                    <FormAcao action={colarResposta.bind(null, f.id)} botao="A IA lê a resposta" className="grid gap-2">
                      <p className="font-medium">Resposta que chegou por fora</p>
                      <p className="text-sm text-cinza">WhatsApp pessoal, e-mail ou ligação: cole o texto ou anexe a foto/PDF, e a IA preenche a proposta.</p>
                      <textarea name="texto" rows={3} className="campo" />
                      <input name="arquivo" type="file" accept="application/pdf,image/*" className="campo" />
                    </FormAcao>
                    <FormProposta f={f} itens={itens} proposta={propostas.find((p) => p.fornecedorId === f.fornecedorId)!} />
                  </div>
                )}
              </div>
            </details>
          ))}
          {fornecedores.length === 0 && <Vazio>Nenhum fornecedor nesta cotação.</Vazio>}
        </div>
        {aberta && outros.length > 0 && (
          <FormAcao action={adicionarFornecedor.bind(null, c.id)} botao="Incluir fornecedor" className="mt-4 flex flex-wrap items-end gap-2">
            <label>
              <span className="rotulo">Pedir preço também para</span>
              <select name="fornecedor" className="campo">
                {outros.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </select>
            </label>
          </FormAcao>
        )}
      </Secao>
    </div>
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
  if (!fornecedores.length) return <Vazio>Inclua fornecedores para comparar.</Vazio>
  const prop = (f: FornecedorCotacao) => propostas.find((p) => p.fornecedorId === f.fornecedorId)!
  return (
    <Rolagem>
      <table className="tabela">
        <thead>
          <tr>
            <th>Item</th>
            {fornecedores.map((f) => (
              <th key={f.id} className="num">
                {f.nome}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {itens.map((i) => (
            <tr key={i.id}>
              <td>
                {i.descricao}
                <span className="block text-sm text-cinza">
                  {qtd(i.quantidade)} {i.unidade}
                  {i.orcado !== null ? `, orçado ${brl(i.orcado)}/${i.unidade}` : ', fora do orçamento'}
                </span>
              </td>
              {fornecedores.map((f) => {
                const v = prop(f).precos[i.id]
                const destaque = menor[i.id] === f.fornecedorId
                return (
                  <td key={f.id} className={`num ${destaque ? 'font-semibold text-feito' : ''}`}>
                    {v === undefined ? (
                      <span className="text-cinza">—</span>
                    ) : v === null ? (
                      <span className="text-cinza">não tem</span>
                    ) : (
                      <>
                        {brl(v)}
                        <span className="block text-sm font-normal text-cinza">{brl(v * i.quantidade)}</span>
                      </>
                    )}
                    {indicada?.[i.id] === f.fornecedorId && <span className="block text-xs text-alerta">indicado pela IA</span>}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
        <tfoot>
          {(
            [
              ['Frete', (f: FornecedorCotacao) => (f.frete === null ? '—' : brl(f.frete))],
              ['Total', (f: FornecedorCotacao) => (resumirProposta(itens, prop(f)).cotados ? brl(resumirProposta(itens, prop(f)).total) : '—')],
              ['Itens cotados', (f: FornecedorCotacao) => `${resumirProposta(itens, prop(f)).cotados} de ${itens.length}`],
              ['Entrega', (f: FornecedorCotacao) => (f.prazoEntrega === null ? '—' : `${f.prazoEntrega} dias`)],
              ['Pagamento', (f: FornecedorCotacao) => prazosTexto(f.prazos)],
            ] as const
          ).map(([rotulo, valor]) => (
            <tr key={rotulo}>
              <td className="font-medium">{rotulo}</td>
              {fornecedores.map((f) => (
                <td key={f.id} className={`num ${rotulo === 'Total' ? 'font-semibold' : ''}`}>
                  {valor(f)}
                </td>
              ))}
            </tr>
          ))}
        </tfoot>
      </table>
    </Rolagem>
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
    <FormAcao action={gerarCompras.bind(null, cotacaoId)} botao="Gerar compras com esta escolha" principal className="grid gap-3">
      {itens.map((i) => {
        const cotaram = fornecedores.filter((f) => {
          const v = propostas.find((p) => p.fornecedorId === f.fornecedorId)?.precos[i.id]
          return typeof v === 'number' && v > 0
        })
        return (
          <label key={i.id} className="grid gap-1 sm:grid-cols-[1fr_20rem] sm:items-center">
            <span>
              {i.descricao} <span className="text-sm text-cinza">({qtd(i.quantidade)} {i.unidade})</span>
            </span>
            <select name={`escolha_${i.id}`} defaultValue={padrao[i.id] ?? ''} className="campo">
              <option value="">Não comprar agora</option>
              {cotaram.map((f) => (
                <option key={f.id} value={f.fornecedorId}>
                  {f.nome}: {brl(propostas.find((p) => p.fornecedorId === f.fornecedorId)!.precos[i.id]!)}/{i.unidade}
                </option>
              ))}
            </select>
          </label>
        )
      })}
      <label>
        <span className="rotulo">
          Motivo {temIndicacao ? '(obrigatório se escolher diferente da IA)' : 'da compra (obrigatório se alguma compra passar do teto médio)'}
        </span>
        <textarea name="motivo" rows={2} className="campo" />
      </label>
      <p className="text-sm text-cinza">
        Vira uma compra por fornecedor, com o frete rateado entre os itens e as parcelas no prazo que ele ofereceu. Cada compra
        segue a aprovação por teto, e o pedido só vai ao fornecedor depois de aprovada.
      </p>
    </FormAcao>
  )
}

function FormProposta({ f, itens, proposta }: { f: FornecedorCotacao; itens: ItemCotacao[]; proposta: Proposta }) {
  return (
    <details className="rounded border border-linha p-3">
      <summary className="cursor-pointer font-medium">Corrigir ou preencher a proposta à mão</summary>
      <FormAcao action={salvarProposta.bind(null, f.id)} botao="Salvar proposta" className="mt-3 grid gap-2">
        {itens.map((i) => {
          const v = proposta.precos[i.id]
          return (
            <div key={i.id} className="grid items-end gap-2 sm:grid-cols-[1fr_8rem_auto]">
              <span className="text-sm">
                {i.descricao} ({i.unidade})
              </span>
              <label>
                <span className="sr-only">Preço de {i.descricao}</span>
                <input name={`preco_${i.id}`} inputMode="decimal" defaultValue={typeof v === 'number' ? v : ''} placeholder="R$ / un." className="campo" />
              </label>
              <label className="flex items-center gap-1 text-sm">
                <input name={`nao_tem_${i.id}`} type="checkbox" defaultChecked={v === null} className="size-4" /> não tem
              </label>
            </div>
          )
        })}
        <div className="grid gap-2 sm:grid-cols-3">
          <label>
            <span className="rotulo">Frete (R$)</span>
            <input name="frete" inputMode="decimal" defaultValue={f.frete ?? ''} className="campo" />
          </label>
          <label>
            <span className="rotulo">Entrega (dias)</span>
            <input name="prazo_entrega" type="number" min={0} defaultValue={f.prazoEntrega ?? ''} className="campo" />
          </label>
          <label>
            <span className="rotulo">Pagamento (dias)</span>
            <input name="prazos" defaultValue={f.prazos?.join('/') ?? ''} placeholder="30/60/90" className="campo" />
          </label>
        </div>
      </FormAcao>
    </details>
  )
}
