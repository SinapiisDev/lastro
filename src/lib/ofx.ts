// Leitura do extrato bancário em OFX (o "Money"/"Quicken" do internet banking). Aceita o formato antigo (SGML,
// sem fechar as tags, em Windows-1252) e o novo (XML, UTF-8). Sem dependência: o arquivo é texto simples.

export class ErroOfx extends Error {}

export type LancamentoOfx = {
  fitid: string // código do lançamento no banco: não se repete na mesma conta
  data: string // AAAA-MM-DD
  valor: number // < 0 saiu, > 0 entrou
  descricao: string // MEMO: o tipo do lançamento ("PIX EMITIDO OUTRA IF")
  nome: string | null // NAME: favorecido ou remetente, quando o banco informa
  documento: string | null
}

export type ExtratoOfx = {
  banco: string | null
  agencia: string | null
  conta: string | null
  inicio: string | null
  fim: string | null
  saldo: { valor: number; em: string } | null // saldo da conta (LEDGERBAL) no fim do dia informado
  lancamentos: LancamentoOfx[]
}

// O cabeçalho diz a codificação; sem ele, tenta UTF-8 e cai para Windows-1252 (o comum nos bancos brasileiros).
export function decodificarOfx(buf: Uint8Array): string {
  const inicio = new TextDecoder('latin1').decode(buf.subarray(0, 400))
  if (/CHARSET:\s*(1252|ISO-8859-1)/i.test(inicio)) return new TextDecoder('windows-1252').decode(buf)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf)
  } catch {
    return new TextDecoder('windows-1252').decode(buf)
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const limpar = (x: string) =>
  x
    .replace(/&(amp|lt|gt|quot|apos);/g, (_, e: string) => ENTIDADES[e])
    .replace(/\s+/g, ' ')
    .trim()

// Valor da tag: no SGML vai até a próxima tag ou a quebra de linha; no XML, até a tag de fechamento.
function tag(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'))
  const v = m ? limpar(m[1]) : ''
  return v || null
}

function dataOfx(x: string | null): string | null {
  const m = x?.match(/^(\d{4})(\d{2})(\d{2})/)
  if (!m) return null
  const iso = `${m[1]}-${m[2]}-${m[3]}`
  const d = new Date(`${iso}T00:00:00Z`)
  return isNaN(+d) || d.toISOString().slice(0, 10) !== iso ? null : iso
}

// "-5300.00", "-5300,00" ou "1.234,56": o último separador é o dos centavos.
function valorOfx(x: string | null): number | null {
  if (!x) return null
  let t = x.replace(/\s/g, '')
  const virgula = t.lastIndexOf(','), ponto = t.lastIndexOf('.')
  if (virgula > ponto) t = t.replace(/\./g, '').replace(',', '.')
  else t = t.replace(/,/g, '')
  const n = Number(t)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

export function lerOfx(texto: string): ExtratoOfx {
  if (!/<OFX>/i.test(texto)) throw new ErroOfx('Este arquivo não é um extrato OFX. No internet banking, exporte o extrato no formato OFX (às vezes aparece como Money ou Quicken).')
  if (/<CCSTMTRS>/i.test(texto) && !/<STMTRS>/i.test(texto)) throw new ErroOfx('Este é o extrato de um cartão de crédito. Envie o extrato da conta corrente.')
  const conta = texto.match(/<STMTRS>([\s\S]*?)(<\/STMTRS>|$)/i)?.[1]
  if (!conta) throw new ErroOfx('O arquivo não tem o extrato de uma conta. Baixe de novo o extrato da conta corrente em OFX.')

  const de = conta.match(/<BANKACCTFROM>([\s\S]*?)<\/BANKACCTFROM>/i)?.[1] ?? conta
  const lista = conta.match(/<BANKTRANLIST>([\s\S]*?)(<\/BANKTRANLIST>|$)/i)?.[1] ?? ''
  const ledger = conta.match(/<LEDGERBAL>([\s\S]*?)<\/LEDGERBAL>/i)?.[1]
  const saldoValor = ledger ? valorOfx(tag(ledger, 'BALAMT')) : null
  const saldoEm = ledger ? dataOfx(tag(ledger, 'DTASOF')) : null

  const vistos = new Map<string, number>()
  const lancamentos: LancamentoOfx[] = []
  for (const [, bloco] of lista.matchAll(/<STMTTRN>([\s\S]*?)(?=<\/STMTTRN>|<STMTTRN>|$)/gi)) {
    const data = dataOfx(tag(bloco, 'DTPOSTED'))
    const valor = valorOfx(tag(bloco, 'TRNAMT'))
    if (!data || valor === null || valor === 0) continue
    const descricao = tag(bloco, 'MEMO') ?? tag(bloco, 'TRNTYPE') ?? ''
    // Sem FITID (ou repetido no arquivo, o que alguns bancos fazem), monta um código com o que o lançamento tem.
    const base = tag(bloco, 'FITID') ?? `${data}|${valor.toFixed(2)}|${descricao}`
    const n = (vistos.get(base) ?? 0) + 1
    vistos.set(base, n)
    lancamentos.push({
      fitid: n > 1 ? `${base}#${n}` : base,
      data,
      valor,
      descricao,
      nome: tag(bloco, 'NAME'),
      documento: tag(bloco, 'CHECKNUM')?.replace(/^0+$/, '') || tag(bloco, 'REFNUM') || null,
    })
  }

  return {
    banco: tag(de, 'BANKID'),
    agencia: tag(de, 'BRANCHID'),
    conta: tag(de, 'ACCTID'),
    inicio: dataOfx(tag(lista, 'DTSTART')),
    fim: dataOfx(tag(lista, 'DTEND')),
    saldo: saldoValor !== null && saldoEm ? { valor: saldoValor, em: saldoEm } : null,
    lancamentos,
  }
}

// Conta do extrato x conta cadastrada: compara só os dígitos ("90512-7" = "905127").
export const mesmaConta = (a: string | null, b: string | null) => {
  const x = (a ?? '').replace(/\D/g, '').replace(/^0+/, ''), y = (b ?? '').replace(/\D/g, '').replace(/^0+/, '')
  return !x || !y || x === y
}
