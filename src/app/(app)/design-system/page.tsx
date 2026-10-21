import type { ReactNode } from 'react'
import {
  AreaTexto,
  Balao,
  BarraCarregando,
  BarraEtapa,
  Botao,
  BotaoLink,
  CabecalhoTela,
  Campo,
  CampoAnexo,
  Cartao,
  CartaoDocumento,
  ChipFiltro,
  ChipOpcao,
  Dinheiro,
  Entrada,
  EntradaDinheiro,
  Esqueleto,
  EstadoVazio,
  Etiqueta,
  Interruptor,
  Kpi,
  LinhaDoTempo,
  LinhaTotal,
  ListaConversa,
  Marca,
  Marcacao,
  Mensagem,
  Modal,
  Passos,
  Predio3D,
  Segmentado,
  Selecao,
  SeletorPilula,
  Situacao,
  Spinner,
  Tabela,
  Td,
  Th,
  Tr,
  classesBotao,
  type VarianteBotao,
} from '@ds'
import { exigirSessao } from '@/lib/sessao'
import { DemoToast } from './demo'

// Vitrine do design system: cada componente de design-system/ com todos os estados, nos dois temas. Só o chefe vê.

const VARIANTES: VarianteBotao[] = ['primario', 'acento', 'secundario', 'suave', 'fantasma', 'perigo', 'perigo-solido']
// Hover não dá para forçar com CSS; aqui ele é simulado com a mesma cor que o :hover aplica.
const HOVER: Record<VarianteBotao, string> = {
  primario: 'bg-ink-2',
  acento: 'brightness-95',
  secundario: 'bg-surface-2',
  suave: 'bg-surface-3',
  fantasma: 'text-accent-ink',
  perigo: 'bg-neg-bg',
  'perigo-solido': 'brightness-95',
}
const FOCO = 'shadow-[0_0_0_2px_var(--surface),0_0_0_4px_var(--focus)]'
const SITUACOES = [
  'aguardando_financeiro',
  'aguardando_chefe',
  'aprovada',
  'paga',
  'recusada',
  'cancelada',
  'rascunho',
  'enviado',
  'aprovado',
  'substituido',
  'cot_rascunho',
  'cot_aguardando',
  'cot_concluida',
  'cot_cancelada',
  'forn_pendente',
  'forn_pedido_enviado',
  'forn_respondeu',
  'forn_recusou',
]

export default async function DesignSystem() {
  await exigirSessao('chefe')
  return (
    <>
      <CabecalhoTela contexto="design-system/ · tokens em DESIGN.md" titulo="Design system">
        <p className="max-w-3xl text-table text-ink-2">
          Todos os componentes da biblioteca com seus estados: padrão, hover, foco, ativo, selecionado, desabilitado, carregando, erro e vazio. O mesmo
          conjunto aparece no tema claro e no escuro.
        </p>
        <nav className="flex flex-wrap gap-2 pt-1">
          <BotaoLink href="#tema-claro" tamanho="sm" variante="suave">
            Tema claro
          </BotaoLink>
          <BotaoLink href="#tema-escuro" tamanho="sm" variante="suave">
            Tema escuro
          </BotaoLink>
        </nav>
      </CabecalhoTela>
      <Tema id="tema-claro" tema="claro" titulo="Tema claro" />
      <Tema id="tema-escuro" tema="escuro" titulo="Tema escuro" />
    </>
  )
}

function Tema({ id, tema, titulo }: { id: string; tema: 'claro' | 'escuro'; titulo: string }) {
  return (
    <section id={id} data-tema={tema} className="flex scroll-mt-4 flex-col gap-4 rounded-xl bg-bg p-3 text-ink sm:p-4">
      <h2 className="px-1 pt-1 font-display text-[28px] font-light">{titulo}</h2>
      <Vitrine sufixo={tema} />
    </section>
  )
}

function Grupo({ titulo, nota, children }: { titulo: string; nota?: string; children: ReactNode }) {
  return (
    <Cartao className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="font-display text-h2 font-normal">{titulo}</h3>
        {nota && <span className="text-label text-ink-3">{nota}</span>}
      </div>
      {children}
    </Cartao>
  )
}

function Estado({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="text-caption font-semibold text-ink-3">{nome}</span>
      {children}
    </div>
  )
}

function Vitrine({ sufixo }: { sufixo: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Grupo titulo="Marca e prédio 3D" nota="design-system/padroes · marca.tsx, predio-3d.tsx">
        <div className="flex flex-wrap items-center gap-6">
          <Marca subtitulo="Construtora" />
          <Marca comNome={false} tamanho={28} />
        </div>
        <div className="relative h-64 overflow-hidden rounded-lg bg-surface-2">
          <Predio3D progresso={{ fundacao: 100, estrutura: 80, alvenaria: 55, instalacoes: 30, cobertura: 0, acabamento: 10 }} zoom={1.1} />
        </div>
      </Grupo>

      <Grupo titulo="Botões" nota="componentes/botao.tsx · hover simulado com a cor que o :hover aplica">
        <div className="grid gap-3">
          {VARIANTES.map((v) => (
            <div key={v} className="flex flex-wrap items-center gap-2">
              <span className="w-24 text-caption font-semibold text-ink-3">{v}</span>
              <Botao variante={v}>Padrão</Botao>
              <span className={`${classesBotao(v)} ${HOVER[v]}`}>Hover</span>
              <span className={`${classesBotao(v)} ${FOCO}`}>Foco</span>
              <Botao variante={v} disabled>
                Desabilitado
              </Botao>
              <Botao variante={v} carregando>
                Carregando
              </Botao>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-24 text-caption font-semibold text-ink-3">tamanhos</span>
            <Botao tamanho="sm">Pequeno</Botao>
            <Botao>Médio</Botao>
            <Botao tamanho="lg">Grande</Botao>
            <Botao variante="secundario" icone aria-label="Mais">
              +
            </Botao>
            <Spinner />
          </div>
        </div>
      </Grupo>

      <Grupo titulo="Campos" nota="componentes/campo.tsx">
        <div className="grid gap-3.5 sm:grid-cols-2">
          <Campo rotulo="Padrão" ajuda="Texto de ajuda abaixo do campo.">
            <Entrada placeholder="Ex.: Cimento CP-II 50 kg" />
          </Campo>
          <Campo rotulo="Preenchido">
            <Entrada defaultValue="Concreto fck 30" />
          </Campo>
          <Campo rotulo="Foco">
            <Entrada defaultValue="Borda escura e anel" className="border-ink shadow-[0_0_0_3px_var(--surface-3)]" />
          </Campo>
          <Campo rotulo="Erro" erro="Informe um valor maior que zero.">
            <Entrada invalido defaultValue="0" />
          </Campo>
          <Campo rotulo="Desabilitado">
            <Entrada disabled defaultValue="Bloqueado" />
          </Campo>
          <Campo rotulo="Valor em R$">
            <EntradaDinheiro defaultValue={1842.3} />
          </Campo>
          <Campo rotulo="Seleção">
            <Selecao defaultValue="b">
              <option value="a">Fundação</option>
              <option value="b">Estrutura</option>
            </Selecao>
          </Campo>
          <Campo rotulo="Texto longo">
            <AreaTexto rows={2} defaultValue="Motivo da compra" />
          </Campo>
        </div>
      </Grupo>

      <Grupo titulo="Marcação e interruptor" nota="componentes/marcacao.tsx">
        <div className="flex flex-wrap gap-5">
          <Marcacao rotulo="Desmarcada" />
          <Marcacao rotulo="Selecionada" defaultChecked />
          <Marcacao rotulo="Parcial" parcial />
          <Marcacao rotulo="Desabilitada" disabled />
          <Marcacao rotulo="Desabilitada marcada" disabled defaultChecked />
        </div>
        <div className="flex flex-col gap-3">
          <Interruptor rotulo="Ligado" descricao="A IA responde os fornecedores." defaultChecked />
          <Interruptor rotulo="Desligado" descricao="Uma pessoa conduz a conversa." />
          <Interruptor rotulo="Desabilitado" disabled />
        </div>
      </Grupo>

      <Grupo titulo="Etiquetas de situação" nota="componentes/etiqueta.tsx">
        <div className="flex flex-wrap gap-2">
          {(['neutro', 'aviso', 'rosa', 'ok', 'paga', 'neg', 'info'] as const).map((t) => (
            <Etiqueta key={t} tom={t}>
              {t}
            </Etiqueta>
          ))}
          <Etiqueta tom="ok" grande>
            Grande
          </Etiqueta>
        </div>
        <div className="flex flex-wrap gap-2">
          {SITUACOES.map((s) => (
            <Situacao key={s} status={s} />
          ))}
        </div>
      </Grupo>

      <Grupo titulo="Barra de etapa" nota="componentes/barra-etapa.tsx">
        <Estado nome="Não iniciada (0%)">
          <BarraEtapa feito={0} />
        </Estado>
        <Estado nome="Abaixo de 14%: percentual fora da barra">
          <BarraEtapa feito={8} gastoPct={5} />
        </Estado>
        <Estado nome="Em andamento">
          <BarraEtapa feito={46} gastoPct={40} />
        </Estado>
        <Estado nome="Alerta: gasto à frente do feito">
          <BarraEtapa feito={48} gastoPct={72} excedente={86400} />
        </Estado>
        <Estado nome="Concluída">
          <BarraEtapa feito={100} gastoPct={98} />
        </Estado>
        <Estado nome="Fina (subetapa)">
          <BarraEtapa feito={62} tamanho="fina" />
        </Estado>
        <Estado nome="Carregando">
          <BarraCarregando />
        </Estado>
      </Grupo>

      <Grupo titulo="Tabela financeira" nota="componentes/tabela.tsx · linha com hover, selecionada e total">
        <Tabela minimo={420}>
          <thead>
            <tr>
              <Th>Item</Th>
              <Th num>Previsto</Th>
              <Th num>Saldo</Th>
            </tr>
          </thead>
          <tbody>
            <Tr>
              <Td>Aço CA-50</Td>
              <Td num>
                <Dinheiro valor={480000} />
              </Td>
              <Td num forte>
                <Dinheiro valor={67100} />
              </Td>
            </Tr>
            <Tr selecionada>
              <Td>Concreto fck 30 (selecionada)</Td>
              <Td num>
                <Dinheiro valor={320000} />
              </Td>
              <Td num forte>
                <Dinheiro valor={-12400} />
              </Td>
            </Tr>
            <Tr>
              <Td>Entrada prevista</Td>
              <Td num>—</Td>
              <Td num forte>
                <Dinheiro valor={57500} sinal />
              </Td>
            </Tr>
          </tbody>
          <tfoot>
            <tr aria-hidden className="h-2" />
            <LinhaTotal>
              <td className="px-2">Total</td>
              <td className="px-2 text-right">
                <Dinheiro valor={800000} />
              </td>
              <td className="px-2 text-right">
                <Dinheiro valor={112200} />
              </td>
            </LinhaTotal>
          </tfoot>
        </Tabela>
      </Grupo>

      <Grupo titulo="Vazio e carregando" nota="componentes/estado-vazio.tsx">
        <EstadoVazio titulo="Nenhuma compra encontrada" acao={<Botao variante="secundario">Limpar filtros</Botao>}>
          Nenhum resultado para os filtros atuais.
        </EstadoVazio>
        <EstadoVazio titulo="Compacto" compacto />
        <Esqueleto linhas={3} />
      </Grupo>

      <Grupo titulo="Cartões e indicadores" nota="componentes/cartao.tsx">
        <div className="grid gap-3 sm:grid-cols-2">
          <Kpi tom="escuro" rotulo="Saldo em caixa" valor={<Dinheiro valor={1842300.15} />} detalhe="+R$ 288 mil no mês" corDetalhe="acento" />
          <Kpi rotulo="A pagar" valor={<Dinheiro valor={318940} />} detalhe="6 compras" pequeno />
          <Kpi tom="aviso" rotulo="Aguardando liberação" valor="3" pequeno />
          <Kpi tom="rosa" rotulo="Aguardando chefe" valor={<Dinheiro valor={186200} />} pequeno />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Cartao tom="suave" as="div" className="text-table">
            Suave
          </Cartao>
          <Cartao tom="noite" as="div" className="text-table">
            Noite
          </Cartao>
          <Cartao tom="escuro" as="div" className="text-table">
            Escuro
          </Cartao>
        </div>
      </Grupo>

      <Grupo titulo="Passos" nota="componentes/passos.tsx · feito, atual, pendente e erro">
        <Passos
          itens={[
            { titulo: 'Registrada', detalhe: '20/10', estado: 'feito' },
            { titulo: 'Financeiro', detalhe: 'liberando', estado: 'atual' },
            { titulo: 'Pagamento', estado: 'pendente' },
          ]}
        />
        <Passos
          tomAtual="rosa"
          itens={[
            { titulo: 'Registrada', estado: 'feito' },
            { titulo: 'Chefe', detalhe: 'aprovando', estado: 'atual' },
            { titulo: 'Recusada', estado: 'erro' },
          ]}
        />
      </Grupo>

      <Grupo titulo="Linha do tempo" nota="componentes/linha-do-tempo.tsx">
        <LinhaDoTempo
          eventos={[
            { chave: 1, titulo: 'Compra registrada', autor: 'Obra', quando: '20/10/2026 às 09:12', tom: 'neutro' },
            { chave: 2, titulo: 'Liberada pelo financeiro', autor: 'Financeiro', quando: '20/10/2026 às 14:40', tom: 'ok' },
            { chave: 3, titulo: 'Recusada', autor: 'Chefe', nota: 'Cotar com mais dois fornecedores', quando: '21/10/2026 às 08:05', tom: 'neg' },
          ]}
        />
      </Grupo>

      <Grupo titulo="Conversa" nota="componentes/balao.tsx · fornecedor, IA, pessoa e sistema">
        <div className="rounded-lg bg-surface-2 p-4">
          <ListaConversa>
            <Balao autor="sistema">Pedido de cotação enviado</Balao>
            <Balao autor="fornecedor" nome="Gerdau" hora="10:21">
              Aço CA-50 a 9,20 o kg, frete 200, entrego em 2 dias.
            </Balao>
            <Balao autor="ia" hora="10:22">
              Obrigado! Registrei a proposta.
            </Balao>
            <Balao autor="pessoa" nome="Equipe" hora="10:30" lido>
              Pode confirmar o prazo de pagamento?
            </Balao>
          </ListaConversa>
        </div>
      </Grupo>

      <Grupo titulo="Anexos" nota="componentes/anexo.tsx · arraste ou escolha; erro de formato e tamanho">
        <form className="grid gap-3 sm:grid-cols-2">
          <CampoAnexo name={`anexo-${sufixo}`} titulo="Nota fiscal" />
          <CampoAnexo name={`anexo2-${sufixo}`} titulo="Comprovante" obrigatorio />
        </form>
        <div className="grid gap-2.5 sm:grid-cols-2">
          <CartaoDocumento tipo="Pedido" nome="pedido-0418.pdf" detalhe="148 KB · 20/10/2026" href="#" />
          <CartaoDocumento tipo="Boleto" nome="boleto-1de3.pdf" detalhe="92 KB · 21/10/2026" href="#" />
        </div>
      </Grupo>

      <Grupo titulo="Filtros" nota="componentes/filtros.tsx">
        <div className="flex flex-wrap items-center gap-2">
          <SeletorPilula aria-label="Obra (padrão)" defaultValue="">
            <option value="">Todas as obras</option>
          </SeletorPilula>
          <SeletorPilula aria-label="Obra (ativo)" ativo defaultValue="1">
            <option value="1">Residencial Vila Aurora</option>
          </SeletorPilula>
        </div>
        <Segmentado
          opcoes={[
            { href: '#s1', rotulo: 'Este mês', ativo: true },
            { href: '#s2', rotulo: '30 dias', ativo: false },
            { href: '#s3', rotulo: '90 dias', ativo: false },
          ]}
        />
        <div className="flex flex-wrap gap-1.5">
          <ChipOpcao href="#c1" ativo quantidade={4}>
            Selecionado
          </ChipOpcao>
          <ChipOpcao href="#c2" ativo={false} quantidade={12}>
            Padrão
          </ChipOpcao>
          <ChipFiltro href="#c3">Obra: Vila Aurora</ChipFiltro>
        </div>
      </Grupo>

      <Grupo titulo="Mensagens e janela" nota="componentes/mensagem.tsx, modal.tsx">
        <Mensagem tom="ok" titulo="Compra registrada">
          Ela foi para o financeiro liberar.
        </Mensagem>
        <Mensagem tom="erro" titulo="Corrija antes de enviar" itens={['Informe o fornecedor.', 'As parcelas não somam o total.']} />
        <div className="flex flex-wrap gap-2">
          <DemoToast />
          <Modal gatilho="Abrir janela" variante="secundario" titulo="Liberar a compra" texto="R$ 186.200,00 para Gerdau. As parcelas entram no fluxo de caixa.">
            <Botao variante="primario">Liberar compra</Botao>
          </Modal>
        </div>
      </Grupo>
    </div>
  )
}
