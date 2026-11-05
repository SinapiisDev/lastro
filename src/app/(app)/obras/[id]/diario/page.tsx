import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { Botao, BotaoImprimir, BotaoLink, CabecalhoTela, Cartao, Entrada, EstadoVazio, Etiqueta, Marca } from '@ds'
import { sql, hoje, lerConfig } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { dataBR, diaDaSemana, mesBR, somarDias } from '@/lib/regras'
import { CLIMAS } from '@/components/rotulos'

type Linha = {
  data: string
  numero: number
  climaManha: string
  climaTarde: string
  tarefas: string | null
  ocorrencias: string | null
  observacoes: string | null
  equipes: string | null
  pessoas: number
  fotos: number
}

const mesDe = (iso: string) => iso.slice(0, 7)
const outroMes = (mes: string, delta: number) => {
  const [a, m] = mes.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1 + delta, 1)).toISOString().slice(0, 7)
}

// Diário de obra: os RDOs do mês, com as ocorrências à vista. Impresso, vira o relatório do período.
export default async function Diario({ params, searchParams }: PageProps<'/obras/[id]/diario'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || !podeVerObra(s, id)) notFound()
  const busca = await searchParams
  if (typeof busca.dia === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(busca.dia)) redirect(`/obras/${id}/diario/${busca.dia}`)

  const [[obra], hojeIso, config] = await Promise.all([
    sql<{ nome: string; endereco: string | null }[]>`select nome, endereco from obras where id = ${id}`,
    hoje(),
    lerConfig(),
  ])
  if (!obra) notFound()
  const mes = typeof busca.mes === 'string' && /^\d{4}-\d{2}$/.test(busca.mes) ? busca.mes : mesDe(hojeIso)
  const soOcorrencias = busca.ocorrencias === '1'
  const inicio = `${mes}-01`
  const fim = somarDias(`${outroMes(mes, 1)}-01`, -1)

  const rdos = await sql<Linha[]>`
    select r.data, r.numero, r.clima_manha as "climaManha", r.clima_tarde as "climaTarde", r.ocorrencias, r.observacoes,
      (select string_agg(t.servico || coalesce(' — ' || t.descricao, ''), chr(10) order by t.id) from rdo_tarefas t where t.rdo_id = r.id) as tarefas,
      (select string_agg(e.nome, ', ' order by e.id) from rdo_equipes e where e.rdo_id = r.id) as equipes,
      coalesce((select sum(e.pessoas) from rdo_equipes e where e.rdo_id = r.id), 0)::int as pessoas,
      (select count(*) from fotos f where f.rdo_id = r.id and f.removida_em is null)::int as fotos
    from rdos r
    where r.obra_id = ${id} and r.data between ${inicio} and ${fim} ${soOcorrencias ? sql`and r.ocorrencias is not null` : sql``}
    order by r.data desc`
  const [{ total, comOcorrencia, temHoje }] = await sql<{ total: number; comOcorrencia: number; temHoje: boolean }[]>`
    select count(*) filter (where data between ${inicio} and ${fim})::int as total,
      count(*) filter (where data between ${inicio} and ${fim} and ocorrencias is not null)::int as "comOcorrencia",
      bool_or(data = ${hojeIso}) as "temHoje"
    from rdos where obra_id = ${id}`
  const escreve = s.perfil === 'obra' || s.perfil === 'chefe'
  const filtro = (extra: Record<string, string>) => `/obras/${id}/diario?${new URLSearchParams({ mes, ...(soOcorrencias ? { ocorrencias: '1' } : {}), ...extra })}`

  return (
    <>
      <header className="hidden items-start justify-between gap-6 border-b-2 border-fixed-ink pb-3 print:flex">
        <div className="flex items-center gap-3">
          <Marca tamanho={28} comNome={false} />
          <div className="flex flex-col">
            <span className="text-[15px] font-bold">{config.nomeEmpresa}</span>
            <span className="text-label">{obra.nome}</span>
          </div>
        </div>
        <span className="text-label font-bold">
          DIÁRIO DE OBRA · {mesBR(mes)}
          {soOcorrencias && ' · só ocorrências'}
        </span>
      </header>

      <CabecalhoTela
        contexto={
          <Link href={`/obras/${id}`} className="print:no-underline">
            {obra.nome}
          </Link>
        }
        titulo="Diário de obra"
        acoes={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {escreve && (
              <BotaoLink href={`/obras/${id}/diario/${hojeIso}`} variante={temHoje ? 'secundario' : 'primario'}>
                {temHoje ? 'Ver o RDO de hoje' : 'Preencher o RDO de hoje'}
              </BotaoLink>
            )}
            <BotaoLink href={`/obras/${id}/fotos`} variante="secundario">
              Fotos da obra
            </BotaoLink>
            <BotaoImprimir texto="Imprimir o mês" />
          </div>
        }
      >
        <span className="text-table text-ink-2">
          {total} {total === 1 ? 'relatório' : 'relatórios'} em {mesBR(mes)} · {comOcorrencia} com ocorrência
        </span>
      </CabecalhoTela>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <BotaoLink href={filtro({ mes: outroMes(mes, -1) })} variante="secundario" tamanho="sm">
          ‹ {mesBR(outroMes(mes, -1))}
        </BotaoLink>
        <span className="px-2 text-body font-semibold">{mesBR(mes)}</span>
        {outroMes(mes, 1) <= mesDe(hojeIso) && (
          <BotaoLink href={filtro({ mes: outroMes(mes, 1) })} variante="secundario" tamanho="sm">
            {mesBR(outroMes(mes, 1))} ›
          </BotaoLink>
        )}
        <BotaoLink
          href={`/obras/${id}/diario?${new URLSearchParams({ mes, ...(soOcorrencias ? {} : { ocorrencias: '1' }) })}`}
          variante={soOcorrencias ? 'primario' : 'suave'}
          tamanho="sm"
        >
          {soOcorrencias ? 'Mostrando só dias com ocorrência' : 'Só dias com ocorrência'}
        </BotaoLink>
        {escreve && (
          <form action={`/obras/${id}/diario`} className="ml-auto flex items-center gap-2">
            <Entrada type="date" name="dia" max={hojeIso} required aria-label="Outro dia" className="h-8 py-0" />
            <Botao variante="secundario" tamanho="sm">
              Abrir dia
            </Botao>
          </form>
        )}
      </div>

      {rdos.length === 0 ? (
        <EstadoVazio titulo={soOcorrencias ? 'Nenhuma ocorrência neste mês' : 'Nenhum RDO neste mês'}>
          {escreve && !soOcorrencias ? 'Comece pelo RDO de hoje.' : undefined}
        </EstadoVazio>
      ) : (
        <ul className="flex flex-col gap-3">
          {rdos.map((r) => (
            <li key={r.data} className="print:break-inside-avoid">
              <Cartao className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/obras/${id}/diario/${r.data}`} className="font-display text-h2 font-normal no-underline hover:underline">
                    {dataBR(r.data)} <span className="text-body text-ink-3">· {diaDaSemana(r.data)} · RDO nº {String(r.numero).padStart(6, '0')}</span>
                  </Link>
                  <span className="flex flex-wrap items-center gap-2 text-label font-semibold text-ink-2">
                    {CLIMAS[r.climaManha]} / {CLIMAS[r.climaTarde]}
                    {r.ocorrencias && <Etiqueta tom="aviso">Ocorrência</Etiqueta>}
                  </span>
                </div>
                <span className="text-table text-ink-2">
                  {r.equipes ? `${r.equipes} · ${r.pessoas} ${r.pessoas === 1 ? 'pessoa' : 'pessoas'}` : 'Sem equipe registrada'}
                  {r.fotos > 0 && ` · ${r.fotos} ${r.fotos === 1 ? 'foto' : 'fotos'}`}
                </span>
                {r.tarefas && <p className="line-clamp-3 text-body whitespace-pre-line print:line-clamp-none">{r.tarefas}</p>}
                {r.ocorrencias && (
                  <p className="rounded-md bg-warn-bg px-3 py-2 text-table whitespace-pre-line text-warn">
                    <strong>Ocorrência:</strong> {r.ocorrencias}
                  </p>
                )}
                {r.observacoes && (
                  <p className="text-table whitespace-pre-line text-ink-2">
                    <strong>Observação:</strong> {r.observacoes}
                  </p>
                )}
              </Cartao>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
