import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { BotaoLink, FormAcao } from '@ds'
import { sqlSistema as sql } from '@/lib/db'
import { lerPreSessao, ROTULO_PERFIL } from '@/lib/sessao'
import { pessoasDoEmail } from '@/lib/contas'
import { Moldura } from '../moldura'
import { escolherEmpresa, escolherObra } from '../acoes'

export const instant = false

const opcao =
  'flex cursor-pointer items-center gap-3 rounded-md border-[1.5px] border-line px-3.5 py-3 hover:bg-surface-2 has-checked:border-ink has-checked:bg-surface-2'

// Depois da senha: a construtora (se o e-mail estiver em mais de uma) e a obra (engenheiro com várias).
export default async function Verificar() {
  await connection()
  const pre = await lerPreSessao()
  if (!pre?.senhaOk) redirect('/entrar')
  const voltar = (
    <BotaoLink href="/entrar" variante="fantasma" tamanho="sm" className="self-center">
      Entrar com outro e-mail
    </BotaoLink>
  )

  if (!pre.usuarioId) {
    const pessoas = await pessoasDoEmail(pre.email)
    return (
      <Moldura titulo="Qual construtora?" subtitulo="Seu e-mail está em mais de uma construtora. Escolha em qual vai entrar agora.">
        <FormAcao action={escolherEmpresa} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-2">
          {pessoas.map((p, i) => (
            <label key={p.id} className={opcao}>
              <input type="radio" name="pessoa" value={p.id} defaultChecked={i === 0} className="ds-check rounded-full" required />
              <span className="flex flex-col">
                <span className="text-body font-semibold">{p.empresa}</span>
                <span className="text-caption text-ink-3">{ROTULO_PERFIL[p.perfil]}</span>
              </span>
            </label>
          ))}
        </FormAcao>
        {voltar}
      </Moldura>
    )
  }

  const obras = await sql<{ id: number; nome: string; endereco: string | null }[]>`
    select o.id, o.nome, o.endereco from usuario_obras uo join obras o on o.id = uo.obra_id
    join usuarios u on u.id = uo.usuario_id
    where uo.usuario_id = ${pre.usuarioId} and u.email = ${pre.email} and o.ativa order by o.nome`
  return (
    <Moldura titulo="Qual obra?" subtitulo="Você cuida de mais de uma obra. Escolha em qual vai trabalhar agora; dá para trocar depois em Minha conta.">
      <FormAcao action={escolherObra} botao="Entrar na obra" variante="primario" tamanho="lg" largura className="flex flex-col gap-2">
        {obras.map((o, i) => (
          <label key={o.id} className={opcao}>
            <input type="radio" name="obra" value={o.id} defaultChecked={i === 0} className="ds-check rounded-full" required />
            <span className="flex flex-col">
              <span className="text-body font-semibold">{o.nome}</span>
              {o.endereco && <span className="text-caption text-ink-3">{o.endereco}</span>}
            </span>
          </label>
        ))}
      </FormAcao>
      {voltar}
    </Moldura>
  )
}
