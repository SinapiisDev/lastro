import Link from 'next/link'
import { BotaoLink, CabecalhoTela, Cartao, Dinheiro, EstadoVazio, SeletorPilula, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, podeContratar } from '@/lib/sessao'

export default async function Contratos({ searchParams }: PageProps<'/contratos'>) {
  const s = await exigirSessao()
  const q = await searchParams
  const obraId = s.perfil === 'obra' ? s.obraId! : Number(q.obra) || 0
  const comObra = s.perfil !== 'obra'

  const [obras, contratos] = await Promise.all([
    comObra ? sql<{ id: number; nome: string }[]>`select id, nome from obras order by nome` : [],
    sql<{ id: number; objeto: string; obra: string; fornecedor: string; inicio: string; contratado: number; medido: number; medicoes: number }[]>`
      select c.id, c.objeto, o.nome as obra, f.nome as fornecedor, c.inicio,
        coalesce((select sum(round(i.quantidade * i.preco_unitario, 2)) from contrato_itens i where i.contrato_id = c.id), 0) as contratado,
        coalesce((select sum(mi.valor) from medicao_itens mi join medicoes m on m.id = mi.medicao_id join compras cp on cp.id = m.compra_id
                   where m.contrato_id = c.id and cp.situacao <> 'cancelada'), 0) as medido,
        (select count(*) from medicoes m where m.contrato_id = c.id)::int as medicoes
      from contratos c join obras o on o.id = c.obra_id join fornecedores f on f.id = c.fornecedor_id
      where true ${obraId ? sql`and c.obra_id = ${obraId}` : sql``}
      order by c.id desc`,
  ])

  return (
    <>
      <CabecalhoTela
        contexto={`${contratos.length} ${contratos.length === 1 ? 'contrato' : 'contratos'}`}
        titulo="Contratos"
        acoes={
          podeContratar(s) && (
            <BotaoLink href={obraId && comObra ? `/contratos/novo?obra=${obraId}` : '/contratos/novo'} variante="primario">
              + Novo contrato
            </BotaoLink>
          )
        }
      />

      {comObra && (
        <Cartao as="div" className="p-3.5!">
          <form className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="obra-contratos">
              Obra
            </label>
            <SeletorPilula id="obra-contratos" name="obra" defaultValue={obraId || ''} ativo={!!obraId}>
              <option value="">Todas as obras</option>
              {obras.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.nome}
                </option>
              ))}
            </SeletorPilula>
            <button className="h-10 rounded-full bg-surface-2 px-4 text-[13px] font-semibold hover:bg-surface-3">Filtrar</button>
          </form>
        </Cartao>
      )}

      <Cartao className="pt-2!">
        {contratos.length === 0 ? (
          <EstadoVazio titulo="Nenhum contrato ainda">
            {podeContratar(s) ? 'Use Novo contrato para registrar uma empreitada e lançar as medições dela.' : 'Os contratos de empreitada das obras aparecem aqui.'}
          </EstadoVazio>
        ) : (
          <Tabela minimo={860}>
            <thead>
              <tr>
                <Th>Nº</Th>
                <Th>Objeto</Th>
                {comObra && <Th>Obra</Th>}
                <Th>Empreiteiro</Th>
                <Th num>Contratado</Th>
                <Th num>Medido</Th>
                <Th num>Saldo</Th>
              </tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/contratos/${c.id}`} className="font-bold">
                      {c.id}
                    </Link>
                  </Td>
                  <Td className="max-w-xs">
                    <Link href={`/contratos/${c.id}`} className="block truncate font-semibold no-underline" title={c.objeto}>
                      {c.objeto}
                    </Link>
                    <span className="block text-caption text-ink-3">
                      {c.medicoes} {c.medicoes === 1 ? 'medição' : 'medições'}
                    </span>
                  </Td>
                  {comObra && <Td>{c.obra}</Td>}
                  <Td>{c.fornecedor}</Td>
                  <Td num>
                    <Dinheiro valor={c.contratado} />
                  </Td>
                  <Td num>
                    <Dinheiro valor={c.medido} />
                    <span className="block text-caption text-ink-3">{c.contratado > 0 ? Math.round((c.medido / c.contratado) * 100) : 0}%</span>
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={c.contratado - c.medido} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Cartao>
    </>
  )
}
