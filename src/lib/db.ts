import 'server-only'
import { AsyncLocalStorage } from 'node:async_hooks'
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
const g = globalThis as unknown as { raiz?: ReturnType<typeof conectar> }
const raiz = (g.raiz ??= conectar())

/**
 * Conexão do sistema, SEM a trava por empresa. Só para o que não tem pessoa logada ou cruza empresas:
 * entrada (login/cadastro), webhook do WhatsApp, lembretes e o painel do administrador.
 */
export const sqlSistema = raiz

export type Tx = postgres.TransactionSql<Record<string, unknown>>

// Empresa da vez: a da sessão, ou a marcada por comoEmpresa() (webhook e lembretes, que não têm sessão).
const contexto = new AsyncLocalStorage<{ empresaId: number }>()
export const comoEmpresa = <T>(empresaId: number, fn: () => Promise<T>) => contexto.run({ empresaId }, fn)

async function empresaAtual() {
  const id = contexto.getStore()?.empresaId ?? (await (await import('./sessao')).lerSessao())?.empresaId
  if (!id) throw new Error('Acesso ao banco sem empresa definida')
  return id
}

// Dentro da transação: vira o papel app_web (sujeito à RLS) e marca empresa e autor para o histórico.
const travar = async (tx: postgres.TransactionSql, perfil = '') =>
  tx`select set_config('role', 'app_web', true), set_config('app.empresa_id', ${String(await empresaAtual())}, true),
            set_config('app.perfil', ${perfil}, true)`

/**
 * Igual ao `sql` do postgres.js, mas cada consulta roda numa transação travada na empresa de quem está logado:
 * o banco só entrega e só aceita linhas dessa empresa, mesmo que a consulta esqueça o filtro.
 * Pedaços de consulta (sql`and x = ${y}`) continuam funcionando dentro de outras consultas.
 */
export const sql = new Proxy(raiz, {
  apply(alvo, _isto, args: Parameters<typeof raiz>) {
    const [strings, ...valores] = args as [TemplateStringsArray, ...postgres.ParameterOrFragment<never>[]]
    // sql(lista), sql('coluna'): só montam pedaços, não executam nada.
    if (!Array.isArray(strings) || !('raw' in strings)) return Reflect.apply(alvo, raiz, args)
    const q = Reflect.apply(alvo, raiz, args) as postgres.PendingQuery<postgres.Row[]> & {
      executed: boolean
      handle: () => void
      resolve: (x: unknown) => void
      reject: (e: unknown) => void
    }
    // Toda execução do postgres.js (await, then, catch, finally, execute) passa por handle(): troca pela travada.
    q.handle = () => {
      if (q.executed) return
      q.executed = true
      raiz
        .begin(async (tx) => {
          await travar(tx)
          return tx(strings, ...valores)
        })
        .then(q.resolve, q.reject)
    }
    return q
  },
  get(alvo, chave, receptor) {
    if (chave === 'begin') return <T>(fn: (tx: Tx) => Promise<T>) => escrever('', fn)
    return Reflect.get(alvo, chave, receptor)
  },
})

// Toda escrita passa por aqui: o autor fica gravado no histórico pelo gatilho do banco.
export function escrever<T>(perfil: string, fn: (tx: Tx) => Promise<T>) {
  return raiz.begin(async (tx) => {
    await travar(tx, perfil)
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
