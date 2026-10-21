import type { ReactNode } from 'react'

// Vazio: título curto + uma frase + uma ação (DESIGN.md §3).
export function EstadoVazio({ titulo, children, acao, compacto = false }: { titulo: string; children?: ReactNode; acao?: ReactNode; compacto?: boolean }) {
  return (
    <div
      className={`flex flex-col items-start gap-1.5 rounded-md border-[1.5px] border-dashed border-line ${compacto ? 'p-4' : 'p-5'}`}
    >
      <span className="text-body font-semibold">{titulo}</span>
      {children && <span className="text-[12.5px] text-ink-3">{children}</span>}
      {acao && <span className="mt-1.5">{acao}</span>}
    </div>
  )
}

// Carregando: esqueletos com pulso de 1,4 s, nunca spinner em tela cheia.
export function Esqueleto({ linhas = 4, className = '' }: { linhas?: number; className?: string }) {
  const larguras = ['60%', '90%', '75%', '85%', '70%', '95%']
  return (
    <div className={`flex flex-col gap-2.5 py-3.5 ${className}`} role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => (
        <span key={i} className="ds-esqueleto block h-3.5 rounded-xs" style={{ width: larguras[i % larguras.length] }} />
      ))}
    </div>
  )
}
