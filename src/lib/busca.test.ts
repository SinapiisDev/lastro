import { test } from 'node:test'
import assert from 'node:assert/strict'
import { casaBusca } from './busca.ts'

test('busca: qualquer parte, sem acento, palavras em qualquer ordem', () => {
  assert.equal(casaBusca('Estrutura / Fôrma metálica', 'metal'), true)
  assert.equal(casaBusca('Estrutura / Fôrma metálica', 'forma'), true)
  assert.equal(casaBusca('Solda para metalon', 'metal sol'), true)
  assert.equal(casaBusca('Pintura interna', 'PINT INT'), true)
  assert.equal(casaBusca('Pintura interna', 'pintura externa'), false)
  assert.equal(casaBusca('Qualquer coisa', '   '), true)
})
