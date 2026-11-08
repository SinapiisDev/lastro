// Leitor mínimo de planilha .xlsx (sem biblioteca): o arquivo é um zip com XML dentro.
// Lê só a primeira aba e devolve as células como texto, linha a linha. Fórmula vem com o último valor calculado.
import { inflateRawSync } from 'node:zlib'

const LIMITE = 64 * 1024 * 1024 // por arquivo descompactado: barra zip-bomba

function arquivosDoZip(buf: Buffer) {
  // Fim do diretório central: assinatura 0x06054b50 nos últimos 64 KB.
  let fim = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i
      break
    }
  }
  if (fim < 0) throw new ErroPlanilha('O arquivo não é uma planilha .xlsx.')
  const total = buf.readUInt16LE(fim + 10)
  let p = buf.readUInt32LE(fim + 16)
  const arquivos = new Map<string, () => Buffer>()
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new ErroPlanilha('Planilha corrompida.')
    const metodo = buf.readUInt16LE(p + 10)
    const compactado = buf.readUInt32LE(p + 20)
    const tamNome = buf.readUInt16LE(p + 28)
    const tamExtra = buf.readUInt16LE(p + 30)
    const tamComentario = buf.readUInt16LE(p + 32)
    const local = buf.readUInt32LE(p + 42)
    const nome = buf.toString('utf8', p + 46, p + 46 + tamNome)
    arquivos.set(nome, () => {
      const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28)
      const dados = buf.subarray(inicio, inicio + compactado)
      if (metodo === 0) return dados
      if (metodo === 8) return inflateRawSync(dados, { maxOutputLength: LIMITE })
      throw new ErroPlanilha('Planilha com compactação não suportada.')
    })
    p += 46 + tamNome + tamExtra + tamComentario
  }
  return arquivos
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const decodificar = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e] ?? m),
  )
// Texto de um <si> ou <is>: junta os <t>, ignorando a guia fonética (<rPh>).
const textoRico = (xml: string) =>
  decodificar([...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''))
const atributo = (tag: string, nome: string) => tag.match(new RegExp(`\\s${nome}="([^"]*)"`))?.[1]

function indiceColuna(ref: string) {
  let n = 0
  for (const c of ref.match(/^[A-Z]+/)?.[0] ?? '') n = n * 26 + c.charCodeAt(0) - 64
  return n - 1
}

export class ErroPlanilha extends Error {}

/** Primeira aba da planilha: uma lista de linhas, cada uma com o texto das células (vazio = null). */
export function lerPlanilha(buf: Buffer): (string | null)[][] {
  if (buf.length < 22 || buf.readUInt32LE(0) !== 0x04034b50) {
    throw new ErroPlanilha(buf.subarray(0, 8).toString('hex') === 'd0cf11e0a1b11ae1'
      ? 'Planilha no formato antigo (.xls). Abra no Excel e salve como .xlsx.'
      : 'O arquivo não é uma planilha .xlsx.')
  }
  const zip = arquivosDoZip(buf)
  const ler = (nome: string) => zip.get(nome)?.().toString('utf8')

  const compartilhados = [...(ler('xl/sharedStrings.xml') ?? '').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) => textoRico(m[1]))

  // Primeira aba do livro → arquivo da aba pelos relacionamentos.
  const livro = ler('xl/workbook.xml') ?? ''
  const idAba = atributo(livro.match(/<sheet\b[^>]*>/)?.[0] ?? '', 'r:id')
  const rels = ler('xl/_rels/workbook.xml.rels') ?? ''
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((r) => atributo(r, 'Id') === idAba)
  let alvo = rel ? atributo(rel, 'Target') ?? '' : 'worksheets/sheet1.xml'
  alvo = alvo.startsWith('/') ? alvo.slice(1) : `xl/${alvo}`
  const aba = ler(alvo)
  if (!aba) throw new ErroPlanilha('Planilha sem nenhuma aba.')

  const linhas: (string | null)[][] = []
  // Linha vazia (<row r="5"/>) não tem corpo: o (?<!\/) evita que ela engula a linha seguinte.
  for (const [, corpo] of aba.matchAll(/<row\b[^>]*(?<!\/)>([\s\S]*?)<\/row>/g)) {
    const linha: (string | null)[] = []
    for (const m of corpo.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = ' ' + m[1]
      const dentro = m[2] ?? ''
      const tipo = atributo(attrs, 't')
      const v = dentro.match(/<v>([\s\S]*?)<\/v>/)?.[1]
      let valor: string | null = null
      if (tipo === 's') valor = v === undefined ? null : (compartilhados[Number(v)] ?? null)
      else if (tipo === 'inlineStr') valor = textoRico(dentro)
      else if (v !== undefined) valor = decodificar(v)
      const ref = atributo(attrs, 'r')
      const i = ref ? indiceColuna(ref) : linha.length
      while (linha.length < i) linha.push(null)
      linha[i] = valor === '' ? null : valor
    }
    linhas.push(linha)
  }
  return linhas
}
