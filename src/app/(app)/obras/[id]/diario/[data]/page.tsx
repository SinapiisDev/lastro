import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  AreaTexto,
  BotaoImprimir,
  BotaoLink,
  CabecalhoTela,
  Campo,
  CampoFotos,
  Cartao,
  EstadoVazio,
  Etiqueta,
  FormAcao,
  Marca,
  Secao,
  Selecao,
  Tabela,
  Td,
  Th,
  Tr,
} from '@ds'
import { sql, hoje, lerConfig } from '@/lib/db'
import { exigirSessao, podeVerObra, atuaNaObra } from '@/lib/sessao'
import { dataBR, diaDaSemana, somarDias } from '@/lib/regras'
import { quando } from '@/lib/historico'
import { CLIMAS, SITUACOES_OBRA } from '@/components/rotulos'
import { LinhasRdo } from '@/components/linhas-rdo'
import { SECOES_RDO, UNIDADES, type ChaveSecao, type LinhaRdo } from '@/lib/rdo'
import { salvarRdo } from '../acoes'
import { removerFoto } from '../../fotos/acoes'

type Rdo = { id: number; numero: number; climaManha: string; climaTarde: string; ocorrencias: string | null; observacoes: string | null; autor: string; criadoEm: Date }
type Obra = { nome: string; endereco: string | null; cidade: string | null; investidor: string | null; inicio: string | null; termino: string | null; situacao: string }

const CHAVES = Object.keys(SECOES_RDO) as ChaveSecao[]
const dias = (de: string, ate: string) => Math.round((Date.parse(ate) - Date.parse(de)) / 864e5)
const numero = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })

async function lerListas(rdoId: number) {
  const listas = await Promise.all(
    CHAVES.map((chave) => {
      const secao = SECOES_RDO[chave]
      const filtro = 'filtro' in secao ? sql`and tipo = ${secao.filtro.tipo}` : sql``
      return sql<LinhaRdo[]>`select ${sql(secao.campos.map((c) => c.nome))} from ${sql(secao.tabela)} where rdo_id = ${rdoId} ${filtro} order by id`
    }),
  )
  // Array.from: lista simples (sem os metadados do postgres.js) para ir ao componente do navegador.
  return Object.fromEntries(CHAVES.map((c, i) => [c, Array.from(listas[i])])) as Record<ChaveSecao, LinhaRdo[]>
}

export default async function DiaDoDiario({ params, searchParams }: PageProps<'/obras/[id]/diario/[data]'>) {
  const s = await exigirSessao()
  const { id: idTexto, data } = await params
  const id = Number(idTexto)
  if (!Number.isInteger(id) || !podeVerObra(s, id) || !/^\d{4}-\d{2}-\d{2}$/.test(data)) notFound()
  const [[obra], hojeIso, config] = await Promise.all([
    sql<Obra[]>`select nome, endereco, cidade, investidor, inicio, termino, situacao from obras where id = ${id}`,
    hoje(),
    lerConfig(),
  ])
  if (!obra || data > hojeIso) notFound()

  const [rdo] = await sql<Rdo[]>`
    select id, numero, clima_manha as "climaManha", clima_tarde as "climaTarde", ocorrencias, observacoes, autor, criado_em as "criadoEm"
    from rdos where obra_id = ${id} and data = ${data}`
  const vazias = Object.fromEntries(CHAVES.map((c) => [c, []])) as unknown as Record<ChaveSecao, LinhaRdo[]>
  const [listas, fotos] = rdo
    ? await Promise.all([lerListas(rdo.id), sql<{ id: number; legenda: string | null }[]>`select id, legenda from fotos where rdo_id = ${rdo.id} and removida_em is null order by id`])
    : [vazias, []]
  const escreve = await atuaNaObra(s, id)
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
    const [prestadores, servicos] = await Promise.all([
      sql<{ nome: string }[]>`select nome from fornecedores order by nome`,
      sql<{ nome: string }[]>`
        select e.nome || '/' || s.nome as nome from etapas e join subetapas s on s.etapa_id = e.id
        where e.obra_id = ${id} order by e.ordem, e.id, s.ordem, s.id`,
    ])
    return (
      <>
        <CabecalhoTela contexto={<Link href={`/obras/${id}/diario`}>{obra.nome} · Diário de obra</Link>} titulo={rdo ? `Editar RDO de ${titulo}` : `RDO de ${titulo}`} acoes={navegar} />
        <Secao titulo="Relatório do dia">
          <datalist id="servicos-obra">
            {servicos.map((x) => (
              <option key={x.nome} value={x.nome} />
            ))}
          </datalist>
          <datalist id="prestadores">
            <option value="Equipe própria" />
            {prestadores.map((p) => (
              <option key={p.nome} value={p.nome} />
            ))}
          </datalist>
          <datalist id="unidades">
            {UNIDADES.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>
          <FormAcao action={salvarRdo.bind(null, id, data)} botao="Salvar RDO" variante="primario" className="flex flex-col gap-6">
            <div className="grid gap-3.5 sm:grid-cols-2">
              {(['manha', 'tarde'] as const).map((p) => (
                <Campo key={p} rotulo={p === 'manha' ? 'Tempo de manhã' : 'Tempo à tarde'}>
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
            {CHAVES.map((chave) => (
              <LinhasRdo key={chave} prefixo={chave} titulo={SECOES_RDO[chave].titulo} campos={SECOES_RDO[chave].campos} botao={SECOES_RDO[chave].botao} iniciais={listas[chave]} />
            ))}
            <Campo rotulo="Ocorrências" ajuda="Uma por linha: acidente, atraso, falta de material, chuva que parou o serviço, visita da fiscalização…">
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

  const nRdo = String(rdo.numero).padStart(6, '0')
  const presentes = listas.equipes.reduce((t, e) => t + Number(e.pessoas), 0)
  const ocorrencias = (rdo.ocorrencias ?? '').split('\n').map((l) => l.trim()).filter(Boolean)
  const prazo = obra.inicio && obra.termino ? { dia: dias(obra.inicio, data) + 1, total: dias(obra.inicio, obra.termino) + 1 } : null
  const [situacao, tomSituacao] = SITUACOES_OBRA[obra.situacao]

  return (
    <>
      {/* Cabeçalho do documento impresso, no formato do RDO que a empresa já usava */}
      <header className="hidden items-start justify-between gap-6 border-b-2 border-fixed-ink pb-3 print:flex">
        <div className="flex items-center gap-3">
          {config.logo ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo guardado no banco como data URL
            <img src={config.logo} alt="" className="h-14 w-auto" />
          ) : (
            <Marca tamanho={28} comNome={false} />
          )}
          <div className="flex flex-col text-caption">
            <span className="text-[15px] font-bold">{config.nomeEmpresa}</span>
            {config.endereco && <span>{config.endereco}</span>}
            <span>{[config.email, config.cnpj && `CNPJ: ${config.cnpj}`, config.site].filter(Boolean).join(' - ')}</span>
          </div>
        </div>
        <div className="flex flex-col items-end text-right text-caption">
          <span className="text-[15px] font-bold">Relatório Diário de Obra</span>
          <span>
            RDO nº <strong>{nRdo}</strong> | Data: <strong>{dataBR(data)}</strong>
          </span>
          {obra.investidor && (
            <span>
              Cliente: <strong>{obra.investidor}</strong>
            </span>
          )}
        </div>
      </header>

      <CabecalhoTela
        contexto={
          <Link href={`/obras/${id}/diario`} className="print:no-underline">
            {obra.nome} · Diário de obra · RDO nº {nRdo}
          </Link>
        }
        titulo={titulo}
        situacao={ocorrencias.length ? <Etiqueta tom="aviso">Com ocorrência</Etiqueta> : undefined}
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-4">
        <Cartao as="div" className="flex flex-col items-start gap-2">
          <span className="text-body font-bold">{obra.nome}</span>
          <Etiqueta tom={tomSituacao}>{situacao}</Etiqueta>
        </Cartao>
        <Cartao as="div" className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-3">Endereço</span>
          <span className="text-table font-semibold">{[obra.endereco, obra.cidade].filter(Boolean).join(' - ') || '—'}</span>
        </Cartao>
        <Cartao as="div" className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-3">Início / término</span>
          {prazo ? (
            <>
              <span className="text-body font-bold">
                Dia {prazo.dia} / {prazo.total}
              </span>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.max(0, (prazo.dia / prazo.total) * 100))}%` }} />
              </div>
            </>
          ) : null}
          <span className="text-caption text-ink-3">
            {obra.inicio ? dataBR(obra.inicio) : '?'} - {obra.termino ? dataBR(obra.termino) : '?'}
          </span>
        </Cartao>
        <Cartao as="div" className="flex flex-col gap-1">
          <span className="text-caption font-semibold text-ink-3">Turno / tempo</span>
          <div className="grid grid-cols-2 gap-2 text-table">
            <span>
              <span className="block text-caption text-ink-3">Manhã</span>
              <strong>{CLIMAS[rdo.climaManha]}</strong>
            </span>
            <span>
              <span className="block text-caption text-ink-3">Tarde</span>
              <strong>{CLIMAS[rdo.climaTarde]}</strong>
            </span>
          </div>
        </Cartao>
      </div>

      <Secao titulo="Observações">
        <p className="text-body whitespace-pre-line">{rdo.observacoes ?? '—'}</p>
      </Secao>

      <Secao titulo="Ocorrências" tom={ocorrencias.length ? 'aviso' : 'padrao'}>
        {ocorrencias.length === 0 ? (
          <span className="text-table text-ink-3">Nenhuma.</span>
        ) : (
          <Tabela>
            <thead>
              <tr>
                <Th className="w-32">Data</Th>
                <Th>Mensagem</Th>
              </tr>
            </thead>
            <tbody>
              {ocorrencias.map((o, i) => (
                <Tr key={i}>
                  <Td>{dataBR(data)}</Td>
                  <Td>{o}</Td>
                </Tr>
              ))}
            </tbody>
          </Tabela>
        )}
      </Secao>

      {CHAVES.map((chave) => {
        const secao = SECOES_RDO[chave]
        const linhas = listas[chave]
        return (
          <Secao
            key={chave}
            titulo={secao.titulo}
            acao={chave === 'equipes' ? <span className="text-label font-bold">Total presente: {presentes}</span> : undefined}
            className="print:break-inside-avoid"
          >
            {linhas.length === 0 ? (
              <span className="text-table text-ink-3">Nada registrado.</span>
            ) : (
              <Tabela minimo={520}>
                <thead>
                  <tr>
                    {secao.campos.map((c) => (
                      <Th key={c.nome} num={c.tipo !== 'texto'}>
                        {c.rotulo}
                      </Th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => (
                    <Tr key={i}>
                      {secao.campos.map((c) => (
                        <Td key={c.nome} num={c.tipo !== 'texto'}>
                          {l[c.nome] === null ? '—' : typeof l[c.nome] === 'number' ? numero(l[c.nome] as number) : l[c.nome]}
                        </Td>
                      ))}
                    </Tr>
                  ))}
                </tbody>
              </Tabela>
            )}
          </Secao>
        )
      })}

      {fotos.length > 0 && (
        <Secao titulo={`Imagens (${fotos.length})`} className="print:break-inside-avoid">
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {fotos.map((f) => (
              <li key={f.id} className="flex flex-col gap-1.5">
                <a href={`/fotos/${f.id}`} target="_blank" rel="noopener">
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto servida pela rota autenticada /fotos */}
                  <img src={`/fotos/${f.id}`} alt={f.legenda ?? `Foto do RDO de ${dataBR(data)}`} loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />
                </a>
                {escreve && <FormAcao action={removerFoto.bind(null, id, f.id)} botao="Tirar foto" variante="fantasma" tamanho="sm" className="print:hidden" />}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <footer className="flex flex-wrap items-end justify-between gap-6 px-1 pt-2 text-caption text-ink-3 print:break-inside-avoid">
        <span>
          Registrado por {rdo.autor} em {quando(rdo.criadoEm)}
        </span>
        <span className="hidden w-64 border-t border-fixed-ink pt-1.5 text-center text-label text-fixed-ink print:mt-16 print:block">Assinatura do responsável</span>
      </footer>
    </>
  )
}
