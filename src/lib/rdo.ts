// As listas do RDO (igual ao modelo do sistema antigo). Formulário, gravação e impressão leem desta definição.

export type CampoRdo = {
  nome: string
  rotulo: string
  tipo: 'texto' | 'decimal' | 'inteiro'
  obrigatorio?: boolean
  lista?: string // id do <datalist> com sugestões
  largura: string // coluna do grid em telas largas
  placeholder?: string
}

type Secao = { titulo: string; tabela: string; filtro?: { tipo: string }; campos: CampoRdo[]; botao: string }

const servico = (obrigatorio = false): CampoRdo => ({
  nome: 'servico',
  rotulo: 'Fase/Serviço',
  tipo: 'texto',
  obrigatorio,
  lista: 'servicos-obra',
  largura: 'minmax(0,1.4fr)',
  placeholder: 'Etapa/serviço',
})
const quantidade: CampoRdo = { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'decimal', largura: '96px' }
const unidade: CampoRdo = { nome: 'unidade', rotulo: 'Unidade', tipo: 'texto', lista: 'unidades', largura: '88px', placeholder: 'm², un…' }

export const SECOES_RDO = {
  tarefas: {
    titulo: 'Tarefas',
    tabela: 'rdo_tarefas',
    botao: '+ Adicionar tarefa',
    campos: [
      servico(true),
      { nome: 'descricao', rotulo: 'Descrição', tipo: 'texto', largura: 'minmax(0,1.4fr)', placeholder: 'Ex.: contrapiso do TIPO 2' },
      { ...quantidade, rotulo: 'Medição' },
      unidade,
    ],
  },
  equipes: {
    titulo: 'Equipe envolvida',
    tabela: 'rdo_equipes',
    botao: '+ Adicionar equipe',
    campos: [
      { nome: 'nome', rotulo: 'Nome', tipo: 'texto', obrigatorio: true, lista: 'prestadores', largura: 'minmax(0,1.2fr)', placeholder: 'Equipe ou prestador' },
      { nome: 'funcao', rotulo: 'Função', tipo: 'texto', largura: 'minmax(0,1fr)', placeholder: 'Ex.: pedreiro' },
      { nome: 'pessoas', rotulo: 'Quantidade', tipo: 'inteiro', obrigatorio: true, largura: '96px' },
      { nome: 'jornada', rotulo: 'Jornada', tipo: 'texto', largura: '96px', placeholder: '8h' },
    ],
  },
  equipamentos: {
    titulo: 'Máquinas e equipamentos',
    tabela: 'rdo_equipamentos',
    botao: '+ Adicionar equipamento',
    campos: [
      { nome: 'equipamento', rotulo: 'Equipamento', tipo: 'texto', obrigatorio: true, largura: 'minmax(0,1.2fr)', placeholder: 'Ex.: betoneira' },
      servico(),
      { nome: 'quantidade', rotulo: 'Quantidade', tipo: 'inteiro', obrigatorio: true, largura: '96px' },
      { nome: 'duracao', rotulo: 'Duração', tipo: 'texto', largura: '96px', placeholder: '4h' },
    ],
  },
  recebidos: {
    titulo: 'Materiais recebidos',
    tabela: 'rdo_materiais',
    filtro: { tipo: 'recebido' },
    botao: '+ Adicionar material recebido',
    campos: [{ nome: 'insumo', rotulo: 'Insumo', tipo: 'texto', obrigatorio: true, largura: 'minmax(0,2fr)', placeholder: 'Ex.: cimento CP-II' }, quantidade, unidade],
  },
  utilizados: {
    titulo: 'Materiais utilizados',
    tabela: 'rdo_materiais',
    filtro: { tipo: 'utilizado' },
    botao: '+ Adicionar material utilizado',
    campos: [
      { nome: 'insumo', rotulo: 'Insumo', tipo: 'texto', obrigatorio: true, largura: 'minmax(0,1.4fr)', placeholder: 'Ex.: cimento CP-II' },
      quantidade,
      unidade,
      servico(),
    ],
  },
} satisfies Record<string, Secao>

export type ChaveSecao = keyof typeof SECOES_RDO
export type LinhaRdo = Record<string, string | number | null>

export const UNIDADES = ['m²', 'm³', 'm', 'un', 'kg', 't', 'sc', 'l', 'h', 'vb', 'cj']

/** Lê as linhas de uma lista do formulário. Linha toda vazia é ignorada; devolve texto de erro se algo não fecha. */
export function linhasDoForm(d: FormData, chave: ChaveSecao): LinhaRdo[] | string {
  const secao: Secao = SECOES_RDO[chave]
  const colunas = secao.campos.map((c) => d.getAll(`${chave}_${c.nome}`).map((v) => String(v).trim()))
  const linhas: LinhaRdo[] = []
  for (let i = 0; i < colunas[0].length; i++) {
    if (colunas.every((col) => !col[i])) continue
    const linha: LinhaRdo = {}
    for (const [j, c] of secao.campos.entries()) {
      const v = colunas[j][i] ?? ''
      if (!v) {
        if (c.obrigatorio) return `${secao.titulo}: preencha "${c.rotulo}" em todas as linhas.`
        linha[c.nome] = null
      } else if (c.tipo === 'texto') linha[c.nome] = v.slice(0, 300)
      else {
        const n = Number(v.replace(',', '.'))
        const ok = c.tipo === 'inteiro' ? Number.isInteger(n) && n >= 1 && n <= 999 : Number.isFinite(n) && n > 0 && n < 1e11
        if (!ok) return `${secao.titulo}: "${c.rotulo}" inválido (${v}).`
        linha[c.nome] = n
      }
    }
    linhas.push(linha)
  }
  return linhas
}
