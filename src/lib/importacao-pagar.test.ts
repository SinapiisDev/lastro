import { test } from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { lerPlanilha } from './xlsx.ts'
import { lerDocumentosPagar, dataDaCelula, valorDaCelula, acharObra, planejarAtualizacao } from './importacao-pagar.ts'

// Zip mínimo (compactado) com os arquivos de uma planilha.
function zip(arquivos: Record<string, string>) {
  const locais: Buffer[] = []
  const centrais: Buffer[] = []
  let deslocamento = 0
  for (const [nome, texto] of Object.entries(arquivos)) {
    const n = Buffer.from(nome)
    const dados = deflateRawSync(Buffer.from(texto))
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(8, 8)
    local.writeUInt32LE(dados.length, 18)
    local.writeUInt16LE(n.length, 26)
    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(8, 10)
    central.writeUInt32LE(dados.length, 20)
    central.writeUInt16LE(n.length, 28)
    central.writeUInt32LE(deslocamento, 42)
    locais.push(local, n, dados)
    centrais.push(central, n)
    deslocamento += 30 + n.length + dados.length
  }
  const dir = Buffer.concat(centrais)
  const fim = Buffer.alloc(22)
  fim.writeUInt32LE(0x06054b50, 0)
  fim.writeUInt16LE(Object.keys(arquivos).length, 10)
  fim.writeUInt32LE(dir.length, 12)
  fim.writeUInt32LE(deslocamento, 16)
  return Buffer.concat([...locais, dir, fim])
}

test('xlsx: textos compartilhados, texto direto, números, células puladas e linha vazia', () => {
  const buf = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Sheet" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Doc.</t></si><si><r><t>Fornecedor</t></r><r><t xml:space="preserve"> &amp; Cia</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"/>' +
      '<row r="3"><c r="B3"><v>99.640000000000001</v></c><c r="C3" t="inlineStr"><is><t>Usina</t></is></c><c r="D3" t="s"/></row></sheetData></worksheet>',
  })
  assert.deepEqual(lerPlanilha(buf), [
    ['Doc.', null, 'Fornecedor & Cia'],
    [null, '99.640000000000001', 'Usina', null],
  ])
  assert.throws(() => lerPlanilha(Buffer.from('d0cf11e0a1b11ae1000000000000000000000000000000', 'hex')), /\.xls/)
})

test('células: data do Excel e em texto, valor com e sem formato brasileiro', () => {
  assert.equal(dataDaCelula('45268'), '2023-12-08')
  assert.equal(dataDaCelula('06/11/2026'), '2026-11-06')
  assert.equal(dataDaCelula('31/02/2026'), null)
  assert.equal(dataDaCelula('3'), null)
  assert.equal(valorDaCelula('99.640000000000001'), 99.64)
  assert.equal(valorDaCelula('1.234,56'), 1234.56)
  assert.equal(valorDaCelula('R$ 2700'), 2700)
  assert.equal(valorDaCelula('abc'), null)
})

const CAB = ['Empresa', null, null, null, 'Doc.', 'Tipo', 'Núm.', 'Parc.', 'Obra', 'Fornecedor', null, null, 'Venc.', 'Bruto (R$)', 'Líquido (R$)', 'Data Pgto.', 'Vlr. pago (R$)', 'Situação', 'Desc.']
const linha = (doc: string, parc: string, venc: string, liquido: string, situacao: string, extra: Partial<{ tipo: string; num: string; obra: string; forn: string; pgto: string; desc: string }> = {}) =>
  ['SILVERENG', null, null, null, doc, extra.tipo ?? 'Provisão', extra.num ?? null, parc, extra.obra ?? 'OBRA DONA KIKA', extra.forn ?? 'CONCREGUA  CONCRETO', null, null, venc, liquido, liquido, extra.pgto ?? null, situacao === 'Liquidado' ? liquido : '0', situacao, extra.desc ?? null]

test('planilha a pagar: agrupa por documento, ordena parcelas e liga o restante do pagamento parcial', () => {
  const r = lerDocumentosPagar([
    ['', null, null, 'SILVERENG CONSTRUTORA'],
    [],
    CAB,
    linha('001236', '3/3', '45733', '10526.66', 'Liquidado', { num: '4276', pgto: '45849' }),
    linha('001236', '1/3', '45693', '10526.68', 'Liquidado', { pgto: '45692' }),
    linha('001236', '2.1/3', '45818', '4454.17', 'Aberto'),
    linha('001236', '2/3', '45713', '6072.5', 'Liquidado', { pgto: '45790' }),
    linha('001236', '1/1', '45713', '19.5', 'Liquidado', { obra: 'BELLE TORRE', forn: 'DANIEL', pgto: '45715' }),
    linha('004008', '1/1', '45874', '220', 'Atrasado', { tipo: 'Previsão', desc: 'Sanepar' }),
    linha('007202', '1/3', '45933', '0', 'Liquidado', { pgto: '45933' }),
    linha('009999', '1/1', '', '10', 'Aberto'),
  ])
  assert.ok(typeof r !== 'string')
  assert.equal(r.parcelas, 6)
  assert.deepEqual(r.ignoradas, [
    { linha: 10, motivo: 'quitada com valor líquido zero' },
    { linha: 11, motivo: 'sem data de vencimento' },
  ])
  const [kika, belle, sanepar] = r.documentos
  assert.equal(kika.chave, '001236|OBRA DONA KIKA|CONCREGUA CONCRETO')
  assert.equal(kika.fornecedor, 'CONCREGUA CONCRETO')
  assert.equal(kika.numeroDocumento, '4276')
  assert.equal(kika.descricao, 'Doc. 001236 do sistema anterior')
  assert.equal(kika.valor, 31580.01)
  assert.equal(kika.primeiroVencimento, '2025-02-05')
  assert.deepEqual(kika.parcelas, [
    { numero: 1, saldoDe: null, valor: 10526.68, vencimento: '2025-02-05', pagaEm: '2025-02-04' },
    { numero: 2, saldoDe: null, valor: 6072.5, vencimento: '2025-02-25', pagaEm: '2025-05-13' },
    { numero: 3, saldoDe: 2, valor: 4454.17, vencimento: '2025-06-10', pagaEm: null },
    { numero: 4, saldoDe: null, valor: 10526.66, vencimento: '2025-03-17', pagaEm: '2025-07-11' },
  ])
  assert.equal(belle.obra, 'BELLE TORRE') // mesmo Doc. em outra obra é outro documento
  assert.equal(sanepar.natureza, 'previsao')
  assert.equal(sanepar.descricao, 'Sanepar (doc. 004008)')
  assert.equal(sanepar.parcelas[0].pagaEm, null)
})

test('planilha a pagar: sem o cabeçalho certo, explica o que falta', () => {
  assert.match(String(lerDocumentosPagar([['Nome', 'Valor']])), /cabeçalho/)
})

test('obra do sistema com o mesmo nome, sem acento, caixa ou "Obra" na frente', () => {
  const obras = [{ id: 1, nome: 'Dona Izmênia' }, { id: 2, nome: 'Belle Torre' }]
  assert.equal(acharObra('OBRA DONA IZMENIA', obras), 1)
  assert.equal(acharObra('BELLE TORRE', obras), 2)
  assert.equal(acharObra('ACPAC', obras), null)
})

test('reimportação: baixa o que o sistema antigo pagou e traz o resto do pagamento parcial', () => {
  const aqui = [
    { id: 10, numero: 1, valor: 500, vencimento: '2026-10-01', pagaEm: '2026-10-01' },
    { id: 11, numero: 2, valor: 500, vencimento: '2026-11-01', pagaEm: null },
    { id: 12, numero: 3, valor: 1751.68, vencimento: '2026-12-01', pagaEm: null },
    { id: 13, numero: 4, valor: 300, vencimento: '2027-01-01', pagaEm: null },
    { id: 14, numero: 5, valor: 200, vencimento: '2027-03-01', pagaEm: null },
  ]
  const planilha = [
    { numero: 1, saldoDe: null, valor: 500, vencimento: '2026-10-01', pagaEm: '2026-10-01' },
    { numero: 2, saldoDe: null, valor: 500, vencimento: '2026-11-01', pagaEm: '2026-11-07' }, // pago depois
    { numero: 3, saldoDe: null, valor: 1216.08, vencimento: '2026-12-01', pagaEm: '2026-12-02' }, // pago em parte
    { numero: 4, saldoDe: 3, valor: 535.6, vencimento: '2026-12-01', pagaEm: null }, // o resto
    { numero: 5, saldoDe: null, valor: 300, vencimento: '2027-01-01', pagaEm: null }, // igual
    { numero: 7, saldoDe: null, valor: 221.82, vencimento: '2027-03-01', pagaEm: '2027-03-05' }, // pago com juros
    { numero: 6, saldoDe: null, valor: 99, vencimento: '2027-02-01', pagaEm: null }, // parcela nova sem par: fica de fora
  ]
  const r = planejarAtualizacao(planilha, aqui)
  assert.deepEqual(r.baixar, [
    { id: 11, pagaEm: '2026-11-07', valor: 500 },
    { id: 12, pagaEm: '2026-12-02', valor: 1216.08 },
    { id: 14, pagaEm: '2027-03-05', valor: 221.82 },
  ])
  assert.deepEqual(r.novas, [{ valor: 535.6, vencimento: '2026-12-01', pagaEm: null, saldoDe: 12 }])
  assert.equal(r.semPar, 1)
  // Nada muda quando a planilha é a mesma.
  const igual = planejarAtualizacao(aqui.map((p) => ({ numero: p.numero, saldoDe: null, valor: p.valor, vencimento: p.vencimento, pagaEm: p.pagaEm })), aqui)
  assert.deepEqual(igual, { baixar: [], novas: [], semPar: 0 })
  // Pago aqui e em aberto lá: não desfaz.
  const desfaz = planejarAtualizacao([{ numero: 1, saldoDe: null, valor: 500, vencimento: '2026-10-01', pagaEm: null }], [aqui[0]])
  assert.deepEqual(desfaz, { baixar: [], novas: [], semPar: 0 })
})
