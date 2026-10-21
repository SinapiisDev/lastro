import { sql } from '@/lib/db'
import { quando } from '@/lib/historico'
import { whatsappReal } from '@/lib/whatsapp'
import { FormAcao } from './form-acao'
import { responderComoPessoa, alternarIA, salvarWhatsapp, simularMensagem } from '@/app/(app)/conversas/acoes'

const AUTORES: Record<string, string> = { ia: 'IA', sistema: 'Sistema', pessoa: 'Pessoa', fornecedor: 'Fornecedor' }

export async function Conversa({
  fornecedor,
  podeSimular,
}: {
  fornecedor: { id: number; nome: string; whatsapp: string | null; iaPausada: boolean }
  podeSimular: boolean
}) {
  const mensagens = await sql<{ id: number; direcao: string; autor: string; texto: string | null; anexoTipo: string | null; pendente: boolean; criadaEm: Date }[]>`
    select id, direcao, autor, texto, anexo_tipo as "anexoTipo", pendente_ia as pendente, criada_em as "criadaEm"
    from mensagens where fornecedor_id = ${fornecedor.id} order by id desc limit 60`
  const simulado = !whatsappReal()

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span>{fornecedor.whatsapp ? `WhatsApp +${fornecedor.whatsapp}` : 'Sem WhatsApp cadastrado'}</span>
        <span className={fornecedor.iaPausada ? 'text-alerta' : 'text-feito'}>
          {fornecedor.iaPausada ? 'IA pausada: uma pessoa conduz a conversa' : 'IA respondendo'}
        </span>
        {simulado && <span className="text-cinza">(WhatsApp simulado: nada sai do sistema)</span>}
        <FormAcao action={alternarIA.bind(null, fornecedor.id)} botao={fornecedor.iaPausada ? 'Devolver para a IA' : 'Pausar a IA'} />
      </div>

      <ol className="grid max-h-[28rem] gap-2 overflow-y-auto rounded border border-linha bg-concreto/50 p-3">
        {mensagens.length === 0 && <li className="text-sm text-cinza">Nenhuma mensagem ainda.</li>}
        {mensagens.reverse().map((m) => (
          <li
            key={m.id}
            className={`max-w-[85%] rounded px-3 py-2 text-sm ${m.direcao === 'saida' ? 'justify-self-end bg-emerald-50' : 'justify-self-start bg-superficie'}`}
          >
            <p className="mb-1 text-xs text-cinza">
              {m.direcao === 'entrada' ? (m.autor === 'pessoa' ? 'Resposta colada no sistema' : fornecedor.nome) : AUTORES[m.autor]} ·{' '}
              {quando(m.criadaEm)}
              {m.pendente && ' · aguardando a IA'}
            </p>
            <p className="whitespace-pre-line">{m.texto ?? ''}</p>
            {m.anexoTipo && <p className="text-xs text-cinza">Anexo: {m.anexoTipo === 'application/pdf' ? 'PDF' : 'imagem'}</p>}
          </li>
        ))}
      </ol>

      <FormAcao action={responderComoPessoa.bind(null, fornecedor.id)} botao="Enviar como pessoa" className="grid gap-2">
        <label>
          <span className="rotulo">Responder você mesmo (a IA pausa nesta conversa)</span>
          <textarea name="texto" rows={2} className="campo" />
        </label>
      </FormAcao>

      {!fornecedor.whatsapp && (
        <FormAcao action={salvarWhatsapp.bind(null, fornecedor.id)} botao="Salvar WhatsApp" className="flex flex-wrap items-end gap-2">
          <label>
            <span className="rotulo">WhatsApp do fornecedor</span>
            <input name="whatsapp" type="tel" placeholder="(11) 99999-8888" className="campo" />
          </label>
        </FormAcao>
      )}

      {simulado && podeSimular && (
        <details className="rounded border border-dashed border-linha p-3">
          <summary className="cursor-pointer text-sm font-medium">Simular mensagem do fornecedor (teste)</summary>
          <FormAcao action={simularMensagem.bind(null, fornecedor.id)} botao="Receber como se fosse o fornecedor" className="mt-3 grid gap-2">
            <label>
              <span className="rotulo">Texto que o fornecedor mandou</span>
              <textarea name="texto" rows={3} className="campo" placeholder="Ex.: Cimento 32,90 o saco, frete 150, entrego em 3 dias, 30/60" />
            </label>
            <label>
              <span className="rotulo">Foto ou PDF (opcional)</span>
              <input name="arquivo" type="file" accept="application/pdf,image/*" className="campo" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input name="audio" type="checkbox" className="size-4" /> Simular um áudio em vez de texto
            </label>
          </FormAcao>
        </details>
      )}
    </div>
  )
}
