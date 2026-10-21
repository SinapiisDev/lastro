# Sistema de Engenharia — Parte 1: Base + Financeiro

Data: 2026-10-20

## Intenção

Construtora com várias obras ao mesmo tempo. O objetivo é organizar quem faz o quê em cada obra, para que as compras não fiquem bagunçadas: toda compra pertence a uma obra e a uma etapa, passa pela aprovação certa conforme o valor, e o financeiro só libera depois de ver o fluxo de caixa. Tudo fica registrado, com notas, boletos e comprovantes anexados, e o chefe acompanha por relatórios.

O sistema completo tem três frentes, construídas em partes:

1. **Parte 1 (este documento):** base (obras, etapas, acessos), compras cadastradas à mão, aprovações, financeiro, relatórios.
2. **Parte 2 (depois):** orçamento — o engenheiro lança cotações de vários fornecedores para os mesmos itens e uma IA indica a compra mais viável.
3. **Parte 3 (depois):** compras pelo WhatsApp — o engenheiro manda tudo pelo WhatsApp na obra e uma IA joga no sistema, separado por tópicos (fornecedor etc.).

As partes 2 e 3 vão alimentar o mesmo cadastro de compras da parte 1. Por isso a compra da parte 1 precisa ser o registro central, e não algo provisório.

## Objetivos

- Cada obra com suas etapas e subetapas, mostrando o avanço do serviço e quanto já foi gasto do previsto.
- Compras sempre ligadas a obra e subetapa, roteadas para aprovação por faixa de valor.
- Financeiro com fluxo de caixa da empresa (filtrável por obra) para decidir liberações.
- Registro de pagamento por parcela, com anexos.
- Histórico completo: nada some.
- 4 painéis: **Financeiro, Orçamento, Compras, Relatórios**.

## Fora do escopo (parte 1)

- Orçamento com IA (parte 2). O painel Orçamento aparece no menu como "em breve".
- WhatsApp (parte 3).
- Login individual por pessoa (decisão do usuário: fica para depois).
- Integração bancária, emissão de boleto, leitura automática de nota fiscal.

## Anti-objetivos (seria fracasso mesmo funcionando)

- Compra sem obra ou sem subetapa.
- Compra acima do teto baixo ser efetivada sem a aprovação certa.
- Perder histórico ou anexo (apagar de verdade qualquer coisa).

## Acessos

Decisão do usuário, explicitamente provisória ("depois penso numa maneira melhor"):

- **Acesso da obra:** na tela de entrada, a pessoa escolhe a obra numa lista e digita a senha daquela obra. É o acesso do engenheiro. Vê só aquela obra (painel Compras e a tela da obra com as etapas).
- **Acesso Financeiro:** uma senha. Vê todas as obras e os painéis Financeiro, Compras e Relatórios.
- **Acesso Chefe (administrador):** uma senha. Vê tudo, tem a fila de aprovação de valor alto e as configurações.
- Financeiro e chefe trocam de obra por uma lista e também têm visão "todas as obras".
- Como os acessos são compartilhados, o histórico registra o **perfil** que agiu (ex.: "Obra Residencial Vila Nova", "Financeiro", "Chefe"), não a pessoa.
- Mesmo provisório: senhas guardadas só como hash, sessão em cookie httpOnly. O chefe pode trocar as senhas.

## Obras e etapas

- **Obra:** nome, endereço, situação (ativa / encerrada), senha de acesso. Cadastrada pelo chefe ou pelo financeiro.
- Ao criar uma obra, ela recebe uma **lista padrão** de etapas e subetapas (Fundação, Estrutura, Alvenaria, Instalações, Acabamento, cada uma com subetapas típicas). Na obra, dá para acrescentar, renomear, reordenar e remover etapas e subetapas. Remover só é permitido se não houver compra ligada.
- **Etapa:** nome, ordem, **valor previsto** (preenchido pelo financeiro ou chefe). O previsto da obra é a soma das etapas.
- **Subetapa:** nome, ordem, **% de serviço feito** (0 a 100), atualizado pelo engenheiro.
- **% da etapa** = média simples das subetapas.
- **Gasto da etapa** = soma das compras aprovadas (e pagas) ligadas às suas subetapas. Compras recusadas, canceladas ou aguardando aprovação não contam.

### Como aparece (escolhido pelo usuário: opção A)

Lista que abre e fecha. Cada etapa é uma linha com:

- nome e seta para abrir/fechar as subetapas;
- barra de progresso com o **% escrito na barra** (pedido do usuário);
- etiqueta de situação: não iniciada (0%), em andamento, concluída (100%);
- à direita, "R$ gasto / R$ previsto".

As subetapas aparecem recuadas, cada uma com sua barra, seu % e o gasto dela. A barra fica **laranja** quando o % gasto do previsto é maior que o % de serviço feito (ex.: 85% do dinheiro com 60% da etapa pronta). Tem que funcionar bem no celular, porque o engenheiro usa na obra. O modelo visual de referência está em `.superpowers/brainstorm/1410-1792524167/content/etapas.html` (opção A).

> Atualização (redesign): o visual de todas as telas agora segue o `DESIGN.md` da raiz e a biblioteca em `design-system/`. O alerta de gasto acima do feito virou trecho hachurado em vermelho com marcador do gasto (componente `BarraEtapa`), no lugar da barra laranja.

## Compras

Na parte 1, o engenheiro cadastra a compra num formulário simples (pelo acesso da obra).

**Campos:** fornecedor, descrição do que está sendo comprado (texto livre), subetapa (obrigatória), valor total, parcelas, justificativa, anexos opcionais (orçamento, pedido).

- **Sempre a prazo, nunca à vista.** A compra tem 1 ou mais parcelas, cada uma com valor e vencimento. A soma das parcelas tem que bater com o valor total. O formulário pode sugerir a divisão em parcelas iguais a cada 30 dias, mas tudo é editável.
- **Fornecedores:** cadastro simples e compartilhado entre obras (nome, CNPJ, telefone). Dá para cadastrar um fornecedor novo direto do formulário da compra.

### Aprovação por faixa de valor (pelo valor total)

| Faixa | O que acontece |
|---|---|
| Até o **teto baixo** | Aprovada na hora. O engenheiro compra direto. |
| Acima do teto baixo até o **teto médio** | Vai para o **financeiro**, que olha o fluxo de caixa, analisa e libera ou recusa. O chefe não entra. |
| Acima do teto médio | Vai **direto para o chefe**, que vê o motivo da compra. Justificativa obrigatória nessa faixa. |

- Os dois tetos ficam numa tela de configuração, editável pelo chefe. Exemplo dado pelo usuário: R$ 7.000 cai na faixa média. Os valores iniciais serão definidos pelo usuário na configuração.
- **Situações da compra:** aguardando financeiro, aguardando chefe, aprovada, recusada, paga (todas as parcelas pagas), cancelada.
- **Recusa:** sempre com motivo. A compra volta ao engenheiro, que pode corrigir e reenviar. O reenvio passa de novo pela regra de faixas.
- Depois de aprovada, a compra não é editada. Se algo mudou, ela é cancelada (com motivo) e outra é cadastrada.

## Painel Financeiro

**Fila de liberação:** compras aguardando o financeiro. Ao abrir uma, o financeiro vê os dados da compra e, ao lado, o fluxo de caixa dos meses em que caem as parcelas, mostrando o caixa **com e sem** essa compra. Então libera ou recusa (com motivo).

**Fluxo de caixa:**

- Da empresa inteira, com filtro por obra.
- **Saídas:** parcelas das compras aprovadas, na data de vencimento.
- **Entradas:** lançadas pelo financeiro (pagamento do cliente ou medição da obra), com obra, descrição, valor, data prevista, e data em que foi recebida.
- **Saldo de caixa:** o financeiro informa o saldo atual em caixa (valor e data), e a projeção parte dele.
- Visão mês a mês: entradas, saídas, saldo do mês e saldo acumulado. Mês com saldo acumulado negativo fica destacado.

**Pagamentos:**

- Lista de parcelas a vencer e vencidas, por data.
- O financeiro dá baixa em cada parcela (data do pagamento) e anexa o boleto e o comprovante.
- A nota fiscal é anexada na compra.
- Quando todas as parcelas são pagas, a compra vira "paga".

**Anexos:** PDF ou imagem, guardados no Supabase Storage. Na compra: nota fiscal, orçamento, pedido. Em cada parcela: boleto, comprovante. Tudo que foi anexado continua acessível pela compra.

## Chefe

- Tem fila própria com as compras acima do teto médio: vê a justificativa e aprova ou recusa (com motivo).
- Vê tudo o que o financeiro vê.
- Cuida das configurações: tetos, cadastro de obras, senhas.

## Painel Relatórios

Todos os relatórios têm filtro por obra e por período. Quem vê: financeiro e chefe.

1. **Gasto por obra:** previsto x gasto x pago x a pagar, total e por etapa.
2. **Fluxo de caixa 30/60/90 dias:** entradas x saídas mês a mês.
3. **Compras por fornecedor:** total comprado de cada fornecedor e em quais obras.
4. **Compras sem aprovação:** tudo o que entrou no teto baixo. Destaca possível fracionamento, ou seja, 2 ou mais compras do mesmo fornecedor, na mesma obra, num intervalo de 7 dias, cuja soma passa o teto baixo.
5. **Pendências:** parcelas vencidas não pagas e compras com parcela paga mas sem nota fiscal anexada.

O relatório de economia gerada pela IA fica para a parte 2.

## Histórico ("tudo fica salvo")

- Nada é apagado de verdade. Compras são canceladas, não excluídas. Anexos não são removidos.
- Toda ação vira um registro: qual perfil fez, o quê, quando, e o valor antes e depois quando for uma alteração. Isso vale para criar, enviar, aprovar, recusar, cancelar, dar baixa, anexar, mudar %, mudar previsto e mudar configurações.
- Cada compra mostra sua linha do tempo (criada → aprovada por X em tal data → parcela 1 paga…).
- Financeiro e chefe consultam o histórico.

## Tecnologia

- **Next.js 16 + TypeScript + Tailwind 4**, que já estão no repositório. Atenção ao `AGENTS.md`: esta versão do Next tem mudanças de API, então é preciso ler `node_modules/next/dist/docs/` antes de escrever código.
- **Supabase** (decisão do usuário): Postgres, Storage para os anexos e, se servir, Auth. Região São Paulo. Plano pago (Pro) para ter backup diário.
- **O navegador nunca fala direto com o banco.** Todo acesso a dados passa pelo servidor Next (server actions / route handlers), com a chave de serviço só no servidor. Isso faz parte da escolha de segurança aceita pelo usuário.
- Interface em português, valores em R$, datas no formato brasileiro, funcionando bem no celular.

## Decisões minhas (o usuário pode revisar)

- Hospedagem na **Vercel**.
- "Gasto" conta compras aprovadas, mesmo com parcelas ainda a pagar, e não só o que já foi pago.
- O financeiro informa o saldo atual em caixa como ponto de partida do fluxo.
- Regra de fracionamento: mesmo fornecedor, mesma obra, 7 dias, soma acima do teto baixo.
- Compra recusada pode ser corrigida e reenviada. Compra aprovada não é editada, só cancelada.
- Na parte 1, os avisos ficam só dentro do sistema (contadores nas filas), sem e-mail nem WhatsApp.
- Na parte 1 não há exportação para Excel ou PDF. A impressão do navegador serve por enquanto.
- A lista padrão de etapas é fixa (definida no código ou numa carga inicial), sem tela para editar o modelo. Cada obra edita a sua.

## Deixado para quem constrói

- Modelo de dados exato e nomes de tabelas.
- Como implementar o acesso por obra com o Supabase.
- Layout dos painéis, exceto a tela de etapas (opção A, acima).
- Estrutura de pastas, testes, limite de tamanho dos anexos.
