import Link from 'next/link'
import { sql } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { quando } from '@/lib/historico'
import { whatsappReal } from '@/lib/whatsapp'
import { Vazio, Rolagem } from '@/components/ui'

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
    <div className="grid gap-4">
      <h1>Conversas com fornecedores</h1>
      <p className="text-cinza">
        {whatsappReal()
          ? 'Mensagens do WhatsApp da empresa. A IA conversa com os fornecedores sobre as cotações; qualquer pessoa pode assumir.'
          : 'WhatsApp simulado: as mensagens ficam só no sistema. Abra um fornecedor para simular a resposta dele.'}
      </p>
      <section className="cartao">
        {fornecedores.length === 0 ? (
          <Vazio>Nenhum fornecedor cadastrado.</Vazio>
        ) : (
          <Rolagem>
            <table className="tabela">
              <thead>
                <tr>
                  <th>Fornecedor</th>
                  <th>Última mensagem</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {fornecedores.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <Link href={`/conversas/${f.id}`} className="font-medium underline">
                        {f.nome}
                      </Link>
                      <span className="block text-sm text-cinza">{f.whatsapp ? `+${f.whatsapp}` : 'sem WhatsApp'}</span>
                    </td>
                    <td className="max-w-md">
                      {f.ultima ? (
                        <>
                          <span className="block truncate">{f.texto}</span>
                          <span className="text-sm text-cinza">{quando(f.ultima)}</span>
                        </>
                      ) : (
                        <span className="text-cinza">nenhuma</span>
                      )}
                    </td>
                    <td className="text-sm">
                      {f.pendentes > 0 && <span className="block text-alerta">{f.pendentes} aguardando a IA</span>}
                      {f.iaPausada && <span className="block text-alerta">IA pausada: precisa de uma pessoa</span>}
                      {f.semResposta && !f.pendentes && <span className="block text-cinza">última mensagem foi dele</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Rolagem>
        )}
      </section>
    </div>
  )
}
