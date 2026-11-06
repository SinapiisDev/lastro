import Link from 'next/link'
import { Suspense } from 'react'
import { BarraSuperior } from '@ds'
import { sql, lerConfig } from '@/lib/db'
import { exigirSessao, ehAdministrador, ROTULO_PERFIL } from '@/lib/sessao'
import { PassoAPasso } from '@/components/passo-a-passo'
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
  const s = await exigirSessao()
  const [config, [u]] = await Promise.all([
    lerConfig(),
    sql<{ visto: boolean; obras: number }[]>`
      select tutorial_visto_em is not null as visto, (select count(*) from usuario_obras uo where uo.usuario_id = u.id)::int as obras
      from usuarios u where id = ${s.usuarioId}`,
  ])
  const links: [string, string][] =
    s.perfil === 'obra'
      ? [
          [`/obras/${s.obraId}`, 'Obra'],
          [`/obras/${s.obraId}/diario`, 'Diário'],
          ['/orcamento', 'Orçamento'],
          ['/cotacoes', 'Cotações'],
          ['/conversas', 'Conversas'],
          ['/compras', 'Compras'],
        ]
      : s.perfil === 'compras'
      ? [
          ...(u?.obras ? ([['/obras', 'Minhas obras']] as [string, string][]) : []),
          ['/compras', 'Compras'],
          ['/cotacoes', 'Cotações'],
          ['/conversas', 'Conversas'],
          ['/orcamento', 'Orçamento'],
        ]
      : [
          ['/financeiro', 'Painel'],
          ['/financeiro/pagar', 'A pagar'],
          ['/financeiro/receber', 'A receber'],
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
    <BarraSuperior
      links={links}
      perfil={ROTULO_PERFIL[s.perfil]}
      nome={s.nome}
      empresa={config.nomeEmpresa}
      sair={
        <>
          <Link href="/conta" className="rounded-sm px-2.5 py-2 text-[13px] font-semibold no-underline hover:bg-surface-2">
            Minha conta
          </Link>
          {ehAdministrador(s) && (
            <Link href="/admin" className="rounded-sm px-2.5 py-2 text-[13px] font-semibold no-underline hover:bg-surface-2">
              Administração do sistema
            </Link>
          )}
          <form action={sair}>
            <button className="w-full cursor-pointer rounded-sm px-2.5 py-2 text-left text-[13px] font-semibold hover:bg-surface-2">Sair</button>
          </form>
        </>
      }
    />
    {!u?.visto && <PassoAPasso perfil={s.perfil} nome={s.nome} />}
    </>
  )
}
