import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarFluxo, filtrosDaUrl, type LinhaFluxo } from './fluxo-analitico.ts'

const l = (data: string, valor: number, tipo: LinhaFluxo['tipo'], extra: Partial<LinhaFluxo> = {}): LinhaFluxo => ({
  data,
  valor,
  tipo,
  obra: 'Obra',
  fornecedor: null,
  descricao: 'x',
  documento: null,
  conta: null,
  compraId: null,
  parcela: null,
  ...extra,
})

const linhas = [
  l('2026-10-20', -100, 'previsto'), // venceu antes do período e continua em aberto
  l('2026-11-03', 20000, 'realizado'),
  l('2026-11-03', -11655.58, 'realizado'),
  l('2026-11-04', -700, 'previsto'), // atrasada (hoje é 10/11)
  l('2026-11-05', -50, 'realizado', { foraDoSaldo: true }),
  l('2026-11-20', 15300, 'previsto'),
  l('2026-11-25', -3000, 'aguardando'),
  l('2026-12-10', -999, 'previsto'), // depois do período: fora
]

test('fluxo analítico: saldo linha a linha e resumo como no sistema antigo', () => {
  const f = montarFluxo({ linhas, saldoInicial: 212604.23, inicio: '2026-11-01', fim: '2026-11-30', hoje: '2026-11-10', ver: 'ambos' })
  assert.equal(f.inicialPrevisto, -100)
  assert.deepEqual(
    f.extrato.map((x) => [x.data, x.valor, x.saldo]),
    [
      ['2026-11-03', 20000, 232504.23],
      ['2026-11-03', -11655.58, 220848.65],
      ['2026-11-04', -700, 220148.65],
      ['2026-11-05', -50, 220148.65], // fora do saldo: aparece, não soma
      ['2026-11-20', 15300, 235448.65],
      ['2026-11-25', -3000, 232448.65],
    ],
  )
  assert.equal(f.extrato[2].atrasada, true)
  assert.deepEqual(f.resumo, {
    saldoInicial: 212604.23,
    creditos: 20000,
    debitos: -11655.58,
    realizado: 8344.42,
    parcial: 220948.65,
    aReceber: 15300,
    aPagar: -3800, // -100 de antes + -700 + -3000
    previsto: 11500,
    final: 232448.65, // igual ao último saldo
    atrasoReceber: 0,
    atrasoPagar: -800,
    atraso: -800,
  })
})

test('fluxo analítico: filtros do endereço', () => {
  assert.deepEqual(filtrosDaUrl({}, '2026-11-19'), {
    inicio: '2026-11-01',
    fim: '2026-11-30',
    ver: 'ambos',
    natureza: undefined,
    obraId: undefined,
    contaId: undefined,
    fornecedorId: undefined,
    aguardando: true,
  })
  const f = filtrosDaUrl({ de: '2026-12-31', ate: '2026-12-01', ver: 'previsto', obra: '3', f: '1', natureza: 'x' }, '2026-11-19')
  assert.deepEqual([f.inicio, f.fim, f.ver, f.obraId, f.aguardando, f.natureza], ['2026-12-01', '2026-12-31', 'previsto', 3, false, undefined])
  assert.equal(filtrosDaUrl({ de: '2026-02-30' }, '2026-02-10').inicio, '2026-02-01') // data inválida: volta ao padrão
})

test('fluxo analítico: só realizado', () => {
  const f = montarFluxo({ linhas, saldoInicial: 1000, inicio: '2026-11-01', fim: '2026-11-30', hoje: '2026-11-10', ver: 'realizado' })
  assert.equal(f.inicialPrevisto, 0)
  assert.equal(f.extrato.length, 3)
  assert.equal(f.resumo.final, f.resumo.parcial + f.resumo.previsto)
  assert.equal(f.resumo.previsto, 0)
})
