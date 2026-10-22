import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Campo, Entrada, FormAcao, Segmentado } from '@ds'
import { lerSessao } from '@/lib/sessao'
import { SENHA_MINIMA } from '@/lib/contas'
import { Moldura } from './moldura'
import { entrar, cadastrarConstrutora } from './acoes'

export const instant = false

export default async function Entrar({ searchParams }: PageProps<'/entrar'>) {
  await connection()
  if (await lerSessao()) redirect('/')
  const nova = (await searchParams).nova === '1'

  return (
    <Moldura
      titulo={nova ? 'Criar minha construtora' : 'Entrar'}
      subtitulo={
        nova
          ? 'Cadastre a construtora e entre como dono. Depois você chama a equipe em Configurações › Pessoas.'
          : 'Entre com o seu e-mail e a sua senha.'
      }
    >
      <Segmentado
        opcoes={[
          { href: '/entrar', rotulo: 'Já tenho acesso', ativo: !nova },
          { href: '/entrar?nova=1', rotulo: 'Criar minha construtora', ativo: nova },
        ]}
      />
      {nova ? (
        <FormAcao action={cadastrarConstrutora} botao="Criar construtora" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="Nome da construtora" ajuda="Aparece para os fornecedores nas mensagens de WhatsApp.">
            <Entrada name="empresa" required maxLength={80} autoComplete="organization" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu nome">
            <Entrada name="nome" required maxLength={80} autoComplete="name" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu e-mail">
            <Entrada name="email" type="email" required autoComplete="username" className="min-h-12" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Senha" ajuda={`Mínimo de ${SENHA_MINIMA} caracteres.`}>
              <Entrada name="senha" type="password" required minLength={SENHA_MINIMA} autoComplete="new-password" className="min-h-12" />
            </Campo>
            <Campo rotulo="Repita a senha">
              <Entrada name="confirmar" type="password" autoComplete="new-password" className="min-h-12" />
            </Campo>
          </div>
          <span className="flex-1" />
        </FormAcao>
      ) : (
        <FormAcao action={entrar} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="E-mail">
            <Entrada name="email" type="email" required autoComplete="username" className="min-h-12" />
          </Campo>
          <Campo rotulo="Senha">
            <Entrada name="senha" type="password" required autoComplete="current-password" className="min-h-12" />
          </Campo>
          <span className="flex-1" />
          <span className="order-last -mt-1 text-center text-label text-ink-3">
            Primeiro acesso ou esqueceu a senha? Peça ao dono da construtora um link de acesso.
          </span>
        </FormAcao>
      )}
    </Moldura>
  )
}
