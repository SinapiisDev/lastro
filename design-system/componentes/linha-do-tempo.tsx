import type { ReactNode } from 'react'

export type TomEvento = 'neutro' | 'ok' | 'aviso' | 'neg' | 'info' | 'acento' | 'vinho'
const PONTO: Record<TomEvento, string> = {
  neutro: 'bg-ink-3',
  ok: 'bg-ok',
  aviso: 'bg-warn',
  neg: 'bg-neg',
  info: 'bg-info',
  acento: 'bg-accent',
  vinho: 'bg-vinho',
}

export type Evento = { chave: string | number; titulo: ReactNode; autor?: ReactNode; nota?: ReactNode; quando: string; tom?: TomEvento }

// Ponto 10 px na cor do evento, linha 1 px, data em caption, autor em 600.
export function LinhaDoTempo({ eventos }: { eventos: Evento[] }) {
  return (
    <ol className="flex flex-col">
      {eventos.map((e) => (
        <li key={e.chave} className="grid grid-cols-[18px_1fr] gap-2.5">
          <span className="flex flex-col items-center">
            <span className={`mt-1 size-2.5 flex-none rounded-full ${PONTO[e.tom ?? 'neutro']}`} />
            <span className="w-px flex-1 bg-line" />
          </span>
          <span className="flex flex-col gap-0.5 pb-3.5">
            <span className="text-[13px] font-semibold">
              {e.titulo}
              {e.autor && <span className="font-semibold text-ink-2"> · {e.autor}</span>}
            </span>
            {e.nota && <span className="text-[12.5px] text-ink-2">“{e.nota}”</span>}
            <span className="text-caption text-ink-3">{e.quando}</span>
          </span>
        </li>
      ))}
    </ol>
  )
}
