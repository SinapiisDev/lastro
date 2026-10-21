'use client'

import { Predio3D } from '@ds'

// Prédio de vitrine na entrada (sem dados de obra: ainda não há sessão).
const VITRINE = { fundacao: 100, estrutura: 100, alvenaria: 86, instalacoes: 70, cobertura: 60, acabamento: 45 }

export function HeroiPredio() {
  return (
    <div className="absolute inset-0">
      <Predio3D progresso={VITRINE} enquadreX={0.1} zoom={0.95} rotulo="Prédio em 3D ilustrando uma obra em andamento" />
    </div>
  )
}
