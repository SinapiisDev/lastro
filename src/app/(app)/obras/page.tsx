import Link from 'next/link'
import { BarraEtapa, CabecalhoTela, Campo, Dinheiro, Entrada, EstadoVazio, FormAcao, Secao, Tabela, Td, Th, Tr } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { criarObra } from './acoes'

const codigo = (id: number) => `OB-${String(id).padStart(3, '0')}`

export default async function Obras() {
  await exigirSessao('chefe', 'financeiro')
  const obras = await sql<{ id: number; nome: string; endereco: string | null; ativa: boolean; previsto: number; gasto: number; progresso: number }[]>`
    select o.id, o.nome, o.endereco, o.ativa,
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
                      <span className="font-semibold">
                        <span className="text-ink-3">{codigo(o.id)}</span> · {o.nome}
                        {!o.ativa && <span className="font-medium text-ink-3"> (encerrada)</span>}
                      </span>
                      {o.endereco && <span className="text-caption text-ink-3">{o.endereco}</span>}
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
        <p className="text-table text-ink-3">A obra começa com a lista padrão de etapas, que pode ser ajustada depois. A senha é a que o engenheiro usa para entrar.</p>
        <FormAcao action={criarObra} botao="Cadastrar obra" variante="primario" className="grid gap-3.5 sm:max-w-xl">
          <Campo rotulo="Nome da obra">
            <Entrada name="nome" required />
          </Campo>
          <Campo rotulo="Endereço">
            <Entrada name="endereco" />
          </Campo>
          <Campo rotulo="Senha de acesso da obra" ajuda="Mínimo de 8 caracteres.">
            <Entrada name="senha" type="password" minLength={8} required autoComplete="new-password" />
          </Campo>
        </FormAcao>
      </Secao>
    </>
  )
}
