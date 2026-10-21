'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function Nav({ links }: { links: [string, string][] }) {
  const atual = usePathname()
  return (
    <nav className="-mb-px flex gap-1 overflow-x-auto" aria-label="Painéis">
      {links.map(([href, texto]) => {
        const ativo = atual === href || atual.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            aria-current={ativo ? 'page' : undefined}
            className={`whitespace-nowrap border-b-4 px-3 py-2 ${ativo ? 'border-sinal font-semibold' : 'border-transparent text-cinza hover:text-grafite'}`}
          >
            {texto}
          </Link>
        )
      })}
    </nav>
  )
}
