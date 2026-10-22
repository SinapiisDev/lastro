import Link from 'next/link'
import { CabecalhoTela, EstadoVazio, Etiqueta, Secao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { quando } from '@/lib/historico'
import { whatsappReal } from '@/lib/whatsapp'

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || nome.slice(0, 2).toUpperCase()

export default async function Conversas() {
  await exigirSessao('chefe', 'financeiro')
  const fornecedores = await sql<{ id: number; nome: string; whatsapp: string | null; iaPausada: boolean; ultima: Date | null; texto: string | null; pendentes: number; semResposta: boolean }[]>`
    select f.id, f.nome, f.whatsapp, f.ia_pausada as "iaPausada", u.criada_em as ultima, u.texto,
      (select count(*) from mensagens m where m.fornecedor_id = f.id and m.pendente_ia)::int as pendentes,
      coalesce(u.direcao = 'entrada', false) as "semResposta"
    from fornecedores f
    left join lateral (select criada_em, texto, direcao from mensagens m where m.fornecedor_id = f.id order by id desc limit 1) u on true
    order by u.criada_em desc nulls last, f.nome`

  return (
    <>
      <CabecalhoTela contexto={whatsappReal() ? 'WhatsApp da empresa' : 'WhatsApp simulado'} titulo="Conversas com fornecedores">
        <p className="max-w-3xl text-table text-ink-2">
          {whatsappReal()
            ? 'Mensagens do WhatsApp da empresa. A IA conversa com os fornecedores sobre as cotações; qualquer pessoa pode assumir.'
            : 'WhatsApp simulado: as mensagens ficam só no sistema. Abra um fornecedor para simular a resposta dele.'}
        </p>
      </CabecalhoTela>
      <Secao titulo="Fornecedores">
        {fornecedores.length === 0 ? (
          <EstadoVazio titulo="Nenhum fornecedor cadastrado">Os fornecedores entram pelas cotações, pelas compras ou pelas configurações.</EstadoVazio>
        ) : (
          <ul className="flex flex-col">
            {fornecedores.map((f) => (
              <li key={f.id} className="border-b border-line last:border-0">
                <Link
                  href={`/conversas/${f.id}`}
                  className="grid grid-cols-[40px_1fr] items-center gap-3 rounded-md px-2 py-3 no-underline hover:bg-surface-2 sm:grid-cols-[40px_minmax(0,1fr)_auto]"
                >
                  <span className="flex size-10 items-center justify-center rounded-full bg-surface-3 text-label font-bold text-ink-2">{iniciais(f.nome)}</span>
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-[13.5px] font-semibold">{f.nome}</span>
                      <span className="text-caption text-ink-3">{f.whatsapp ? `+${f.whatsapp}` : 'sem WhatsApp'}</span>
                    </span>
                    <span className="truncate text-caption text-ink-3">{f.ultima ? f.texto : 'nenhuma mensagem'}</span>
                  </span>
                  <span className="col-start-2 flex flex-wrap items-center gap-2 sm:col-start-auto sm:justify-end">
                    {f.pendentes > 0 && <Etiqueta tom="aviso">{f.pendentes} aguardando a IA</Etiqueta>}
                    {f.iaPausada && <Etiqueta tom="vinho">IA pausada: precisa de uma pessoa</Etiqueta>}
                    {f.semResposta && !f.pendentes && <Etiqueta>última mensagem foi dele</Etiqueta>}
                    {f.ultima && <span className="text-[11px] font-semibold text-ink-3">{quando(f.ultima)}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </>
  )
}
