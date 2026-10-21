import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarWhatsapp,
  variantesWhatsapp,
  ratearFrete,
  parcelasPorPrazos,
  resumirProposta,
  menorPorItem,
  economia,
  validarExtracao,
  validarRecomendacao,
} from './cotacao.ts'

test('número de WhatsApp: só dígitos, com DDI, e variantes do 9º dígito', () => {
  assert.equal(normalizarWhatsapp('(11) 99999-8888'), '5511999998888')
  assert.equal(normalizarWhatsapp('+55 11 3333-4444'), '551133334444')
  assert.equal(normalizarWhatsapp('123'), null)
  assert.deepEqual(variantesWhatsapp('5511999998888'), ['5511999998888', '551199998888'])
  assert.deepEqual(variantesWhatsapp('551199998888'), ['551199998888', '5511999998888'])
  assert.deepEqual(variantesWhatsapp('14155550123'), ['14155550123'])
})

test('frete rateado na proporção, sem perder centavo', () => {
  const r = ratearFrete([100, 200, 0.01], 10)
  assert.equal(Math.round(r.reduce((a, b) => a + b, 0) * 100), Math.round((300.01 + 10) * 100))
  assert.deepEqual(ratearFrete([100, 300], 40), [110, 330])
  assert.deepEqual(ratearFrete([50], 0), [50])
})

test('parcelas pelos prazos do fornecedor', () => {
  assert.deepEqual(parcelasPorPrazos(100, [60, 30, 90], '2026-10-20'), [
    { valor: 33.33, vencimento: '2026-11-19' },
    { valor: 33.33, vencimento: '2026-12-19' },
    { valor: 33.34, vencimento: '2027-01-18' },
  ])
  assert.deepEqual(parcelasPorPrazos(50, null, '2026-10-20'), [{ valor: 50, vencimento: '2026-11-19' }])
})

test('comparação de propostas, menor preço por item e economia', () => {
  const itens = [
    { id: 1, quantidade: 200 },
    { id: 2, quantidade: 10 },
  ]
  const a = { fornecedorId: 10, frete: 150, precos: { 1: 32, 2: 120 } }
  const b = { fornecedorId: 20, frete: null, precos: { 1: 30, 2: null } }
  const c = { fornecedorId: 30, frete: 0, precos: {} } // não respondeu
  assert.deepEqual(resumirProposta(itens, a), { subtotal: 7600, total: 7750, cotados: 2, faltando: 0 })
  assert.deepEqual(resumirProposta(itens, b), { subtotal: 6000, total: 6000, cotados: 1, faltando: 1 })
  assert.deepEqual(menorPorItem(itens, [a, b, c]), { 1: 20, 2: 10 })
  assert.equal(economia(itens, [a, b, c], { 1: 20, 2: 10 }), 400) // (32 − 30) × 200
})

test('o que a IA devolve passa por checagem antes de gravar', () => {
  const saida = {
    propostas: [
      {
        cotacao_id: 7,
        precos: [
          { item_id: 1, preco_unitario: 31.9, nao_tem: false },
          { item_id: 2, preco_unitario: null, nao_tem: true },
          { item_id: 99, preco_unitario: 1, nao_tem: false }, // item de outra cotação
          { item_id: 1, preco_unitario: -5, nao_tem: false }, // negativo
        ],
        frete: 150,
        prazo_entrega_dias: 3,
        prazos_pagamento_dias: [30, 60],
        observacao: null,
        completa: true,
      },
      { cotacao_id: 8, precos: [], frete: null, prazo_entrega_dias: null, prazos_pagamento_dias: null, observacao: null, completa: false }, // não está aberta
    ],
    resposta: '  Obrigado!  ',
    precisa_pessoa: false,
  }
  const v = validarExtracao(saida, [{ id: 7, itens: [1, 2] }])
  assert.equal(v.propostas.length, 1)
  assert.deepEqual(v.propostas[0].precos, [
    { itemId: 1, preco: 31.9 },
    { itemId: 2, preco: null },
  ])
  assert.deepEqual(v.propostas[0].prazosPagamento, [30, 60])
  assert.equal(v.resposta, 'Obrigado!')

  const itens = [{ id: 1, quantidade: 1 }, { id: 2, quantidade: 1 }]
  const props = [{ fornecedorId: 10, frete: null, precos: { 1: 5, 2: null } }]
  assert.deepEqual(validarRecomendacao([{ item_id: 1, fornecedor_id: 10 }, { item_id: 2, fornecedor_id: 10 }, { item_id: 1, fornecedor_id: 99 }], itens, props), { 1: 10 })
})
