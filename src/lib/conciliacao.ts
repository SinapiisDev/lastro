import { normalizar } from './importacao-pagar.ts'
import { centavos, somarDias } from './regras.ts'

// Sugestão de pares entre as linhas do extrato e o que está em aberto no sistema. Nada é baixado sozinho:
// a tela mostra a sugestão e a pessoa confirma.
//   certo: um candidato só (ou um só com o nome do extrato, ou um só agendado para aquele dia nesta conta)
//   Também entram as parcelas e entradas já baixadas sem extrato (lançadas à mão ou importadas) com data
//   até 3 dias da linha: aí a confirmação só liga a linha do extrato a elas, sem pagar de novo.
//   talvez: mais de um candidato com o mesmo valor, ou o nome do extrato não bate; a pessoa escolhe
//   sem_par: nada em aberto com esse valor

export type LinhaExtrato = { id: number; data: string; valor: number; descricao: string; nome: string | null }
export type Candidato = {
  tipo: 'parcela' | 'entrada'
  id: number
  valor: number
  vencimento: string
  agendadaPara: string | null
  baixadaEm: string | null // já paga ou recebida, ainda sem linha do extrato
  contaId: number | null
  nome: string // fornecedor (parcela) ou obra e descrição (entrada)
  cnpj: string | null
}
export type Relacao = 'bate' | 'conflita' | 'neutro'
export type Opcao = Candidato & { relacao: Relacao }
export type Sugestao = { linhaId: number; tipo: 'certo' | 'talvez' | 'sem_par'; opcoes: Opcao[] }

// Janela de datas: paga até 6 meses depois do vencimento ou até 30 dias antes.
const ATRASO_MAXIMO = 180
const ADIANTADO_MAXIMO = 30
const BAIXADA_MAXIMO = 3

// Palavras que não identificam ninguém ("COMERCIO DE TINTAS LTDA").
const COMUNS = new Set(
  'LTDA EIRELI CIA COMERCIO COMERCIAL INDUSTRIA SERVICOS SERVICO CONSTRUCAO CONSTRUCOES CONSTRUTORA MATERIAIS MATERIAL FILIAL ME EPP SA DE DA DO DAS DOS E TRANSFERENCIA PAGAMENTO RECEBIMENTO PIX EMITIDO RECEBIDO OUTRA REM FAV DEB CRED TRANSF CONTAS TIT INTERCREDIS SICOOB OBRA EDIFICIO RESIDENCIAL EMPREENDIMENTO EMPREEN'.split(' '),
)
const palavras = (x: string) => normalizar(x).split(/[^A-Z0-9]+/).filter((p) => p.length >= 4 && !COMUNS.has(p) && !/^\d+$/.test(p))
const digitos = (x: string) => x.replace(/\D/g, '')

// Nome que o banco mostra no lançamento ("FAV.: F.COLOMBO COMERCIO…", "Recebimento Pix EDIFICIO…"), sem CPF mascarado.
export function nomeDoExtrato(l: Pick<LinhaExtrato, 'descricao' | 'nome'>): string {
  const t = `${l.nome ?? ''} ${l.descricao}`
  const m =
    t.match(/(?:FAV|REM)\.?:\s*(.+?)\s+Transfer/i) ??
    t.match(/(?:Recebimento|Pagamento) Pix\s+([^\d*].*?)(?:\s+[\d*.]|$)/i)
  return m ? m[1].trim() : ''
}

export function relacaoDoNome(l: Pick<LinhaExtrato, 'descricao' | 'nome'>, c: Pick<Candidato, 'nome' | 'cnpj'>): Relacao {
  const texto = `${l.nome ?? ''} ${l.descricao}`
  const cnpj = digitos(c.cnpj ?? '')
  if (cnpj.length >= 11 && digitos(texto).includes(cnpj)) return 'bate'
  const doExtrato = new Set(palavras(texto))
  if (palavras(c.nome).some((p) => doExtrato.has(p))) return 'bate'
  // Só conflita quando o extrato traz um nome de verdade e nenhuma palavra dele aparece no candidato.
  return palavras(nomeDoExtrato(l)).length ? 'conflita' : 'neutro'
}

const distancia = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000

export function sugerirPares(linhas: LinhaExtrato[], candidatos: Candidato[], contaId: number): Sugestao[] {
  const porValor = new Map<string, Candidato[]>()
  for (const c of candidatos) {
    const k = `${c.tipo}|${centavos(c.valor)}`
    porValor.set(k, [...(porValor.get(k) ?? []), c])
  }

  const sugestoes = linhas.map((l): Sugestao => {
    const tipo = l.valor < 0 ? 'parcela' : 'entrada'
    const data = (c: Candidato) => c.baixadaEm ?? c.agendadaPara ?? c.vencimento
    const naJanela = (c: Candidato) =>
      c.baixadaEm
        ? distancia(c.baixadaEm, l.data) <= BAIXADA_MAXIMO
        : data(c) >= somarDias(l.data, -ATRASO_MAXIMO) && data(c) <= somarDias(l.data, ADIANTADO_MAXIMO)
    const opcoes = (porValor.get(`${tipo}|${centavos(Math.abs(l.valor))}`) ?? [])
      .filter((c) => (c.contaId === null || c.contaId === contaId) && naJanela(c))
      .map((c) => ({ ...c, relacao: relacaoDoNome(l, c) }))
      .sort(
        (a, b) =>
          Number(b.relacao === 'bate') - Number(a.relacao === 'bate') ||
          Number(a.relacao === 'conflita') - Number(b.relacao === 'conflita') ||
          Number(b.agendadaPara === l.data || b.baixadaEm === l.data) - Number(a.agendadaPara === l.data || a.baixadaEm === l.data) ||
          distancia(data(a), l.data) - distancia(data(b), l.data),
      )
    if (!opcoes.length) return { linhaId: l.id, tipo: 'sem_par', opcoes }
    const validas = opcoes.filter((o) => o.relacao !== 'conflita')
    const agendadas = validas.filter((o) => (o.agendadaPara === l.data && o.contaId === contaId) || o.baixadaEm === l.data)
    const comNome = validas.filter((o) => o.relacao === 'bate')
    const escolhido = validas.length === 1 ? validas[0] : agendadas.length === 1 ? agendadas[0] : comNome.length === 1 ? comNome[0] : null
    if (!escolhido) return { linhaId: l.id, tipo: 'talvez', opcoes }
    return { linhaId: l.id, tipo: 'certo', opcoes: [escolhido, ...opcoes.filter((o) => o !== escolhido)] }
  })

  // Um candidato só serve para uma linha. Se duas linhas "certas" apontam para o mesmo, fica com a única que traz
  // o nome do fornecedor; sem isso, todas viram "talvez".
  const chave = (o: Candidato) => `${o.tipo}|${o.id}`
  const disputas = new Map<string, Sugestao[]>()
  for (const s of sugestoes) if (s.tipo === 'certo') disputas.set(chave(s.opcoes[0]), [...(disputas.get(chave(s.opcoes[0])) ?? []), s])
  for (const linhas of disputas.values()) {
    if (linhas.length < 2) continue
    const comNome = linhas.filter((s) => s.opcoes[0].relacao === 'bate')
    for (const s of linhas) if (comNome.length !== 1 || s !== comNome[0]) s.tipo = 'talvez'
  }
  const tomados = new Set(sugestoes.filter((s) => s.tipo === 'certo').map((s) => chave(s.opcoes[0])))
  for (const s of sugestoes) {
    if (s.tipo !== 'talvez') continue
    s.opcoes = s.opcoes.filter((o) => !tomados.has(chave(o)))
    if (!s.opcoes.length) s.tipo = 'sem_par'
  }
  return sugestoes
}
