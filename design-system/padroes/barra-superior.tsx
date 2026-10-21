import Link from 'next/link'
import type { ReactNode } from 'react'
import { Marca } from './marca'
import { Navegacao } from './navegacao'
import { BotaoTema } from './alternar-tema'

const iniciais = (nome: string) =>
  nome
    .split(/\s+/)
    .filter((p) => p.length > 2 || /^[A-ZÁ-Ú]/.test(p))
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('') || nome.slice(0, 2).toUpperCase()

/**
 * Barra superior (DESIGN.md §4): marca à esquerda, navegação em pílulas no centro,
 * perfil + tema + avatar à direita. O avatar abre o menu com "Sair".
 */
export function BarraSuperior({
  links,
  perfil,
  nome,
  empresa,
  sair,
}: {
  links: [string, string][]
  perfil: string
  nome: string
  empresa?: string
  /** formulário/botão de saída (server action) */
  sair: ReactNode
}) {
  return (
    <header className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 px-4 py-3.5 sm:px-6 lg:grid-cols-[auto_1fr_auto] print:hidden">
      <Link href="/" className="no-underline">
        <Marca subtitulo={empresa} />
      </Link>
      <div className="col-span-2 row-start-2 lg:col-span-1 lg:col-start-2 lg:row-start-1">
        <Navegacao links={links} />
      </div>
      <div className="flex items-center justify-end gap-2">
        <span className="hidden h-10 items-center gap-2 rounded-full bg-surface pr-3.5 pl-1.5 text-[13px] font-semibold md:flex">
          <span className="rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-bold text-ink-2">{perfil}</span>
          <span className="max-w-48 truncate">{nome}</span>
        </span>
        <BotaoTema />
        <details className="relative">
          <summary
            aria-label={`Menu de ${nome}`}
            className="flex size-10 cursor-pointer items-center justify-center rounded-full bg-pink text-[13px] font-bold text-fixed-ink"
          >
            {iniciais(nome)}
          </summary>
          <div className="absolute top-12 right-0 z-30 flex w-56 flex-col gap-1 rounded-md border border-line bg-surface p-1.5 shadow-2">
            <span className="px-2.5 pt-1.5 text-caption text-ink-3">
              {perfil} · {nome}
            </span>
            {sair}
          </div>
        </details>
      </div>
    </header>
  )
}
