import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BotaoLink, CabecalhoTela, Campo, CampoFotos, Entrada, EstadoVazio, FormAcao, Secao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, podeVerObra } from '@/lib/sessao'
import { dataBR, diaDaSemana } from '@/lib/regras'
import { enviarFotos, removerFoto } from './acoes'

type Foto = { id: number; dia: string; legenda: string | null; rdo: string | null; autor: string }

// Galeria da obra: fotos dos RDOs e avulsas, do dia mais recente para o mais antigo.
export default async function Fotos({ params }: PageProps<'/obras/[id]/fotos'>) {
  const s = await exigirSessao()
  const id = Number((await params).id)
  if (!Number.isInteger(id) || !podeVerObra(s, id)) notFound()
  const [obra] = await sql<{ nome: string }[]>`select nome from obras where id = ${id}`
  if (!obra) notFound()
  // shortcut: mostra as 300 fotos mais recentes; paginar por mês quando uma obra passar disso.
  const fotos = await sql<Foto[]>`
    select f.id, coalesce(r.data, (f.criada_em at time zone 'America/Sao_Paulo')::date)::text as dia, f.legenda,
      r.data::text as rdo, f.autor
    from fotos f left join rdos r on r.id = f.rdo_id
    where f.obra_id = ${id} and f.removida_em is null
    order by dia desc, f.id desc
    limit 300`
  const dias = [...new Set(fotos.map((f) => f.dia))]
  const escreve = s.perfil === 'obra' || s.perfil === 'chefe'

  return (
    <>
      <CabecalhoTela
        contexto={<Link href={`/obras/${id}`}>{obra.nome}</Link>}
        titulo="Fotos da obra"
        acoes={
          <BotaoLink href={`/obras/${id}/diario`} variante="secundario">
            Diário de obra
          </BotaoLink>
        }
      >
        <span className="text-table text-ink-2">
          {fotos.length} {fotos.length === 1 ? 'foto' : 'fotos'}. As fotos do RDO entram aqui sozinhas.
        </span>
      </CabecalhoTela>

      {escreve && (
        <Secao titulo="Adicionar fotos">
          <FormAcao action={enviarFotos.bind(null, id)} botao="Enviar fotos" variante="primario" className="flex flex-col gap-3.5">
            <CampoFotos />
            <Campo rotulo="Legenda (opcional)" ajuda="Vale para todas as fotos deste envio. Ex.: concretagem da laje do 2º andar.">
              <Entrada name="legenda" maxLength={200} />
            </Campo>
          </FormAcao>
        </Secao>
      )}

      {fotos.length === 0 ? (
        <EstadoVazio titulo="Nenhuma foto ainda">As fotos enviadas no RDO e aqui aparecem organizadas por dia.</EstadoVazio>
      ) : (
        dias.map((dia) => (
          <section key={dia} className="flex flex-col gap-2.5">
            <h2 className="px-1 font-display text-h2 font-normal">
              {dataBR(dia)} <span className="text-body text-ink-3">· {diaDaSemana(dia)}</span>
            </h2>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {fotos
                .filter((f) => f.dia === dia)
                .map((f) => (
                  <li key={f.id} className="flex flex-col gap-1.5 rounded-lg bg-surface p-2">
                    <a href={`/fotos/${f.id}`} target="_blank" rel="noopener">
                      {/* eslint-disable-next-line @next/next/no-img-element -- foto servida pela rota autenticada /fotos */}
                      <img src={`/fotos/${f.id}`} alt={f.legenda ?? `Foto de ${dataBR(dia)}`} loading="lazy" className="aspect-[4/3] w-full rounded-md object-cover" />
                    </a>
                    {f.legenda && <span className="px-1 text-table">{f.legenda}</span>}
                    <span className="px-1 text-caption text-ink-3">
                      {f.rdo ? (
                        <Link href={`/obras/${id}/diario/${f.rdo}`}>Do RDO de {dataBR(f.rdo)}</Link>
                      ) : (
                        'Enviada na galeria'
                      )}{' '}
                      · {f.autor}
                    </span>
                    {escreve && <FormAcao action={removerFoto.bind(null, id, f.id)} botao="Tirar foto" variante="fantasma" tamanho="sm" />}
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </>
  )
}
