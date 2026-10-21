import { test } from 'node:test'
import assert from 'node:assert/strict'
import { base32, codigoTotp, conferirTotp, cifrar, decifrar, novoSegredo } from './totp.ts'

// Vetor da RFC 6238 (SHA-1): segredo "12345678901234567890".
const RFC = base32(Buffer.from('12345678901234567890'))

test('código do celular bate com a RFC 6238', () => {
  assert.equal(codigoTotp(RFC, 59_000, 8), '94287082')
  assert.equal(codigoTotp(RFC, 1_111_111_109_000, 8), '07081804')
  assert.equal(codigoTotp(RFC, 59_000), '287082')
})

test('aceita o código vizinho e recusa o resto', () => {
  const s = novoSegredo()
  const agora = 1_800_000_000_000
  assert.ok(conferirTotp(s, codigoTotp(s, agora), agora))
  assert.ok(conferirTotp(s, codigoTotp(s, agora - 30_000), agora))
  assert.ok(!conferirTotp(s, codigoTotp(s, agora - 90_000), agora))
  assert.ok(!conferirTotp(s, '12345', agora))
})

test('segredo cifrado volta igual e não aparece em claro', () => {
  process.env.SESSION_SECRET ??= 'x'.repeat(32)
  const s = novoSegredo()
  const guardado = cifrar(s)
  assert.ok(!guardado.includes(s))
  assert.equal(decifrar(guardado), s)
})
