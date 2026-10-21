import { Suspense } from 'react'
import { exigirSessao, nomePerfil } from '@/lib/sessao'
import { sair } from '../entrar/acoes'
import { Nav } from './nav'

// Cada página confere o acesso por conta própria; aqui o login só monta o menu.
export default function AppLayout({ children }: LayoutProps<'/'>) {
  return (
    <>
      <header className="border-b border-linha bg-superficie print:hidden">
        <Suspense fallback={<div className="h-[5.6rem]" />}>
          <Cabecalho />
        </Suspense>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  )
}

async function Cabecalho() {
  const s = await exigirSessao()
  const links: [string, string][] =
    s.perfil === 'obra'
      ? [
          [`/obras/${s.obraId}`, 'Obra'],
          ['/orcamento', 'Orçamento'],
          ['/cotacoes', 'Cotações'],
          ['/compras', 'Compras'],
        ]
      : [
          ['/financeiro', 'Financeiro'],
          ['/obras', 'Obras'],
          ['/orcamento', 'Orçamento'],
          ['/cotacoes', 'Cotações'],
          ['/conversas', 'Conversas'],
          ['/compras', 'Compras'],
          ['/relatorios', 'Relatórios'],
          ['/historico', 'Histórico'],
          ...(s.perfil === 'chefe' ? ([['/configuracoes', 'Configurações']] as [string, string][]) : []),
        ]

  return (
    <>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 pt-3">
        <p className="font-semibold">Gestão de Obras</p>
        <form action={sair} className="flex items-center gap-3 text-sm">
          <span className="text-cinza">{nomePerfil(s)}</span>
          <button className="underline">Sair</button>
        </form>
      </div>
      <div className="mx-auto max-w-6xl px-2">
        <Nav links={links} />
      </div>
    </>
  )
}
