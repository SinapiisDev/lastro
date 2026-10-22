'use client'

import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react'

// Caixa de marcação: não marcada, selecionada, parcial (indeterminate) e desabilitada.
export function Marcacao({
  rotulo,
  parcial = false,
  className = '',
  ...resto
}: ComponentProps<'input'> & { rotulo?: ReactNode; parcial?: boolean }) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = parcial
  }, [parcial])
  const caixa = <input ref={ref} type="checkbox" className="ds-check" {...resto} />
  if (!rotulo) return caixa
  return (
    <label className={`inline-flex cursor-pointer items-center gap-2 text-[13px] has-disabled:cursor-not-allowed has-disabled:opacity-40 ${className}`}>
      {caixa}
      {rotulo}
    </label>
  )
}

// Interruptor ligado/desligado (azul quando ligado).
export function Interruptor({ rotulo, descricao, className = '', ...resto }: ComponentProps<'input'> & { rotulo: ReactNode; descricao?: ReactNode }) {
  return (
    <label className={`flex cursor-pointer items-center justify-between gap-4 ${className}`}>
      <span className="flex flex-col gap-0.5">
        <span className="text-body font-semibold">{rotulo}</span>
        {descricao && <span className="text-[12.5px] text-ink-3">{descricao}</span>}
      </span>
      <input type="checkbox" role="switch" className="ds-interruptor" {...resto} />
    </label>
  )
}
