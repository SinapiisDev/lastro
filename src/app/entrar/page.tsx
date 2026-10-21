import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Campo, Entrada, FormAcao } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { lerSessao } from '@/lib/sessao'
import { Moldura } from './moldura'
import { entrar, primeiroAcesso } from './acoes'

export const instant = false

export default async function Entrar() {
  await connection()
  if (await lerSessao()) redirect('/')
  const [config, [{ instalado }]] = await Promise.all([lerConfig(), sql<{ instalado: boolean }[]>`select exists (select 1 from usuarios) as instalado`])

  return (
    <Moldura
      empresa={config.nomeEmpresa}
      titulo={instalado ? 'Entrar' : 'Instalar o sistema'}
      subtitulo={
        instalado
          ? 'Cada pessoa entra com o próprio e-mail. Contas novas são criadas pelo dono.'
          : 'Crie a conta do dono. Depois, em Configurações › Pessoas, você cria as contas do financeiro e dos engenheiros.'
      }
    >
      {instalado ? (
        <FormAcao action={entrar} botao="Entrar" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="E-mail">
            <Entrada name="email" type="email" required autoComplete="username" className="min-h-12" />
          </Campo>
          <Campo rotulo="Senha">
            <Entrada name="senha" type="password" required autoComplete="current-password" className="min-h-12" />
          </Campo>
          <span className="flex-1" />
          <span className="order-last -mt-1 text-center text-label text-ink-3">Esqueceu a senha? O dono redefine em Configurações › Pessoas.</span>
        </FormAcao>
      ) : (
        <FormAcao action={primeiroAcesso} botao="Criar conta do dono" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
          <Campo rotulo="Código de instalação" ajuda="Está na configuração do servidor (CODIGO_INSTALACAO). Sem ele, ninguém consegue instalar o sistema no seu lugar.">
            <Entrada name="codigo" type="password" required autoComplete="off" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu nome">
            <Entrada name="nome" required autoComplete="name" className="min-h-12" />
          </Campo>
          <Campo rotulo="Seu e-mail">
            <Entrada name="email" type="email" required autoComplete="username" className="min-h-12" />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Senha" ajuda="Mínimo de 10 caracteres.">
              <Entrada name="senha" type="password" minLength={10} required autoComplete="new-password" className="min-h-12" />
            </Campo>
            <Campo rotulo="Repita a senha">
              <Entrada name="confirmar" type="password" minLength={10} required autoComplete="new-password" className="min-h-12" />
            </Campo>
          </div>
          <p className="rounded-md bg-surface-2 px-3.5 py-3 text-label leading-normal text-ink-2">
            No próximo passo você liga a verificação pelo celular: instale um aplicativo autenticador (Google Authenticator ou Microsoft
            Authenticator) para ler o QR Code.
          </p>
        </FormAcao>
      )}
    </Moldura>
  )
}
