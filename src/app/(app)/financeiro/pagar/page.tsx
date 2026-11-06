import Link from 'next/link'
import { BotaoLink, CabecalhoTela, Cartao, ChipOpcao, Dinheiro, EstadoVazio, Etiqueta, Kpi, LinhaTotal, SeletorPilula, Tabela, Td, Th, Tr } from '@ds'
import { sql, hoje as hojeDb } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { dataBR } from '@/lib/regras'
import { NATUREZAS, TIPOS_DOCUMENTO } from '@/components/rotulos'

const SITUACOES = [
  ['abertas', 'Em aberto'],
  ['vencidas', 'Vencidas'],
  ['pagas', 'Pagas'],
  ['todas', 'Todas'],
] as const
const ORIGENS = [
  ['', 'Tudo'],
  ['financeiro', 'Documentos do financeiro'],
  ['obra', 'Compras da obra'],
] as const
const dataOk = (x: unknown) => (typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : '')

type Linha = {
  id: number
  compraId: number
  numero: number
  total: number
  saldoDe: number | null
  valor: number
  vencimento: string
  pagaEm: string | null
  obra: string
  fornecedor: string
  descricao: string
  origem: string
  natureza: string
  tipoDocumento: string | null
  numeroDocumento: string | null
}

// Contas a pagar: todas as parcelas de compras aprovadas e documentos do financeiro.
export default async function ContasPagar({ searchParams }: PageProps<'/financeiro/pagar'>) {
  await exigirSessao('financeiro', 'chefe')
  const q = await searchParams
  const obraId = Number(q.obra) || 0
  const fornecedorId = Number(q.fornecedor) || 0
  const situacao = SITUACOES.find(([k]) => k === q.situacao)?.[0] ?? 'abertas'
  const origem = ORIGENS.find(([k]) => k === q.origem)?.[0] ?? ''
  const natureza = typeof q.natureza === 'string' && Object.hasOwn(NATUREZAS, q.natureza) ? q.natureza : ''
  const de = dataOk(q.de)
  const ate = dataOk(q.ate)
  const busca = typeof q.busca === 'string' ? q.busca.trim() : ''

  const [hoje, obras, fornecedores] = await Promise.all([
    hojeDb(),
    sql<{ id: number; nome: string }[]>`select id, nome from obras order by ativa desc, nome`,
    sql<{ id: number; nome: string }[]>`select id, nome from fornecedores f where exists (select 1 from compras c where c.fornecedor_id = f.id) order by nome`,
  ])
  const linhas = await sql<Linha[]>`
    select p.id, p.compra_id as "compraId", p.numero, (select count(*) from parcelas x where x.compra_id = p.compra_id)::int as total,
      (select x.numero from parcelas x where x.id = p.saldo_de) as "saldoDe",
      p.valor, p.vencimento, p.paga_em as "pagaEm", c.obra, c.fornecedor, c.descricao, c.origem, c.natureza,
      c.tipo_documento as "tipoDocumento", c.numero_documento as "numeroDocumento"
    from parcelas p join v_compras c on c.id = p.compra_id
    where c.situacao = 'aprovada'
      ${situacao === 'abertas' ? sql`and p.paga_em is null` : situacao === 'vencidas' ? sql`and p.paga_em is null and p.vencimento < ${hoje}` : situacao === 'pagas' ? sql`and p.paga_em is not null` : sql``}
      ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
      ${fornecedorId ? sql`and c.fornecedor_id = ${fornecedorId}` : sql``}
      ${origem ? sql`and c.origem = ${origem}` : sql``}
      ${natureza ? sql`and c.natureza = ${natureza}` : sql``}
      ${de ? sql`and p.vencimento >= ${de}` : sql``}
      ${ate ? sql`and p.vencimento <= ${ate}` : sql``}
      ${busca ? sql`and (c.descricao ilike ${'%' + busca + '%'} or c.fornecedor ilike ${'%' + busca + '%'} or c.numero_documento = ${busca} or c.id::text = ${busca})` : sql``}
    order by ${situacao === 'pagas' ? sql`p.paga_em desc, p.id desc` : sql`p.vencimento, p.id`}
    limit 500`

  const soma = (ls: Linha[]) => ls.reduce((t, l) => t + l.valor, 0)
  const abertas = linhas.filter((l) => !l.pagaEm)
  const vencidas = abertas.filter((l) => l.vencimento < hoje)
  const filtros = { obra: obraId || '', fornecedor: fornecedorId || '', situacao, origem, natureza, de, ate, busca }
  const href = (muda: Record<string, string | number>) => {
    const p = new URLSearchParams()
    for (const [k, v] of Object.entries({ ...filtros, ...muda })) if (v) p.set(k, String(v))
    return `/financeiro/pagar?${p}`
  }
  const temFiltro = !!(obraId || fornecedorId || origem || natureza || de || ate || busca || situacao !== 'abertas')
  const campo = 'h-10 rounded-full border border-transparent bg-surface-2 px-4 text-[13px] font-medium outline-none focus:border-ink focus:bg-surface'

  return (
    <>
      <CabecalhoTela
        contexto={`${linhas.length} ${linhas.length === 1 ? 'parcela' : 'parcelas'}${temFiltro ? ' no filtro' : ''}${linhas.length === 500 ? ' (mostrando as 500 primeiras)' : ''}`}
        titulo="Contas a pagar"
        acoes={
          <BotaoLink href="/financeiro/pagar/novo" variante="primario">
            + Novo documento a pagar
          </BotaoLink>
        }
      />

      <section className="grid gap-4 sm:grid-cols-3">
        <Kpi tom="escuro" rotulo="Em aberto no filtro" valor={<Dinheiro valor={soma(abertas)} />} detalhe={`${abertas.length} ${abertas.length === 1 ? 'parcela' : 'parcelas'}`} corDetalhe="acento" />
        <Kpi tom="aviso" rotulo="Vencidas" valor={<Dinheiro valor={soma(vencidas)} />} detalhe={`${vencidas.length} sem pagamento`} corDetalhe="aviso" />
        <Kpi rotulo="Pagas no filtro" valor={<Dinheiro valor={soma(linhas.filter((l) => l.pagaEm))} />} detalhe={`${linhas.length - abertas.length} pagas`} />
      </section>

      <Cartao as="div" className="flex flex-col gap-3 p-3.5!">
        <form className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="situacao" value={situacao} />
          {origem && <input type="hidden" name="origem" value={origem} />}
          {natureza && <input type="hidden" name="natureza" value={natureza} />}
          <SeletorPilula aria-label="Obra" name="obra" defaultValue={obraId || ''} ativo={!!obraId}>
            <option value="">Todas as obras</option>
            {obras.map((o) => (
              <option key={o.id} value={o.id}>
                {o.nome}
              </option>
            ))}
          </SeletorPilula>
          <SeletorPilula aria-label="Fornecedor" name="fornecedor" defaultValue={fornecedorId || ''} ativo={!!fornecedorId}>
            <option value="">Todos os fornecedores</option>
            {fornecedores.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </SeletorPilula>
          <label className="flex items-center gap-1.5 text-label font-semibold text-ink-3">
            Vencimento de
            <input name="de" type="date" defaultValue={de} className={campo} />
          </label>
          <label className="flex items-center gap-1.5 text-label font-semibold text-ink-3">
            até
            <input name="ate" type="date" defaultValue={ate} className={campo} />
          </label>
          <input name="busca" type="search" aria-label="Buscar" defaultValue={busca} placeholder="Descrição, fornecedor ou nº do documento" className={`${campo} min-w-56 flex-1`} />
          <button className="h-10 rounded-full bg-ink px-[18px] text-[13px] font-semibold text-on-ink hover:bg-ink-2">Filtrar</button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label font-semibold text-ink-3">Situação</span>
          {SITUACOES.map(([k, t]) => (
            <ChipOpcao key={k} href={href({ situacao: k })} ativo={situacao === k}>
              {t}
            </ChipOpcao>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label font-semibold text-ink-3">Origem</span>
          {ORIGENS.map(([k, t]) => (
            <ChipOpcao key={k} href={href({ origem: k })} ativo={origem === k}>
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
            <Link href="/financeiro/pagar" className="ml-1 text-label font-semibold text-ink-2 underline">
              Limpar filtros
            </Link>
          )}
        </div>
      </Cartao>

      <Cartao className="pt-2!">
        {linhas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma conta a pagar no filtro" acao={temFiltro ? <BotaoLink href="/financeiro/pagar">Limpar filtros</BotaoLink> : undefined}>
            {temFiltro ? 'Tente outra situação ou período.' : 'Lance impostos, aluguéis e notas em Novo documento a pagar. As compras aprovadas das obras aparecem aqui sozinhas.'}
          </EstadoVazio>
        ) : (
          <Tabela minimo={980}>
            <thead>
              <tr>
                <Th>Vencimento</Th>
                <Th>Documento</Th>
                <Th>Fornecedor</Th>
                <Th>Obra · descrição</Th>
                <Th>Parcela</Th>
                <Th num>Valor</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <Tr key={l.id}>
                  <Td className={`whitespace-nowrap font-semibold ${!l.pagaEm && l.vencimento < hoje ? 'text-neg' : ''}`}>{dataBR(l.vencimento)}</Td>
                  <Td>
                    <Link href={`/compras/${l.compraId}`} className="font-bold">
                      Nº {l.compraId}
                    </Link>
                    <span className="block text-caption text-ink-3">
                      {l.origem === 'financeiro' ? `${l.tipoDocumento ? TIPOS_DOCUMENTO[l.tipoDocumento] : 'Documento'}${l.numeroDocumento ? ` ${l.numeroDocumento}` : ''}` : 'Compra da obra'}
                      {l.natureza !== 'provisao' && ` · ${NATUREZAS[l.natureza][0]}`}
                    </span>
                  </Td>
                  <Td>{l.fornecedor}</Td>
                  <Td className="max-w-xs">
                    <span className="block">{l.obra}</span>
                    <span className="block truncate text-caption text-ink-3" title={l.descricao}>
                      {l.descricao}
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap">
                    {l.numero}/{l.total}
                    {l.saldoDe && <span className="block text-caption text-ink-3">restante da {l.saldoDe}ª</span>}
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={l.valor} />
                  </Td>
                  <Td>
                    {l.pagaEm ? (
                      <Etiqueta tom="paga">Paga em {dataBR(l.pagaEm)}</Etiqueta>
                    ) : l.vencimento < hoje ? (
                      <Etiqueta tom="neg">Vencida</Etiqueta>
                    ) : l.vencimento === hoje ? (
                      <Etiqueta tom="aviso">Vence hoje</Etiqueta>
                    ) : (
                      <Etiqueta>Em aberto</Etiqueta>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr aria-hidden className="h-2" />
              <LinhaTotal>
                <td colSpan={5} className="px-2">
                  Total · {linhas.length} {linhas.length === 1 ? 'parcela' : 'parcelas'}
                </td>
                <td className="px-2 text-right">
                  <Dinheiro valor={soma(linhas)} />
                </td>
                <td />
              </LinhaTotal>
            </tfoot>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
