import { CabecalhoTela, Campo, Entrada, EstadoVazio, FormAcao, Marcacao, Secao } from '@ds'
import { sql, hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { somarDias } from '@/lib/regras'
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
    <>
      <CabecalhoTela contexto="Cotações" titulo="Nova cotação">
        <p className="max-w-2xl text-table text-ink-2">Escolha os itens e os fornecedores. A IA pede os preços pelo WhatsApp e monta a comparação.</p>
      </CabecalhoTela>
      <FormAcao action={criarCotacao} botao="Criar cotação" variante="primario" tamanho="lg" className="grid max-w-4xl gap-4">
        <Secao titulo="Identificação">
          <div className="grid gap-3.5 sm:grid-cols-[1fr_14rem]">
            <Campo rotulo="Nome da cotação">
              <Entrada name="titulo" required placeholder="Ex.: Concreto e aço da fundação" />
            </Campo>
            <Campo rotulo="Fornecedores respondem até">
              <Entrada name="prazo_resposta" type="date" required min={dia} defaultValue={somarDias(dia, 2)} />
            </Campo>
          </div>
        </Secao>

        <Secao titulo="O que cotar">
          {itens.length === 0 ? (
            <EstadoVazio titulo="Nada de material ou equipamento no orçamento" compacto>
              Inclua itens fora do orçamento logo abaixo.
            </EstadoVazio>
          ) : (
            <div className="flex flex-col">
              {itens.map((i) => (
                <div key={i.chave} className="grid items-center gap-2 border-b border-line py-2.5 sm:grid-cols-[1fr_11rem]">
                  <Marcacao
                    name="item"
                    value={i.chave}
                    rotulo={
                      <span className="flex flex-col">
                        <span className="font-semibold">{i.descricao}</span>
                        <span className="text-caption text-ink-3">
                          {i.etapa} / {i.subetapa} · orçado {qtd(i.quantidade)} {i.unidade}
                        </span>
                      </span>
                    }
                  />
                  <label className="flex items-center gap-2 text-label font-semibold text-ink-2">
                    <span className="sr-only">Quantidade de {i.descricao}</span>
                    <Entrada name={`qtd_${i.chave}`} type="number" min="0.001" step="0.001" defaultValue={i.quantidade} className="text-right" />
                    <span className="w-10 shrink-0">{i.unidade}</span>
                  </label>
                </div>
              ))}
            </div>
          )}
          <ItensLivres subetapas={subetapas} />
        </Secao>

        <Secao titulo="Para quem pedir preço">
          <div className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {fornecedores.map((f) => (
              <Marcacao
                key={f.id}
                name="fornecedor"
                value={f.id}
                defaultChecked={f.vendas > 0}
                rotulo={
                  <span className="flex flex-col">
                    <span className="font-semibold">{f.nome}</span>
                    {(f.vendas > 0 || !f.whatsapp) && (
                      <span className="text-caption text-ink-3">
                        {[f.vendas > 0 && 'já vendeu para esta obra', !f.whatsapp && 'sem WhatsApp'].filter(Boolean).join(' · ')}
                      </span>
                    )}
                  </span>
                }
              />
            ))}
          </div>
          <div className="grid gap-3.5 border-t border-line pt-4 sm:grid-cols-2">
            <Campo rotulo="Novo fornecedor (opcional)">
              <Entrada name="novo_nome" />
            </Campo>
            <Campo rotulo="WhatsApp dele">
              <Entrada name="novo_whatsapp" type="tel" placeholder="(11) 99999-8888" />
            </Campo>
          </div>
        </Secao>
      </FormAcao>
    </>
  )
}
