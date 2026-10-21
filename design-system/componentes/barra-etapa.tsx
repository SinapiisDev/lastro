import { brl } from '@/lib/regras'

/**
 * Barra de progresso de etapa (DESIGN.md §3). Percentual escrito dentro; abaixo de 14 % ele vai para fora.
 * Alerta quando o gasto (% do previsto) passa do executado: trecho excedente hachurado e marcador do gasto.
 */
export function BarraEtapa({
  feito,
  gastoPct,
  excedente,
  tamanho = 'normal',
  rotulo = 'do serviço feito',
}: {
  feito: number
  /** % do previsto já gasto; liga o alerta quando passa de `feito`. */
  gastoPct?: number
  /** R$ gasto acima do executado, para a frase do alerta. */
  excedente?: number
  tamanho?: 'normal' | 'fina'
  rotulo?: string
}) {
  const f = Math.max(0, Math.min(100, Math.round(feito)))
  const g = gastoPct === undefined ? undefined : Math.max(0, gastoPct)
  const alerta = g !== undefined && g > f + 0.5
  const concluida = f >= 100 && !alerta
  const fora = f < 14
  const altura = tamanho === 'fina' ? 'h-5' : 'h-7'

  if (tamanho === 'fina') {
    return (
      <span
        role="progressbar"
        aria-valuenow={f}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${f}% ${rotulo}`}
        className={`relative block ${altura} overflow-hidden rounded-full bg-surface-3`}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink opacity-85" style={{ width: `${f}%` }} />
        <span className="absolute inset-y-0 right-2 flex items-center text-[11px] font-bold text-ink-2">{f}%</span>
      </span>
    )
  }

  return (
    <span className="flex min-w-0 flex-col gap-1">
      <span
        role="progressbar"
        aria-valuenow={f}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${f}% ${rotulo}${alerta ? `, gasto em ${Math.round(g!)}%` : ''}`}
        className={`relative block ${altura} overflow-hidden rounded-full bg-surface-3`}
      >
        <span
          className={`absolute inset-y-0 left-0 flex items-center justify-end rounded-full text-label font-bold ${fora ? '' : 'pr-2.5'} ${concluida ? 'bg-ok text-surface' : 'bg-accent text-fixed-ink'}`}
          style={{ width: `${f}%` }}
        >
          {!fora && (concluida ? '100% ✓' : `${f}%`)}
        </span>
        {alerta && (
          <>
            <span className="ds-hachura absolute inset-y-0" style={{ left: `${f}%`, width: `${Math.min(100, g!) - f}%` }} />
            <span className="absolute inset-y-0 w-0.5 bg-neg" style={{ left: `${Math.min(99.6, g!)}%` }} />
          </>
        )}
        {fora && (
          <span className="absolute inset-y-0 flex items-center pl-2 text-label font-bold text-ink" style={{ left: `${f}%` }}>
            {f}%
          </span>
        )}
      </span>
      {alerta && (
        <span className="text-caption font-bold text-neg">
          Gasto {Math.round(g!)}% · feito {f}%{excedente && excedente > 0 ? ` — ${brl(excedente)} acima do executado` : ''}
        </span>
      )}
    </span>
  )
}

export function BarraCarregando() {
  return <span className="ds-esqueleto block h-7 rounded-full" aria-hidden />
}
