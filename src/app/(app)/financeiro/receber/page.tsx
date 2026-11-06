import Link from 'next/link'
import {
  BotaoLink,
  CabecalhoTela,
  Campo,
  Cartao,
  ChipOpcao,
  Dinheiro,
  Entrada,
  EntradaDinheiro,
  EstadoVazio,
  Etiqueta,
  FormAcao,
  Kpi,
  LinhaTotal,
  Modal,
  SeletorPilula,
  Tabela,
  Td,
  Th,
  Tr,
} from '@ds'
import { sql, hoje as hojeDb } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl, dataBR } from '@/lib/regras'
import { NATUREZAS, TIPOS_DOCUMENTO } from '@/components/rotulos'
import { receberEntrada, cancelarEntrada } from '../acoes'

const SITUACOES = [
  ['abertas', 'A receber'],
  ['atrasadas', 'Atrasadas'],
  ['recebidas', 'Recebidas'],
  ['canceladas', 'Canceladas'],
  ['todas', 'Todas'],
] as const
const dataOk = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '')

type Linha = {
  id: number
  obra: string
  descricao: string
  valor: number
  previstoPara: string
  recebidaEm: string | null
  cancelada: boolean
  natureza: string
  tipoDocumento: string | null
  numeroDocumento: string | null
  saldoDe: boolean
}

// Contas a receber: aportes, medições e contratos (as entradas previstas), com recebimento parcial.
export default async function ContasReceber({ searchParams }: PageProps<'/financeiro/receber'>) {
  await exigirSessao('financeiro', 'chefe')
  const q = await searchParams
  const obraId = Number(q.obra) || 0
  const situacao = SITUACOES.find(([k]) => k === q.situacao)?.[0] ?? 'abertas'
  const natureza = typeof q.natureza === 'string' && Object.hasOwn(NATUREZAS, q.natureza) ? q.natureza : ''
  const de = dataOk(q.de)
  const ate = dataOk(q.ate)

  const [hoje, obras] = await Promise.all([hojeDb(), sql<{ id: number; nome: string }[]>`select id, nome from obras order by ativa desc, nome`])
  const linhas = await sql<Linha[]>`
    select e.id, o.nome as obra, e.descricao, e.valor, e.previsto_para as "previstoPara", e.recebida_em as "recebidaEm", e.cancelada,
      e.natureza, e.tipo_documento as "tipoDocumento", e.numero_documento as "numeroDocumento", e.saldo_de is not null as "saldoDe"
    from entradas e join obras o on o.id = e.obra_id
    where true
      ${situacao === 'abertas' ? sql`and e.recebida_em is null and not e.cancelada` : situacao === 'atrasadas' ? sql`and e.recebida_em is null and not e.cancelada and e.previsto_para < ${hoje}` : situacao === 'recebidas' ? sql`and e.recebida_em is not null` : situacao === 'canceladas' ? sql`and e.cancelada` : sql``}
      ${obraId ? sql`and e.obra_id = ${obraId}` : sql``}
      ${natureza ? sql`and e.natureza = ${natureza}` : sql``}
      ${de ? sql`and e.previsto_para >= ${de}` : sql``}
      ${ate ? sql`and e.previsto_para <= ${ate}` : sql``}
    order by ${situacao === 'recebidas' ? sql`e.recebida_em desc, e.id desc` : sql`e.previsto_para, e.id`}
    limit 500`

  const soma = (ls: Linha[]) => ls.reduce((t, l) => t + l.valor, 0)
  const abertas = linhas.filter((l) => !l.recebidaEm && !l.cancelada)
  const atrasadas = abertas.filter((l) => l.previstoPara < hoje)
  const filtros = { obra: obraId || '', situacao, natureza, de, ate }
  const href = (muda: Record<string, string | number>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...filtros, ...muda })) if (v) p.set(k, String(v))
    return `/financeiro/receber?${p}`
  }
  const temFiltro = !!(obraId || natureza || de || ate || situacao !== 'abertas')
  const campo = 'h-10 rounded-full border border-transparent bg-surface-2 px-4 text-[13px] font-medium outline-none focus:border-ink focus:bg-surface'

  return (
    <>
      <CabecalhoTela
        contexto={`${linhas.length} ${linhas.length === 1 ? 'lançamento' : 'lançamentos'}${temFiltro ? ' no filtro' : ''}`}
        titulo="Contas a receber"
        acoes={
          <BotaoLink href="/financeiro/receber/novo" variante="primario">
            + Novo documento a receber
          </BotaoLink>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi tom="escuro" rotulo="A receber no filtro" valor={<Dinheiro valor={soma(abertas)} />} detalhe={`${abertas.length} em aberto`} corDetalhe="acento" />
        <Kpi tom="aviso" rotulo="Atrasadas" valor={<Dinheiro valor={soma(atrasadas)} />} detalhe={`${atrasadas.length} passaram da data`} corDetalhe="aviso" />
        <Kpi rotulo="Recebidas no filtro" valor={<Dinheiro valor={soma(linhas.filter((l) => l.recebidaEm))} />} detalhe={`${linhas.filter((l) => l.recebidaEm).length} recebidas`} />
      </section>

      <Cartao as="div" className="flex flex-col gap-3 p-3.5!">
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="situacao" value={situacao} />
          {natureza && <input type="hidden" name="natureza" value={natureza} />}
          <SeletorPilula aria-label="Obra" name="obra" defaultValue={obraId || ''} ativo={!!obraId}>
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </SeletorPilula>
          <label className="flex items-center gap-1.5 text-label font-semibold text-ink-3">
            Previsto de
            <input name="de" type="date" defaultValue={de} className={campo} />
          </label>
          <label className="flex items-center gap-1.5 text-label font-semibold text-ink-3">
            até
            <input name="ate" type="date" defaultValue={ate} className={campo} />
          </label>
          <button className="h-10 rounded-full bg-ink px-[18px] text-[13px] font-semibold text-on-ink hover:bg-ink-2">Filtrar</button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label font-semibold text-ink-3">Situação</span>
          {SITUACOES.map(([k, t]) => (
            <ChipOpcao key={k} href={href({ situacao: k })} ativo={situacao === k}>
              {t}
            </ChipOpcao>
          ))}
          <span className="mr-1 ml-3 text-label font-semibold text-ink-3">Tipo</span>
          <ChipOpcao href={href({ natureza: '' })} ativo={!natureza}>
            Todos
          </ChipOpcao>
          {Object.entries(NATUREZAS).map(([k, [t]]) => (
            <ChipOpcao key={k} href={href({ natureza: k })} ativo={natureza === k}>
              {t}
            </ChipOpcao>
          ))}
          {temFiltro && (
            <Link href="/financeiro/receber" className="ml-1 text-label font-semibold text-ink-2 underline">
              Limpar filtros
            </Link>
          )}
        </div>
      </Cartao>

      <Cartao className="pt-2!">
        {linhas.length === 0 ? (
          <EstadoVazio titulo="Nada a receber no filtro" acao={temFiltro ? <BotaoLink href="/financeiro/receber">Limpar filtros</BotaoLink> : undefined}>
            {temFiltro ? 'Tente outra situação ou período.' : 'Lance aportes, medições e contratos em Novo documento a receber.'}
          </EstadoVazio>
        ) : (
          <Tabela minimo={940}>
            <thead>
              <tr>
                <Th>Previsto para</Th>
                <Th>Descrição · obra</Th>
                <Th>Documento</Th>
                <Th num>Valor</Th>
                <Th>Situação</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => {
                const aberta = !l.recebidaEm && !l.cancelada
                return (
                  <Tr key={l.id}>
                    <Td className={`whitespace-nowrap font-semibold ${aberta && l.previstoPara < hoje ? 'text-neg' : ''}`}>{dataBR(l.previstoPara)}</Td>
                    <Td className="max-w-sm">
                      <span className="block truncate font-semibold" title={l.descricao}>
                        {l.descricao}
                        {l.saldoDe && <span className="font-normal text-ink-3"> · restante</span>}
                      </span>
                      <span className="block text-caption text-ink-3">{l.obra}</span>
                    </Td>
                    <Td className="text-ink-2">
                      {l.tipoDocumento ? TIPOS_DOCUMENTO[l.tipoDocumento] : '—'}
                      {l.numeroDocumento && ` ${l.numeroDocumento}`}
                      <span className="block text-caption text-ink-3">{NATUREZAS[l.natureza][0]}</span>
                    </Td>
                    <Td num forte>
                      <Dinheiro valor={l.valor} />
                    </Td>
                    <Td>
                      {l.recebidaEm ? (
                        <Etiqueta tom="paga">Recebida em {dataBR(l.recebidaEm)}</Etiqueta>
                      ) : l.cancelada ? (
                        <Etiqueta>Cancelada</Etiqueta>
                      ) : l.previstoPara < hoje ? (
                        <Etiqueta tom="neg">Atrasada</Etiqueta>
                      ) : (
                        <Etiqueta tom="aviso">Aguardando</Etiqueta>
                      )}
                    </Td>
                    <Td className="text-right whitespace-nowrap">
                      {aberta && (
                        <span className="inline-flex gap-1.5">
                          <Modal gatilho="Receber" tamanho="sm" titulo={`Receber: ${l.descricao}`} texto={`Valor previsto ${brl(l.valor)}. Se entrou só uma parte, informe o valor recebido e quando deve entrar o restante.`}>
                            <FormAcao action={receberEntrada.bind(null, l.id)} botao="Confirmar recebimento" variante="primario" className="flex flex-col gap-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <Campo rotulo="Recebida em">
                                  <Entrada name="recebida_em" type="date" required defaultValue={hoje} />
                                </Campo>
                                <Campo rotulo="Valor recebido">
                                  <EntradaDinheiro name="valor_recebido" required min="0.01" defaultValue={l.valor} />
                                </Campo>
                              </div>
                              <Campo rotulo="Se recebeu só uma parte: quando entra o restante">
                                <Entrada name="restante_vencimento" type="date" />
                              </Campo>
                            </FormAcao>
                          </Modal>
                          <Modal gatilho="Cancelar" variante="secundario" tamanho="sm" titulo="Cancelar esta entrada?" texto={`${l.descricao}, ${brl(l.valor)}. Ela sai do fluxo de caixa.`}>
                            <FormAcao action={cancelarEntrada.bind(null, l.id)} botao="Cancelar entrada" variante="perigo" />
                          </Modal>
                        </span>
                      )}
                    </Td>
                  </Tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr aria-hidden className="h-2" />
              <LinhaTotal>
                <td colSpan={3} className="px-2">
                  Total · {linhas.length} {linhas.length === 1 ? 'lançamento' : 'lançamentos'}
                </td>
                <td className="px-2 text-right">
                  <Dinheiro valor={soma(linhas)} />
                </td>
                <td colSpan={2} />
              </LinhaTotal>
            </tfoot>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
