// Planilha "Documentos a pagar" do sistema antigo → documentos do financeiro com parcelas. Regras puras (sem banco).
//   Uma linha da planilha = uma parcela. Documento = mesmo "Doc." + obra + fornecedor.
//   Parcela "2.1/3" é o restante do pagamento parcial da 2ª: entra depois dela, apontando para ela (saldo_de).
//   Valor = líquido (o que foi ou será pago de fato; o bruto vem antes de descontos e retenções).

import { centavos } from './regras.ts'

export type ParcelaImportada = { numero: number; saldoDe: number | null; valor: number; vencimento: string; pagaEm: string | null }
export type DocumentoImportado = {
  chave: string
  codigo: string
  obra: string
  fornecedor: string
  natureza: 'provisao' | 'previsao' | 'adiantamento'
  numeroDocumento: string | null
  descricao: string
  valor: number
  primeiroVencimento: string
  parcelas: ParcelaImportada[]
}
export type Ignorada = { linha: number; motivo: string }
export type LeituraPagar = { documentos: DocumentoImportado[]; ignoradas: Ignorada[]; parcelas: number }

/** Comparação de nomes: sem acento, maiúsculas, um espaço só. */
export const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/\s+/g, ' ').trim()
const limpar = (s: string) => s.replace(/\s+/g, ' ').trim()
const cabecalho = (s: string | null) => normalizar(s ?? '').replace(/[^A-Z0-9]/g, '')

// Colunas pelo nome do cabeçalho, não pela posição: a ordem muda conforme o relatório exportado.
const COLUNAS = {
  doc: (h: string) => h === 'DOC',
  tipo: (h: string) => h === 'TIPO',
  numero: (h: string) => h === 'NUM' || h === 'NUMERO',
  parcela: (h: string) => h === 'PARC' || h === 'PARCELA',
  obra: (h: string) => h === 'OBRA',
  fornecedor: (h: string) => h === 'FORNECEDOR',
  vencimento: (h: string) => h === 'VENC' || h === 'VENCIMENTO',
  bruto: (h: string) => h.startsWith('BRUTO'),
  liquido: (h: string) => h.startsWith('LIQUIDO'),
  pagoEm: (h: string) => h.startsWith('DATAPGTO') || h.startsWith('DATAPAGAMENTO'),
  pago: (h: string) => h.startsWith('VLRPAGO') || h.startsWith('VALORPAGO'),
  situacao: (h: string) => h === 'SITUACAO',
  descricao: (h: string) => h === 'DESC' || h === 'DESCRICAO',
}
type Coluna = keyof typeof COLUNAS
const OBRIGATORIAS: Coluna[] = ['doc', 'parcela', 'obra', 'fornecedor', 'vencimento', 'situacao']

/** Data da célula: número de série do Excel, dd/mm/aaaa ou aaaa-mm-dd. */
export function dataDaCelula(v: string | null): string | null {
  if (!v) return null
  const t = v.trim()
  if (/^\d+(\.\d+)?$/.test(t)) {
    const dias = Math.floor(Number(t))
    if (dias < 20_000 || dias > 80_000) return null // fora de 1954–2119: não é data
    return new Date(Date.UTC(1899, 11, 30 + dias)).toISOString().slice(0, 10)
  }
  const br = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  const iso = br ? `${br[3]}-${br[2].padStart(2, '0')}-${br[1].padStart(2, '0')}` : t.match(/^\d{4}-\d{2}-\d{2}/)?.[0]
  return iso && !isNaN(Date.parse(iso + 'T00:00:00Z')) && new Date(iso + 'T00:00:00Z').toISOString().startsWith(iso) ? iso : null
}

/** Valor da célula em R$ com centavos: número do Excel ("99.640000000000001") ou texto brasileiro ("1.234,56"). */
export function valorDaCelula(v: string | null): number | null {
  if (!v) return null
  const t = v.replace(/R\$|\s/g, '')
  const n = /^-?\d+(\.\d+)?(e-?\d+)?$/i.test(t) ? Number(t) : /^-?[\d.]*\d(,\d+)?$/.test(t) ? Number(t.replace(/\./g, '').replace(',', '.')) : NaN
  return Number.isFinite(n) ? centavos(n) / 100 : null
}

// "2.1/3" → [2, 1]; "3/3" → [3, 0]
function rotuloParcela(v: string): [number, number] | null {
  const m = v.trim().match(/^(\d+)(?:\.(\d+))?\s*\/\s*\d+$/)
  return m ? [Number(m[1]), Number(m[2] ?? 0)] : null
}

function natureza(tipo: string | null): DocumentoImportado['natureza'] {
  const t = normalizar(tipo ?? '')
  if (t.startsWith('PREVIS')) return 'previsao'
  if (t.startsWith('ADIANT')) return 'adiantamento'
  return 'provisao'
}

export function lerDocumentosPagar(linhas: (string | null)[][]): LeituraPagar | string {
  const inicio = linhas.findIndex((l) => {
    const h = l.map(cabecalho)
    return OBRIGATORIAS.every((c) => h.some(COLUNAS[c]))
  })
  if (inicio < 0) return 'Não achei o cabeçalho da planilha (Doc., Parc., Obra, Fornecedor, Venc., Situação). Use o relatório "Documentos a pagar" do sistema antigo.'
  const h = linhas[inicio].map(cabecalho)
  const col = Object.fromEntries(Object.entries(COLUNAS).map(([k, teste]) => [k, h.findIndex(teste)])) as Record<Coluna, number>
  if (col.liquido < 0 && col.bruto < 0) return 'A planilha não tem a coluna de valor (Líquido ou Bruto).'

  const ignoradas: Ignorada[] = []
  const grupos = new Map<string, { linha: number; rotulo: [number, number]; valor: number; vencimento: string; pagaEm: string | null; l: (string | null)[] }[]>()
  let parcelas = 0
  for (let i = inicio + 1; i < linhas.length; i++) {
    const l = linhas[i]
    const c = (k: Coluna) => (col[k] >= 0 ? (l[col[k]]?.trim() || null) : null)
    const linha = i + 1 // como aparece no Excel
    if (!c('doc') && !c('fornecedor') && !c('parcela')) continue // linha em branco ou de total
    const ignorar = (motivo: string) => ignoradas.push({ linha, motivo })
    const doc = c('doc')
    const obra = c('obra')
    const fornecedor = c('fornecedor')
    const rotulo = rotuloParcela(c('parcela') ?? '')
    const vencimento = dataDaCelula(c('vencimento'))
    if (!doc || !obra || !fornecedor) {
      ignorar('sem número do documento, obra ou fornecedor')
      continue
    }
    if (!rotulo) {
      ignorar(`parcela "${c('parcela') ?? ''}" fora do formato 1/3`)
      continue
    }
    if (!vencimento) {
      ignorar('sem data de vencimento')
      continue
    }
    const situacao = normalizar(c('situacao') ?? '')
    const paga = situacao.startsWith('LIQUID') || situacao.startsWith('PAG') || situacao.startsWith('QUITAD')
    if (!paga && !['ABERTO', 'ATRASADO', 'VENCIDO', 'A VENCER', 'PARCIAL'].some((s) => situacao.startsWith(s))) {
      ignorar(situacao.startsWith('CANCEL') ? 'cancelada' : `situação "${c('situacao') ?? ''}" desconhecida`)
      continue
    }
    const liquido = valorDaCelula(c('liquido')) ?? valorDaCelula(c('bruto'))
    const pago = valorDaCelula(c('pago'))
    const valor = paga && pago ? pago : liquido
    if (!valor || valor <= 0) {
      ignorar(paga ? 'quitada com valor líquido zero' : 'valor zero')
      continue
    }
    const pagaEm = paga ? (dataDaCelula(c('pagoEm')) ?? vencimento) : null
    const chave = `${doc}|${normalizar(obra)}|${normalizar(fornecedor)}`
    if (!grupos.has(chave)) grupos.set(chave, [])
    grupos.get(chave)!.push({ linha, rotulo, valor, vencimento, pagaEm, l })
    parcelas++
  }

  const documentos: DocumentoImportado[] = []
  for (const [chave, ps] of grupos) {
    ps.sort((a, b) => a.rotulo[0] - b.rotulo[0] || a.rotulo[1] - b.rotulo[1] || a.vencimento.localeCompare(b.vencimento) || a.linha - b.linha)
    const numeroDo = new Map(ps.map((p, i) => [p.rotulo.join('.'), i + 1]))
    const primeira = ps[0].l
    const c = (k: Coluna) => (col[k] >= 0 ? (primeira[col[k]]?.trim() || null) : null)
    const pegar = (k: Coluna) => ps.map((p) => (col[k] >= 0 ? p.l[col[k]]?.trim() : null)).find(Boolean) ?? null
    const codigo = c('doc')!
    const descricao = pegar('descricao')
    documentos.push({
      chave,
      codigo,
      obra: limpar(c('obra')!),
      fornecedor: limpar(c('fornecedor')!),
      natureza: natureza(c('tipo')),
      numeroDocumento: pegar('numero'),
      descricao: descricao ? `${limpar(descricao)} (doc. ${codigo})` : `Doc. ${codigo} do sistema anterior`,
      valor: ps.reduce((t, p) => t + centavos(p.valor), 0) / 100,
      primeiroVencimento: ps.reduce((m, p) => (p.vencimento < m ? p.vencimento : m), ps[0].vencimento),
      parcelas: ps.map((p, i) => ({
        numero: i + 1,
        saldoDe: p.rotulo[1] > 0 ? (numeroDo.get(p.rotulo[1] === 1 ? `${p.rotulo[0]}.0` : `${p.rotulo[0]}.${p.rotulo[1] - 1}`) ?? null) : null,
        valor: p.valor,
        vencimento: p.vencimento,
        pagaEm: p.pagaEm,
      })),
    })
  }
  return { documentos, ignoradas, parcelas }
}

/** Obra do sistema com o mesmo nome (sem acento, maiúsculas, sem o "Obra" na frente). */
export function acharObra(nome: string, obras: { id: number; nome: string }[]) {
  const chave = (s: string) => normalizar(s).replace(/^OBRA\s+/, '')
  return obras.find((o) => chave(o.nome) === chave(nome))?.id ?? null
}

// --- Documento que já veio numa importação anterior: o que mudou no sistema antigo desde então ---

export type ParcelaDoSistema = { id: number; numero: number; valor: number; vencimento: string; pagaEm: string | null }
export type AtualizacaoDoDocumento = {
  /** Parcelas em aberto aqui que o sistema antigo já pagou (valor menor = pagamento parcial). */
  baixar: { id: number; pagaEm: string; valor: number }[]
  /** Restos de pagamento parcial que surgiram depois: entram ligados à parcela que foi paga em parte. */
  novas: { valor: number; vencimento: string; pagaEm: string | null; saldoDe: number }[]
  /** Parcelas da planilha sem par aqui (que não são resto de pagamento parcial): ficam de fora. */
  semPar: number
}

/**
 * Compara as parcelas da planilha com as que o documento já tem. O par é pelo vencimento e o valor;
 * parcela aberta aqui e paga lá com valor maior foi paga com juros; com valor menor, é pagamento parcial (como o "Liquidado parcial" do sistema antigo,
 * cujo restante vem na linha seguinte, "1.1/1"). Nada que já está pago aqui muda.
 */
export function planejarAtualizacao(planilha: ParcelaImportada[], sistema: ParcelaDoSistema[]): AtualizacaoDoDocumento {
  const livres = [...sistema]
  const parDe = new Map<number, ParcelaDoSistema>() // número na planilha → parcela daqui
  const parcial = new Set<number>()
  const tirar = (p: ParcelaDoSistema) => livres.splice(livres.indexOf(p), 1)
  // 1º o par exato (mesmo vencimento e valor), preferindo a mesma situação; depois o pagamento parcial.
  for (const x of planilha) {
    const mesmos = livres.filter((p) => p.vencimento === x.vencimento && centavos(p.valor) === centavos(x.valor))
    const p = mesmos.find((p) => !!p.pagaEm === !!x.pagaEm) ?? mesmos[0]
    if (p) {
      parDe.set(x.numero, p)
      tirar(p)
    }
  }
  for (const x of planilha) {
    if (parDe.has(x.numero) || !x.pagaEm) continue
    const p = livres.find((p) => !p.pagaEm && p.vencimento === x.vencimento && centavos(p.valor) > centavos(x.valor))
    if (p) {
      parDe.set(x.numero, p)
      parcial.add(x.numero)
      tirar(p)
    }
  }
  // Pago com juros ou multa: mesmo vencimento, valor pago maior. Fica o valor que saiu de fato.
  for (const x of planilha) {
    if (parDe.has(x.numero) || !x.pagaEm) continue
    const p = livres.find((p) => !p.pagaEm && p.vencimento === x.vencimento && centavos(p.valor) < centavos(x.valor))
    if (p) {
      parDe.set(x.numero, p)
      tirar(p)
    }
  }
  const baixar: AtualizacaoDoDocumento['baixar'] = []
  for (const x of planilha) {
    const p = parDe.get(x.numero)
    if (p && !p.pagaEm && x.pagaEm) baixar.push({ id: p.id, pagaEm: x.pagaEm, valor: x.valor })
  }
  const novas: AtualizacaoDoDocumento['novas'] = []
  let semPar = 0
  for (const x of planilha) {
    if (parDe.has(x.numero)) continue
    const origem = x.saldoDe ? parDe.get(x.saldoDe) : undefined
    // Só entra o resto de uma parcela que acabou de ser paga em parte aqui: o total do documento não muda.
    if (origem && x.saldoDe && parcial.has(x.saldoDe)) {
      novas.push({ valor: x.valor, vencimento: x.vencimento, pagaEm: x.pagaEm, saldoDe: origem.id })
      parDe.set(x.numero, origem)
      parcial.add(x.numero) // o resto do resto também entra
    } else semPar++
  }
  return { baixar, novas, semPar }
}
