import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linhasDoForm } from './rdo.ts'

const form = (pares: [string, string][]) => {
  const d = new FormData()
  for (const [k, v] of pares) d.append(k, v)
  return d
}

test('linhas do RDO: ignora linha vazia, converte números e exige o obrigatório', () => {
  const d = form([
    ['tarefas_servico', 'ESTRUTURA/Laje'], ['tarefas_descricao', 'Concretagem'], ['tarefas_quantidade', '12,5'], ['tarefas_unidade', 'm³'],
    ['tarefas_servico', ''], ['tarefas_descricao', ''], ['tarefas_quantidade', ''], ['tarefas_unidade', ''],
  ])
  assert.deepEqual(linhasDoForm(d, 'tarefas'), [{ servico: 'ESTRUTURA/Laje', descricao: 'Concretagem', quantidade: 12.5, unidade: 'm³' }])

  const semServico = form([['tarefas_servico', ''], ['tarefas_descricao', 'algo'], ['tarefas_quantidade', ''], ['tarefas_unidade', '']])
  assert.match(String(linhasDoForm(semServico, 'tarefas')), /Fase\/Serviço/)

  const pessoasRuins = form([['equipes_nome', 'Equipe própria'], ['equipes_funcao', ''], ['equipes_pessoas', '2.5'], ['equipes_jornada', '8h']])
  assert.match(String(linhasDoForm(pessoasRuins, 'equipes')), /Quantidade/)

  const negativo = form([['recebidos_insumo', 'Cimento'], ['recebidos_quantidade', '-3'], ['recebidos_unidade', 'sc']])
  assert.match(String(linhasDoForm(negativo, 'recebidos')), /inválido/)
})
