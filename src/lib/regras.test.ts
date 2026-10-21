import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  faixaDaCompra,
  dividirParcelas,
  progressoEtapa,
  gastoNaFrente,
  projetarFluxo,
  detectarFracionamento,
  somarDias,
  totalItem,
  comBdi,
} from './regras.ts'

test('orçamento: total do item em centavos e preço com BDI', () => {
  assert.equal(totalItem(3, 0.1), 0.3) // 3 × 0,10 sem erro de ponto flutuante
  assert.equal(totalItem(12.5, 39.9), 498.75)
  assert.equal(totalItem(0.333, 10), 3.33)
  assert.equal(comBdi(100000, 25), 125000)
  assert.equal(comBdi(1000, 0), 1000)
  assert.equal(comBdi(333.33, 10), 366.66)
})

test('faixa de aprovação pelos tetos (limite pertence à faixa de baixo)', () => {
  assert.equal(faixaDaCompra(2000, 2000, 20000), 'baixa')
  assert.equal(faixaDaCompra(2000.01, 2000, 20000), 'media')
  assert.equal(faixaDaCompra(7000, 2000, 20000), 'media')
  assert.equal(faixaDaCompra(20000, 2000, 20000), 'media')
  assert.equal(faixaDaCompra(20000.01, 2000, 20000), 'alta')
})

test('parcelas somam o total exato e vencem a cada 30 dias', () => {
  const p = dividirParcelas(100, 3, '2026-01-31')
  assert.deepEqual(p.map((x) => x.valor), [33.33, 33.33, 33.34])
  assert.deepEqual(p.map((x) => x.vencimento), ['2026-01-31', '2026-03-02', '2026-04-01'])
  assert.equal(somarDias('2026-12-31', 1), '2027-01-01')
})

test('progresso da etapa e alerta de gasto', () => {
  assert.equal(progressoEtapa([100, 50, 0]), 50)
  assert.equal(progressoEtapa([]), 0)
  assert.equal(gastoNaFrente(85, 100, 60), true)
  assert.equal(gastoNaFrente(50, 100, 60), false)
  assert.equal(gastoNaFrente(10, 0, 0), true)
})

test('fluxo de caixa: atrasados no mês atual, acumulado a partir do saldo', () => {
  const linhas = projetarFluxo(
    1000,
    [
      { data: '2026-09-10', valor: -100 }, // atrasado
      { data: '2026-10-25', valor: 500 },
      { data: '2026-11-05', valor: -2000 },
      { data: '2027-06-01', valor: -999 }, // fora do horizonte
    ],
    '2026-10-20',
    3,
  )
  assert.deepEqual(
    linhas.map((l) => [l.mes, l.entradas, l.saidas, l.acumulado]),
    [
      ['2026-10', 500, 100, 1400],
      ['2026-11', 0, 2000, -600],
      ['2026-12', 0, 0, -600],
    ],
  )
})

test('fracionamento: mesmo fornecedor e obra em 7 dias passando o teto', () => {
  const c = (id: number, data: string, valor: number, fornecedorId = 1, obraId = 1) => ({ id, obraId, fornecedorId, data, valor })
  const suspeitas = detectarFracionamento(
    [
      c(1, '2026-10-01', 1500),
      c(2, '2026-10-05', 1500), // junto com 1 passa 2000
      c(3, '2026-10-20', 1500), // longe demais
      c(4, '2026-10-02', 1500, 2), // outro fornecedor
      c(5, '2026-10-03', 100),
      c(6, '2026-10-04', 100, 1, 2), // outra obra
    ],
    2000,
  )
  assert.deepEqual([...suspeitas].sort(), [1, 2, 5])
})
