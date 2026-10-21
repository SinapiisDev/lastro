import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import type { ReactNode } from 'react'
import { brl, dataBR, mesBR, projetarFluxo } from '@/lib/regras'
import { contextoFluxo } from '@/lib/fluxo'
import { descreverEvento, quando, NOME_DOCUMENTO, type Evento } from '@/lib/historico'
import { FormAcao } from '@/components/form-acao'
import { Secao, Situacao, FAIXAS, Rolagem, Vazio } from '@/components/ui'
import { TabelaFluxo } from '@/components/tabela-fluxo'
import { decidir, cancelar, registrarPagamento, anexar, reenviarPedido } from '../acoes'

type Compra = {
  id: number
  obraId: number
  obra: string
  etapa: string
  subetapa: string
  fornecedor: string
  descricao: string
  valor: number
  justificativa: string | null
  faixa: keyof typeof FAIXAS
  situacao: string
  status: string
  motivo: string | null
  criadaEm: Date
  cotacaoId: number | null
  pedidoEnviado: Date | null
}

export default async function DetalheCompra({ params }: PageProps<'/compras/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id)) notFound()
  const [c] = await sql<Compra[]>`
    select id, obra_id as "obraId", obra, etapa, subetapa, fornecedor, descricao, valor, justificativa,
           faixa, situacao, status, motivo, criada_em as "criadaEm", cotacao_id as "cotacaoId", pedido_enviado_em as "pedidoEnviado"
    from v_compras where id = ${id}`
  if (!c || !podeVerObra(s, c.obraId)) notFound()

  const [itens, parcelas, anexos, eventos] = await Promise.all([
    // Cada item com o orçado (versão vigente) e o que outras compras aprovadas já levaram dele.
    sql<{ id: number; descricao: string; valor: number; etapa: string; subetapa: string; itemChave: string | null; orcado: number | null; outras: number }[]>`
      select ci.id, ci.descricao, ci.valor, e.nome as etapa, s.nome as subetapa, ci.item_chave as "itemChave",
        (select round(i.quantidade * i.preco_unitario, 2) from orcamento_itens i
           join v_orcamento_vigente o on o.id = i.orcamento_id where i.chave = ci.item_chave) as orcado,
        coalesce((select sum(x.valor) from compra_itens x join compras c2 on c2.id = x.compra_id
                  where x.item_chave = ci.item_chave and c2.situacao = 'aprovada' and c2.id <> ci.compra_id), 0) as outras
      from compra_itens ci join subetapas s on s.id = ci.subetapa_id join etapas e on e.id = s.etapa_id
      where ci.compra_id = ${id} order by ci.id`,
    sql<{ id: number; numero: number; valor: number; vencimento: string; pagaEm: string | null; vencida: boolean }[]>`
      select id, numero, valor, vencimento, paga_em as "pagaEm", (paga_em is null and vencimento < hoje()) as vencida
      from parcelas where compra_id = ${id} order by numero`,
    sql<{ id: number; parcelaId: number | null; tipo: string; nome: string; criadoEm: Date }[]>`
      select id, parcela_id as "parcelaId", tipo, nome, criado_em as "criadoEm"
      from anexos where compra_id = ${id} order by id`,
    sql<Evento[]>`
      select id, em, perfil, tabela, acao, antes, depois from historico
      where (tabela = 'compras' and registro_id = ${id})
         or (tabela in ('parcelas', 'anexos', 'compra_itens') and coalesce(depois, antes) ->> 'compra_id' = ${String(id)})
      order by id`,
  ])

  const decide =
    (c.situacao === 'aguardando_financeiro' && s.perfil !== 'obra') ||
    (c.situacao === 'aguardando_chefe' && s.perfil === 'chefe')
  const algumaPaga = parcelas.some((p) => p.pagaEm)
  const podeCancelar = !algumaPaga && (c.situacao.startsWith('aguardando') || (c.situacao === 'aprovada' && s.perfil !== 'obra'))
  const paga = s.perfil !== 'obra' && c.situacao === 'aprovada'
  const numeroParcela = (pid: number | null) => parcelas.find((p) => p.id === pid)?.numero
  const sobra = (i: (typeof itens)[number]) => (i.orcado ?? 0) - i.outras - i.valor
  const aviso = itens.some((i) => !i.itemChave || i.orcado === null)
    ? 'Esta compra tem item fora do orçamento.'
    : itens.some((i) => sobra(i) < 0)
      ? 'Esta compra passa o valor orçado de pelo menos um item.'
      : undefined

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <h1>Compra nº {c.id}</h1>
        <Situacao status={c.status} />
      </div>

      <section className="cartao grid gap-4 sm:grid-cols-2">
        <dl className="grid gap-2">
          <Dado nome="Obra">
            <Link href={`/obras/${c.obraId}`} className="underline">
              {c.obra}
            </Link>
          </Dado>
          <Dado nome="Etapa">
            {c.etapa} / {c.subetapa}
          </Dado>
          <Dado nome="Fornecedor">{c.fornecedor}</Dado>
          {c.cotacaoId && (
            <Dado nome="Pedido ao fornecedor">
              <Link href={`/cotacoes/${c.cotacaoId}`} className="underline">
                Cotação nº {c.cotacaoId}
              </Link>
              {': '}
              {c.pedidoEnviado ? (
                <span className="text-feito">enviado em {quando(c.pedidoEnviado)}</span>
              ) : c.situacao === 'aprovada' ? (
                <div className="text-alerta">
                  ainda não enviado (fornecedor sem WhatsApp ou falha no envio).
                  <FormAcao action={reenviarPedido.bind(null, c.id)} botao="Enviar pedido agora" className="mt-1" />
                </div>
              ) : (
                <span className="text-cinza">sai quando a compra for aprovada</span>
              )}
            </Dado>
          )}
          <Dado nome="Registrada em">{quando(c.criadaEm)}</Dado>
        </dl>
        <dl className="grid gap-2">
          <Dado nome="Valor total">
            <span className="text-xl font-semibold">{brl(c.valor)}</span>
          </Dado>
          <Dado nome="Faixa">{FAIXAS[c.faixa]}</Dado>
          {c.justificativa && <Dado nome="Motivo da compra">{c.justificativa}</Dado>}
          {c.motivo && (
            <Dado nome={c.situacao === 'cancelada' ? 'Motivo do cancelamento' : 'Motivo da recusa'}>
              <span className="text-erro">{c.motivo}</span>
            </Dado>
          )}
        </dl>
        <p className="whitespace-pre-line sm:col-span-2">{c.descricao}</p>
      </section>

      <Secao titulo="Itens e orçamento">
        <Rolagem>
          <table className="tabela">
            <thead>
              <tr>
                <th>Item</th>
                <th>Etapa</th>
                <th className="num">Nesta compra</th>
                <th className="num">Orçado</th>
                <th className="num">Outras compras</th>
                <th className="num">Sobra depois desta</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((i) => (
                <tr key={i.id}>
                  <td>{i.descricao}</td>
                  <td>
                    {i.etapa} <span className="text-cinza">/ {i.subetapa}</span>
                  </td>
                  <td className="num">{brl(i.valor)}</td>
                  {i.itemChave && i.orcado !== null ? (
                    <>
                      <td className="num">{brl(i.orcado)}</td>
                      <td className="num">{brl(i.outras)}</td>
                      <td className={`num ${sobra(i) < 0 ? 'font-semibold text-erro' : ''}`}>{brl(sobra(i))}</td>
                    </>
                  ) : (
                    <td colSpan={3} className="text-alerta">
                      {i.itemChave ? 'Item saiu do orçamento vigente' : 'Fora do orçamento'}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Rolagem>
      </Secao>

      {decide && <Analise compraId={c.id} parcelas={parcelas} aviso={aviso} />}

      {c.situacao === 'recusada' && s.perfil === 'obra' && (
        <section className="cartao flex flex-wrap items-center justify-between gap-3">
          <p>A compra foi recusada. Dá para corrigir e enviar de novo; esta fica guardada como recusada.</p>
          <Link href={`/compras/nova?de=${c.id}`} className="btn btn-principal">
            Corrigir e reenviar
          </Link>
        </section>
      )}

      <Secao titulo="Parcelas">
        <Rolagem>
          <table className="tabela">
            <thead>
              <tr>
                <th>Parcela</th>
                <th>Vencimento</th>
                <th className="num">Valor</th>
                <th>Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {parcelas.map((p) => (
                <tr key={p.id}>
                  <td>{p.numero}ª</td>
                  <td>{dataBR(p.vencimento)}</td>
                  <td className="num">{brl(p.valor)}</td>
                  <td>
                    {p.pagaEm ? (
                      <span className="text-feito">Paga em {dataBR(p.pagaEm)}</span>
                    ) : p.vencida && c.situacao === 'aprovada' ? (
                      <span className="font-semibold text-erro">Vencida</span>
                    ) : (
                      <span className="text-cinza">Em aberto</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Rolagem>
        {paga && (
          <div className="mt-3 grid gap-2">
            {parcelas
              .filter((p) => !p.pagaEm)
              .map((p) => (
                <details key={p.id} className="rounded border border-linha p-3">
                  <summary className="cursor-pointer font-medium">
                    Registrar pagamento da {p.numero}ª parcela ({brl(p.valor)})
                  </summary>
                  <FormAcao
                    action={registrarPagamento.bind(null, p.id)}
                    botao="Confirmar pagamento"
                    principal
                    className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-end"
                  >
                    <label>
                      <span className="rotulo">Pago em</span>
                      <input name="paga_em" type="date" required className="campo" />
                    </label>
                    <label>
                      <span className="rotulo">Boleto (opcional)</span>
                      <input name="boleto" type="file" accept="application/pdf,image/*" className="campo" />
                    </label>
                    <label>
                      <span className="rotulo">Comprovante (opcional)</span>
                      <input name="comprovante" type="file" accept="application/pdf,image/*" className="campo" />
                    </label>
                  </FormAcao>
                </details>
              ))}
          </div>
        )}
      </Secao>

      <Secao titulo="Documentos">
        {anexos.length === 0 ? (
          <Vazio>Nenhum documento anexado ainda.</Vazio>
        ) : (
          <ul className="mb-4 grid gap-1">
            {anexos.map((a) => (
              <li key={a.id} className="flex flex-wrap gap-x-3">
                <a href={`/anexos/${a.id}`} target="_blank" className="font-medium underline">
                  {NOME_DOCUMENTO[a.tipo]}
                  {a.parcelaId && ` da ${numeroParcela(a.parcelaId)}ª parcela`}
                </a>
                <span className="text-cinza">
                  {a.nome}, {quando(a.criadoEm)}
                </span>
              </li>
            ))}
          </ul>
        )}
        <FormAcao action={anexar.bind(null, c.id)} botao="Anexar" className="grid gap-3 sm:grid-cols-[11rem_11rem_1fr_auto] sm:items-end">
          <label>
            <span className="rotulo">Documento</span>
            <select name="tipo" className="campo">
              {Object.entries(NOME_DOCUMENTO).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rotulo">Referente a</span>
            <select name="parcela" className="campo">
              <option value="">Compra inteira</option>
              {parcelas.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.numero}ª parcela
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="rotulo">Arquivo (PDF ou foto, até 4 MB)</span>
            <input name="arquivo" type="file" required accept="application/pdf,image/*" className="campo" />
          </label>
        </FormAcao>
      </Secao>

      <Secao titulo="Linha do tempo">
        <ol className="grid gap-2">
          {eventos.map((e) => (
            <li key={e.id} className="grid gap-x-3 sm:grid-cols-[9rem_9rem_1fr]">
              <span className="text-sm text-cinza">{quando(e.em)}</span>
              <span className="text-sm font-medium">{e.perfil}</span>
              <span>{descreverEvento(e)}</span>
            </li>
          ))}
        </ol>
      </Secao>

      {podeCancelar && (
        <details className="cartao">
          <summary className="cursor-pointer text-erro">Cancelar esta compra</summary>
          <FormAcao action={cancelar.bind(null, c.id)} botao="Cancelar compra" perigo className="mt-3 grid gap-3">
            <label>
              <span className="rotulo">Motivo do cancelamento</span>
              <textarea name="motivo" required rows={2} className="campo" />
            </label>
          </FormAcao>
        </details>
      )}
    </div>
  )
}

function Dado({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div>
      <dt className="rotulo mb-0">{nome}</dt>
      <dd>{children}</dd>
    </div>
  )
}

// O caixa com e sem a compra, nos meses em que as parcelas vencem.
async function Analise({
  compraId,
  parcelas,
  aviso,
}: {
  compraId: number
  parcelas: { valor: number; vencimento: string }[]
  aviso?: string
}) {
  const { hoje, movimentos, saldo } = await contextoFluxo()
  const ultimo = parcelas.map((p) => p.vencimento).sort().at(-1) ?? hoje
  const meses = Math.min(24, Math.max(3, (Number(ultimo.slice(0, 4)) - Number(hoje.slice(0, 4))) * 12 + Number(ultimo.slice(5, 7)) - Number(hoje.slice(5, 7)) + 1))
  const sem = projetarFluxo(saldo, movimentos, hoje, meses)
  const com = projetarFluxo(saldo, [...movimentos, ...parcelas.map((p) => ({ data: p.vencimento, valor: -p.valor }))], hoje, meses)
  const falta = com.find((l) => l.acumulado < 0)

  return (
    <Secao titulo="Análise antes de liberar">
      {aviso && <p className="mb-3 font-medium text-erro">{aviso} Veja os itens acima.</p>}
      <p className="mb-3 text-sm text-cinza">
        Saldo de hoje {brl(saldo)}, somando o que está previsto para entrar e as parcelas já aprovadas de todas as obras.
      </p>
      <TabelaFluxo linhas={sem} comparar={com} />
      {falta && <p className="mt-2 font-medium text-erro">Com esta compra, o caixa fica negativo em {mesBR(falta.mes)}.</p>}
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <FormAcao action={decidir.bind(null, compraId, true)} botao="Liberar compra" principal />
        <FormAcao action={decidir.bind(null, compraId, false)} botao="Recusar compra" perigo className="grid gap-2">
          <label>
            <span className="rotulo">Motivo da recusa (volta para o engenheiro)</span>
            <textarea name="motivo" required rows={2} className="campo" />
          </label>
        </FormAcao>
      </div>
    </Secao>
  )
}
