// Fluxo de caixa analítico (como o "Fluxo analítico" do sistema antigo): cada entrada e saída do período, realizada
// ou prevista, com o saldo acumulado linha a linha e o resumo ao lado. Só cálculo; a busca no banco fica em fluxo.ts.

export type TipoLinha = 'realizado' | 'previsto' | 'aguardando' // aguardando = compra ainda sem aprovação
export type LinhaFluxo = {
  data: string // realizado: dia do pagamento/recebimento; previsto: vencimento (ou dia agendado)
  valor: number // > 0 entra, < 0 sai
  tipo: TipoLinha
  foraDoSaldo?: boolean // pago sem conta bancária, com contas cadastradas: aparece, mas não mexe no saldo das contas
  obra: string | null
  fornecedor: string | null
  descricao: string
  documento: string | null
  conta: string | null
  compraId: number | null
  parcela: string | null // "2/3"
}
export type Visao = 'ambos' | 'realizado' | 'previsto'

const c = (v: number) => Math.round(v * 100)

type Busca = Record<string, string | string[] | undefined>
// 30/02 o JavaScript aceita (vira 02/03): só vale a data que volta igual.
const data = (x: unknown) => {
  if (typeof x !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return null
  const d = new Date(x + 'T00:00:00Z')
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x ? x : null
}
const id = (x: unknown) => (Number.isInteger(Number(x)) && Number(x) > 0 ? Number(x) : undefined)

// Filtros da tela (e da exportação), vindos do endereço. Sem período, o mês de hoje. "f" marca que o formulário
// foi enviado: aí a caixa de compras aguardando aprovação desmarcada vale; na primeira visita, ela vem marcada.
export function filtrosDaUrl(q: Busca, hoje: string) {
  const fimDoMes = new Date(Date.UTC(+hoje.slice(0, 4), +hoje.slice(5, 7), 0)).toISOString().slice(0, 10)
  let inicio = data(q.de) ?? hoje.slice(0, 8) + '01'
  let fim = data(q.ate) ?? fimDoMes
  if (fim < inicio) [inicio, fim] = [fim, inicio]
  const ver: Visao = q.ver === 'realizado' || q.ver === 'previsto' ? q.ver : 'ambos'
  const natureza: 'provisao' | 'previsao' | undefined = q.natureza === 'provisao' || q.natureza === 'previsao' ? q.natureza : undefined
  return { inicio, fim, ver, natureza, obraId: id(q.obra), contaId: id(q.conta), fornecedorId: id(q.fornecedor), aguardando: q.f ? q.aguardando === '1' : true }
}

export function montarFluxo({
  linhas,
  saldoInicial,
  inicio,
  fim,
  hoje,
  ver,
}: {
  linhas: LinhaFluxo[] // realizadas do período + todas as previstas em aberto (de qualquer data)
  saldoInicial: number // realizado, no fim do dia anterior ao início
  inicio: string
  fim: string
  hoje: string
  ver: Visao
}) {
  const aberta = (l: LinhaFluxo) => l.tipo !== 'realizado'
  const mostra = (l: LinhaFluxo) => ver === 'ambos' || (ver === 'realizado') === !aberta(l)
  // Previsto que venceu antes do período e continua em aberto: entra como um saldo inicial previsto.
  const antes = ver === 'realizado' ? [] : linhas.filter((l) => aberta(l) && l.data < inicio)
  const doPeriodo = linhas
    .filter((l) => l.data >= inicio && l.data <= fim && mostra(l))
    .sort((a, b) => a.data.localeCompare(b.data) || Number(aberta(a)) - Number(aberta(b)) || b.valor - a.valor)

  const inicialPrevisto = antes.reduce((t, l) => t + c(l.valor), 0)
  let saldo = c(saldoInicial) + inicialPrevisto
  const extrato = doPeriodo.map((l) => {
    if (!l.foraDoSaldo) saldo += c(l.valor)
    return { ...l, saldo: saldo / 100, atrasada: aberta(l) && l.data < hoje }
  })

  const soma = (ls: LinhaFluxo[], sinal: 1 | -1) => ls.filter((l) => Math.sign(l.valor) === sinal).reduce((t, l) => t + c(l.valor), 0) / 100
  const realizadas = doPeriodo.filter((l) => !aberta(l) && !l.foraDoSaldo)
  const previstas = [...antes, ...doPeriodo.filter(aberta)]
  const atrasadas = linhas.filter((l) => aberta(l) && l.data < hoje && ver !== 'realizado')
  const creditos = soma(realizadas, 1)
  const debitos = soma(realizadas, -1)
  const aReceber = soma(previstas, 1)
  const aPagar = soma(previstas, -1)
  const parcial = (c(saldoInicial) + c(creditos) + c(debitos)) / 100
  return {
    extrato,
    inicialPrevisto: inicialPrevisto / 100,
    resumo: {
      saldoInicial,
      creditos,
      debitos,
      realizado: (c(creditos) + c(debitos)) / 100,
      parcial,
      aReceber,
      aPagar,
      previsto: (c(aReceber) + c(aPagar)) / 100,
      final: (c(parcial) + c(aReceber) + c(aPagar)) / 100,
      atrasoReceber: soma(atrasadas, 1),
      atrasoPagar: soma(atrasadas, -1),
      atraso: (c(soma(atrasadas, 1)) + c(soma(atrasadas, -1))) / 100,
    },
  }
}
