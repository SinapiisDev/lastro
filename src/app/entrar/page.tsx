import { connection } from 'next/server'
import { redirect } from 'next/navigation'
import { Campo, Entrada, FormAcao, Marca, BotaoTema } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { lerSessao } from '@/lib/sessao'
import { FormLogin } from './form-login'
import { HeroiPredio } from './heroi-predio'
import { primeiroAcesso } from './acoes'

export const instant = false

export default async function Entrar() {
  await connection()
  if (await lerSessao()) redirect('/')
  const config = await lerConfig()
  const obras = await sql<{ id: number; nome: string; endereco: string | null }[]>`
    select id, nome, endereco from obras where ativa order by nome`

  return (
    <main className="grid min-h-screen gap-4 bg-bg p-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(360px,520px)]">
      <section className="relative hidden min-h-[600px] overflow-hidden rounded-xl bg-surface lg:block">
        <HeroiPredio />
        <div className="pointer-events-none absolute top-8 left-8">
          <Marca tamanho={44} subtitulo={`${config.nomeEmpresa} · uso interno`} />
        </div>
        <div className="pointer-events-none absolute bottom-8 left-8 flex max-w-[380px] flex-col gap-2.5">
          <h1 className="font-display text-display font-light tracking-[-0.02em]">Cada real da obra, no lugar certo.</h1>
          <p className="text-body text-ink-2">
            Orçamento, compras e pagamentos {obras.length === 1 ? 'da obra' : `das ${obras.length} obras`} em andamento.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-7 rounded-xl bg-surface px-6 py-8 sm:px-9 sm:py-10">
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            <span className="mb-4 lg:hidden">
              <Marca subtitulo={config.nomeEmpresa} />
            </span>
            <h2 className="font-display text-h1 font-light">{config.temSenhas ? 'Entrar' : 'Primeiro acesso'}</h2>
            <span className="text-table text-ink-3">
              {config.temSenhas
                ? 'Acesso liberado pelo administrador. Não há cadastro aberto.'
                : 'Defina a senha do chefe e a do financeiro. Depois o chefe cria as obras, cada uma com a sua senha.'}
            </span>
          </div>
          <BotaoTema className="bg-surface-2" />
        </div>
        {config.temSenhas ? (
          <FormLogin obras={obras} />
        ) : (
          <FormAcao action={primeiroAcesso} botao="Salvar senhas e entrar" variante="primario" tamanho="lg" largura className="flex flex-1 flex-col gap-4">
            <Campo rotulo="Senha do chefe" ajuda="Mínimo de 8 caracteres.">
              <Entrada name="chefe" type="password" minLength={8} required autoComplete="new-password" className="min-h-12" />
            </Campo>
            <Campo rotulo="Senha do financeiro">
              <Entrada name="financeiro" type="password" minLength={8} required autoComplete="new-password" className="min-h-12" />
            </Campo>
            <span className="flex-1" />
          </FormAcao>
        )}
      </section>
    </main>
  )
}
