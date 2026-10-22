import { connection } from 'next/server'
import { BotaoLink, Campo, Entrada, FormAcao } from '@ds'
import { lerPreSessao, ROTULO_PERFIL } from '@/lib/sessao'
import { SENHA_MINIMA, convitePodeDefinirSenha, conviteValido } from '@/lib/contas'
import { Moldura } from '@/app/entrar/moldura'
import { concluirAcesso, confirmarEmail } from './acoes'

export const instant = false

// Link de acesso que o dono mandou: confirma o e-mail, cria a senha e entra direto no painel da área.
export default async function Convite({ params }: PageProps<'/convite/[token]'>) {
  await connection()
  const { token } = await params
  const c = await conviteValido(token)
  if (!c)
    return (
      <Moldura titulo="Link vencido" subtitulo="Este link de acesso venceu ou já foi usado. Peça um link novo ao dono da construtora.">
        <BotaoLink href="/entrar" variante="secundario" tamanho="lg">
          Ir para a entrada
        </BotaoLink>
      </Moldura>
    )

  const area = `${c.empresa} · ${ROTULO_PERFIL[c.perfil]}`
  const pre = await lerPreSessao()
  if (pre?.convite !== c.id || pre.email !== c.email)
    return (
      <Moldura titulo={`Olá, ${c.nome.split(' ')[0]}`} subtitulo={`Seu acesso: ${area}. Digite o seu e-mail para continuar.`}>
        <FormAcao action={confirmarEmail.bind(null, token)} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
          <Campo rotulo="E-mail">
            <Entrada name="email" type="email" required autoComplete="username" className="min-h-12" />
          </Campo>
        </FormAcao>
      </Moldura>
    )

  if (!(await convitePodeDefinirSenha(c.email, c.empresaId)))
    return (
      <Moldura titulo="Digite a sua senha" subtitulo={`Você já tem conta no Lastro. Use a mesma senha para entrar também em ${area}.`}>
        <FormAcao action={concluirAcesso.bind(null, token)} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
          <input type="hidden" name="email" value={c.email} autoComplete="username" />
          <Campo rotulo="Senha">
            <Entrada name="senha" type="password" required autoComplete="current-password" className="min-h-12" />
          </Campo>
        </FormAcao>
      </Moldura>
    )

  return (
    <Moldura titulo="Crie a sua senha" subtitulo={`É com ela e o e-mail ${c.email} que você vai entrar daqui para frente. Acesso: ${area}.`}>
      <FormAcao action={concluirAcesso.bind(null, token)} botao="Criar senha e entrar" variante="primario" tamanho="lg" largura className="flex flex-col gap-4">
        <input type="hidden" name="email" value={c.email} autoComplete="username" />
        <Campo rotulo="Senha" ajuda={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
          <Entrada name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" className="min-h-12" />
        </Campo>
        <Campo rotulo="Repita a senha">
          <Entrada name="confirmar" type="password" required autoComplete="new-password" className="min-h-12" />
        </Campo>
      </FormAcao>
    </Moldura>
  )
}
