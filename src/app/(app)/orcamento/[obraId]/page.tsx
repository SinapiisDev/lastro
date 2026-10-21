import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { brl, comBdi } from '@/lib/regras'
import { quando } from '@/lib/historico'
import { FormAcao } from '@/components/form-acao'
import { Secao, Situacao, Rolagem, TIPOS_ITEM } from '@/components/ui'
import { Imprimir } from '@/components/imprimir'
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

  if (!sel) {
    return (
      <div className="grid max-w-2xl gap-3">
        <h1>Orçamento da obra {obra.nome}</h1>
        <p className="cartao">
          {editor
            ? 'Esta obra ainda não tem orçamento. Ao começar, ele usa as etapas e subetapas da obra; você inclui os itens em cada uma.'
            : 'A construtora ainda não montou o orçamento desta obra.'}
        </p>
        {editor && <FormAcao action={iniciarOrcamento.bind(null, obraId)} botao="Começar orçamento" principal />}
      </div>
    )
  }

  const [subs, itens, [{ fora }]] = await Promise.all([
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

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1>Orçamento da obra {obra.nome}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-2">
            <span>Versão {sel.versao}</span> <Situacao status={sel.situacao} />
            {sel.aprovadoEm && <span className="text-sm text-cinza">aprovado em {quando(sel.aprovadoEm)}</span>}
          </p>
          {obra.investidor && (
            <p className="text-cinza">
              Investidor: {obra.investidor}
              {obra.contato && `, ${obra.contato}`}
            </p>
          )}
          {sel.motivo && <p className="text-sm text-cinza">Motivo desta versão: {sel.motivo}</p>}
        </div>
        <div className="flex flex-wrap gap-2 print:hidden">
          {editor && sel.situacao === 'rascunho' && (
            <Link href={editando ? `/orcamento/${obraId}` : `/orcamento/${obraId}?editar=1`} className="btn">
              {editando ? 'Terminar edição' : 'Editar itens'}
            </Link>
          )}
          <Imprimir />
        </div>
      </div>

      {editando ? (
        <Editor orcamentoId={sel.id} etapas={etapas} />
      ) : (
        <section className="cartao print:border-0 print:p-0">
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Tipo</th>
                  <th className="num">Qtd.</th>
                  <th>Un.</th>
                  <th className="num">Preço unit.</th>
                  <th className="num">Total</th>
                  <th className="num print:hidden">Comprado</th>
                  <th className="num print:hidden">Sobra</th>
                </tr>
              </thead>
              {etapas
                .filter((e) => e.total > 0 || e.subs.some((x) => x.itens.length))
                .map((e) => (
                  <tbody key={e.id}>
                    <tr className="bg-concreto/60">
                      <td colSpan={5} className="font-semibold">
                        {e.nome}
                      </td>
                      <td className="num font-semibold">{brl(e.total)}</td>
                      <td className="num print:hidden">{brl(e.comprado)}</td>
                      <td className={`num print:hidden ${e.total - e.comprado < 0 ? 'font-semibold text-erro' : ''}`}>
                        {brl(e.total - e.comprado)}
                      </td>
                    </tr>
                    {e.subs
                      .filter((x) => x.itens.length)
                      .map((x) => [
                        <tr key={`s${x.id}`}>
                          <td colSpan={8} className="pl-4 text-sm text-cinza">
                            {x.nome}
                          </td>
                        </tr>,
                        ...x.itens.map((i) => (
                          <tr key={i.id}>
                            <td className="pl-6">{i.descricao}</td>
                            <td className="text-sm">{TIPOS_ITEM[i.tipo]}</td>
                            <td className="num">{qtd(i.quantidade)}</td>
                            <td>{i.unidade}</td>
                            <td className="num">{brl(i.preco)}</td>
                            <td className="num">{brl(i.total)}</td>
                            <td className="num print:hidden">{brl(i.comprado)}</td>
                            <td className={`num print:hidden ${i.total - i.comprado < 0 ? 'font-semibold text-erro' : ''}`}>
                              {brl(i.total - i.comprado)}
                            </td>
                          </tr>
                        )),
                      ])}
                  </tbody>
                ))}
              <tfoot>
                <tr>
                  <td colSpan={5} className="font-medium">
                    Custo total
                  </td>
                  <td className="num font-medium">{brl(custo)}</td>
                  <td className="num print:hidden">{brl(comprado)}</td>
                  <td className="num print:hidden">{brl(custo - comprado)}</td>
                </tr>
                <tr>
                  <td colSpan={5}>Margem da construtora (BDI) {sel.bdi.toLocaleString('pt-BR')}%</td>
                  <td className="num">{brl(comBdi(custo, sel.bdi) - custo)}</td>
                  <td colSpan={2} className="print:hidden" />
                </tr>
                <tr>
                  <td colSpan={5} className="text-lg font-semibold">
                    Valor ao investidor
                  </td>
                  <td className="num text-lg font-semibold">{brl(comBdi(custo, sel.bdi))}</td>
                  <td colSpan={2} className="print:hidden" />
                </tr>
              </tfoot>
            </table>
          </Rolagem>
          {itens.length === 0 && <p className="py-2 text-cinza">Nenhum item ainda.{editor && ' Use Editar itens para incluir.'}</p>}
          {fora > 0 && (
            <p className="mt-3 text-sm text-alerta print:hidden">Compras fora do orçamento nesta obra: {brl(fora)}.</p>
          )}
        </section>
      )}

      {editor && (
        <div className="grid gap-5 print:hidden lg:grid-cols-2">
          <Secao titulo="Situação">
            <Acoes versao={sel} />
          </Secao>
          <Secao titulo="Investidor">
            <FormAcao action={salvarInvestidor.bind(null, obraId)} botao="Salvar investidor" className="grid gap-3">
              <label>
                <span className="rotulo">Nome</span>
                <input name="investidor" defaultValue={obra.investidor ?? ''} className="campo" />
              </label>
              <label>
                <span className="rotulo">Contato (telefone ou e-mail)</span>
                <input name="contato" defaultValue={obra.contato ?? ''} className="campo" />
              </label>
            </FormAcao>
          </Secao>
        </div>
      )}

      {versoes.length > 1 && (
        <Secao titulo="Versões">
          <ul className="grid gap-1 print:hidden">
            {versoes.map((v) => (
              <li key={v.id} className="flex flex-wrap items-center gap-2">
                <Link href={`/orcamento/${obraId}?versao=${v.versao}`} className={`underline ${v.id === sel.id ? 'font-semibold' : ''}`}>
                  Versão {v.versao}
                </Link>
                <Situacao status={v.situacao} />
                <span className="text-sm text-cinza">
                  criada em {quando(v.criadoEm)}
                  {v.motivo && `: ${v.motivo}`}
                </span>
              </li>
            ))}
          </ul>
        </Secao>
      )}
    </div>
  )
}

function Acoes({ versao: v }: { versao: Versao }) {
  if (v.situacao === 'substituido') return <p className="text-cinza">Versão antiga, mantida só para consulta.</p>
  if (v.situacao === 'aprovado')
    return (
      <FormAcao action={criarRevisao.bind(null, v.id)} botao="Criar revisão" className="grid gap-3">
        <p className="text-sm text-cinza">
          Aprovado: está travado e vale para a obra. Para mudar, crie uma revisão. Ela começa como cópia desta versão, e esta
          continua valendo até a revisão ser aprovada.
        </p>
        <label>
          <span className="rotulo">Motivo da revisão</span>
          <input name="motivo" required placeholder="Ex.: aditivo de contrato, mudança de projeto" className="campo" />
        </label>
      </FormAcao>
    )
  return (
    <div className="grid gap-4">
      {v.situacao === 'rascunho' && (
        <FormAcao action={salvarBdi.bind(null, v.id)} botao="Salvar margem" className="flex flex-wrap items-end gap-2">
          <label>
            <span className="rotulo">Margem da construtora (BDI) em %</span>
            <input name="bdi" type="number" min={0} step="0.01" defaultValue={v.bdi} className="campo w-32" />
          </label>
        </FormAcao>
      )}
      <div className="flex flex-wrap gap-2">
        {v.situacao === 'rascunho' && <FormAcao action={mudarSituacao.bind(null, v.id, 'enviado')} botao="Marcar como enviado ao investidor" />}
        {v.situacao === 'enviado' && <FormAcao action={mudarSituacao.bind(null, v.id, 'rascunho')} botao="Voltar para rascunho" />}
        <FormAcao action={mudarSituacao.bind(null, v.id, 'aprovado')} botao="Aprovado: contrato assinado" principal />
      </div>
      <p className="text-sm text-cinza">Ao aprovar, o orçamento trava e passa a ser o previsto da obra.</p>
    </div>
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
    <div className="grid gap-4">
      {etapas.map((e) => (
        <section key={e.id} className="cartao grid gap-4">
          <div className="flex flex-wrap justify-between gap-2">
            <h2>{e.nome}</h2>
            <span className="font-semibold">{brl(e.total)}</span>
          </div>
          {e.subs.map((x) => (
            <div key={x.id} className="grid gap-2 border-l-4 border-linha pl-3">
              <p className="font-medium">{x.nome}</p>
              {x.itens.map((i) => (
                <div key={i.id} className="flex flex-wrap items-end gap-2 border-b border-linha pb-2">
                  <FormAcao action={salvarItem.bind(null, i.id)} botao="Salvar" className="grid flex-1 items-end gap-2 sm:grid-cols-[1fr_9rem_5rem_6rem_8rem_auto]">
                    <CamposItem item={i} />
                  </FormAcao>
                  <FormAcao action={removerItem.bind(null, i.id)} botao="Remover" perigo />
                </div>
              ))}
              <FormAcao
                action={adicionarItem.bind(null, orcamentoId, x.id)}
                botao="Incluir item"
                className="grid items-end gap-2 sm:grid-cols-[1fr_9rem_5rem_6rem_8rem_auto]"
              >
                <CamposItem />
              </FormAcao>
            </div>
          ))}
        </section>
      ))}
    </div>
  )
}

function CamposItem({ item }: { item?: Item }) {
  return (
    <>
      <label>
        <span className="rotulo">Item</span>
        <input name="descricao" required defaultValue={item?.descricao} placeholder={item ? undefined : 'Ex.: Cimento CP-II 50 kg'} className="campo" />
      </label>
      <label>
        <span className="rotulo">Tipo</span>
        <select name="tipo" defaultValue={item?.tipo ?? 'material'} className="campo">
          {Object.entries(TIPOS_ITEM).map(([v, t]) => (
            <option key={v} value={v}>
              {t}
            </option>
          ))}
        </select>
      </label>
      <label>
        <span className="rotulo">Un.</span>
        <input name="unidade" required defaultValue={item?.unidade} placeholder={item ? undefined : 'saco'} className="campo" />
      </label>
      <label>
        <span className="rotulo">Qtd.</span>
        <input name="quantidade" type="number" min="0.001" step="0.001" required defaultValue={item?.quantidade} className="campo" />
      </label>
      <label>
        <span className="rotulo">Preço unit. (R$)</span>
        <input name="preco_unitario" type="number" min={0} step="0.01" required defaultValue={item?.preco} className="campo" />
      </label>
    </>
  )
}
