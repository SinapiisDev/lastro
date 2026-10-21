import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

// Código do celular (TOTP, RFC 6238): o mesmo do Google Authenticator, Microsoft Authenticator etc.
const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function base32(buf: Buffer) {
  let bits = 0
  let valor = 0
  let saida = ''
  for (const b of buf) {
    valor = (valor << 8) | b
    bits += 8
    while (bits >= 5) {
      saida += ALFABETO[(valor >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) saida += ALFABETO[(valor << (5 - bits)) & 31]
  return saida
}

function deBase32(texto: string) {
  let bits = 0
  let valor = 0
  const bytes: number[] = []
  for (const c of texto.replace(/[\s=]/g, '').toUpperCase()) {
    const i = ALFABETO.indexOf(c)
    if (i < 0) throw new Error('Segredo inválido')
    valor = (valor << 5) | i
    bits += 5
    if (bits >= 8) {
      bytes.push((valor >>> (bits - 8)) & 255)
      bits -= 8
    }
  }
  return Buffer.from(bytes)
}

export const novoSegredo = () => base32(randomBytes(20))

export function codigoTotp(segredo: string, quando = Date.now(), digitos = 6) {
  const passo = Buffer.alloc(8)
  passo.writeBigUInt64BE(BigInt(Math.floor(quando / 30000)))
  const h = createHmac('sha1', deBase32(segredo)).update(passo).digest()
  const o = h[h.length - 1] & 15
  const n = (h.readUInt32BE(o) & 0x7fffffff) % 10 ** digitos
  return String(n).padStart(digitos, '0')
}

// Aceita o código atual e o vizinho de cada lado (relógio do celular um pouco adiantado ou atrasado).
export function conferirTotp(segredo: string, codigo: string, quando = Date.now()) {
  const limpo = codigo.replace(/\D/g, '')
  if (limpo.length !== 6) return false
  return [-1, 0, 1].some((d) => {
    const esperado = Buffer.from(codigoTotp(segredo, quando + d * 30000))
    return timingSafeEqual(esperado, Buffer.from(limpo))
  })
}

export const linkTotp = (segredo: string, email: string, empresa: string) =>
  `otpauth://totp/${encodeURIComponent(`${empresa}:${email}`)}?secret=${segredo}&issuer=${encodeURIComponent(empresa)}`

// O segredo fica cifrado no banco: quem ler a tabela não consegue gerar códigos.
function chave() {
  const s = process.env.SESSION_SECRET
  if (!s || s.length < 32) throw new Error('Defina SESSION_SECRET com pelo menos 32 caracteres')
  return createHash('sha256').update(`totp:${s}`).digest()
}

export function cifrar(texto: string) {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', chave(), iv)
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()])
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64url')).join('.')
}

export function decifrar(guardado: string) {
  const [iv, tag, dados] = guardado.split('.').map((p) => Buffer.from(p, 'base64url'))
  const d = createDecipheriv('aes-256-gcm', chave(), iv)
  d.setAuthTag(tag)
  return Buffer.concat([d.update(dados), d.final()]).toString('utf8')
}
