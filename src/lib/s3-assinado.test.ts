import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linkAssinado } from './s3-assinado.ts'

// Exemplo oficial da AWS ("Authenticating Requests: Using Query Parameters"): GET de test.txt, 24 horas.
test('assina igual ao exemplo da documentação da AWS', () => {
  const url = linkAssinado(
    { endpoint: 'https://examplebucket.s3.amazonaws.com', bucket: '', chave: 'AKIAIOSFODNN7EXAMPLE', segredo: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY', regiao: 'us-east-1' },
    'GET',
    'test.txt',
    86400,
    new Date('2013-05-24T00:00:00Z'),
  )
  assert.equal(new URL(url).searchParams.get('X-Amz-Signature'), 'aeeed9bbccd4d02ee5c0109b86d86835f995330da4c265957d157751f604d404')
})

test('caminho com pastas e caracteres especiais vai codificado, com a barra entre as pastas', () => {
  const url = linkAssinado({ endpoint: 'https://conta.r2.cloudflarestorage.com', bucket: 'lastro-anexos', chave: 'k', segredo: 's' }, 'PUT', 'obra-1/nota fiscal (1).pdf', 60)
  assert.ok(url.startsWith('https://conta.r2.cloudflarestorage.com/lastro-anexos/obra-1/nota%20fiscal%20%281%29.pdf?'))
  assert.match(url, /X-Amz-Credential=k%2F\d{8}%2Fauto%2Fs3%2Faws4_request/)
})
