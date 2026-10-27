import 'server-only'
import { randomUUID } from 'node:crypto'

// Supabase Storage pela API REST, só no servidor, com a chave de serviço.
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
  const r = await fetch(`${base()}/object/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: { ...cabecalhos(), 'content-type': arquivo.type, 'x-upsert': 'false' },
    body: arquivo,
  })
  if (!r.ok) throw new Error(`Falha ao guardar o arquivo (${r.status}): ${await r.text()}`)
  return caminho
}

export async function baixarArquivo(caminho: string) {
  const r = await fetch(`${base()}/object/${BUCKET}/${caminho}`, { headers: cabecalhos() })
  if (!r.ok) throw new Error(`Falha ao ler o arquivo (${r.status})`)
  return Buffer.from(await r.arrayBuffer())
}

export async function linkTemporario(caminho: string) {
  const r = await fetch(`${base()}/object/sign/${BUCKET}/${caminho}`, {
    method: 'POST',
    headers: { ...cabecalhos(), 'content-type': 'application/json' },
    body: JSON.stringify({ expiresIn: 60 }),
  })
  if (!r.ok) throw new Error(`Falha ao gerar link do arquivo (${r.status})`)
  const { signedURL } = (await r.json()) as { signedURL: string }
  return `${base()}${signedURL}`
}
