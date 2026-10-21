'use client'

import { useEffect, useState } from 'react'
import { Predio3D, type Progresso } from '@ds'

// Na entrada o prédio se constrói sozinho, peça por peça: cada etapa avança dentro da sua janela de tempo
// (segundos do ciclo), o pronto fica parado um pouco e a obra recomeça.
const ETAPAS: [keyof Progresso, number, number][] = [
  ['fundacao', 0, 2],
  ['estrutura', 1.8, 8],
  ['alvenaria', 3.5, 11],
  ['instalacoes', 5, 12],
  ['cobertura', 8.2, 9.6],
  ['acabamento', 9.5, 14],
]
const CICLO = 18 // 14 s de obra + 4 s com o prédio pronto
const PASSO = 120 // ms entre atualizações: cada uma faz as peças novas crescerem

export function progressoNoTempo(segundos: number): Progresso {
  const t = segundos % CICLO
  const p = {} as Progresso
  for (const [etapa, inicio, fim] of ETAPAS) p[etapa] = Math.round(Math.min(1, Math.max(0, (t - inicio) / (fim - inicio))) * 100)
  return p
}

const PRONTO = progressoNoTempo(CICLO - 0.01)

export function HeroiPredio() {
  // Quem pediu menos movimento no aparelho vê o prédio pronto, parado.
  const [parado] = useState(() => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [progresso, setProgresso] = useState<Progresso>(() => (parado ? PRONTO : progressoNoTempo(0)))

  useEffect(() => {
    if (parado) return
    const inicio = performance.now()
    const id = setInterval(() => {
      const novo = progressoNoTempo((performance.now() - inicio) / 1000)
      // Só refaz o prédio quando alguma etapa andou (no prédio pronto, parado, nada muda).
      setProgresso((atual) => (Object.keys(novo).every((k) => novo[k as keyof Progresso] === atual[k as keyof Progresso]) ? atual : novo))
    }, PASSO)
    return () => clearInterval(id)
  }, [parado])

  return (
    <div className="absolute inset-0">
      <Predio3D progresso={progresso} zoom={1} rotulo="Prédio em 3D sendo construído, etapa por etapa" />
    </div>
  )
}
