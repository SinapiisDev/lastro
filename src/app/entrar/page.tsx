import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { sql, lerConfig } from '@/lib/db'
import { lerSessao } from '@/lib/sessao'
import { FormAcao } from '@/components/form-acao'
import { FormLogin } from './form-login'
import { primeiroAcesso } from './acoes'

export const instant = false

export default async function Entrar() {
  await connection()
  if (await lerSessao()) redirect('/')
  const config = await lerConfig()
  const obras = await sql<{ id: number; nome: string }[]>`select id, nome from obras where ativa order by nome`

  return (
    <main className="mx-auto w-full max-w-sm px-4 py-12">
      <h1 className="mb-1">Gestão de Obras</h1>
      {config.temSenhas ? (
        <>
          <p className="mb-6 text-cinza">Escolha seu acesso e digite a senha.</p>
          <FormLogin obras={obras} />
        </>
      ) : (
        <>
          <p className="mb-6 text-cinza">
            Primeiro acesso ao sistema. Defina a senha do chefe e a do financeiro. Depois o chefe cria as obras, cada
            uma com a sua senha.
          </p>
          <FormAcao action={primeiroAcesso} botao="Salvar senhas e entrar" principal className="cartao grid gap-4">
            <label>
              <span className="rotulo">Senha do chefe</span>
              <input name="chefe" type="password" minLength={8} required className="campo" autoComplete="new-password" />
            </label>
            <label>
              <span className="rotulo">Senha do financeiro</span>
              <input name="financeiro" type="password" minLength={8} required className="campo" autoComplete="new-password" />
            </label>
          </FormAcao>
        </>
      )}
    </main>
  )
}
