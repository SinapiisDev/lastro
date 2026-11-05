import Link from 'next/link'
import { BarraEtapa, CabecalhoTela, Dinheiro, EstadoVazio, Etiqueta, FormAcao, Secao, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { CamposObra } from '@/components/campos-obra'
import { SITUACOES_OBRA } from '@/components/rotulos'
import { criarObra } from './acoes'

const codigo = (id: number) => `OB-${String(id).padStart(3, '0')}`

export default async function Obras() {
  await exigirSessao('chefe', 'financeiro')
  const obras = await sql<
    { id: number; nome: string; investidor: string | null; cidade: string | null; situacao: string; ativa: boolean; previsto: number; gasto: number; progresso: number }[]
  >`
    select o.id, o.nome, o.investidor, o.cidade, o.situacao, o.ativa,
      coalesce((select sum(p.previsto) from v_previsto p join subetapas s on s.id = p.subetapa_id
                join etapas e on e.id = s.etapa_id where e.obra_id = o.id), 0) as previsto,
      coalesce((select sum(valor) from v_compras c where c.obra_id = o.id and c.situacao = 'aprovada'), 0) as gasto,
      coalesce((select round(avg(p)) from (
        select avg(s.progresso) as p from etapas e join subetapas s on s.etapa_id = e.id
        where e.obra_id = o.id group by e.id) x), 0)::int as progresso
    from obras o
    order by o.ativa desc, o.nome`
  const ativas = obras.filter((o) => o.ativa).length

  return (
    <>
      <CabecalhoTela contexto={`${ativas} ${ativas === 1 ? 'obra ativa' : 'obras ativas'}`} titulo="Obras" />
      <Secao titulo="Todas as obras">
        {obras.length === 0 ? (
          <EstadoVazio titulo="Nenhuma obra ainda">Cadastre a primeira logo abaixo; ela já começa com a lista padrão de etapas.</EstadoVazio>
        ) : (
          <Tabela minimo={760}>
            <thead>
              <tr>
                <Th>Obra</Th>
                <Th className="w-[34%]">Serviço feito</Th>
                <Th num>Gasto</Th>
                <Th num>Previsto</Th>
              </tr>
            </thead>
            <tbody>
              {obras.map((o) => (
                <Tr key={o.id}>
                  <Td>
                    <Link href={`/obras/${o.id}`} className="flex flex-col gap-0.5 no-underline">
                      <span className="flex flex-wrap items-center gap-2 font-semibold">
                        <span>
                          <span className="text-ink-3">{codigo(o.id)}</span> · {o.nome}
                        </span>
                        <Etiqueta tom={SITUACOES_OBRA[o.situacao][1]}>{SITUACOES_OBRA[o.situacao][0]}</Etiqueta>
                      </span>
                      {(o.investidor || o.cidade) && <span className="text-caption text-ink-3">{[o.investidor, o.cidade].filter(Boolean).join(' · ')}</span>}
                    </Link>
                  </Td>
                  <Td>
                    <BarraEtapa feito={o.progresso} gastoPct={o.previsto > 0 ? (o.gasto / o.previsto) * 100 : undefined} />
                  </Td>
                  <Td num forte>
                    <Dinheiro valor={o.gasto} />
                  </Td>
                  <Td num className="text-ink-2">
                    <Dinheiro valor={o.previsto} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>

      <Secao titulo="Cadastrar obra">
        <p className="text-table text-ink-3">A obra começa com a lista padrão de etapas, que pode ser ajustada depois. Para o engenheiro enxergar a obra, ligue a conta dele em Configurações › Pessoas.</p>
        <FormAcao action={criarObra} botao="Cadastrar obra" variante="primario" className="grid gap-3.5 sm:max-w-3xl sm:grid-cols-2">
          <CamposObra />
        </FormAcao>
      </Secao>
    </>
  )
}
