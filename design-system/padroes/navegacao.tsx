'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Navegação em pílulas (ativo preto). Rola na horizontal no celular.
export function Navegacao({ links }: { links: [string, string][] }) {
  const atual = usePathname()
  // Ativo é o link mais específico que bate (/obras/3/diario ganha de /obras/3).
  const ativoHref = links
    .map(([href]) => href)
    .filter((href) => atual === href || atual.startsWith(href + '/'))
    .sort((a, b) => b.length - a.length)[0]
  return (
    <nav aria-label="Painéis" className="flex min-w-0 justify-center">
      <div className="ds-sem-barra flex max-w-full gap-1 overflow-x-auto rounded-full bg-surface p-1">
        {links.map(([href, texto]) => {
          const ativo = href === ativoHref
          return (
            <Link
              key={href}
              href={href}
              aria-current={ativo ? 'page' : undefined}
              className={`rounded-full px-4 py-2 text-[13px] font-semibold whitespace-nowrap no-underline transition-colors ${
                ativo ? 'bg-ink text-on-ink' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
              }`}
            >
              {texto}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
