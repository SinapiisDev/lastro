// Link assinado (AWS Signature V4 na URL) para um armazenamento compatível com S3, como o Cloudflare R2.
// Regras puras: quem tem o link faz aquela operação naquele arquivo até expirar, sem a chave.
import { createHash, createHmac } from 'node:crypto'

/** bucket vazio: o endpoint já é o endereço do bucket (bucket.s3.amazonaws.com). */
export type Credenciais = { endpoint: string; bucket: string; chave: string; segredo: string; regiao?: string }

const hmac = (k: Buffer | string, s: string) => createHmac('sha256', k).update(s).digest()
const hex = (s: string) => createHash('sha256').update(s).digest('hex')
// Codificação do S3: só letras, números e - _ . ~ ficam como estão.
const codificar = (s: string) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

export function linkAssinado(c: Credenciais, metodo: 'GET' | 'PUT' | 'DELETE', caminho: string, segundos: number, agora = new Date()) {
  const regiao = c.regiao ?? 'auto'
  const url = new URL(c.endpoint)
  const rota = `${url.pathname.replace(/\/$/, '')}${c.bucket ? `/${codificar(c.bucket)}` : ''}/${caminho.split('/').map(codificar).join('/')}`
  const data = agora.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '') // 20261110T120000Z
  const dia = data.slice(0, 8)
  const escopo = `${dia}/${regiao}/s3/aws4_request`
  const consulta = Object.entries({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${c.chave}/${escopo}`,
    'X-Amz-Date': data,
    'X-Amz-Expires': String(segundos),
    'X-Amz-SignedHeaders': 'host',
  })
    .map(([k, v]) => `${codificar(k)}=${codificar(v)}`)
    .sort()
    .join('&')
  const pedido = [metodo, rota, consulta, `host:${url.host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const texto = ['AWS4-HMAC-SHA256', data, escopo, hex(pedido)].join('\n')
  const chaveDoDia = hmac(hmac(hmac(hmac(`AWS4${c.segredo}`, dia), regiao), 's3'), 'aws4_request')
  const assinatura = createHmac('sha256', chaveDoDia).update(texto).digest('hex')
  return `${url.protocol}//${url.host}${rota}?${consulta}&X-Amz-Signature=${assinatura}`
}
