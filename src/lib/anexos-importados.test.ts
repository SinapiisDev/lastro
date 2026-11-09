import { test } from 'node:test'
import assert from 'node:assert/strict'
import { codigoDaPasta, tipoDoAnexo, ignorarArquivo } from './anexos-importados.ts'

test('anexos do sistema antigo: documento pela pasta e tipo pelo nome', () => {
  assert.equal(codigoDaPasta('Obra Prima - anexos/001840/Conrado 1840.pdf'), '001840')
  assert.equal(codigoDaPasta('Obra Prima - anexos/indice.csv'), null)
  assert.equal(codigoDaPasta('nota.pdf'), null)
  assert.equal(tipoDoAnexo('41240129923181000100550010000017991262041333.xml'), 'nota_fiscal')
  assert.equal(tipoDoAnexo('DANFE-NFe4126.pdf'), 'nota_fiscal')
  assert.equal(tipoDoAnexo('NF SILVERENG (16).pdf'), 'nota_fiscal')
  assert.equal(tipoDoAnexo('BOLETO_01.PDF'), 'boleto')
  assert.equal(tipoDoAnexo('Comprovante Pix.pdf'), 'comprovante')
  assert.equal(tipoDoAnexo('Orçamento obra.pdf'), 'orcamento')
  assert.equal(tipoDoAnexo('WhatsApp Image 2025-03-25.jpeg'), 'outro')
  assert.ok(ignorarArquivo('.DS_Store') && ignorarArquivo('x.pdf.parcial') && !ignorarArquivo('x.pdf'))
})
