import { notFound } from 'next/navigation'
import { CabecalhoTela, EstadoVazio, Etiqueta, FormAcao, Secao, Tabela, Td, Th, Tr } from '@ds'
import { sqlSistema } from '@/lib/db'
import { ehAdministrador, exigirSessao } from '@/lib/sessao'
import { quando } from '@/lib/historico'
import { LinkDeAcesso } from '@/components/link-de-acesso'
import { alternarEmpresa, linkDoDono } from './acoes'

// Painel de quem vende o sistema: todas as construtoras. Usa a conexão do sistema (cruza empresas).
export default async function Admin() {
  const s = await exigirSessao()
  if (!ehAdministrador(s)) notFound()
  const empresas = await sqlSistema<
    { id: number; nome: string; ativa: boolean; criadaEm: Date; donos: string | null; pessoas: number; obras: number; ultimoAcesso: Date | null }[]
  >`
    select e.id, c.nome_empresa as nome, e.ativa, e.criada_em as "criadaEm",
      (select string_agg(u.nome || ' (' || u.email || ')', ', ') from usuarios u where u.empresa_id = e.id and u.perfil = 'chefe' and u.ativo) as donos,
      (select count(*) from usuarios u where u.empresa_id = e.id and u.ativo)::int as pessoas,
      (select count(*) from obras o where o.empresa_id = e.id and o.ativa)::int as obras,
      (select max(u.ultimo_acesso_em) from usuarios u where u.empresa_id = e.id) as "ultimoAcesso"
    from empresas e join config c on c.empresa_id = e.id
    order by e.criada_em desc`

  return (
    <>
      <CabecalhoTela contexto="Administração do sistema" titulo="Construtoras">
        <p className="max-w-3xl text-table text-ink-2">
          Todas as construtoras cadastradas. Bloquear tira todo mundo da construtora na hora; os dados ficam guardados e voltam ao liberar.
        </p>
      </CabecalhoTela>
      <Secao titulo={`${empresas.length} ${empresas.length === 1 ? 'construtora' : 'construtoras'}`}>
        {empresas.length === 0 ? (
          <EstadoVazio titulo="Nenhuma construtora ainda" />
        ) : (
          <Tabela minimo={900}>
            <thead>
              <tr>
                <Th>Construtora</Th>
                <Th>Dono</Th>
                <Th num>Pessoas</Th>
                <Th num>Obras ativas</Th>
                <Th>Último acesso</Th>
                <Th>Situação</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {empresas.map((e) => (
                <Tr key={e.id}>
                  <Td>
                    <span className="block font-semibold">{e.nome}</span>
                    <span className="block text-caption text-ink-3">desde {quando(e.criadaEm)}</span>
                  </Td>
                  <Td className="text-ink-2">
                    {e.donos ?? '—'}
                    {e.donos && e.id !== s.empresaId && (
                      <LinkDeAcesso action={linkDoDono.bind(null, e.id)} botao="Link de acesso do dono" variante="fantasma" tamanho="sm" className="mt-1 flex flex-col gap-2" />
                    )}
                  </Td>
                  <Td num>{e.pessoas}</Td>
                  <Td num>{e.obras}</Td>
                  <Td className="text-ink-2">{e.ultimoAcesso ? quando(e.ultimoAcesso) : 'nunca'}</Td>
                  <Td>{e.ativa ? <Etiqueta tom="ok">Liberada</Etiqueta> : <Etiqueta tom="neg">Bloqueada</Etiqueta>}</Td>
                  <Td className="text-right">
                    {e.id !== s.empresaId && (
                      <FormAcao
                        action={alternarEmpresa.bind(null, e.id)}
                        botao={e.ativa ? 'Bloquear' : 'Liberar'}
                        variante={e.ativa ? 'perigo' : 'secundario'}
                        tamanho="sm"
                        className="flex items-center justify-end gap-2"
                      />
                    )}
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
