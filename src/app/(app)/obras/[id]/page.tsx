import Link from 'next/link'
import { notFound } from 'next/navigation'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { brl, progressoEtapa, gastoNaFrente } from '@/lib/regras'
import { FormAcao } from '@/components/form-acao'
import { Secao, Trena } from '@/components/ui'
import {
  salvarProgresso,
  salvarEtapa,
  removerEtapa,
  adicionarEtapa,
  salvarSubetapa,
  removerSubetapa,
  adicionarSubetapa,
} from '../acoes'

type Sub = { id: number; etapaId: number; nome: string; ordem: number; progresso: number; previsto: number; gasto: number; vinculos: number }

const situacaoEtapa = (pct: number) => (pct === 0 ? 'Não iniciada' : pct === 100 ? 'Concluída' : 'Em andamento')

export default async function Obra({ params, searchParams }: PageProps<'/obras/[id]'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || !podeVerObra(s, id)) notFound()
  const editar = (await searchParams).editar === '1'

  const [obra] = await sql<{ nome: string; endereco: string | null; ativa: boolean }[]>`
    select nome, endereco, ativa from obras where id = ${id}`
  if (!obra) notFound()
  const etapas = await sql<{ id: number; nome: string; ordem: number }[]>`
    select id, nome, ordem from etapas where obra_id = ${id} order by ordem, id`
  // Previsto vem do orçamento vigente; gasto, dos itens de compras aprovadas.
  const subs = await sql<Sub[]>`
    select s.id, s.etapa_id as "etapaId", s.nome, s.ordem, s.progresso,
      coalesce((select previsto from v_previsto p where p.subetapa_id = s.id), 0) as previsto,
      coalesce((select sum(ci.valor) from compra_itens ci join compras c on c.id = ci.compra_id
                where ci.subetapa_id = s.id and c.situacao = 'aprovada'), 0) as gasto,
      ((select count(*) from compra_itens ci where ci.subetapa_id = s.id)
        + (select count(*) from orcamento_itens i where i.subetapa_id = s.id))::int as vinculos
    from subetapas s
    join etapas e on e.id = s.etapa_id
    where e.obra_id = ${id}
    order by s.ordem, s.id`

  const lista = etapas.map((e) => {
    const filhas = subs.filter((x) => x.etapaId === e.id)
    return {
      ...e,
      subs: filhas,
      previsto: filhas.reduce((t, x) => t + x.previsto, 0),
      gasto: filhas.reduce((t, x) => t + x.gasto, 0),
      pct: progressoEtapa(filhas.map((x) => x.progresso)),
    }
  })
  const previstoTotal = lista.reduce((t, e) => t + e.previsto, 0)
  const gastoTotal = lista.reduce((t, e) => t + e.gasto, 0)
  const pctObra = progressoEtapa(lista.filter((e) => e.subs.length).map((e) => e.pct))
  const atualizaProgresso = s.perfil === 'obra' || s.perfil === 'chefe'

  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1>{obra.nome}</h1>
          {obra.endereco && <p className="text-cinza">{obra.endereco}</p>}
          {!obra.ativa && <p className="text-cinza">Obra encerrada</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href={`/orcamento/${id}`} className="btn">
            Orçamento
          </Link>
          <Link href={`/compras?obra=${id}`} className="btn">
            Compras da obra
          </Link>
          <Link href={editar ? `/obras/${id}` : `/obras/${id}?editar=1`} className="btn">
            {editar ? 'Fechar edição' : 'Editar etapas'}
          </Link>
        </div>
      </div>

      <section className="cartao grid gap-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <p className="rotulo">Serviço feito na obra</p>
          <Trena pct={pctObra} alerta={gastoNaFrente(gastoTotal, previstoTotal, pctObra)} />
        </div>
        <p className="sm:text-right">
          <span className="text-xl font-semibold">{brl(gastoTotal)}</span>
          <span className="text-cinza"> gastos de {brl(previstoTotal)} previstos</span>
        </p>
      </section>

      {editar ? (
        <Editor obraId={id} etapas={lista} />
      ) : (
        <Secao titulo="Etapas">
          {lista.map((e) => (
            <details key={e.id} className="border-b border-linha last:border-0">
              <summary className="grid cursor-pointer list-none gap-2 py-3 sm:grid-cols-[minmax(10rem,16rem)_1fr_8rem_minmax(10rem,auto)] sm:items-center sm:gap-4">
                <span className="font-medium">
                  <span className="seta" aria-hidden>
                    ▸
                  </span>{' '}
                  {e.nome}
                </span>
                <Trena pct={e.pct} alerta={gastoNaFrente(e.gasto, e.previsto, e.pct)} />
                <span className="text-sm text-cinza">{situacaoEtapa(e.pct)}</span>
                <span className="text-sm sm:text-right">
                  {brl(e.gasto)} <span className="text-cinza">de {brl(e.previsto)}</span>
                </span>
              </summary>
              <div className="grid gap-1 pb-3 sm:pl-6">
                {e.subs.length === 0 && <p className="text-sm text-cinza">Sem subetapas. Use Editar etapas para incluir.</p>}
                {e.subs.map((x) => (
                  <div
                    key={x.id}
                    className="grid gap-2 rounded py-2 sm:grid-cols-[minmax(10rem,15rem)_1fr_auto_minmax(10rem,auto)] sm:items-center sm:gap-4"
                  >
                    <span className="text-sm">{x.nome}</span>
                    <Trena pct={x.progresso} fina />
                    {atualizaProgresso ? (
                      <FormAcao action={salvarProgresso.bind(null, x.id)} botao="Salvar" className="flex items-center gap-2">
                        <label className="flex items-center gap-1 text-sm">
                          <span className="sr-only">Serviço feito em {x.nome}</span>
                          <input
                            name="progresso"
                            type="number"
                            min={0}
                            max={100}
                            step={5}
                            defaultValue={x.progresso}
                            className="campo w-20"
                          />
                          %
                        </label>
                      </FormAcao>
                    ) : (
                      <span />
                    )}
                    <span className="text-sm sm:text-right">
                      {brl(x.gasto)} <span className="text-cinza">de {brl(x.previsto)}</span>
                    </span>
                  </div>
                ))}
              </div>
            </details>
          ))}
        </Secao>
      )}
    </div>
  )
}

function Editor({
  obraId,
  etapas,
}: {
  obraId: number
  etapas: { id: number; nome: string; ordem: number; previsto: number; subs: Sub[] }[]
}) {
  return (
    <div className="grid gap-4">
      <p className="text-sm text-cinza">
        O valor previsto de cada etapa vem do{' '}
        <Link href={`/orcamento/${obraId}`} className="underline">
          orçamento da obra
        </Link>
        .
      </p>
      {etapas.map((e) => (
        <section key={e.id} className="cartao grid gap-3">
          <FormAcao
            action={salvarEtapa.bind(null, e.id)}
            botao="Salvar etapa"
            className="grid items-end gap-2 sm:grid-cols-[5rem_1fr_11rem_auto]"
          >
            <label>
              <span className="rotulo">Ordem</span>
              <input name="ordem" type="number" defaultValue={e.ordem} className="campo" />
            </label>
            <label>
              <span className="rotulo">Etapa</span>
              <input name="nome" defaultValue={e.nome} required className="campo font-medium" />
            </label>
            <p className="text-sm text-cinza">Previsto: {brl(e.previsto)}</p>
          </FormAcao>

          <div className="grid gap-2 border-l-4 border-linha pl-3">
            {e.subs.map((x) => (
              <div key={x.id} className="flex flex-wrap items-end gap-2">
                <FormAcao
                  action={salvarSubetapa.bind(null, x.id)}
                  botao="Salvar"
                  className="grid flex-1 items-end gap-2 sm:grid-cols-[5rem_1fr_auto]"
                >
                  <label>
                    <span className="rotulo">Ordem</span>
                    <input name="ordem" type="number" defaultValue={x.ordem} className="campo" />
                  </label>
                  <label>
                    <span className="rotulo">Subetapa</span>
                    <input name="nome" defaultValue={x.nome} required className="campo" />
                  </label>
                </FormAcao>
                {x.vinculos === 0 && <FormAcao action={removerSubetapa.bind(null, x.id)} botao="Remover" perigo />}
              </div>
            ))}
            <FormAcao action={adicionarSubetapa.bind(null, e.id)} botao="Adicionar subetapa" className="flex flex-wrap items-end gap-2">
              <label className="flex-1">
                <span className="rotulo">Nova subetapa em {e.nome}</span>
                <input name="nome" required className="campo" />
              </label>
            </FormAcao>
          </div>

          {e.subs.every((x) => x.vinculos === 0) && (
            <FormAcao action={removerEtapa.bind(null, e.id)} botao={`Remover a etapa ${e.nome}`} perigo />
          )}
        </section>
      ))}

      <section className="cartao">
        <FormAcao action={adicionarEtapa.bind(null, obraId)} botao="Adicionar etapa" principal className="flex flex-wrap items-end gap-2">
          <label className="flex-1">
            <span className="rotulo">Nova etapa</span>
            <input name="nome" required className="campo" />
          </label>
        </FormAcao>
      </section>
    </div>
  )
}
