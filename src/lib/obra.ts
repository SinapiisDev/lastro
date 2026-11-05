import { SITUACOES_OBRA } from '@/components/rotulos'

export type DadosObra = {
  nome: string
  endereco: string | null
  investidor: string | null
  cidade: string | null
  inicio: string | null
  termino: string | null
  categoria: string | null
  situacao: string
  controla_estoque: boolean
}

const texto = (d: FormData, campo: string) => String(d.get(campo) ?? '').trim()
const data = (d: FormData, campo: string) => {
  const v = texto(d, campo)
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null
}

// Cadastro e edição da obra leem o mesmo formulário (CamposObra).
export function dadosObra(d: FormData): DadosObra | string {
  const nome = texto(d, 'nome')
  if (!nome) return 'Informe o nome da obra.'
  const situacao = texto(d, 'situacao') || 'em_andamento'
  if (!(situacao in SITUACOES_OBRA)) return 'Situação inválida.'
  const inicio = data(d, 'inicio')
  const termino = data(d, 'termino')
  if (inicio && termino && termino < inicio) return 'O término não pode ser antes do início.'
  return {
    nome: nome.slice(0, 160),
    endereco: texto(d, 'endereco') || null,
    investidor: texto(d, 'investidor') || null,
    cidade: texto(d, 'cidade') || null,
    inicio,
    termino,
    categoria: texto(d, 'categoria') || null,
    situacao,
    controla_estoque: d.get('controla_estoque') === 'on',
  }
}
