import Link from 'next/link'
import { Suspense } from 'react'
import { BarraSuperior } from '@ds'
import { lerConfig } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { sair } from '../entrar/acoes'

// Cada página confere o acesso por conta própria; aqui o login só monta o menu.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <Suspense fallback={<div className="h-[68px]" aria-hidden />}>
        <Cabecalho />
      </Suspense>
      <main className="mx-auto flex w-full max-w-[1720px] flex-1 flex-col gap-4 px-4 pt-2 pb-10 sm:px-6">{children}</main>
    </>
  )
}

async function Cabecalho() {
  const [s, config] = await Promise.all([exigirSessao(), lerConfig()])
  const links: [string, string][] =
    s.perfil === 'obra'
      ? [
          [`/obras/${s.obraId}`, 'Obra'],
          ['/orcamento', 'Orçamento'],
          ['/cotacoes', 'Cotações'],
          ['/compras', 'Compras'],
        ]
      : [
          ['/financeiro', 'Painel'],
          ['/obras', 'Obras'],
          ['/orcamento', 'Orçamento'],
          ['/cotacoes', 'Cotações'],
          ['/conversas', 'Conversas'],
          ['/compras', 'Compras'],
          ['/relatorios', 'Relatórios'],
          ['/historico', 'Histórico'],
          ...(s.perfil === 'chefe' ? ([['/configuracoes', 'Configurações']] as [string, string][]) : []),
        ]
  const perfil = { obra: 'Obra', financeiro: 'Financeiro', chefe: 'Chefe' }[s.perfil]

  return (
    <BarraSuperior
      links={links}
      perfil={perfil}
      nome={s.perfil === 'obra' ? s.nome : perfil}
      empresa={config.nomeEmpresa}
      sair={
        <>
          {s.perfil === 'chefe' && (
            <Link href="/design-system" className="rounded-sm px-2.5 py-2 text-[13px] font-semibold no-underline hover:bg-surface-2">
              Design system
            </Link>
          )}
          <form action={sair}>
            <button className="w-full cursor-pointer rounded-sm px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-surface-2">Sair</button>
          </form>
        </>
      }
    />
  )
}
