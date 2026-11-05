'use client'

import { useEffect, useRef, useState } from 'react'
import { Botao } from '@ds'
import { marcarPassoAPasso } from '@/app/(app)/conta/acoes'
import type { Perfil } from '@/lib/sessao'

type Passo = { titulo: string; onde: string; texto: string[] }

// Textos de cada perfil. Aparece na primeira entrada da pessoa; depois só em Minha conta › Rever o passo a passo.
const PASSOS: Record<Perfil, Passo[]> = {
  chefe: [
    {
      titulo: 'Bem-vindo, dono',
      onde: 'Visão geral',
      texto: [
        'Você vê tudo: obras, orçamentos, compras, caixa e o histórico de quem fez o quê.',
        'Siga os próximos passos na ordem uma vez; depois o sistema anda sozinho.',
      ],
    },
    {
      titulo: '1. Dados da empresa',
      onde: 'Configurações › Empresa',
      texto: ['Escreva o nome da construtora. Ele aparece nas mensagens de WhatsApp aos fornecedores e no orçamento impresso.'],
    },
    {
      titulo: '2. Limites de aprovação',
      onde: 'Configurações › Tetos de aprovação',
      texto: [
        'Teto baixo: até esse valor o engenheiro compra sem pedir aprovação.',
        'Teto médio: até esse valor o financeiro libera. Acima dele, a compra vem para você aprovar.',
      ],
    },
    {
      titulo: '3. Cadastre as obras',
      onde: 'Obras › Cadastrar obra',
      texto: [
        'Cada obra nasce com a lista padrão de etapas (fundação, estrutura, alvenaria…).',
        'Para ajustar, abra a obra e use Editar etapas.',
      ],
    },
    {
      titulo: '4. Crie as contas da equipe',
      onde: 'Configurações › Pessoas › Nova pessoa',
      texto: [
        'Cadastre o nome, o e-mail e a área (financeiro, compras ou engenheiro) de cada pessoa; para o engenheiro, marque as obras que ele cuida.',
        'Sai um link de acesso: copie ou mande pelo WhatsApp. No link, a pessoa confirma o e-mail, cria a senha e já cai no painel da área dela.',
        'Esqueceu a senha ou o link venceu (7 dias)? Em Gerenciar acesso, gere um link novo.',
        'Se alguém sair da empresa, desative a conta: a pessoa sai do sistema na hora.',
      ],
    },
    {
      titulo: '5. Monte o orçamento de cada obra',
      onde: 'Orçamento › escolha a obra',
      texto: [
        'Clique em Começar orçamento e inclua os itens em cada etapa (quantidade e preço).',
        'Informe a margem da construtora (BDI), envie ao investidor e, quando o contrato for assinado, registre a aprovação.',
        'O orçamento aprovado vira o previsto de cada etapa e trava; mudanças viram uma nova versão.',
      ],
    },
    {
      titulo: '6. Aprove as compras grandes',
      onde: 'Painel › Compras aguardando liberação',
      texto: [
        'Compras acima do teto médio esperam por você. Abra a compra, veja a análise do caixa e os itens do orçamento.',
        'Clique em Aprovar compra ou em Recusar (com o motivo, que volta para o engenheiro corrigir).',
      ],
    },
    {
      titulo: '7. Acompanhe',
      onde: 'Relatórios e Histórico',
      texto: [
        'Relatórios: gasto por obra, caixa dos próximos 30/60/90 dias, fornecedores e pendências (parcela vencida, pagamento sem nota).',
        'Histórico: tudo o que cada pessoa fez, com data e hora. Nada ali pode ser apagado.',
      ],
    },
  ],
  financeiro: [
    {
      titulo: 'Bem-vindo ao financeiro',
      onde: 'Visão geral',
      texto: ['Seu trabalho no sistema: manter o caixa em dia, liberar as compras da faixa média e registrar os pagamentos.'],
    },
    {
      titulo: '1. Informe o saldo em caixa',
      onde: 'Painel › Atualizar o saldo em caixa (faixa escura no fim da tela)',
      texto: ['Digite o saldo do banco no fim do dia. O sistema projeta o caixa dos próximos meses a partir dele.'],
    },
    {
      titulo: '2. Lance as entradas previstas',
      onde: 'Painel › Lançar entrada',
      texto: ['Cadastre as medições e aportes do investidor com a data prevista. Quando o dinheiro cair, clique em Recebida.'],
    },
    {
      titulo: '3. Libere as compras',
      onde: 'Painel › Compras aguardando liberação › Analisar',
      texto: [
        'Abra a compra: a análise mostra como fica o caixa com e sem ela e se passa do orçamento.',
        'Clique em Aprovar compra para liberar ou em Recusar, escrevendo o motivo.',
      ],
    },
    {
      titulo: '4. Registre os pagamentos',
      onde: 'Compras › abra a compra › Parcelas',
      texto: [
        'Em Registrar pagamento da parcela, informe a data e anexe o boleto e o comprovante.',
        'A nota fiscal vai em Documentos, na mesma tela. O relatório avisa quando falta nota.',
      ],
    },
    {
      titulo: '5. Fique de olho',
      onde: 'Relatórios, Cotações e Conversas',
      texto: ['Relatórios mostram parcelas vencidas e pendências. Em Cotações e Conversas você acompanha o que a IA está negociando com os fornecedores.'],
    },
  ],
  obra: [
    {
      titulo: 'Bem-vindo, engenheiro',
      onde: 'Visão geral',
      texto: ['Aqui você atualiza o andamento da obra, preenche o diário de obra, registra compras e pede cotações. Você só vê as suas obras.'],
    },
    {
      titulo: '1. Atualize o serviço feito',
      onde: 'Obra › Etapas',
      texto: [
        'Abra a etapa (clique no +) e, em cada subetapa, informe o percentual pronto e clique em Salvar.',
        'Se o gasto passar do que foi feito, a barra fica hachurada em vermelho para o financeiro ver.',
      ],
    },
    {
      titulo: '2. Preencha o diário de obra (RDO)',
      onde: 'Diário › Preencher o RDO de hoje',
      texto: [
        'Todo dia: clima, as equipes que trabalharam (próprias e prestadores) com o número de pessoas, os serviços feitos, ocorrências e observações.',
        'Tire as fotos pelo próprio celular no RDO: elas vão para o relatório e para a galeria da obra. Imprima o dia ou o mês inteiro.',
      ],
    },
    {
      titulo: '3. Registre uma compra',
      onde: 'Compras › + Nova compra',
      texto: [
        'Escolha a etapa, o item do orçamento, o fornecedor, o valor e as parcelas. Anexe o orçamento ou a nota.',
        'Quem aprova depende do valor: até o teto baixo é na hora; acima, vai para o financeiro ou para o dono.',
      ],
    },
    {
      titulo: '4. Peça cotação',
      onde: 'Cotações › Nova cotação',
      texto: [
        'Marque os itens e os fornecedores e clique em Pedir cotação aos fornecedores. A IA pede os preços pelo WhatsApp.',
        'Em Conversas você acompanha o que a IA fala com cada fornecedor. Se ela pausar (negociação, dúvida), responda você mesmo.',
        'Quando os preços chegarem, escolha o fornecedor de cada item: vira uma compra que segue a aprovação.',
      ],
    },
    {
      titulo: '5. Acompanhe as compras',
      onde: 'Compras',
      texto: ['Veja a situação de cada compra. Se for recusada, abra e use Corrigir e reenviar.'],
    },
  ],
  compras: [
    {
      titulo: 'Bem-vindo ao setor de compras',
      onde: 'Visão geral',
      texto: [
        'Aqui você pede cotações e registra as compras de todas as obras.',
        'Se o dono marcar obras em que você também atua como engenheiro, elas aparecem em Minhas obras: nelas você preenche o diário, envia fotos e atualiza o % feito.',
      ],
    },
    {
      titulo: '1. Peça cotação',
      onde: 'Cotações › Nova cotação',
      texto: [
        'Escolha a obra, marque os itens do orçamento (ou inclua itens fora dele) e os fornecedores. A IA pede os preços pelo WhatsApp.',
        'Em Conversas você acompanha o que a IA fala com cada fornecedor. Se ela pausar (negociação, dúvida), responda você mesmo.',
        'Quando os preços chegarem, escolha o fornecedor de cada item: vira uma compra que segue a aprovação.',
      ],
    },
    {
      titulo: '2. Registre uma compra',
      onde: 'Compras › + Nova compra',
      texto: [
        'Escolha a obra, a etapa, o item do orçamento, o fornecedor, o valor e as parcelas. Anexe o orçamento ou a nota.',
        'Quem aprova depende do valor: até o teto baixo é na hora; acima, vai para o financeiro ou para o dono.',
      ],
    },
    {
      titulo: '3. Acompanhe as compras',
      onde: 'Compras',
      texto: ['Filtre por obra e por situação. Se uma compra for recusada, abra e use Corrigir e reenviar.'],
    },
  ],
}

export function PassoAPasso({ perfil, nome }: { perfil: Perfil; nome: string }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [i, setI] = useState(0)
  const passos = PASSOS[perfil]
  const p = passos[i]
  const ultimo = i === passos.length - 1

  useEffect(() => {
    ref.current?.showModal()
  }, [])

  return (
    <dialog
      ref={ref}
      onClose={() => marcarPassoAPasso(true)}
      aria-labelledby="passo-titulo"
      className="m-auto w-[min(560px,calc(100%-32px))] rounded-lg bg-surface p-6 text-ink shadow-2 backdrop:bg-night/55"
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3">
          <span className="text-label font-semibold text-ink-3">
            {i === 0 ? `Olá, ${nome.split(' ')[0]}` : `Passo ${i} de ${passos.length - 1}`}
          </span>
          <div className="flex gap-1" aria-hidden>
            {passos.map((_, k) => (
              <span key={k} className={`h-1.5 rounded-full transition-all ${k === i ? 'w-5 bg-ink' : 'w-1.5 bg-surface-3'}`} />
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <h2 id="passo-titulo" className="font-display text-[26px] leading-tight font-light">
            {p.titulo}
          </h2>
          <span className="text-label font-bold text-accent-ink">{p.onde}</span>
        </div>
        <ul className="flex min-h-28 flex-col gap-2.5 text-body leading-normal text-ink-2">
          {p.texto.map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4">
          <Botao type="button" variante="fantasma" tamanho="sm" className="px-0" onClick={() => ref.current?.close()}>
            Pular
          </Botao>
          <div className="flex gap-2">
            {i > 0 && (
              <Botao type="button" variante="secundario" onClick={() => setI(i - 1)}>
                Voltar
              </Botao>
            )}
            <Botao type="button" variante={ultimo ? 'acento' : 'primario'} onClick={() => (ultimo ? ref.current?.close() : setI(i + 1))}>
              {ultimo ? 'Entendi, começar' : 'Próximo'}
            </Botao>
          </div>
        </div>
      </div>
    </dialog>
  )
}
