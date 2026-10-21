import Link from 'next/link'
import { BotaoLink, CabecalhoTela, Cartao, ChipOpcao, Dinheiro, EstadoVazio, LinhaTotal, SeletorPilula, Situacao, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'

const STATUS = [
  ['', 'Todas'],
  ['aguardando_financeiro', 'Aguardando financeiro'],
  ['aguardando_chefe', 'Aguardando dono'],
  ['aprovada', 'Aprovadas (a pagar)'],
  ['paga', 'Pagas'],
  ['recusada', 'Recusadas'],
  ['cancelada', 'Canceladas'],
]

export default async function Compras({ searchParams }: PageProps<'/compras'>) {
  const s = await exigirSessao()
  const q = await searchParams
  const obraId = s.perfil === 'obra' ? s.obraId! : Number(q.obra) || 0
  const status = typeof q.status === 'string' && STATUS.some(([v]) => v === q.status) ? q.status : ''
  const busca = typeof q.busca === 'string' ? q.busca.trim() : ''

  const obras = s.perfil === 'obra' ? [] : await sql<{ id: number; nome: string }[]>`select id, nome from obras order by nome`
  const compras = await sql<
    { id: number; criadaEm: Date; obra: string; etapa: string; subetapa: string; fornecedor: string; descricao: string; valor: number; status: string }[]
  >`
    select id, criada_em as "criadaEm", obra, etapa, subetapa, fornecedor, descricao, valor, status
    from v_compras
    where true ${obraId ? sql`and obra_id = ${obraId}` : sql``} ${status ? sql`and status = ${status}` : sql``}
    order by id desc
    limit 300`

  // Busca sobre o que já veio do banco (as 300 mais recentes do filtro).
  const termo = busca.toLocaleLowerCase('pt-BR')
  const linhas = termo
    ? compras.filter((c) => String(c.id) === termo || `${c.descricao} ${c.fornecedor}`.toLocaleLowerCase('pt-BR').includes(termo))
    : compras
  const total = linhas.reduce((t, c) => t + c.valor, 0)
  const href = (muda: Record<string, string | number>) => {
    const p = new URLSearchParams()
    const tudo: Record<string, string | number> = { obra: s.perfil === 'obra' ? '' : obraId || '', status, busca, ...muda }
    for (const [k, v] of Object.entries(tudo)) if (v) p.set(k, String(v))
    const t = p.toString()
    return t ? `/compras?${t}` : '/compras'
  }
  const temFiltro = !!(status || busca || (s.perfil !== 'obra' && obraId))
  const comObra = s.perfil !== 'obra'

  return (
    <>
      <CabecalhoTela
        contexto={`${linhas.length} ${linhas.length === 1 ? 'compra' : 'compras'}${temFiltro ? ' no filtro' : ''}`}
        titulo="Compras"
        acoes={
          s.perfil === 'obra' && (
            <BotaoLink href="/compras/nova" variante="primario">
              + Nova compra
            </BotaoLink>
          )
        }
      />

      <Cartao as="div" className="flex flex-col gap-3 p-3.5!">
        <form className="flex flex-wrap items-center gap-2">
          {comObra && (
            <>
              <label className="sr-only" htmlFor="obra-compras">
                Obra
              </label>
              <SeletorPilula id="obra-compras" name="obra" defaultValue={obraId || ''} ativo={!!obraId}>
                <option value="">Todas as obras</option>
                {obras.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nome}
                  </option>
                ))}
              </SeletorPilula>
            </>
          )}
          {status && <input type="hidden" name="status" value={status} />}
          <label className="sr-only" htmlFor="busca-compras">
            Buscar
          </label>
          <input
            id="busca-compras"
            name="busca"
            type="search"
            defaultValue={busca}
            placeholder="Buscar item, fornecedor ou nº"
            className="h-10 min-w-56 flex-1 rounded-full border border-transparent bg-surface-2 px-4 text-[13px] font-medium outline-none focus:border-ink focus:bg-surface"
          />
          <button className="h-10 rounded-full bg-surface-2 px-4 text-[13px] font-semibold hover:bg-surface-3">Filtrar</button>
        </form>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-label font-semibold text-ink-3">Situação</span>
          {STATUS.map(([v, t]) => (
            <ChipOpcao key={v} href={href({ status: v })} ativo={status === v}>
              {t}
            </ChipOpcao>
          ))}
          {temFiltro && (
            <Link href="/compras" className="ml-1 text-label font-semibold text-ink-2 underline">
              Limpar filtros
            </Link>
          )}
        </div>
      </Cartao>

      <Cartao className="pt-2!">
        {linhas.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma compra encontrada"
            acao={
              temFiltro ? (
                <BotaoLink href="/compras">Limpar filtros</BotaoLink>
              ) : (
                s.perfil === 'obra' && (
                  <BotaoLink href="/compras/nova" variante="primario">
                    Nova compra
                  </BotaoLink>
                )
              )
            }
          >
            {temFiltro ? 'Nenhum resultado para os filtros atuais. Tente outra situação ou busca.' : s.perfil === 'obra' ? 'Use Nova compra para registrar a primeira.' : undefined}
          </EstadoVazio>
        ) : (
          <Tabela minimo={900}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Item</Th>
                <Th>{comObra ? 'Obra · etapa' : 'Etapa'}</Th>
                <Th>Fornecedor</Th>
                <Th>Data</Th>
                <Th num>Valor</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/compras/${c.id}`} className="font-bold">
                      {c.id}
                    </Link>
                  </Td>
                  <Td className="max-w-xs">
                    <span className="block truncate font-semibold" title={c.descricao}>
                      {c.descricao}
                    </span>
                  </Td>
                  <Td>
                    {comObra && <span className="block">{c.obra}</span>}
                    <span className={comObra ? 'block text-caption text-ink-3' : ''}>
                      {c.etapa} <span className="text-ink-3">/ {c.subetapa}</span>
                    </span>
                  </Td>
                  <Td>{c.fornecedor}</Td>
                  <Td className="whitespace-nowrap text-ink-2">{c.criadaEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</Td>
                  <Td num forte>
                    <Dinheiro valor={c.valor} />
                  </Td>
                  <Td>
                    <Situacao status={c.status} />
                  </Td>
                </Tr>
              ))}
            </tbody>
            <tfoot>
              <tr aria-hidden className="h-2" />
              <LinhaTotal>
                <td colSpan={5} className="px-2">
                  Total · {linhas.length} {linhas.length === 1 ? 'compra' : 'compras'}
                </td>
                <td className="px-2 text-right">
                  <Dinheiro valor={total} />
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
