import Link from 'next/link'
import { BotaoLink, CabecalhoTela, EstadoVazio, Secao, Situacao, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { dataBR } from '@/lib/regras'

export default async function Cotacoes({ searchParams }: PageProps<'/cotacoes'>) {
  const s = await exigirSessao()
  const obraId = s.perfil === 'obra' ? s.obraId! : Number((await searchParams).obra) || 0
  const abre = s.perfil === 'obra' || s.perfil === 'compras' // engenheiro e setor de compras abrem cotações
  const cotacoes = await sql<{ id: number; obra: string; titulo: string; situacao: string; prazo: string; respostas: number; fornecedores: number; criadaEm: Date }[]>`
    select c.id, o.nome as obra, c.titulo, c.situacao, c.prazo_resposta as prazo, c.criada_em as "criadaEm",
      (select count(*) from cotacao_fornecedores cf where cf.cotacao_id = c.id)::int as fornecedores,
      (select count(distinct cf.id) from cotacao_fornecedores cf join cotacao_precos cp on cp.cotacao_fornecedor_id = cf.id
        where cf.cotacao_id = c.id)::int as respostas
    from cotacoes c join obras o on o.id = c.obra_id
    ${obraId ? sql`where c.obra_id = ${obraId}` : sql``}
    order by c.id desc limit 200`
  const abertas = cotacoes.filter((c) => c.situacao === 'aguardando').length

  return (
    <>
      <CabecalhoTela
        contexto={abertas ? `${abertas} ${abertas === 1 ? 'cotação aberta' : 'cotações abertas'}` : 'Preços pedidos pela IA aos fornecedores'}
        titulo="Cotações"
        acoes={
          abre && (
            <BotaoLink href="/cotacoes/nova" variante="primario">
              Nova cotação
            </BotaoLink>
          )
        }
      >
        <p className="max-w-3xl text-table text-ink-2">
          A IA pede os preços aos fornecedores pelo WhatsApp, preenche a tabela e indica a opção mais viável. Quem decide é o engenheiro ou o setor de compras, e a
          escolha vira compra no fluxo de aprovação.
        </p>
      </CabecalhoTela>
      <Secao titulo="Todas as cotações">
        {cotacoes.length === 0 ? (
          <EstadoVazio
            titulo="Nenhuma cotação ainda"
            acao={
              abre && (
                <BotaoLink href="/cotacoes/nova" variante="primario">
                  Nova cotação
                </BotaoLink>
              )
            }
          >
            {abre ? 'Peça preços de vários fornecedores de uma vez.' : 'O engenheiro e o setor de compras abrem as cotações.'}
          </EstadoVazio>
        ) : (
          <Tabela minimo={720}>
            <thead>
              <tr>
                <Th>Nº</Th>
                {s.perfil !== 'obra' && <Th>Obra</Th>}
                <Th>Cotação</Th>
                <Th>Responder até</Th>
                <Th num>Respostas</Th>
                <Th>Situação</Th>
              </tr>
            </thead>
            <tbody>
              {cotacoes.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <Link href={`/cotacoes/${c.id}`} className="font-bold">
                      CT-{String(c.id).padStart(4, '0')}
                    </Link>
                  </Td>
                  {s.perfil !== 'obra' && <Td className="text-ink-2">{c.obra}</Td>}
                  <Td className="font-semibold">{c.titulo}</Td>
                  <Td className="text-ink-2">{dataBR(c.prazo)}</Td>
                  <Td num>
                    {c.respostas} de {c.fornecedores}
                  </Td>
                  <Td>
                    <Situacao status={`cot_${c.situacao}`} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>
    </>
  )
}
