import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerOfx, decodificarOfx, mesmaConta, ErroOfx } from './ofx.ts'
import { sugerirPares, relacaoDoNome, nomeDoExtrato, type Candidato, type LinhaExtrato } from './conciliacao.ts'

const SGML = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM>
<BANKID>756
<BRANCHID>3031-7
<ACCTID>90512-7
<ACCTTYPE>CHECKING
</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261101120000[-3:BRT]
<DTEND>20261109120000[-3:BRT]
<STMTTRN>
<TRNTYPE>DEBIT
<DTPOSTED>20261106120000[-3:BRT]
<TRNAMT>-1226.88
<FITID>202611061226881
<CHECKNUM>28794876
<MEMO>DÉB.TRANSF.CONTAS DIF.TIT. INTERCREDIS
<NAME>FAV.: TINTAS AURORA LTDA Transferência Pix CONSTRUTORA X
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105
<TRNAMT>20000,00
<FITID>A1
<MEMO>PIX RECEBIDO - OUTRA IF
<NAME>Recebimento Pix EDIFICIO RESIDENCIAL DONA KIKA - EMPREEN 54.
</STMTTRN>
<STMTTRN>
<TRNTYPE>CREDIT
<DTPOSTED>20261105
<TRNAMT>20000.00
<FITID>A1
<MEMO>PIX RECEBIDO - OUTRA IF
</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>11430.25<DTASOF>20261106120000[-3:BRT]</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`

test('ofx: SGML em Windows-1252, vírgula decimal, FITID repetido e saldo', () => {
  const buf = Buffer.from(SGML, 'latin1') // "É" e "ê" em um byte, como o banco manda
  const e = lerOfx(decodificarOfx(buf))
  assert.equal(e.banco, '756')
  assert.equal(e.agencia, '3031-7')
  assert.equal(e.conta, '90512-7')
  assert.deepEqual([e.inicio, e.fim], ['2026-11-01', '2026-11-09'])
  assert.deepEqual(e.saldo, { valor: 11430.25, em: '2026-11-06' })
  assert.equal(e.lancamentos.length, 3)
  assert.deepEqual(e.lancamentos[0], {
    fitid: '202611061226881',
    data: '2026-11-06',
    valor: -1226.88,
    descricao: 'DÉB.TRANSF.CONTAS DIF.TIT. INTERCREDIS',
    nome: 'FAV.: TINTAS AURORA LTDA Transferência Pix CONSTRUTORA X',
    documento: '28794876',
  })
  assert.equal(e.lancamentos[1].valor, 20000)
  assert.deepEqual(e.lancamentos.map((l) => l.fitid), ['202611061226881', 'A1', 'A1#2'])
})

test('ofx: XML em UTF-8, e arquivos que não são extrato de conta', () => {
  const xml = '<?xml version="1.0" encoding="UTF-8"?><OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>001</BANKID><ACCTID>12345</ACCTID></BANKACCTFROM><BANKTRANLIST><STMTTRN><DTPOSTED>20261103</DTPOSTED><TRNAMT>-30.00</TRNAMT><FITID>X</FITID><MEMO>Tarifa &amp; pacote</MEMO></STMTTRN></BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>'
  const e = lerOfx(decodificarOfx(Buffer.from(xml)))
  assert.equal(e.lancamentos[0].descricao, 'Tarifa & pacote')
  assert.equal(e.saldo, null)
  assert.throws(() => lerOfx('Data;Valor\n01/11;10'), ErroOfx)
  assert.throws(() => lerOfx('<OFX><CREDITCARDMSGSRSV1><CCSTMTRS></CCSTMTRS></CREDITCARDMSGSRSV1></OFX>'), /cartão/)
  assert.ok(mesmaConta('90512-7', '0905127'))
  assert.ok(!mesmaConta('90512-7', '11111-1'))
  assert.ok(mesmaConta(null, '11111-1'))
})

test('nome do extrato: favorecido, remetente e CPF mascarado', () => {
  assert.equal(nomeDoExtrato({ descricao: 'X', nome: 'FAV.: TINTAS AURORA LTDA Transferência Pix CONSTRUTORA X' }), 'TINTAS AURORA LTDA')
  assert.equal(nomeDoExtrato({ descricao: 'PIX', nome: 'Pagamento Pix ***.485.429-**' }), '')
  const c = { nome: 'TINTAS AURORA COMERCIO LTDA', cnpj: null }
  assert.equal(relacaoDoNome({ descricao: 'X', nome: 'FAV.: TINTAS AURORA LTDA Transferência Pix' }, c), 'bate')
  assert.equal(relacaoDoNome({ descricao: 'X', nome: 'FAV.: PARAFUSOS CENTRAL LTDA Transferência Pix' }, c), 'conflita')
  assert.equal(relacaoDoNome({ descricao: 'PIX EMITIDO OUTRA IF', nome: 'Pagamento Pix ***.485.429-**' }, c), 'neutro')
  assert.equal(relacaoDoNome({ descricao: 'PIX', nome: 'Pagamento Pix 82.650.730 0001-00' }, { nome: 'VIDROS', cnpj: '82.650.730/0001-00' }), 'bate')
})

const linha = (id: number, valor: number, extra: Partial<LinhaExtrato> = {}): LinhaExtrato => ({ id, data: '2026-11-05', valor, descricao: 'DÉB.TIT.COMPE EFETIVADO', nome: null, ...extra })
const parcela = (id: number, valor: number, extra: Partial<Candidato> = {}): Candidato => ({
  tipo: 'parcela', id, valor, vencimento: '2026-11-05', agendadaPara: null, baixadaEm: null, contaId: null, nome: 'FORNECEDOR QUALQUER', cnpj: null, ...extra,
})

test('pares: um só candidato, nome que conflita, valores repetidos, agendada e janela de datas', () => {
  const s = sugerirPares(
    [
      linha(1, -1650), // um candidato só
      linha(2, -475, { nome: 'FAV.: PARAFUSOS CENTRAL LTDA Transferência Pix' }), // valor bate, nome não
      linha(3, -150), linha(4, -150), // duas linhas, três parcelas iguais
      linha(5, -1234.84, { nome: 'FAV.: JOAO SILVA Transferência Pix' }), // duas parcelas, uma com o nome
      linha(6, -990, { data: '2026-11-06' }), // agendada para o dia, nesta conta
      linha(7, -500), // só uma parcela de 2025: fora da janela
      linha(8, 22000, { descricao: 'PIX RECEBIDO', nome: 'Recebimento Pix EDIFICIO RESIDENCIAL DONA KIKA' }),
      linha(9, -30), // sem nada
    ],
    [
      parcela(10, 1650),
      parcela(11, 475, { nome: 'LMM ARTEFATOS' }),
      parcela(12, 150), parcela(13, 150, { vencimento: '2026-10-29' }), parcela(14, 150, { vencimento: '2026-10-27' }),
      parcela(15, 1234.84, { nome: 'RENILSON FERREIRA' }), parcela(16, 1234.84, { nome: 'JOAO DA SILVA' }),
      parcela(17, 990, { agendadaPara: '2026-11-06', contaId: 1 }), parcela(18, 990, { vencimento: '2026-11-04' }),
      parcela(19, 500, { vencimento: '2025-01-10' }),
      parcela(20, 990, { agendadaPara: '2026-11-06', contaId: 2 }), // agendada em outra conta: não entra
      { tipo: 'entrada', id: 30, valor: 22000, vencimento: '2026-11-06', agendadaPara: null, baixadaEm: null, contaId: null, nome: 'OBRA DONA KIKA Aporte', cnpj: null },
    ],
    1,
  )
  const por = Object.fromEntries(s.map((x) => [x.linhaId, x]))
  assert.deepEqual([por[1].tipo, por[1].opcoes[0].id], ['certo', 10])
  assert.deepEqual([por[2].tipo, por[2].opcoes[0].relacao], ['talvez', 'conflita'])
  assert.equal(por[3].tipo, 'talvez')
  assert.deepEqual(por[3].opcoes.map((o) => o.id), [12, 13, 14]) // mais perto da data primeiro
  assert.equal(por[4].tipo, 'talvez')
  assert.deepEqual([por[5].tipo, por[5].opcoes[0].id], ['certo', 16])
  assert.deepEqual([por[6].tipo, por[6].opcoes[0].id, por[6].opcoes.length], ['certo', 17, 2])
  assert.equal(por[7].tipo, 'sem_par')
  assert.deepEqual([por[8].tipo, por[8].opcoes[0].id], ['certo', 30])
  assert.equal(por[9].tipo, 'sem_par')
})

test('pares: parcela já paga à mão na mesma data só é ligada à linha', () => {
  const s = sugerirPares(
    [linha(1, -800, { data: '2026-11-05' }), linha(2, -700, { data: '2026-11-20' })],
    [parcela(10, 800, { baixadaEm: '2026-11-05', vencimento: '2026-10-01' }), parcela(11, 800, { vencimento: '2026-11-01' }), parcela(12, 700, { baixadaEm: '2026-11-05' })],
    1,
  )
  assert.deepEqual([s[0].tipo, s[0].opcoes[0].id], ['certo', 10]) // paga no mesmo dia vence a parcela em aberto
  assert.equal(s[1].tipo, 'sem_par') // paga 15 dias antes: não é esta
})

test('pares: a mesma parcela não serve para duas linhas', () => {
  const s = sugerirPares([linha(1, -100), linha(2, -100), linha(3, -200), linha(4, -300)], [parcela(10, 100), parcela(11, 200), parcela(12, 300)], 1)
  assert.deepEqual(s.map((x) => x.tipo), ['talvez', 'talvez', 'certo', 'certo'])
  const so = sugerirPares([linha(1, -100), linha(2, -100, { nome: 'FAV.: FORNECEDOR QUALQUER Transfer' })], [parcela(10, 100)], 1)
  // a linha com o nome leva; a outra fica sem par
  assert.deepEqual(so.map((x) => x.tipo), ['sem_par', 'certo'])
})
