import { AreaTexto, Balao, Campo, Entrada, FormAcao, ListaConversa, type AutorBalao } from '@ds'
import { sql } from '@/lib/db'
import { quando } from '@/lib/historico'
import { whatsappReal, linkWhatsapp } from '@/lib/whatsapp'
import { responderComoPessoa, alternarIA, salvarWhatsapp, simularMensagem } from '@/app/(app)/conversas/acoes'

const NOMES: Record<string, string> = { ia: 'Assistente de compras', sistema: 'Mensagem automática', pessoa: 'Equipe' }

// Sem o número oficial (modo manual), o sistema prepara as mensagens e a pessoa manda pelo próprio WhatsApp;
// a resposta do fornecedor volta colada aqui (ou na cotação, quando colar=false) e a IA lê.
export async function Conversa({ fornecedor, colar = true }: { fornecedor: { id: number; nome: string; whatsapp: string | null; iaPausada: boolean }; colar?: boolean }) {
  const mensagens = await sql<{ id: number; direcao: string; autor: string; texto: string | null; anexoTipo: string | null; pendente: boolean; criadaEm: Date }[]>`
    select id, direcao, autor, texto, anexo_tipo as "anexoTipo", pendente_ia as pendente, criada_em as "criadaEm"
    from mensagens where fornecedor_id = ${fornecedor.id} order by id desc limit 60`
  const manual = !whatsappReal()

  return (
    <div className="flex min-w-0 flex-col overflow-hidden rounded-lg bg-surface-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
        <div className="flex flex-col">
          <span className="text-body font-semibold">{fornecedor.nome}</span>
          <span className="text-caption text-ink-3">
            {fornecedor.whatsapp ? `WhatsApp +${fornecedor.whatsapp}` : 'Sem WhatsApp cadastrado'}
            {manual && ' · as mensagens saem pelo seu WhatsApp'}
          </span>
        </div>
        {!manual && (
          <div className="flex flex-wrap items-center gap-3">
            <span className={`text-caption font-semibold ${fornecedor.iaPausada ? 'text-warn' : 'text-ok'}`}>
              ● {fornecedor.iaPausada ? 'IA pausada: uma pessoa conduz a conversa' : 'IA respondendo'}
            </span>
            <FormAcao
              action={alternarIA.bind(null, fornecedor.id)}
              botao={fornecedor.iaPausada ? 'Devolver para a IA' : 'Pausar a IA'}
              tamanho="sm"
              className="flex items-center gap-2"
            />
          </div>
        )}
      </div>

      <div className="flex max-h-[28rem] flex-col-reverse overflow-y-auto p-4">
        <ListaConversa>
          {mensagens.length === 0 && <Balao autor="sistema">Nenhuma mensagem ainda.</Balao>}
          {mensagens.reverse().map((m) => {
            const colada = m.direcao === 'entrada' && m.autor === 'pessoa'
            // Mensagens automáticas do sistema também saem para o fornecedor: ficam do lado de quem envia.
            const autor: AutorBalao = m.direcao === 'entrada' ? 'fornecedor' : m.autor === 'ia' ? 'ia' : 'pessoa'
            return (
              <Balao
                key={m.id}
                autor={autor}
                nome={m.direcao === 'entrada' ? (colada ? 'Resposta colada no sistema' : fornecedor.nome) : NOMES[m.autor]}
                hora={`${quando(m.criadaEm)}${m.pendente ? ' · aguardando a IA' : ''}`}
                lido={autor === 'pessoa' && !manual}
                rodape={
                  <>
                    {m.anexoTipo && <span className="text-caption opacity-70">Anexo: {m.anexoTipo === 'application/pdf' ? 'PDF' : 'imagem'}</span>}
                    {manual && m.direcao === 'saida' && m.texto && (
                      <a
                        href={linkWhatsapp(fornecedor.whatsapp, m.texto)}
                        target="_blank"
                        rel="noreferrer"
                        className={`mt-1 self-start text-caption font-bold underline-offset-2 ${autor === 'ia' ? 'text-accent-night' : 'text-inherit'}`}
                      >
                        Mandar pelo meu WhatsApp ›
                      </a>
                    )}
                  </>
                }
              >
                {m.texto ?? ''}
              </Balao>
            )
          })}
        </ListaConversa>
      </div>

      <div className="flex flex-col gap-3 border-t border-line bg-surface p-3">
        <FormAcao
          action={responderComoPessoa.bind(null, fornecedor.id)}
          botao={manual ? 'Preparar mensagem' : 'Enviar como pessoa'}
          variante="primario"
          className="flex flex-col gap-2"
        >
          <Campo rotulo={manual ? 'Escrever ao fornecedor (depois mande pelo seu WhatsApp)' : 'Responder você mesmo (a IA pausa nesta conversa)'}>
            <AreaTexto name="texto" rows={2} placeholder="Escreva para o fornecedor…" />
          </Campo>
        </FormAcao>

        {!fornecedor.whatsapp && (
          <FormAcao action={salvarWhatsapp.bind(null, fornecedor.id)} botao="Salvar WhatsApp" className="flex flex-wrap items-end gap-2">
            <Campo rotulo="WhatsApp do fornecedor" className="min-w-56 flex-1">
              <Entrada name="whatsapp" type="tel" placeholder="(11) 99999-8888" />
            </Campo>
          </FormAcao>
        )}

        {manual && colar && (
          <details className="rounded-md border border-line px-3 py-2.5">
            <summary className="cursor-pointer text-table font-semibold">Colar resposta do fornecedor</summary>
            <FormAcao action={simularMensagem.bind(null, fornecedor.id)} botao="A IA lê a resposta" className="mt-3 flex flex-col gap-3">
              <Campo rotulo="Texto que o fornecedor mandou no seu WhatsApp">
                <AreaTexto name="texto" rows={3} placeholder="Ex.: Cimento 32,90 o saco, frete 150, entrego em 3 dias, 30/60" />
              </Campo>
              <Campo rotulo="Foto ou PDF (opcional)">
                <Entrada name="arquivo" type="file" accept="application/pdf,image/*" className="py-2.5" />
              </Campo>
            </FormAcao>
          </details>
        )}
      </div>
    </div>
  )
}
