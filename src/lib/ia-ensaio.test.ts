import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CASOS, lerEnsaio, compararEnsaio } from './ia-ensaio.ts'
import { validarExtracao, type ExtracaoIA } from './cotacao.ts'

const cotacao = (precoAco?: number) => ({
  id: 7,
  itens: [
    { id: 1, descricao: 'Aço CA-50', precoAtual: precoAco },
    { id: 2, descricao: 'Concreto fck 25', precoAtual: undefined },
  ],
  frete: null,
  prazoEntrega: null,
  prazosPagamento: null,
})
const ler = (titulo: string, c = cotacao()) => lerEnsaio([c], CASOS.find((x) => x.titulo === titulo)!.texto) as ExtracaoIA

test('casos prontos: textos distintos, e todo caso passa pela checagem real', () => {
  const textos = CASOS.map((c) => c.texto.toLowerCase())
  assert.equal(new Set(textos).size, textos.length)
  for (const c of CASOS.slice(0, 13)) {
    const r = lerEnsaio([cotacao()], c.texto)
    assert.notEqual(typeof r, 'string', c.titulo)
    validarExtracao(r as ExtracaoIA, [{ id: 7, itens: [1, 2] }])
  }
})

test('mensagem completa: preços nos itens certos e proposta completa', () => {
  const r = ler('Aço e concreto: tudo numa mensagem só')
  assert.deepEqual(r.propostas[0].precos, [
    { item_id: 1, preco_unitario: 6.8, nao_tem: false },
    { item_id: 2, preco_unitario: 520, nao_tem: false },
  ])
  assert.equal(r.propostas[0].completa, true)
  assert.match(r.resposta!, /Recebemos tudo/)
})

test('faltando dados: a resposta pede exatamente o que falta', () => {
  const r = ler('Aço e concreto: só os preços, sem frete nem prazo')
  assert.equal(r.propostas[0].completa, false)
  assert.equal(r.resposta, 'Obrigado pelos valores! Para fechar a proposta, falta só o frete, o prazo de entrega e a condição de pagamento.')
})

test('continuação: preço já informado antes conta para fechar a proposta', () => {
  const c = { ...cotacao(7.1), itens: cotacao(7.1).itens.map((i) => ({ ...i, precoAtual: i.id === 1 ? 7.1 : 495 })) }
  assert.equal(ler('Continuação: frete, entrega e pagamento', c).propostas[0].completa, true)
})

test('não tem, pessoa, agradecimento e mensagem desconhecida', () => {
  assert.equal(ler('Não tem um dos itens').propostas[0].precos[1].nao_tem, true)
  const p = ler('Tenta mandar a IA confirmar o pedido')
  assert.equal(p.precisa_pessoa, true)
  assert.match(p.resposta!, /alguém da equipe/)
  assert.deepEqual(ler('Só agradeceu'), { propostas: [], resposta: null, precisa_pessoa: false })
  assert.equal(typeof lerEnsaio([cotacao()], 'cimento 30 reais'), 'string')
  assert.equal(typeof lerEnsaio([cotacao()], CASOS.find((c) => c.titulo.startsWith('Materiais básicos: lista'))!.texto), 'string')
})

test('comparação de ensaio lê o menor preço do resumo', () => {
  const resumo = 'Itens da cotação:\n- item 1: 500 kg de Aço\n\nMenor preço unitário por item (sem considerar frete):\n- item 1: fornecedor 3\n- item 2: ninguém cotou'
  assert.deepEqual(compararEnsaio(resumo).escolhas, [{ item_id: 1, fornecedor_id: 3 }])
})
