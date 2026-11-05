import { Campo, Entrada, Marcacao, Selecao } from '@ds'
import { CATEGORIAS_OBRA, SITUACOES_OBRA } from '@/components/rotulos'

type Obra = {
  nome: string
  endereco: string | null
  investidor: string | null
  cidade: string | null
  inicio: string | null
  termino: string | null
  categoria: string | null
  situacao: string
  controlaEstoque: boolean
}

// Os campos da obra, iguais no cadastro e na edição. Lidos por dadosObra() em src/lib/obra.ts.
export function CamposObra({ obra }: { obra?: Obra }) {
  const categorias = obra?.categoria && !CATEGORIAS_OBRA.includes(obra.categoria) ? [...CATEGORIAS_OBRA, obra.categoria] : CATEGORIAS_OBRA
  return (
    <>
      <Campo rotulo="Nome da obra">
        <Entrada name="nome" required defaultValue={obra?.nome} />
      </Campo>
      <Campo rotulo="Cliente">
        <Entrada name="investidor" defaultValue={obra?.investidor ?? ''} placeholder="Quem contratou a obra" />
      </Campo>
      <Campo rotulo="Endereço">
        <Entrada name="endereco" defaultValue={obra?.endereco ?? ''} />
      </Campo>
      <Campo rotulo="Cidade - UF">
        <Entrada name="cidade" defaultValue={obra?.cidade ?? ''} placeholder="Guarapuava/PR" />
      </Campo>
      <Campo rotulo="Início">
        <Entrada name="inicio" type="date" defaultValue={obra?.inicio ?? ''} />
      </Campo>
      <Campo rotulo="Término previsto">
        <Entrada name="termino" type="date" defaultValue={obra?.termino ?? ''} />
      </Campo>
      <Campo rotulo="Categoria">
        <Selecao name="categoria" defaultValue={obra?.categoria ?? ''}>
          <option value="">Escolha…</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Campo rotulo="Situação" ajuda="Finalizada ou cancelada: a obra sai das listas e os engenheiros dela deixam de ver.">
        <Selecao name="situacao" defaultValue={obra?.situacao ?? 'em_andamento'}>
          {Object.entries(SITUACOES_OBRA).map(([k, [rotulo]]) => (
            <option key={k} value={k}>
              {rotulo}
            </option>
          ))}
        </Selecao>
      </Campo>
      <Marcacao name="controla_estoque" defaultChecked={obra?.controlaEstoque} rotulo="Controla estoque" className="self-center" />
    </>
  )
}
