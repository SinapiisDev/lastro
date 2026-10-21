import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl } from '@/lib/regras'
import { Situacao, Vazio, Rolagem } from '@/components/ui'

const STATUS = [
  ['', 'Todas'],
  ['aguardando_financeiro', 'Aguardando financeiro'],
  ['aguardando_chefe', 'Aguardando chefe'],
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

  const obras = s.perfil === 'obra' ? [] : await sql<{ id: number; nome: string }[]>`select id, nome from obras order by nome`
  const compras = await sql<
    { id: number; criadaEm: Date; obra: string; etapa: string; subetapa: string; fornecedor: string; descricao: string; valor: number; status: string }[]
  >`
    select id, criada_em as "criadaEm", obra, etapa, subetapa, fornecedor, descricao, valor, status
    from v_compras
    where true ${obraId ? sql`and obra_id = ${obraId}` : sql``} ${status ? sql`and status = ${status}` : sql``}
    order by id desc
    limit 300`

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1>Compras</h1>
        {s.perfil === 'obra' && (
          <Link href="/compras/nova" className="btn btn-principal">
            Nova compra
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-2">
        {s.perfil !== 'obra' && (
          <label>
            <span className="rotulo">Obra</span>
            <select name="obra" defaultValue={obraId || ''} className="campo">
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          <span className="rotulo">Situação</span>
          <select name="status" defaultValue={status} className="campo">
            {STATUS.map(([v, t]) => (
              <option key={v} value={v}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <button className="btn">Filtrar</button>
      </form>

      <section className="cartao">
        {compras.length === 0 ? (
          <Vazio>
            Nenhuma compra encontrada.{s.perfil === 'obra' && ' Use Nova compra para registrar a primeira.'}
          </Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Data</th>
                  {s.perfil !== 'obra' && <th>Obra</th>}
                  <th>Etapa</th>
                  <th>Fornecedor</th>
                  <th>Descrição</th>
                  <th className="num">Valor</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {compras.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link href={`/compras/${c.id}`} className="font-medium underline">
                        {c.id}
                      </Link>
                    </td>
                    <td>{c.criadaEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</td>
                    {s.perfil !== 'obra' && <td>{c.obra}</td>}
                    <td>
                      {c.etapa} <span className="text-cinza">/ {c.subetapa}</span>
                    </td>
                    <td>{c.fornecedor}</td>
                    <td className="max-w-xs truncate" title={c.descricao}>
                      {c.descricao}
                    </td>
                    <td className="num">{brl(c.valor)}</td>
                    <td>
                      <Situacao status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </section>
    </div>
  )
}
