import { CabecalhoTela, Campo, FormAcao, Secao, Selecao } from '@ds'
import { sql } from '@/lib/db'
import { exigirSessao, ROTULO_PERFIL } from '@/lib/sessao'
import { sairDeTodos, trocarObra, marcarPassoAPasso } from './acoes'

export default async function MinhaConta() {
  const s = await exigirSessao()
  const [[u], obras] = await Promise.all([
    sql<{ celular: string }[]>`select celular from usuarios where id = ${s.usuarioId}`,
    s.perfil === 'obra'
      ? sql<{ id: number; nome: string }[]>`
          select o.id, o.nome from usuario_obras uo join obras o on o.id = uo.obra_id
          where uo.usuario_id = ${s.usuarioId} and o.ativa order by o.nome`
      : [],
  ])

  return (
    <>
      <CabecalhoTela contexto={`${ROTULO_PERFIL[s.perfil]} · WhatsApp +${u.celular}`} titulo="Minha conta" />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Secao titulo="Aparelhos conectados">
          <FormAcao action={sairDeTodos} botao="Sair de todos os aparelhos" variante="perigo" className="flex flex-col gap-3">
            <p className="text-table text-ink-2">
              Cada aparelho fica conectado por 30 dias. Perdeu o celular ou entrou num computador emprestado? Saia de todos e entre de novo com o
              código do WhatsApp. Trocou de número? Peça ao dono para atualizar em Configurações › Pessoas.
            </p>
          </FormAcao>
        </Secao>

        <div className="flex flex-col gap-4">
          {obras.length > 1 && (
            <Secao titulo="Trocar de obra">
              <FormAcao action={trocarObra} botao="Ir para a obra" className="flex flex-wrap items-end gap-3">
                <Campo rotulo="Obra" className="min-w-56 flex-1">
                  <Selecao name="obra" defaultValue={s.obraId}>
                    {obras.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.nome}
                      </option>
                    ))}
                  </Selecao>
                </Campo>
              </FormAcao>
            </Secao>
          )}
          <Secao titulo="Passo a passo">
            <FormAcao action={marcarPassoAPasso.bind(null, false)} botao="Rever o passo a passo" className="flex flex-col gap-3">
              <p className="text-table text-ink-2">Mostra de novo o guia da primeira entrada, com o que fazer em cada tela.</p>
            </FormAcao>
          </Secao>
        </div>
      </div>
    </>
  )
}
