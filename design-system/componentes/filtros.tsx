import Link from 'next/link'
import type { ComponentProps, ReactNode } from 'react'

/**
 * Filtros (DESIGN.md §3). Feitos com <form method="get"> e links: funcionam sem JavaScript e
 * deixam a URL compartilhável.
 */

/** Seletor de obra em pílula; preto quando há obra escolhida. */
export function SeletorPilula({ ativo = false, className = '', ...resto }: ComponentProps<'select'> & { ativo?: boolean }) {
  return (
    <select
      className={`h-10 cursor-pointer appearance-none rounded-full border-0 bg-[length:5px_5px] bg-no-repeat pr-9 pl-4 text-[13px] font-semibold ${
        ativo ? 'bg-ink text-on-ink' : 'bg-surface-2 text-ink hover:bg-surface-3'
      } bg-[image:linear-gradient(45deg,transparent_50%,currentColor_50%),linear-gradient(135deg,currentColor_50%,transparent_50%)] bg-[position:calc(100%-18px)_50%,calc(100%-13px)_50%] ${className}`}
      {...resto}
    />
  )
}

/** Controle segmentado (período, abas). Cada opção é um link. */
export function Segmentado({ opcoes, fundo = 'surface-2' }: { opcoes: { href: string; rotulo: ReactNode; ativo: boolean }[]; fundo?: 'surface' | 'surface-2' }) {
  return (
    <nav className={`flex gap-0.5 overflow-x-auto rounded-full p-1 ds-sem-barra ${fundo === 'surface' ? 'bg-surface' : 'bg-surface-2'}`}>
      {opcoes.map((o) => (
        <Link
          key={o.href}
          href={o.href}
          aria-current={o.ativo ? 'true' : undefined}
          className={`inline-flex h-8 items-center rounded-full px-3 text-[12.5px] font-semibold whitespace-nowrap no-underline transition-colors ${
            o.ativo ? (fundo === 'surface' ? 'bg-ink text-on-ink' : 'bg-surface text-ink shadow-1') : 'text-ink-2 hover:text-ink'
          }`}
        >
          {o.rotulo}
        </Link>
      ))}
    </nav>
  )
}

/** Filtro ativo removível. */
export function ChipFiltro({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-[30px] items-center gap-1.5 rounded-full bg-surface-3 pr-1.5 pl-3 text-label font-semibold no-underline hover:bg-line"
    >
      {children}
      <span aria-label="remover filtro" className="flex size-5 items-center justify-center rounded-full bg-surface">
        ×
      </span>
    </Link>
  )
}

/** Chip de seleção (situação). Marcado = fundo da família semântica. */
export function ChipOpcao({ href, ativo, children, quantidade }: { href: string; ativo: boolean; children: ReactNode; quantidade?: number }) {
  return (
    <Link
      href={href}
      aria-current={ativo ? 'true' : undefined}
      className={`inline-flex h-[30px] items-center gap-1.5 rounded-full border px-3 text-label font-semibold no-underline transition-colors ${
        ativo ? 'border-ink bg-ink text-on-ink' : 'border-line bg-surface text-ink-2 hover:text-ink'
      }`}
    >
      {children}
      {quantidade !== undefined && <span className="opacity-60">{quantidade}</span>}
    </Link>
  )
}
