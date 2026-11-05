import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AreaTexto,
  BotaoLink,
  Campo,
  CampoAnexo,
  Cartao,
  CartaoDocumento,
  Dinheiro,
  Entrada,
  EstadoVazio,
  Etiqueta,
  FormAcao,
  LinhaDoTempo,
  LinhaTotal,
  Modal,
  Passos,
  SeloIA,
  Secao,
  Selecao,
  Situacao,
  Tabela,
  Td,
  Th,
  Tr,
  type EstadoPasso,
} from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { brl, dataBR, mesBR, projetarFluxo } from '@/lib/regras'
import { contextoFluxo } from '@/lib/fluxo'
import { descreverEvento, quando, NOME_DOCUMENTO, type Evento } from '@/lib/historico'
import { FAIXAS } from '@/components/rotulos'
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

  const financeiro = s.perfil === 'financeiro' || s.perfil === 'chefe' // aprova, cancela aprovada e paga
  const decide =
    (c.situacao === 'aguardando_financeiro' && financeiro) ||
    (c.situacao === 'aguardando_chefe' && s.perfil === 'chefe')
  const algumaPaga = parcelas.some((p) => p.pagaEm)
  const podeCancelar = !algumaPaga && (c.situacao.startsWith('aguardando') || (c.situacao === 'aprovada' && financeiro))
  const paga = financeiro && c.situacao === 'aprovada'
  const numeroParcela = (pid: number | null) => parcelas.find((p) => p.id === pid)?.numero
  const sobra = (i: (typeof itens)[number]) => (i.orcado ?? 0) - i.outras - i.valor
  const aviso = itens.some((i) => !i.itemChave || i.orcado === null)
    ? 'Esta compra tem item fora do orçamento.'
    : itens.some((i) => sobra(i) < 0)
      ? 'Esta compra passa o valor orçado de pelo menos um item.'
      : undefined

  // Andamento: registrada → aprovação (financeiro ou chefe, conforme o teto) → pagamento.
  const encerrada = c.situacao === 'recusada' || c.situacao === 'cancelada'
  const aprovada = c.situacao === 'aprovada'
  const passoAprovacao: EstadoPasso = encerrada ? 'erro' : aprovada ? 'feito' : 'atual'
  const passoPagamento: EstadoPasso = c.status === 'paga' ? 'feito' : aprovada ? 'atual' : 'pendente'
  const titulo = c.descricao.split('\n')[0]

  return (
    <>
      <section className="flex flex-wrap items-end justify-between gap-4 px-1 pt-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Link href="/compras" className="text-label font-semibold text-ink-3 no-underline hover:text-ink">
            ‹ Compras · Compra nº {c.id}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="max-w-3xl font-display text-[28px] leading-[1.1] font-light tracking-[-0.02em] sm:text-[36px]">{titulo}</h1>
            <Situacao status={c.status} grande />
          </div>
          <span className="text-[13px] font-medium text-ink-2">
            <Link href={`/obras/${c.obraId}`}>{c.obra}</Link> · {c.etapa} › {c.subetapa} · {c.fornecedor} · registrada em {quando(c.criadaEm)}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex flex-col items-end">
            <span className="text-label font-semibold text-ink-3">Valor total</span>
            <span className="font-display text-[36px] leading-tight font-light">
              <Dinheiro valor={c.valor} />
            </span>
          </div>
          {decide && (
            <div className="flex gap-2">
              <Modal gatilho="Recusar" variante="perigo" tamanho="lg" titulo="Recusar a compra" texto="A compra volta para o engenheiro com o seu motivo. Ele pode corrigir e reenviar.">
                <FormAcao action={decidir.bind(null, c.id, false)} botao="Recusar compra" variante="perigo-solido" className="flex flex-col gap-3">
                  <Campo rotulo="Motivo da recusa (volta para o engenheiro)">
                    <AreaTexto name="motivo" required rows={3} />
                  </Campo>
                </FormAcao>
              </Modal>
              <Modal
                gatilho="Aprovar compra"
                variante="acento"
                tamanho="lg"
                titulo="Liberar a compra"
                texto={`${brl(c.valor)} para ${c.fornecedor}. As parcelas entram no fluxo de caixa${c.cotacaoId ? ' e o pedido vai ao fornecedor' : ''}.`}
              >
                <FormAcao action={decidir.bind(null, c.id, true)} botao="Liberar compra" variante="primario" className="flex flex-col gap-3" />
              </Modal>
            </div>
          )}
        </div>
      </section>

      <Passos
        itens={[
          { titulo: 'Registrada', detalhe: quando(c.criadaEm), estado: 'feito' },
          {
            titulo: c.situacao === 'aguardando_chefe' || c.faixa === 'alta' ? 'Aprovação do dono' : c.faixa === 'baixa' ? 'Aprovação automática' : 'Liberação do financeiro',
            detalhe: c.situacao === 'recusada' ? 'Recusada' : c.situacao === 'cancelada' ? 'Cancelada' : aprovada ? 'Aprovada' : FAIXAS[c.faixa],
            estado: passoAprovacao,
          },
          {
            titulo: 'Pagamento',
            detalhe: `${parcelas.filter((p) => p.pagaEm).length} de ${parcelas.length} ${parcelas.length === 1 ? 'parcela paga' : 'parcelas pagas'}`,
            estado: encerrada ? 'pendente' : passoPagamento,
          },
        ]}
        tomAtual={c.situacao === 'aguardando_chefe' ? 'vinho' : 'escuro'}
      />

      {c.motivo && (
        <p className="rounded-[16px] bg-neg-bg px-4.5 py-3.5 text-[13px] font-semibold text-neg">
          {c.situacao === 'cancelada' ? 'Motivo do cancelamento' : 'Motivo da recusa'}: {c.motivo}
        </p>
      )}

      {c.situacao === 'recusada' && (s.perfil === 'obra' || s.perfil === 'compras') && (
        <Cartao as="div" className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-table">A compra foi recusada. Dá para corrigir e enviar de novo; esta fica guardada como recusada.</p>
          <BotaoLink href={`/compras/nova?de=${c.id}`} variante="primario">
            Corrigir e reenviar
          </BotaoLink>
        </Cartao>
      )}

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Secao titulo="Itens e orçamento">
            <p className="text-table whitespace-pre-line text-ink-2">{c.descricao}</p>
            {c.justificativa && (
              <p className="text-table">
                <span className="font-semibold">Motivo da compra:</span> {c.justificativa}
              </p>
            )}
            <Tabela minimo={720}>
              <thead>
                <tr>
                  <Th>Item</Th>
                  <Th>Etapa</Th>
                  <Th num>Nesta compra</Th>
                  <Th num>Orçado</Th>
                  <Th num>Outras compras</Th>
                  <Th num>Sobra depois desta</Th>
                </tr>
              </thead>
              <tbody>
                {itens.map((i) => (
                  <Tr key={i.id}>
                    <Td className="font-semibold">{i.descricao}</Td>
                    <Td className="text-ink-2">
                      {i.etapa} <span className="text-ink-3">/ {i.subetapa}</span>
                    </Td>
                    <Td num forte>
                      <Dinheiro valor={i.valor} />
                    </Td>
                    {i.itemChave && i.orcado !== null ? (
                      <>
                        <Td num className="text-ink-2">
                          <Dinheiro valor={i.orcado} />
                        </Td>
                        <Td num className="text-ink-2">
                          <Dinheiro valor={i.outras} />
                        </Td>
                        <Td num forte>
                          <Dinheiro valor={sobra(i)} />
                        </Td>
                      </>
                    ) : (
                      <Td colSpan={3} className="text-right">
                        <Etiqueta tom="aviso">{i.itemChave ? 'Item saiu do orçamento vigente' : 'Fora do orçamento'}</Etiqueta>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
              <tfoot>
                <tr aria-hidden className="h-2" />
                <LinhaTotal>
                  <td colSpan={2} className="px-2">
                    Total · {FAIXAS[c.faixa]}
                  </td>
                  <td className="px-2 text-right">
                    <Dinheiro valor={c.valor} />
                  </td>
                  <td colSpan={3} />
                </LinhaTotal>
              </tfoot>
            </Tabela>
            {c.cotacaoId && (
              <p className="text-table">
                <span className="font-semibold">Pedido ao fornecedor: </span>
                <Link href={`/cotacoes/${c.cotacaoId}`}>Cotação nº {c.cotacaoId}</Link>
                {': '}
                {c.pedidoEnviado ? (
                  <span className="font-semibold text-ok">enviado em {quando(c.pedidoEnviado)}</span>
                ) : c.situacao === 'aprovada' ? (
                  <span className="font-semibold text-warn">ainda não enviado (fornecedor sem WhatsApp ou falha no envio).</span>
                ) : (
                  <span className="text-ink-3">sai quando a compra for aprovada</span>
                )}
              </p>
            )}
            {c.cotacaoId && !c.pedidoEnviado && c.situacao === 'aprovada' && (
              <FormAcao action={reenviarPedido.bind(null, c.id)} botao="Enviar pedido agora" tamanho="sm" className="flex items-center gap-2" />
            )}
          </Secao>

          <Secao titulo="Parcelas">
            <Tabela minimo={520}>
              <thead>
                <tr>
                  <Th>Nº</Th>
                  <Th>Vencimento</Th>
                  <Th num>Valor</Th>
                  <Th>Situação</Th>
                </tr>
              </thead>
              <tbody>
                {parcelas.map((p) => (
                  <Tr key={p.id}>
                    <Td className="font-semibold">{p.numero}ª</Td>
                    <Td>{dataBR(p.vencimento)}</Td>
                    <Td num forte>
                      <Dinheiro valor={p.valor} />
                    </Td>
                    <Td>
                      {p.pagaEm ? (
                        <Etiqueta tom="paga">Paga em {dataBR(p.pagaEm)}</Etiqueta>
                      ) : p.vencida && c.situacao === 'aprovada' ? (
                        <Etiqueta tom="neg">Vencida</Etiqueta>
                      ) : (
                        <Etiqueta>Em aberto</Etiqueta>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
            {paga && (
              <div className="flex flex-col gap-2">
                {parcelas
                  .filter((p) => !p.pagaEm)
                  .map((p) => (
                    <details key={p.id} className="rounded-md border border-line px-3.5 py-3">
                      <summary className="cursor-pointer text-table font-semibold">
                        Registrar pagamento da {p.numero}ª parcela ({brl(p.valor)})
                      </summary>
                      <FormAcao action={registrarPagamento.bind(null, p.id)} botao="Confirmar pagamento" variante="primario" className="mt-3 grid gap-3 sm:grid-cols-3 sm:items-start">
                        <Campo rotulo="Pago em">
                          <Entrada name="paga_em" type="date" required />
                        </Campo>
                        <CampoAnexo name="boleto" titulo="Boleto (opcional)" />
                        <CampoAnexo name="comprovante" titulo="Comprovante (opcional)" />
                      </FormAcao>
                    </details>
                  ))}
              </div>
            )}
          </Secao>

          <Secao titulo="Documentos">
            {anexos.length === 0 ? (
              <EstadoVazio titulo="Nenhum documento anexado ainda" compacto />
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-[repeat(auto-fill,minmax(180px,1fr))]">
                {anexos.map((a) => (
                  <CartaoDocumento
                    key={a.id}
                    tipo={`${NOME_DOCUMENTO[a.tipo]}${a.parcelaId ? ` da ${numeroParcela(a.parcelaId)}ª parcela` : ''}`}
                    nome={a.nome}
                    detalhe={quando(a.criadoEm)}
                    href={`/anexos/${a.id}`}
                  />
                ))}
              </div>
            )}
            <FormAcao action={anexar.bind(null, c.id)} botao="Anexar" className="grid gap-3 border-t border-line pt-4 sm:grid-cols-[11rem_11rem_1fr] sm:items-start">
              <Campo rotulo="Documento">
                <Selecao name="tipo">
                  {Object.entries(NOME_DOCUMENTO).map(([v, t]) => (
                    <option key={v} value={v}>
                      {t}
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <Campo rotulo="Referente a">
                <Selecao name="parcela">
                  <option value="">Compra inteira</option>
                  {parcelas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.numero}ª parcela
                    </option>
                  ))}
                </Selecao>
              </Campo>
              <CampoAnexo name="arquivo" titulo="Arquivo" obrigatorio />
            </FormAcao>
          </Secao>
        </div>

        <aside className="flex flex-col gap-4">
          {decide && <Analise parcelas={parcelas} aviso={aviso} />}
          <Secao titulo="Histórico">
            <LinhaDoTempo eventos={eventos.map((e) => ({ chave: e.id, titulo: descreverEvento(e), autor: e.perfil, quando: quando(e.em) }))} />
          </Secao>
          {podeCancelar && (
            <details className="rounded-lg bg-surface px-5 py-4">
              <summary className="cursor-pointer text-table font-semibold text-neg">Cancelar esta compra</summary>
              <FormAcao action={cancelar.bind(null, c.id)} botao="Cancelar compra" variante="perigo" className="mt-3 flex flex-col gap-3">
                <Campo rotulo="Motivo do cancelamento">
                  <AreaTexto name="motivo" required rows={2} />
                </Campo>
              </FormAcao>
            </details>
          )}
        </aside>
      </section>
    </>
  )
}

// O caixa com e sem a compra, nos meses em que as parcelas vencem.
async function Analise({ parcelas, aviso }: { parcelas: { valor: number; vencimento: string }[]; aviso?: string }) {
  const { hoje, movimentos, saldo } = await contextoFluxo()
  const ultimo = parcelas.map((p) => p.vencimento).sort().at(-1) ?? hoje
  const meses = Math.min(24, Math.max(3, (Number(ultimo.slice(0, 4)) - Number(hoje.slice(0, 4))) * 12 + Number(ultimo.slice(5, 7)) - Number(hoje.slice(5, 7)) + 1))
  const sem = projetarFluxo(saldo, movimentos, hoje, meses)
  const com = projetarFluxo(saldo, [...movimentos, ...parcelas.map((p) => ({ data: p.vencimento, valor: -p.valor }))], hoje, meses)
  const falta = com.find((l) => l.acumulado < 0)

  return (
    <Cartao tom="noite" className="flex flex-col gap-3.5">
      <div className="flex items-center gap-2">
        <SeloIA />
        <h2 className="text-[13px] font-semibold text-accent-night">Análise antes de liberar</h2>
      </div>
      <span className="font-display text-[22px] leading-tight font-light">
        {falta ? `Com esta compra, o caixa fica negativo em ${mesBR(falta.mes)}.` : aviso ? 'O caixa comporta, mas confira o orçamento.' : 'O caixa comporta esta compra.'}
      </span>
      {aviso && (
        <p className="rounded-[14px] border border-night-3 px-3.5 py-3 text-[12.5px] font-semibold text-warn-night">{aviso} Veja os itens ao lado.</p>
      )}
      <p className="text-label leading-normal font-medium text-night-ink-2">
        Saldo de hoje {brl(saldo)}, somando o que está previsto para entrar e as parcelas já aprovadas de todas as obras.
      </p>
      <TabelaFluxo linhas={sem} comparar={com} noturno />
    </Cartao>
  )
}
