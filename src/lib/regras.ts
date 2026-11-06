// Regras puras (sem banco), usadas no servidor e nos formulários.

export type Faixa = 'baixa' | 'media' | 'alta'

export function faixaDaCompra(valor: number, tetoBaixo: number, tetoMedio: number): Faixa {
  if (valor <= tetoBaixo) return 'baixa'
  if (valor <= tetoMedio) return 'media'
  return 'alta'
}

export const situacaoInicial = {
  baixa: 'aprovada',
  media: 'aguardando_financeiro',
  alta: 'aguardando_chefe',
} as const

export const centavos = (v: number) => Math.round(v * 100)

// Mesmo arredondamento do banco (v_previsto): cada item arredondado em centavos.
export const totalItem = (quantidade: number, precoUnitario: number) => centavos(quantidade * precoUnitario) / 100

// Preço ao investidor = custo + margem (BDI) em %.
export const comBdi = (custo: number, bdi: number) => centavos(custo * (1 + bdi / 100)) / 100

export function brl(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

// 'AAAA-MM-DD' -> 'segunda-feira' (meio-dia UTC: o fuso não troca o dia)
export const diaDaSemana = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('pt-BR', { weekday: 'long', timeZone: 'UTC' })

export function dataBR(iso: string) {
  const [a, m, d] = iso.split('-')
  return `${d}/${m}/${a}`
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
export const mesBR = (aaaaMm: string) => `${MESES[Number(aaaaMm.slice(5, 7)) - 1]}/${aaaaMm.slice(0, 4)}`

export function somarDias(iso: string, dias: number) {
  const [a, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10)
}

const diasEntre = (de: string, ate: string) =>
  (Date.parse(ate + 'T00:00:00Z') - Date.parse(de + 'T00:00:00Z')) / 86_400_000

// Parcelas iguais a cada 30 dias; a diferença de centavos vai para a última.
export function dividirParcelas(total: number, quantidade: number, primeiroVencimento: string) {
  const base = Math.floor(centavos(total) / quantidade)
  return Array.from({ length: quantidade }, (_, i) => ({
    valor: (i === quantidade - 1 ? centavos(total) - base * (quantidade - 1) : base) / 100,
    vencimento: somarDias(primeiroVencimento, 30 * i),
  }))
}

export function progressoEtapa(progressos: number[]) {
  if (!progressos.length) return 0
  return Math.round(progressos.reduce((a, b) => a + b, 0) / progressos.length)
}

// Laranja quando o dinheiro gasto corre na frente do serviço feito.
export function gastoNaFrente(gasto: number, previsto: number, progresso: number) {
  if (previsto <= 0) return gasto > 0
  return (gasto / previsto) * 100 > progresso
}

// Pagamento (ou recebimento) de parte de uma parcela: o que sobra vira uma parcela nova.
// Devolve o restante (0 = pagou tudo) ou a mensagem de erro.
export function restanteDoPagamento(valorParcela: number, pago: number): number | string {
  if (!(pago > 0)) return 'Informe o valor pago.'
  const resto = centavos(valorParcela) - centavos(pago)
  if (resto < 0) return `O valor pago passa o da parcela (${brl(valorParcela)}).`
  return resto / 100
}

export type Movimento = { data: string; valor: number } // valor > 0 entra, < 0 sai

// Projeção mês a mês a partir do saldo de hoje. O que está atrasado cai no mês atual.
export function projetarFluxo(saldoHoje: number, movimentos: Movimento[], hoje: string, meses: number) {
  const inicio = hoje.slice(0, 7)
  const chaves = Array.from({ length: meses }, (_, i) => {
    const [a, m] = inicio.split('-').map(Number)
    return new Date(Date.UTC(a, m - 1 + i, 1)).toISOString().slice(0, 7)
  })
  const linhas = chaves.map((mes) => ({ mes, entradas: 0, saidas: 0, saldoMes: 0, acumulado: 0 }))
  for (const mov of movimentos) {
    const mes = mov.data < hoje ? inicio : mov.data.slice(0, 7)
    const linha = linhas.find((l) => l.mes === mes)
    if (!linha) continue // além do horizonte
    if (mov.valor > 0) linha.entradas += mov.valor
    else linha.saidas -= mov.valor
  }
  let acumulado = saldoHoje
  for (const l of linhas) {
    l.saldoMes = (centavos(l.entradas) - centavos(l.saidas)) / 100
    acumulado = (centavos(acumulado) + centavos(l.saldoMes)) / 100
    l.acumulado = acumulado
  }
  return linhas
}

export type CompraSimples = { id: number; obraId: number; fornecedorId: number; data: string; valor: number }

// Possível fracionamento: 2+ compras sem aprovação, mesmo fornecedor e obra,
// dentro de `dias` dias, somando mais que o teto baixo.
export function detectarFracionamento(compras: CompraSimples[], tetoBaixo: number, dias = 7) {
  const suspeitas = new Set<number>()
  const grupos = new Map<string, CompraSimples[]>()
  for (const c of compras) {
    const chave = `${c.obraId}-${c.fornecedorId}`
    grupos.set(chave, [...(grupos.get(chave) ?? []), c])
  }
  for (const grupo of grupos.values()) {
    grupo.sort((a, b) => a.data.localeCompare(b.data))
    grupo.forEach((c, i) => {
      const janela = grupo.slice(i).filter((o) => diasEntre(c.data, o.data) <= dias)
      const soma = janela.reduce((s, o) => s + centavos(o.valor), 0)
      if (janela.length >= 2 && soma > centavos(tetoBaixo)) janela.forEach((o) => suspeitas.add(o.id))
    })
  }
  return suspeitas
}
