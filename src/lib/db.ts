import 'server-only'
import postgres from 'postgres'

const tipos = {
  // numeric chega como número (valores em R$ cabem com folga em double)
  numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
  // date chega como 'AAAA-MM-DD', sem fuso horário no meio
  dia: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
}

function conectar() {
  // prepare: false porque o pooler do Supabase (modo transação) não aceita prepared statements
  return postgres(process.env.DATABASE_URL!, { prepare: false, types: tipos, max: 5 })
}

// Em desenvolvimento o módulo recarrega; reaproveita a conexão para não estourar o limite.
const g = globalThis as unknown as { sql?: ReturnType<typeof conectar> }
export const sql = (g.sql ??= conectar())

export type Tx = postgres.TransactionSql<Record<string, unknown>>

// Toda escrita passa por aqui: o perfil fica gravado no histórico pelo gatilho do banco.
export function escrever<T>(perfil: string, fn: (tx: Tx) => Promise<T>) {
  return sql.begin(async (tx) => {
    await tx`select set_config('app.perfil', ${perfil}, true)`
    return fn(tx as unknown as Tx)
  }) as Promise<T>
}

export async function lerConfig() {
  const [c] = await sql<{ tetoBaixo: number; tetoMedio: number; saldoCaixa: number; saldoCaixaEm: string; nomeEmpresa: string }[]>`
    select teto_baixo as "tetoBaixo", teto_medio as "tetoMedio", saldo_caixa as "saldoCaixa",
           saldo_caixa_em as "saldoCaixaEm", nome_empresa as "nomeEmpresa"
    from config`
  return c
}

export async function hoje() {
  const [{ d }] = await sql<{ d: string }[]>`select hoje() as d`
  return d
}
