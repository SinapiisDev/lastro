import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  BotaoImprimir,
  BotaoLink,
  CabecalhoTela,
  Campo,
  Cartao,
  Dinheiro,
  Entrada,
  EstadoVazio,
  Etiqueta,
  Marcacao,
  Selecao,
  SelecaoBusca,
  Tabela,
  Td,
  Th,
  Tr,
} from '@ds'
import { sql, hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { dataBR } from '@/lib/regras'
import { dadosDoFluxo } from '@/lib/fluxo'
import { filtrosDaUrl, montarFluxo } from '@/lib/fluxo-analitico'

const VER = [
  ['ambos', 'Realizado e previsto'],
  ['realizado', 'Só realizado'],
  ['previsto', 'Só previsto'],
] as const
const NATUREZA = [
  ['', 'Provisões e previsões'],
  ['provisao', 'Só provisões (documento lançado)'],
  ['previsao', 'Só previsões (estimativa)'],
] as const

export default async function FluxoDeCaixa({ searchParams }: PageProps<'/financeiro/fluxo'>) {
  await exigirSessao('financeiro', 'chefe')
  const q = await searchParams
  const dia = await hoje()
  const f = filtrosDaUrl(q, dia)
  const [dados, obras, contas, fornecedores] = await Promise.all([
    dadosDoFluxo(f),
    sql<{ id: number; nome: string; ativa: boolean }[]>`select id, nome, ativa from obras order by ativa desc, nome`,
    sql<{ id: number; nome: string }[]>`select id, nome from contas_bancarias order by ativa desc, nome`,
    sql<{ id: number; nome: string }[]>`select id, nome from fornecedores order by nome`,
  ])
  const { extrato, inicialPrevisto, resumo } = montarFluxo({
    linhas: dados.linhas,
    saldoInicial: dados.saldoInicial,
    inicio: f.inicio,
    fim: f.fim,
    hoje: dia,
    ver: f.ver,
  })
  const filtrado = !!(f.obraId || f.fornecedorId)
  const exportar = `/financeiro/fluxo/exportar?${new URLSearchParams(Object.entries(q).flatMap(([k, v]) => (typeof v === 'string' ? [[k, v]] : [])))}`

  return (
    <>
      <CabecalhoTela
        contexto={`${dataBR(f.inicio)} a ${dataBR(f.fim)} · ${extrato.length} ${extrato.length === 1 ? 'lançamento' : 'lançamentos'}`}
        titulo="Fluxo de caixa"
        acoes={
          <>
            <BotaoLink href={exportar} variante="secundario">
              Exportar para Excel
            </BotaoLink>
            <BotaoImprimir />
          </>
        }
      />

      <Cartao as="div" className="print:hidden">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <input type="hidden" name="f" value="1" />
          <Campo rotulo="De (vencimento ou pagamento)">
            <Entrada name="de" type="date" defaultValue={f.inicio} />
          </Campo>
          <Campo rotulo="Até">
            <Entrada name="ate" type="date" defaultValue={f.fim} />
          </Campo>
          <Campo rotulo="Obra">
            <Selecao name="obra" defaultValue={f.obraId ?? ''}>
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                  {!o.ativa && ' (encerrada)'}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Fornecedor">
            <SelecaoBusca
              name="fornecedor"
              padrao={f.fornecedorId ? String(f.fornecedorId) : ''}
              placeholder="Todos (digite para buscar)"
              opcoes={[{ valor: '', rotulo: 'Todos os fornecedores' }, ...fornecedores.map((x) => ({ valor: String(x.id), rotulo: x.nome }))]}
            />
          </Campo>
          {contas.length > 0 && (
            <Campo rotulo="Conta bancária">
              <Selecao name="conta" defaultValue={f.contaId ?? ''}>
                <option value="">Todas as contas</option>
                {contas.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </Selecao>
            </Campo>
          )}
          <Campo rotulo="Mostrar">
            <Selecao name="ver" defaultValue={f.ver}>
              {VER.map(([k, r]) => (
                <option key={k} value={k}>
                  {r}
                </option>
              ))}
            </Selecao>
          </Campo>
          <Campo rotulo="Tipo de lançamento">
            <Selecao name="natureza" defaultValue={f.natureza ?? ''}>
              {NATUREZA.map(([k, r]) => (
                <option key={k} value={k}>
                  {r}
                </option>
              ))}
            </Selecao>
          </Campo>
          <div className="flex flex-col justify-end gap-3 sm:col-span-2 lg:col-span-4 lg:flex-row lg:items-center lg:justify-between">
            <Marcacao name="aguardando" value="1" defaultChecked={f.aguardando} rotulo="Incluir compras aguardando aprovação (como previsto)" />
            <div className="flex gap-2">
              <Link href="/financeiro/fluxo" className="inline-flex h-10 items-center rounded-full px-4 text-[13px] font-semibold text-ink-2 underline">
                Limpar
              </Link>
              <button className="h-10 cursor-pointer rounded-full bg-ink px-5 text-[13px] font-semibold text-on-ink hover:bg-ink-2">Atualizar</button>
            </div>
          </div>
        </form>
      </Cartao>

      <section className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <Cartao className="min-w-0 pt-2! xl:order-1">
          {extrato.length === 0 && !inicialPrevisto ? (
            <EstadoVazio titulo="Nada no período">Nenhum pagamento, recebimento ou conta em aberto entre essas datas com estes filtros.</EstadoVazio>
          ) : (
            <Tabela minimo={dados.temContas ? 1000 : 880}>
              <thead>
                <tr>
                  <Th>Data</Th>
                  <Th>Obra</Th>
                  <Th>Descrição</Th>
                  <Th>Doc.</Th>
                  {dados.temContas && <Th>Conta</Th>}
                  <Th>Tipo</Th>
                  <Th num>Valor</Th>
                  <Th num>Saldo</Th>
                </tr>
              </thead>
              <tbody>
                <Tr>
                  <Td className="text-ink-2">{dataBR(dados.diaAnterior)}</Td>
                  <Td colSpan={dados.temContas ? 4 : 3} className="font-semibold">
                    Saldo inicial realizado
                    {filtrado && <span className="block text-caption font-medium text-ink-3">filtrado por obra ou fornecedor: o acumulado começa em zero</span>}
                  </Td>
                  <Td>
                    <Etiqueta>Realizado</Etiqueta>
                  </Td>
                  <Td num>
                    <Dinheiro valor={resumo.saldoInicial} />
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={resumo.saldoInicial} />
                  </Td>
                </Tr>
                {f.ver !== 'realizado' && (
                  <Tr>
                    <Td className="text-ink-2">antes de {dataBR(f.inicio)}</Td>
                    <Td colSpan={dados.temContas ? 4 : 3} className="font-semibold">
                      Em aberto de antes do período
                      <span className="block text-caption font-medium text-ink-3">contas vencidas antes do início e ainda não pagas ou recebidas</span>
                    </Td>
                    <Td>
                      <Etiqueta tom={inicialPrevisto ? 'neg' : 'info'}>{inicialPrevisto ? 'Atrasado' : 'Previsto'}</Etiqueta>
                    </Td>
                    <Td num>
                      <Dinheiro valor={inicialPrevisto} />
                    </Td>
                    <Td num forte>
                      <Dinheiro valor={resumo.saldoInicial + inicialPrevisto} />
                    </Td>
                  </Tr>
                )}
                {extrato.map((l, i) => (
                  <Tr key={i}>
                    <Td className="whitespace-nowrap text-ink-2">{dataBR(l.data)}</Td>
                    <Td className="max-w-40">
                      <span className="block truncate" title={l.obra ?? ''}>
                        {l.obra ?? '—'}
                      </span>
                    </Td>
                    <Td className="max-w-xs">
                      {l.compraId ? (
                        <Link href={`/compras/${l.compraId}`} className="block truncate font-semibold no-underline hover:underline" title={l.fornecedor ?? ''}>
                          {l.fornecedor}
                        </Link>
                      ) : (
                        <span className="block truncate font-semibold">{l.fornecedor ?? (l.valor > 0 ? 'Recebimento' : 'Banco')}</span>
                      )}
                      <span className="block truncate text-caption text-ink-3" title={l.descricao}>
                        {l.descricao}
                        {l.parcela && l.parcela !== '1/1' && ` · parcela ${l.parcela}`}
                      </span>
                    </Td>
                    <Td className="max-w-32 text-ink-2">
                      <span className="block truncate" title={l.documento ?? ''}>
                        {l.documento ?? '—'}
                      </span>
                    </Td>
                    {dados.temContas && (
                      <Td className="text-ink-2">
                        {l.conta ?? '—'}
                        {l.foraDoSaldo && <span className="block text-caption text-warn">sem conta: fora do saldo</span>}
                      </Td>
                    )}
                    <Td>
                      {l.tipo === 'realizado' ? (
                        <Etiqueta>Realizado</Etiqueta>
                      ) : l.atrasada ? (
                        <Etiqueta tom="neg">Atrasado</Etiqueta>
                      ) : l.tipo === 'aguardando' ? (
                        <Etiqueta tom="aviso">Aguardando aprovação</Etiqueta>
                      ) : (
                        <Etiqueta tom="info">Previsto</Etiqueta>
                      )}
                    </Td>
                    <Td num>
                      <Dinheiro valor={l.valor} sinal className={l.valor > 0 ? 'text-ok' : ''} />
                    </Td>
                    <Td num forte>
                      <Dinheiro valor={l.saldo} />
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Tabela>
          )}
        </Cartao>

        <Cartao as="aside" className="order-first flex flex-col gap-4 xl:sticky xl:top-4 xl:order-2">
          <Bloco titulo={`Saldo inicial · fim de ${dataBR(dados.diaAnterior)}`}>
            {dados.saldosContas.map((c) => (
              <Linha key={c.nome} rotulo={c.nome} valor={c.saldo} />
            ))}
            {!dados.temContas && !filtrado && <Linha rotulo="Caixa (saldo informado)" valor={resumo.saldoInicial} />}
            <Destaque rotulo="Saldo inicial total" valor={resumo.saldoInicial} />
          </Bloco>
          {f.ver !== 'previsto' && (
            <Bloco titulo="Realizado no período">
              <Linha rotulo="Créditos (entrou)" valor={resumo.creditos} />
              <Linha rotulo="Débitos (saiu)" valor={resumo.debitos} />
              <Linha rotulo="Saldo realizado" valor={resumo.realizado} />
              <Destaque rotulo="Saldo parcial" valor={resumo.parcial} />
            </Bloco>
          )}
          {f.ver !== 'realizado' && (
            <Bloco titulo="Previsto">
              <Linha rotulo="A receber" valor={resumo.aReceber} />
              <Linha rotulo="A pagar" valor={resumo.aPagar} />
              <Linha rotulo="Saldo previsto" valor={resumo.previsto} />
            </Bloco>
          )}
          <Destaque rotulo={`Saldo final em ${dataBR(f.fim)}`} valor={resumo.final} forte />
          {f.ver !== 'realizado' && (
            <Bloco titulo={`Em atraso até ${dataBR(dia)}`}>
              <Linha rotulo="A receber" valor={resumo.atrasoReceber} />
              <Linha rotulo="A pagar" valor={resumo.atrasoPagar} />
              <Linha rotulo="Saldo em atraso" valor={resumo.atraso} />
              {resumo.atrasoPagar < 0 && (
                <Link href="/financeiro/pagar?situacao=vencidas" className="text-label font-semibold">
                  Ver contas vencidas ›
                </Link>
              )}
            </Bloco>
          )}
        </Cartao>
      </section>
    </>
  )
}

function Bloco({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h2 className="text-label font-bold text-ink-3">{titulo}</h2>
      {children}
    </div>
  )
}

function Linha({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <p className="flex items-baseline justify-between gap-3 text-[13px]">
      <span className="min-w-0 truncate text-ink-2" title={rotulo}>
        {rotulo}
      </span>
      <Dinheiro valor={valor} className="font-semibold" />
    </p>
  )
}

function Destaque({ rotulo, valor, forte = false }: { rotulo: string; valor: number; forte?: boolean }) {
  return (
    <p className={`flex items-baseline justify-between gap-3 rounded-md px-3 py-2.5 text-[13px] font-bold ${forte ? 'bg-ink text-on-ink' : 'bg-surface-2'}`}>
      <span>{rotulo}</span>
      <Dinheiro valor={valor} noturno={forte} />
    </p>
  )
}
