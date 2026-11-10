import 'server-only'
import { randomUUID } from 'node:crypto'
import { linkAssinado, type Credenciais } from './s3-assinado'

// Arquivos (anexos, fotos, diário) no Cloudflare R2 quando ele está configurado (10 GB grátis); senão no Supabase Storage.
// Os dois só no servidor, com a chave: o navegador recebe só links assinados, que expiram.
function r2(): Credenciais | null {
  const { R2_ACCOUNT_ID, R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET } = process.env
  if (!R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET || !(R2_ENDPOINT || R2_ACCOUNT_ID)) return null
  return { endpoint: R2_ENDPOINT || `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, bucket: R2_BUCKET, chave: R2_ACCESS_KEY_ID, segredo: R2_SECRET_ACCESS_KEY, regiao: process.env.R2_REGIAO }
}

// Supabase Storage pela API REST, com a chave de serviço.
const BUCKET = 'anexos'
const base = () => `${process.env.SUPABASE_URL}/storage/v1`
const cabecalhos = () => {
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return { apikey: chave, Authorization: `Bearer ${chave}` }
}

// shortcut: limite de 4 MB por causa do limite de corpo da Vercel (4,5 MB);
// se precisar de arquivos maiores, trocar por upload direto com URL assinada.
export const TAMANHO_MAXIMO = 4 * 1024 * 1024
const TIPOS = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic']

export function validarArquivo(arquivo: unknown): File | string | null {
  if (!(arquivo instanceof File) || arquivo.size === 0) return null
  if (arquivo.size > TAMANHO_MAXIMO) return 'Arquivo maior que 4 MB.'
  if (!TIPOS.includes(arquivo.type)) return 'Envie PDF ou imagem (JPG, PNG, WEBP, HEIC).'
  return arquivo
}

// Fotos da obra: o navegador já reduz para JPEG antes de enviar (CampoFotos); aqui só confere.
export const MAX_FOTOS = 10
export function validarFotos(lista: unknown[]): File[] | string {
  const fotos = lista.filter((f): f is File => f instanceof File && f.size > 0)
  if (fotos.length > MAX_FOTOS) return `Envie até ${MAX_FOTOS} fotos por vez.`
  if (fotos.some((f) => !['image/jpeg', 'image/png', 'image/webp'].includes(f.type))) return 'Envie as fotos em JPG ou PNG.'
  if (fotos.some((f) => f.size > TAMANHO_MAXIMO)) return 'Foto maior que 4 MB.'
  return fotos
}

// Sobe antes de gravar no banco: se o banco falhar, sobra só um arquivo solto (nunca um registro sem arquivo).
export async function enviarArquivo(pasta: string, arquivo: File) {
  const limpo = arquivo.name.normalize('NFD').replace(/[^\w.-]+/g, '_').slice(-80)
  const caminho = `${pasta}/${randomUUID()}-${limpo}`
  const c = r2()
  if (c) {
    const r = await fetch(linkAssinado(c, 'PUT', caminho, 300), { method: 'PUT', headers: { 'content-type': arquivo.type }, body: arquivo })
    if (!r.ok) throw new Error(`Falha ao guardar o arquivo (${r.status}): ${await r.text()}`)
    return caminho
  }
  const r = await fetch(`${base()}/object/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: { ...cabecalhos(), 'content-type': arquivo.type, 'x-upsert': 'false' },
    body: arquivo,
  })
  if (!r.ok) throw new Error(`Falha ao guardar o arquivo (${r.status}): ${await r.text()}`)
  return caminho
}

export async function baixarArquivo(caminho: string) {
  const c = r2()
  const r = c ? await fetch(linkAssinado(c, 'GET', caminho, 300)) : await fetch(`${base()}/object/${BUCKET}/${caminho}`, { headers: cabecalhos() })
  if (!r.ok) throw new Error(`Falha ao ler o arquivo (${r.status})`)
  return Buffer.from(await r.arrayBuffer())
}

export async function linkTemporario(caminho: string) {
  const c = r2()
  if (c) return linkAssinado(c, 'GET', caminho, 60)
  const r = await fetch(`${base()}/object/sign/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: { ...cabecalhos(), 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  if (!r.ok) throw new Error(`Falha ao gerar link do arquivo (${r.status})`)
  const { signedURL } = (await r.json()) as { signedURL: string }
  return `${base()}${signedURL}`
}

// Envio direto do navegador para o Storage (sem passar pelo limite de 4,5 MB da Vercel): o servidor autoriza
// um caminho de cada vez e o navegador faz o PUT nesse endereço. Vale por 2 horas.
export async function linkDeEnvio(caminho: string) {
  const c = r2()
  if (c) return linkAssinado(c, 'PUT', caminho, 7200)
  const r = await fetch(`${base()}/object/upload/sign/${BUCKET}/${caminho}`, { method: 'POST', headers: cabecalhos() })
  if (!r.ok) throw new Error(`Falha ao autorizar o envio (${r.status}): ${await r.text()}`)
  const { url } = (await r.json()) as { url: string }
  return `${base()}${url}`
}

/** Nome de arquivo seguro para caminho no Storage (sem acento, espaço ou barra). */
export const nomeNoStorage = (nome: string) => nome.normalize('NFD').replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').slice(-100)
