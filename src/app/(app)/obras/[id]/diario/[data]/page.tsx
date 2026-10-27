import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AreaTexto,
  BotaoImprimir,
  BotaoLink,
  CabecalhoTela,
  Campo,
  CampoFotos,
  EstadoVazio,
  Etiqueta,
  FormAcao,
  Marca,
  Secao,
  Selecao,
} from '@ds'
import { sql, hoje, lerConfig } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { dataBR, diaDaSemana, somarDias } from '@/lib/regras'
import { quando } from '@/lib/historico'
import { CLIMAS } from '@/components/rotulos'
import { LinhasEquipe } from '@/components/linhas-equipe'
import { salvarRdo } from '../acoes'
import { removerFoto } from '../../fotos/acoes'

type Rdo = { id: number; climaManha: string; climaTarde: string; servicos: string | null; ocorrencias: string | null; observacoes: string | null; autor: string; criadoEm: Date }

export default async function DiaDoDiario({ params, searchParams }: PageProps<'/obras/[id]/diario/[data]'>) {
  const s = await exigirSessao()
  const { id: idTexto, data } = await params
  const id = Number(idTexto)
  if (!Number.isInteger(id) || !podeVerObra(s, id) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) notFound()
  const [[obra], hojeIso, config] = await Promise.all([
    sql<{ nome: string; endereco: string | null }[]>`select nome, endereco from obras where id = ${id}`,
    hoje(),
    lerConfig(),
  ])
  if (!obra || data > hojeIso) notFound()

  const [rdo] = await sql<Rdo[]>`
    select id, clima_manha as "climaManha", clima_tarde as "climaTarde", servicos, ocorrencias, observacoes, autor, criado_em as "criadoEm"
    from rdos where obra_id = ${id} and data = ${data}`
  const [equipes, fotos] = rdo
    ? await Promise.all([
        sql<{ nome: string; funcao: string | null; pessoas: number }[]>`select nome, funcao, pessoas from rdo_equipes where rdo_id = ${rdo.id} order by id`,
        sql<{ id: number; legenda: string | null }[]>`select id, legenda from fotos where rdo_id = ${rdo.id} and removida_em is null order by id`,
      ])
    : [[], []]
  const escreve = s.perfil === 'obra' || s.perfil === 'chefe'
  const editar = escreve && (!rdo || (await searchParams).editar === '1')
  const titulo = `${dataBR(data)} · ${diaDaSemana(data)}`
  const anterior = somarDias(data, -1)
  const seguinte = somarDias(data, 1)
  const navegar = (
    <div className="flex items-center gap-2 print:hidden">
      <BotaoLink href={`/obras/${id}/diario/${anterior}`} variante="secundario" tamanho="sm">
        ‹ Dia anterior
      </BotaoLink>
      {seguinte <= hojeIso && (
        <BotaoLink href={`/obras/${id}/diario/${seguinte}`} variante="secundario" tamanho="sm">
          Próximo dia ›
        </BotaoLink>
      )}
    </div>
  )

  if (editar) {
    const prestadores = await sql<{ nome: string }[]>`select nome from fornecedores order by nome`
    return (
      <>
        <CabecalhoTela contexto={<Link href={`/obras/${id}/diario`}>{obra.nome} · Diário de obra</Link>} titulo={rdo ? `Editar RDO de ${titulo}` : `RDO de ${titulo}`} acoes={navegar} />
        <Secao titulo="Relatório do dia">
          <FormAcao action={salvarRdo.bind(null, id, data)} botao="Salvar RDO" variante="primario" className="flex flex-col gap-5">
            <div className="grid gap-3.5 sm:grid-cols-2">
              {(['manha', 'tarde'] as const).map((p) => (
                <Campo key={p} rotulo={p === 'manha' ? 'Clima de manhã' : 'Clima à tarde'}>
                  <Selecao name={`clima_${p}`} defaultValue={rdo ? (p === 'manha' ? rdo.climaManha : rdo.climaTarde) : 'bom'}>
                    {Object.entries(CLIMAS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              ))}
            </div>
            <LinhasEquipe iniciais={equipes} prestadores={prestadores.map((p) => p.nome)} />
            <Campo rotulo="Serviços executados">
              <AreaTexto name="servicos" rows={4} defaultValue={rdo?.servicos ?? ''} placeholder="O que foi feito hoje, por etapa." />
            </Campo>
            <Campo rotulo="Ocorrências" ajuda="Acidente, atraso, falta de material, chuva que parou o serviço, visita da fiscalização…">
              <AreaTexto name="ocorrencias" rows={3} defaultValue={rdo?.ocorrencias ?? ''} />
            </Campo>
            <Campo rotulo="Observações">
              <AreaTexto name="observacoes" rows={3} defaultValue={rdo?.observacoes ?? ''} />
            </Campo>
            <div className="flex flex-col gap-1.5">
              <span className="text-label font-semibold text-ink-2">{fotos.length ? `Mais fotos (já tem ${fotos.length})` : 'Fotos do dia'}</span>
              <CampoFotos />
            </div>
          </FormAcao>
        </Secao>
      </>
    )
  }

  if (!rdo)
    return (
      <>
        <CabecalhoTela contexto={<Link href={`/obras/${id}/diario`}>{obra.nome} · Diário de obra</Link>} titulo={titulo} acoes={navegar} />
        <EstadoVazio titulo="Sem RDO neste dia">O engenheiro ainda não registrou o relatório deste dia.</EstadoVazio>
      </>
    )

  const pessoas = equipes.reduce((t, e) => t + e.pessoas, 0)
  return (
    <>
      {/* Cabeçalho do documento impresso */}
      <header className="hidden items-start justify-between gap-6 border-b-2 border-fixed-ink pb-3 print:flex">
        <div className="flex items-center gap-3">
          <Marca tamanho={28} comNome={false} />
          <div className="flex flex-col">
            <span className="text-[15px] font-bold">{config.nomeEmpresa}</span>
            <span className="text-label">
              {obra.nome}
              {obra.endereco && ` · ${obra.endereco}`}
            </span>
          </div>
        </div>
        <span className="text-label font-bold">RELATÓRIO DIÁRIO DE OBRA · {titulo}</span>
      </header>

      <CabecalhoTela
        contexto={<Link href={`/obras/${id}/diario`} className="print:no-underline">{obra.nome} · Diário de obra</Link>}
        titulo={titulo}
        situacao={rdo.ocorrencias ? <Etiqueta tom="aviso">Com ocorrência</Etiqueta> : undefined}
        acoes={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            {navegar}
            {escreve && (
              <BotaoLink href={`/obras/${id}/diario/${data}?editar=1`} variante="secundario" tamanho="sm">
                Editar
              </BotaoLink>
            )}
            <BotaoImprimir texto="Imprimir RDO" />
          </div>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-2 print:grid-cols-2">
        <Secao titulo="Clima">
          <dl className="grid grid-cols-2 gap-3 text-body">
            <div>
              <dt className="text-label font-semibold text-ink-3">Manhã</dt>
              <dd className="font-semibold">{CLIMAS[rdo.climaManha]}</dd>
            </div>
            <div>
              <dt className="text-label font-semibold text-ink-3">Tarde</dt>
              <dd className="font-semibold">{CLIMAS[rdo.climaTarde]}</dd>
            </div>
          </dl>
        </Secao>
        <Secao titulo={`Equipes · ${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'}`}>
          {equipes.length === 0 ? (
            <span className="text-table text-ink-3">Nenhuma equipe registrada.</span>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {equipes.map((e, i) => (
                <li key={i} className="flex items-baseline justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <span className="flex flex-col">
                    <span className="text-body font-semibold">{e.nome}</span>
                    {e.funcao && <span className="text-caption text-ink-3">{e.funcao}</span>}
                  </span>
                  <span className="text-table font-semibold whitespace-nowrap">
                    {e.pessoas} {e.pessoas === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Secao>
        <Secao titulo="Serviços executados" className="lg:col-span-2 print:col-span-2">
          <p className="text-body whitespace-pre-line">{rdo.servicos ?? '—'}</p>
        </Secao>
        <Secao titulo="Ocorrências" tom={rdo.ocorrencias ? 'aviso' : 'padrao'}>
          <p className="text-body whitespace-pre-line">{rdo.ocorrencias ?? 'Nenhuma.'}</p>
        </Secao>
        <Secao titulo="Observações">
          <p className="text-body whitespace-pre-line">{rdo.observacoes ?? '—'}</p>
        </Secao>
        {fotos.length > 0 && (
          <Secao titulo={`Fotos (${fotos.length})`} className="lg:col-span-2 print:col-span-2 print:break-inside-avoid">
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
              {fotos.map((f) => (
                <li key={f.id} className="flex flex-col gap-1.5">
                  <a href={`/fotos/${f.id}`} target="_blank" rel="noopener">
                    {/* eslint-disable-next-line @next/next/no-img-element -- foto servida pela rota autenticada /fotos */}
                    <img src={`/fotos/${f.id}`} alt={f.legenda ?? `Foto do RDO de ${dataBR(data)}`} loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />
                  </a>
                  {escreve && (
                    <FormAcao action={removerFoto.bind(null, id, f.id)} botao="Tirar foto" variante="fantasma" tamanho="sm" className="print:hidden" />
                  )}
                </li>
              ))}
            </ul>
          </Secao>
        )}
      </div>

      <footer className="flex flex-wrap items-end justify-between gap-6 px-1 text-caption text-ink-3">
        <span>
          Registrado por {rdo.autor} em {quando(rdo.criadoEm)}
        </span>
        <span className="hidden w-64 border-t border-fixed-ink pt-1.5 text-center text-label text-fixed-ink print:block">Engenheiro responsável</span>
      </footer>
    </>
  )
}
