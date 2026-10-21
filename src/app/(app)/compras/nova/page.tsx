import { sql, lerConfig, hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { CabecalhoTela } from '@ds'
import { FormCompra, type Inicial, type ItemOrcado } from './form-compra'

export default async function NovaCompra({ searchParams }: PageProps<'/compras/nova'>) {
  const s = await exigirSessao('obra')
  const obraId = s.obraId!
  const de = Number((await searchParams).de) || 0

  const [subs, itens, fornecedores, config, dia] = await Promise.all([
    sql<{ id: number; nome: string; etapaId: number; etapa: string }[]>`
      select s.id, s.nome, e.id as "etapaId", e.nome as etapa from subetapas s join etapas e on e.id = s.etapa_id
      where e.obra_id = ${obraId} order by e.ordem, e.id, s.ordem, s.id`,
    // Itens do orçamento vigente com quanto já foi comprado (compras aprovadas) de cada um.
    sql<ItemOrcado[]>`
      select i.chave, i.subetapa_id as "subetapaId", i.descricao, i.unidade, i.quantidade,
        round(i.quantidade * i.preco_unitario, 2) as orcado,
        coalesce((select sum(ci.valor) from compra_itens ci join compras c on c.id = ci.compra_id
                  where ci.item_chave = i.chave and c.situacao = 'aprovada'), 0) as comprado
      from orcamento_itens i join v_orcamento_vigente o on o.id = i.orcamento_id
      where o.obra_id = ${obraId}
      order by i.id`,
    sql<{ id: number; nome: string }[]>`select id, nome from fornecedores order by nome`,
    lerConfig(),
    hoje(),
  ])
  const etapas = [...new Set(subs.map((x) => x.etapaId))].map((id) => {
    const filhas = subs.filter((x) => x.etapaId === id)
    return { id, nome: filhas[0].etapa, subs: filhas }
  })

  // "Corrigir e reenviar": parte de uma compra recusada desta obra.
  let inicial: Inicial = {}
  if (de) {
    const [c] = await sql<Inicial[]>`
      select (select subetapa_id from compra_itens where compra_id = c.id order by id limit 1) as "subetapaId",
             (select item_chave from compra_itens where compra_id = c.id order by id limit 1) as "itemChave",
             fornecedor_id as "fornecedorId", descricao, valor, justificativa
      from compras c where id = ${de} and obra_id = ${obraId} and situacao = 'recusada'`
    if (c) {
      const parcelas = await sql<{ valor: number; vencimento: string }[]>`
        select valor, vencimento from parcelas where compra_id = ${de} order by numero`
      inicial = { ...c, parcelas }
    }
  }

  return (
    <>
      <CabecalhoTela contexto="Compras" titulo={de ? `Corrigir e reenviar a compra nº ${de}` : 'Nova compra'} />
      <FormCompra
        etapas={etapas}
        itens={itens}
        fornecedores={fornecedores}
        tetoBaixo={config.tetoBaixo}
        tetoMedio={config.tetoMedio}
        hoje={dia}
        inicial={inicial}
      />
    </>
  )
}
