// Textos de domínio usados nas telas (não são do design system).
import type { TomEtiqueta } from '@ds'
export const FAIXAS = { baixa: 'Teto baixo (sem aprovação)', media: 'Teto médio (financeiro)', alta: 'Acima do teto médio (dono)' }

export const CLIMAS: Record<string, string> = { bom: 'Bom', nublado: 'Nublado', chuva: 'Chuva', impraticavel: 'Impraticável' }

export const TIPOS_ITEM: Record<string, string> = {
  material: 'Material',
  mao_de_obra: 'Mão de obra',
  equipamento: 'Equipamento',
  frete: 'Frete',
  servico: 'Serviço',
  outros: 'Outros',
}

// Situação da obra (as mesmas do sistema antigo). Finalizada e cancelada saem das listas do dia a dia.
export const SITUACOES_OBRA: Record<string, [string, TomEtiqueta]> = {
  nao_iniciada: ['Não iniciada', 'neutro'],
  em_andamento: ['Em andamento', 'info'],
  paralisada: ['Paralisada', 'aviso'],
  finalizada: ['Finalizada', 'ok'],
  cancelada: ['Cancelada', 'neg'],
}

export const CATEGORIAS_OBRA = ['Construção Casa', 'Construção Prédio', 'Reforma', 'Gerencial']
