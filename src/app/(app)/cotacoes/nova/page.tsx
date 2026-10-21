import { sql, hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { somarDias } from '@/lib/regras'
import { FormAcao } from '@/components/form-acao'
import { Secao, Vazio } from '@/components/ui'
import { criarCotacao } from '../acoes'
import { ItensLivres } from './itens-livres'

const qtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

export default async function NovaCotacao() {
  const s = await exigirSessao('obra')
  const obraId = s.obraId!
  const [itens, subetapas, fornecedores, dia] = await Promise.all([
    sql<{ chave: string; descricao: string; unidade: string; quantidade: number; etapa: string; subetapa: string }[]>`
      select i.chave, i.descricao, i.unidade, i.quantidade, e.nome as etapa, s.nome as subetapa
      from orcamento_itens i join v_orcamento_vigente o on o.id = i.orcamento_id
      join subetapas s on s.id = i.subetapa_id join etapas e on e.id = s.etapa_id
      where o.obra_id = ${obraId} and i.tipo <> 'mao_de_obra'
      order by e.ordem, e.id, s.ordem, s.id, i.id`,
    sql<{ id: number; nome: string; etapa: string }[]>`
      select s.id, s.nome, e.nome as etapa from subetapas s join etapas e on e.id = s.etapa_id
      where e.obra_id = ${obraId} order by e.ordem, e.id, s.ordem, s.id`,
    // Sugeridos: quem já vendeu para esta obra aparece primeiro.
    sql<{ id: number; nome: string; whatsapp: string | null; vendas: number }[]>`
      select f.id, f.nome, f.whatsapp, (select count(*) from compras c where c.fornecedor_id = f.id and c.obra_id = ${obraId})::int as vendas
      from fornecedores f order by vendas desc, f.nome`,
    hoje(),
  ])

  return (
    <div className="grid max-w-4xl gap-4">
      <h1>Nova cotação</h1>
      <FormAcao action={criarCotacao} botao="Criar cotação" principal className="grid gap-5">
        <section className="cartao grid gap-3 sm:grid-cols-[1fr_12rem]">
          <label>
            <span className="rotulo">Nome da cotação</span>
            <input name="titulo" required placeholder="Ex.: Concreto e aço da fundação" className="campo" />
          </label>
          <label>
            <span className="rotulo">Fornecedores respondem até</span>
            <input name="prazo_resposta" type="date" required min={dia} defaultValue={somarDias(dia, 2)} className="campo" />
          </label>
        </section>

        <Secao titulo="O que cotar">
          {itens.length === 0 ? (
            <Vazio>O orçamento desta obra não tem itens de material ou equipamento. Inclua itens fora do orçamento abaixo.</Vazio>
          ) : (
            <div className="grid gap-1">
              {itens.map((i) => (
                <div key={i.chave} className="grid items-center gap-2 border-b border-linha py-2 sm:grid-cols-[1.5rem_1fr_8rem]">
                  <input type="checkbox" name="item" value={i.chave} id={`i${i.chave}`} className="size-4" />
                  <label htmlFor={`i${i.chave}`}>
                    {i.descricao}{' '}
                    <span className="text-sm text-cinza">
                      ({i.etapa} / {i.subetapa}, orçado {qtd(i.quantidade)} {i.unidade})
                    </span>
                  </label>
                  <label className="flex items-center gap-1 text-sm">
                    <span className="sr-only">Quantidade de {i.descricao}</span>
                    <input name={`qtd_${i.chave}`} type="number" min="0.001" step="0.001" defaultValue={i.quantidade} className="campo" />
                    {i.unidade}
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4">
            <ItensLivres subetapas={subetapas} />
          </div>
        </Secao>

        <Secao titulo="Para quem pedir preço">
          <div className="grid gap-1 sm:grid-cols-2">
            {fornecedores.map((f) => (
              <label key={f.id} className="flex items-center gap-2 py-1">
                <input type="checkbox" name="fornecedor" value={f.id} defaultChecked={f.vendas > 0} className="size-4" />
                <span>
                  {f.nome}
                  <span className="text-sm text-cinza">
                    {f.vendas > 0 && ', já vendeu para esta obra'}
                    {!f.whatsapp && ', sem WhatsApp'}
                  </span>
                </span>
              </label>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label>
              <span className="rotulo">Novo fornecedor (opcional)</span>
              <input name="novo_nome" className="campo" />
            </label>
            <label>
              <span className="rotulo">WhatsApp dele</span>
              <input name="novo_whatsapp" type="tel" placeholder="(11) 99999-8888" className="campo" />
            </label>
          </div>
        </Secao>
      </FormAcao>
    </div>
  )
}
