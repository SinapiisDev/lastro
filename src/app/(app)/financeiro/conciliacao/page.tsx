import Link from 'next/link'
import {
  BotaoLink,
  CabecalhoTela,
  Cartao,
  Dinheiro,
  Entrada,
  EstadoVazio,
  Etiqueta,
  FormAcao,
  Kpi,
  Marcacao,
  Mensagem,
  Secao,
  Segmentado,
  Selecao,
  Tabela,
  Td,
  Th,
  Tr,
} from '@ds'
import { exigirSessao } from '@/lib/sessao'
import { dataBR } from '@/lib/regras'
import { listarContas } from '@/lib/contas-bancarias'
import { sugerirPares, type Opcao } from '@/lib/conciliacao'
import { dadosConciliacao, type CandidatoDetalhe, type LinhaPendente } from '@/lib/conciliacao-banco'
import { EnviarExtrato } from './enviar-extrato'
import { importarExtrato, conciliar, marcarLinha, desfazerLinha } from './acoes'

type Linha = LinhaPendente
type Detalhe = CandidatoDetalhe

// Conciliação: o extrato do banco (OFX) contra o que está em aberto no sistema. Nada é baixado sem confirmar.
export default async function Conciliacao({ searchParams }: PageProps<'/financeiro/conciliacao'>) {
  const s = await exigirSessao('financeiro', 'chefe')
  const q = await searchParams
  const contas = (await listarContas()).filter((c) => c.ativa)
  if (!contas.length) {
    return (
      <>
        <CabecalhoTela contexto="Financeiro" titulo="Conciliação bancária" />
        <EstadoVazio
          titulo="Nenhuma conta bancária cadastrada"
          acao={s.perfil === 'chefe' ? <BotaoLink href="/configuracoes?aba=contas">Cadastrar conta</BotaoLink> : undefined}
        >
          {s.perfil === 'chefe' ? 'Cadastre a conta da empresa com o saldo de um dia.' : 'O dono cadastra as contas da empresa em Configurações › Contas bancárias.'}
        </EstadoVazio>
      </>
    )
  }
  const conta = contas.find((c) => c.id === Number(q.conta)) ?? contas[0]

  const { linhas, conferidas, candidatos } = await dadosConciliacao(conta.id)
  const sugestoes = sugerirPares(linhas, candidatos, conta.id)
  const linhaDe = new Map(linhas.map((l) => [l.id, l]))
  const certas = sugestoes.filter((x) => x.tipo === 'certo')
  const talvez = sugestoes.filter((x) => x.tipo === 'talvez')
  const semPar = sugestoes.filter((x) => x.tipo === 'sem_par')
  const diferenca = conta.saldoBanco !== null && conta.saldoNaDataDoBanco !== null ? Math.round((conta.saldoNaDataDoBanco - conta.saldoBanco) * 100) / 100 : null
  const acaoConciliar = conciliar.bind(null, conta.id)
  const aviso = textoDoAviso(String(q.feito ?? ''))

  return (
    <>
      <CabecalhoTela
        contexto="Financeiro"
        titulo="Conciliação bancária"
        acoes={contas.length > 1 ? <Segmentado fundo="surface" opcoes={contas.map((c) => ({ href: `/financeiro/conciliacao?conta=${c.id}`, rotulo: c.nome, ativo: c.id === conta.id }))} /> : undefined}
      />

      {aviso && <Mensagem tom="ok" titulo={aviso} />}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi tom="escuro" rotulo={`Saldo hoje · ${conta.nome}`} valor={<Dinheiro valor={conta.saldo} />} detalhe={`informado em ${dataBR(conta.saldoEm)}, mais o que entrou e saiu depois`} corDetalhe="acento" />
        <Kpi
          rotulo="Saldo no banco"
          valor={conta.saldoBanco === null ? '—' : <Dinheiro valor={conta.saldoBanco} />}
          detalhe={conta.saldoBancoEm ? `no último extrato, em ${dataBR(conta.saldoBancoEm)}` : 'envie um extrato para conferir'}
        />
        <Kpi
          tom={diferenca ? 'aviso' : 'padrao'}
          rotulo="Diferença sistema × banco"
          valor={diferenca === null ? '—' : <Dinheiro valor={diferenca} sinal />}
          detalhe={diferenca === null ? 'aparece depois do primeiro extrato' : diferenca ? 'falta conferir alguma linha' : 'o sistema bate com o banco'}
          corDetalhe={diferenca ? 'aviso' : 'ok'}
        />
        <Kpi rotulo="Para conferir" valor={linhas.length} detalhe={`${certas.length} com par certo · ${talvez.length} para escolher`} />
      </section>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          {!linhas.length && (
            <Cartao>
              <EstadoVazio titulo="Nada para conferir">Envie o extrato mais recente da conta: o sistema mostra o que bate com os pagamentos e recebimentos.</EstadoVazio>
            </Cartao>
          )}

          {certas.length > 0 && (
            <Secao titulo={`Bateu (${certas.length})`}>
              <p className="text-table text-ink-2">Mesmo valor, data próxima e, quando o banco mostra, o mesmo nome. Desmarque o que não for e confirme.</p>
              <FormAcao action={acaoConciliar} botao="Confirmar os marcados" variante="primario" className="flex flex-col gap-3">
                <Tabela minimo={760}>
                  <Cabecalho primeira="" ultima="No sistema" />
                  <tbody>
                    {certas.map((x) => (
                      <Tr key={x.linhaId}>
                        <Td>
                          <Marcacao name="par" value={`${x.linhaId}:${x.opcoes[0].tipo}:${x.opcoes[0].id}`} defaultChecked aria-label="Confirmar este par" />
                        </Td>
                        <NoExtrato l={linhaDe.get(x.linhaId)!} />
                        <Td>
                          <NoSistema o={x.opcoes[0] as Opcao & Detalhe} />
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </FormAcao>
            </Secao>
          )}

          {talvez.length > 0 && (
            <Secao titulo={`Escolha o par (${talvez.length})`}>
              <p className="text-table text-ink-2">Mais de uma parcela com o mesmo valor, ou o nome do extrato é diferente do fornecedor. Escolha a certa, ou deixe para depois.</p>
              <FormAcao action={acaoConciliar} botao="Confirmar as escolhas" variante="primario" className="flex flex-col gap-3">
                <Tabela minimo={760}>
                  <Cabecalho ultima="Qual é?" />
                  <tbody>
                    {talvez.map((x) => (
                      <Tr key={x.linhaId}>
                        <NoExtrato l={linhaDe.get(x.linhaId)!} />
                        <Td className="min-w-[300px]">
                          <Selecao name="par" defaultValue="" aria-label="Parcela deste lançamento">
                            <option value="">Deixar para depois</option>
                            {(x.opcoes as (Opcao & Detalhe)[]).map((o) => (
                              <option key={`${o.tipo}${o.id}`} value={`${x.linhaId}:${o.tipo}:${o.id}`}>
                                {rotulo(o)}
                                {o.relacao === 'conflita' ? ' · nome diferente do extrato' : ''}
                              </option>
                            ))}
                          </Selecao>
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Tabela>
              </FormAcao>
            </Secao>
          )}

          {semPar.length > 0 && (
            <Secao titulo={`Sem par no sistema (${semPar.length})`}>
              <p className="text-table text-ink-2">
                Pagamento ou recebimento que ainda não está no sistema? Lance o <Link href="/financeiro/pagar/novo">documento a pagar</Link> ou o{' '}
                <Link href="/financeiro/receber/novo">documento a receber</Link> com o valor do extrato e volte aqui: o par aparece sozinho. Tarifa, juros e outros movimentos só do banco: lance no saldo. O que é de antes do saldo informado da conta pode ser ignorado.
              </p>
              <Tabela minimo={760}>
                <Cabecalho ultima="O que fazer" />
                <tbody>
                  {semPar.map((x) => {
                    const l = linhaDe.get(x.linhaId)!
                    return (
                      <Tr key={x.linhaId}>
                        <NoExtrato l={l} />
                        <Td>
                          <div className="flex flex-wrap items-start gap-2">
                            <FormAcao action={marcarLinha.bind(null, l.id, 'avulso')} botao="Lançar no saldo" tamanho="sm" className="flex flex-wrap items-center gap-2">
                              <Entrada name="observacao" defaultValue={l.valor < 0 && /TARIFA|PACOTE|JUROS|IOF/i.test(l.descricao) ? 'Tarifa do banco' : ''} placeholder="Ex.: Tarifa do banco" aria-label="Descrição" className="min-h-8 w-44 py-1 text-label" />
                            </FormAcao>
                            <FormAcao action={marcarLinha.bind(null, l.id, 'ignorado')} botao="Ignorar" variante="fantasma" tamanho="sm" />
                          </div>
                        </Td>
                      </Tr>
                    )
                  })}
                </tbody>
              </Tabela>
            </Secao>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <Secao titulo="Enviar extrato">
            <p className="text-table text-ink-2">
              No internet banking, baixe o extrato da conta {conta.numero ? `${conta.numero} ` : ''}em <strong>OFX</strong> (às vezes aparece como Money ou Quicken) e envie aqui.
            </p>
            <EnviarExtrato action={importarExtrato.bind(null, conta.id)} />
          </Secao>

          <Secao titulo="Conferidos">
            {conferidas.length === 0 ? (
              <EstadoVazio titulo="Nada conferido ainda" compacto />
            ) : (
              <ul className="flex flex-col">
                {conferidas.map((c) => (
                  <li key={c.id} className="flex flex-col gap-1 border-t border-line py-2.5 first:border-0 first:pt-0">
                    <span className="flex items-baseline justify-between gap-2 text-table">
                      <span className="truncate font-semibold">{c.vinculo ?? c.observacao ?? c.nome ?? c.descricao}</span>
                      <Dinheiro valor={c.valor} sinal className="shrink-0 font-bold" />
                    </span>
                    <span className="flex flex-wrap items-center justify-between gap-2 text-caption text-ink-3">
                      <span className="flex items-center gap-2">
                        {dataBR(c.data)}
                        <Etiqueta tom={c.situacao === 'conciliado' ? 'ok' : c.situacao === 'avulso' ? 'info' : 'neutro'}>
                          {c.situacao === 'conciliado' ? 'Conciliado' : c.situacao === 'avulso' ? 'No saldo' : 'Ignorado'}
                        </Etiqueta>
                        {c.compraId && <Link href={`/compras/${c.compraId}`}>Nº {c.compraId}</Link>}
                      </span>
                      <FormAcao action={desfazerLinha.bind(null, c.id)} botao="Desfazer" variante="fantasma" tamanho="sm" />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Secao>
        </div>
      </section>
    </>
  )
}

// Aviso depois de conferir (vem pelo endereço, porque a linha conferida sai da lista).
function textoDoAviso(feito: string) {
  const pares = feito.match(/^pares-(\d+)-(\d+)$/)
  if (pares) {
    const [ok, falhas] = [Number(pares[1]), Number(pares[2])]
    return `${ok} ${ok === 1 ? 'par confirmado' : 'pares confirmados'}.${falhas ? ` ${falhas} não ${falhas === 1 ? 'deu' : 'deram'}: já pagos ou mudaram.` : ''}`
  }
  return { saldo: 'Lançado no saldo da conta.', ignorada: 'Linha ignorada.', desfeito: 'Conferência desfeita: a linha voltou para conferir.' }[feito] ?? null
}

function Cabecalho({ primeira, ultima }: { primeira?: string; ultima: string }) {
  return (
    <thead>
      <tr>
        {primeira !== undefined && <Th className="w-10">{primeira}</Th>}
        <Th>Data</Th>
        <Th>No extrato</Th>
        <Th num>Valor</Th>
        <Th>{ultima}</Th>
      </tr>
    </thead>
  )
}

function NoExtrato({ l }: { l: Linha }) {
  return (
    <>
      <Td className="whitespace-nowrap">{dataBR(l.data).slice(0, 5)}</Td>
      <Td>
        <span className="flex max-w-[340px] flex-col gap-0.5">
          <span className="truncate font-semibold" title={l.nome ?? l.descricao}>
            {l.nome ?? l.descricao}
          </span>
          {l.nome && <span className="truncate text-caption text-ink-3">{l.descricao}</span>}
        </span>
      </Td>
      <Td num forte>
        <Dinheiro valor={l.valor} sinal />
      </Td>
    </>
  )
}

const quandoOpcao = (o: Detalhe) =>
  o.baixadaEm ? `já ${o.tipo === 'parcela' ? 'paga' : 'recebida'} em ${dataBR(o.baixadaEm).slice(0, 5)}` : o.agendadaPara ? `agendada p/ ${dataBR(o.agendadaPara).slice(0, 5)}` : `vence ${dataBR(o.vencimento)}`

const rotulo = (o: Detalhe) =>
  o.tipo === 'parcela' ? `${o.nome} · Nº ${o.compraId} · ${o.parcela} · ${quandoOpcao(o)} · ${o.obra}` : `${o.obra} · ${o.parcela} · ${quandoOpcao(o)}`

function NoSistema({ o }: { o: Detalhe & Opcao }) {
  return (
    <span className="flex max-w-[360px] flex-col gap-0.5">
      <span className="truncate font-semibold">{o.tipo === 'parcela' ? o.nome : o.parcela}</span>
      <span className="truncate text-caption text-ink-3">
        {o.tipo === 'parcela' && (
          <>
            <Link href={`/compras/${o.compraId}`}>Nº {o.compraId}</Link> · {o.parcela} ·{' '}
          </>
        )}
        {quandoOpcao(o)} · {o.obra}
        {o.relacao === 'bate' && ' · nome confere'}
      </span>
    </span>
  )
}
