import { hoje } from '@/lib/db'
import { exigirSessao } from '@/lib/sessao'
import { dadosDoFluxo } from '@/lib/fluxo'
import { filtrosDaUrl, montarFluxo } from '@/lib/fluxo-analitico'

// Mesmo fluxo da tela, em CSV que o Excel brasileiro abre direto (ponto e vírgula, vírgula decimal, acentos).
export async function GET(req: Request) {
  await exigirSessao('financeiro', 'chefe')
  const dia = await hoje()
  const f = filtrosDaUrl(Object.fromEntries(new URL(req.url).searchParams), dia)
  const dados = await dadosDoFluxo(f)
  const { extrato, inicialPrevisto, resumo } = montarFluxo({
    linhas: dados.linhas,
    saldoInicial: dados.saldoInicial,
    inicio: f.inicio,
    fim: f.fim,
    hoje: dia,
    ver: f.ver,
  })

  const br = (iso: string) => iso.split('-').reverse().join('/')
  const n = (v: number) => v.toFixed(2).replace('.', ',')
  const cel = (x: string | null | undefined) => `"${(x ?? '').replace(/"/g, '""')}"`
  const linhas = [
    ['Data', 'Tipo', 'Obra', 'Fornecedor', 'Descrição', 'Parcela', 'Documento', 'Conta', 'Valor', 'Saldo'].map(cel),
    [br(dados.diaAnterior), 'Realizado', '', '', 'Saldo inicial realizado', '', '', '', n(resumo.saldoInicial), n(resumo.saldoInicial)].map(cel),
    ...(f.ver === 'realizado'
      ? []
      : [['', 'Previsto', '', '', `Em aberto de antes de ${br(f.inicio)}`, '', '', '', n(inicialPrevisto), n(resumo.saldoInicial + inicialPrevisto)].map(cel)]),
    ...extrato.map((l) =>
      [
        br(l.data),
        l.tipo === 'realizado'
          ? l.foraDoSaldo
            ? 'Realizado (sem conta)'
            : 'Realizado'
          : l.atrasada
            ? 'Atrasado'
            : l.tipo === 'aguardando'
              ? 'Aguardando aprovação'
              : 'Previsto',
        l.obra,
        l.fornecedor,
        l.descricao,
        l.parcela,
        l.documento,
        l.conta,
        n(l.valor),
        n(l.saldo),
      ].map(cel),
    ),
  ]
  const csv = '﻿' + linhas.map((l) => l.join(';')).join('\r\n') + '\r\n'
  return new Response(csv, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': `attachment; filename="fluxo-de-caixa-${f.inicio}-a-${f.fim}.csv"`,
      'cache-control': 'no-store',
    },
  })
}
