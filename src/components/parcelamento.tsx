'use client'

import { useState, type ReactNode } from 'react'
import { Campo, Entrada } from '@ds'
import { brl, centavos, dividirParcelas } from '@/lib/regras'

type Parcela = { valor: number; vencimento: string }

// Divide o total em parcelas iguais a cada 30 dias; cada parcela pode ser ajustada à mão.
// Os campos saem como parcela_valor / parcela_vencimento (o servidor confere a soma).
export function useParcelamento(total: number, hoje: string, inicial: Parcela[] = []) {
  const [parcelas, setParcelas] = useState<Parcela[]>(inicial)
  const [quantidade, setQuantidadeBruta] = useState(inicial.length || 1)
  const [primeiro, setPrimeiroBruto] = useState(inicial[0]?.vencimento ?? hoje)
  const [base, setBase] = useState(total)
  const refazer = (v: number, q: number, d: string) => setParcelas(v > 0 && q > 0 && d ? dividirParcelas(v, q, d) : [])
  if (base !== total) {
    setBase(total)
    refazer(total, quantidade, primeiro)
  }
  const soma = parcelas.reduce((t, p) => t + centavos(p.valor || 0), 0) / 100
  return {
    parcelas,
    quantidade,
    primeiro,
    soma,
    bate: total > 0 && centavos(soma) === centavos(total),
    setQuantidade: (q: number) => {
      setQuantidadeBruta(q)
      refazer(total, q, primeiro)
    },
    setPrimeiro: (d: string) => {
      setPrimeiroBruto(d)
      refazer(total, quantidade, d)
    },
    mudar: (i: number, campo: keyof Parcela, x: string) =>
      setParcelas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: campo === 'valor' ? Number(x) : x } : p))),
  }
}

// `children` entra como a primeira coluna (normalmente o campo do valor total).
export function CamposParcelas({ p, total, children }: { p: ReturnType<typeof useParcelamento>; total: number; children?: ReactNode }) {
  return (
    <>
      <div className="grid gap-3.5 sm:grid-cols-3">
        {children}
        <Campo rotulo="Parcelas">
          <Entrada type="number" min={1} max={120} value={p.quantidade} onChange={(e) => p.setQuantidade(Number(e.target.value))} />
        </Campo>
        <Campo rotulo="Primeiro vencimento">
          <Entrada type="date" value={p.primeiro} onChange={(e) => p.setPrimeiro(e.target.value)} />
        </Campo>
      </div>
      {p.parcelas.length > 0 && (
        <div className="flex flex-col gap-2">
          <p className="text-label font-semibold text-ink-2">Parcelas (dá para ajustar valor e data de cada uma)</p>
          {p.parcelas.map((x, i) => (
            <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-2">
              <span className="text-label font-bold text-ink-3">{i + 1}ª</span>
              <Entrada
                name="parcela_valor"
                type="number"
                min="0.01"
                step="0.01"
                required
                aria-label={`Valor da parcela ${i + 1}`}
                value={x.valor}
                onChange={(e) => p.mudar(i, 'valor', e.target.value)}
                className="text-right"
              />
              <Entrada
                name="parcela_vencimento"
                type="date"
                required
                aria-label={`Vencimento da parcela ${i + 1}`}
                value={x.vencimento}
                onChange={(e) => p.mudar(i, 'vencimento', e.target.value)}
              />
            </div>
          ))}
          {!p.bate && (
            <p className="text-caption font-semibold text-neg">
              As parcelas somam {brl(p.soma)} e o total é {brl(total || 0)}.
            </p>
          )}
        </div>
      )}
    </>
  )
}
