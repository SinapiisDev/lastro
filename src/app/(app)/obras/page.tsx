import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { brl } from '@/lib/regras'
import { FormAcao } from '@/components/form-acao'
import { Secao, Trena, Vazio, Rolagem } from '@/components/ui'
import { criarObra } from './acoes'

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

  return (
    <div className="grid gap-6">
      <h1>Obras</h1>
      <Secao titulo="Todas as obras">
        {obras.length === 0 ? (
          <Vazio>Nenhuma obra ainda. Cadastre a primeira logo abaixo.</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Obra</th>
                  <th className="w-1/3">Serviço feito</th>
                  <th className="num">Gasto</th>
                  <th className="num">Previsto</th>
                </tr>
              </thead>
              <tbody>
                {obras.map((o) => (
                  <tr key={o.id}>
                    <td>
                      <Link href={`/obras/${o.id}`} className="font-medium underline">
                        {o.nome}
                      </Link>
                      {!o.ativa && <span className="ml-2 text-sm text-cinza">(encerrada)</span>}
                      {o.endereco && <p className="text-sm text-cinza">{o.endereco}</p>}
                    </td>
                    <td>
                      <Trena pct={o.progresso} fina />
                    </td>
                    <td className="num">{brl(o.gasto)}</td>
                    <td className="num">{brl(o.previsto)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </Secao>

      <Secao titulo="Cadastrar obra">
        <p className="mb-3 text-sm text-cinza">
          A obra já começa com a lista padrão de etapas, que pode ser ajustada depois. A senha é a que o engenheiro usa para
          entrar.
        </p>
        <FormAcao action={criarObra} botao="Cadastrar obra" principal className="grid gap-3 sm:max-w-md">
          <label>
            <span className="rotulo">Nome da obra</span>
            <input name="nome" required className="campo" />
          </label>
          <label>
            <span className="rotulo">Endereço</span>
            <input name="endereco" className="campo" />
          </label>
          <label>
            <span className="rotulo">Senha de acesso da obra</span>
            <input name="senha" type="password" minLength={8} required className="campo" autoComplete="new-password" />
          </label>
        </FormAcao>
      </Secao>
    </div>
  )
}
