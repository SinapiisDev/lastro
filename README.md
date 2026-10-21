# Gestão de Obras

Obras com etapas e subetapas, orçamento da obra (itens, margem/BDI, envio ao investidor, aprovação e revisões), cotação com fornecedores (a IA pede os preços pelo WhatsApp, lê as respostas e indica a opção mais viável), compras com vários itens ligadas ao orçamento e aprovação por faixa de valor, financeiro (fluxo de caixa, pagamentos, anexos), relatórios e histórico.

## Acessos

- **Obra**: escolhe a obra e digita a senha dela (é o acesso do engenheiro). Vê só a própria obra.
- **Financeiro** e **Chefe**: uma senha cada, veem todas as obras. Só o chefe vê Configurações.
- No primeiro acesso, o sistema pede as senhas do chefe e do financeiro.

## Cotação e conversa com fornecedores

1. O engenheiro abre uma cotação com itens do orçamento (e, se precisar, itens fora dele) e marca os fornecedores.
2. "Pedir cotação" manda a mensagem pelo WhatsApp de cada fornecedor.
3. A IA lê as respostas (texto, foto ou PDF), pergunta o que falta e preenche a tabela. Áudio ela não ouve: pede por escrito.
4. "Analisar com a IA" indica a opção mais viável (preço, frete, prazo de pagamento, entrega), com explicação.
5. O engenheiro escolhe; vira uma compra por fornecedor, que segue a aprovação por teto. O pedido só vai ao fornecedor depois de aprovado.

A IA nunca fecha compra nem negocia. Qualquer pessoa pode assumir uma conversa (a IA pausa), e resposta que chegou por fora pode ser colada na cotação. Sem a chave da IA, os preços são preenchidos à mão; sem o WhatsApp configurado, o sistema funciona em **modo simulado** (as mensagens ficam só no sistema, e em Conversas dá para simular a resposta do fornecedor).

## Rodar no computador

Precisa de Node 20+ e do **Docker Desktop aberto** (o banco local roda dentro dele; depois de reiniciar o computador, abra o Docker antes).

```bash
npm install
cp .env.example .env.local # preencha SUPABASE_SERVICE_ROLE_KEY (Secret key do `npx supabase status`) e SESSION_SECRET
npm run dev                # liga o Supabase local (aplica supabase/migrations) e depois o site
```

Testes das regras (faixas, parcelas, fluxo de caixa, fracionamento, frete, propostas, checagem do que a IA devolve): `npm test`.

## Colocar no ar

1. Crie o projeto no Supabase na região São Paulo (plano Pro para ter backup diário).
2. Aplique o banco: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. Na Vercel, importe o repositório e defina as variáveis (todas estão explicadas em `.env.example`):
   - `DATABASE_URL`: string de conexão do pooler em modo **Transaction** (porta 6543).
   - `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API Keys).
   - `SESSION_SECRET` e `CRON_SECRET`: textos aleatórios de 32+ caracteres.
   - `ANTHROPIC_API_KEY`: chave criada em console.anthropic.com → API Keys (cobra por uso; centavos por mensagem lida).
4. Abra o site e defina as senhas do chefe e do financeiro na hora. Até isso ser feito, qualquer um que abrir o endereço consegue definir essas senhas.

### WhatsApp oficial (Meta)

1. Em developers.facebook.com, crie um app do tipo Business com o produto WhatsApp e vincule a conta Meta Business verificada.
2. Cadastre o número da empresa e gere um token permanente (usuário do sistema). Preencha `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` (ID do número) e `WHATSAPP_APP_SECRET` (Configurações do app → Básico).
3. Em WhatsApp → Configuração, cadastre o webhook `https://SEU-SITE/api/whatsapp`, com o mesmo texto de `WHATSAPP_VERIFY_TOKEN`, e assine o campo **messages**.
4. Crie e aprove estes 3 modelos de mensagem (categoria Utilidade, idioma Português (BR)), com os nomes e textos exatos:

| Nome | Texto |
|---|---|
| `pedido_cotacao` | Olá, {{1}}! Aqui é da {{2}}. Gostaríamos de uma cotação para a obra {{3}}: {{4}}. Por favor, informe o preço de cada item, o frete, o prazo de entrega e a condição de pagamento a prazo. Responder até {{5}}. Cotação nº {{6}}. |
| `lembrete_cotacao` | Olá, {{1}}! Ainda aguardamos os preços da cotação nº {{2}} (obra {{3}}). Consegue responder até {{4}}? |
| `pedido_compra` | Olá, {{1}}! Pedido confirmado pela {{2}} (cotação nº {{3}}): {{4}}. Total {{5}}. Entrega na obra {{6}}. Obrigado! |

O WhatsApp só deixa mandar mensagem livre até 24 horas depois da última mensagem do fornecedor; fora disso, só esses modelos. O lembrete de quem não respondeu roda uma vez por dia (`vercel.json`). Cadastre o WhatsApp de cada fornecedor em Configurações (ou na própria cotação).

## Como está montado

- `supabase/migrations`: tabelas, histórico automático (gatilho que grava toda alteração com o perfil que fez) e travas contra apagar registros.
- `src/lib/regras.ts` e `src/lib/cotacao.ts`: regras de negócio puras, com testes ao lado.
- `src/lib/ia.ts`: as duas tarefas da IA (ler mensagens e comparar propostas), com resposta em formato validado; `src/lib/conversa.ts` liga IA, WhatsApp e cotação.
- `src/app/(app)`: os painéis. Toda leitura e escrita acontece no servidor; o navegador nunca fala com o banco.
- Interface: o contrato visual está em `DESIGN.md`; os componentes, em `design-system/` (mapa em `design-system/README.md`), com tema claro e escuro. A vitrine de componentes fica em `/design-system` (perfil Chefe).
- `src/app/api/whatsapp`: webhook da Meta (só aceita chamada assinada); `src/app/api/cron/lembretes`: lembrete diário.
- Anexos ficam num bucket privado; o link de download vale 60 segundos e só sai para quem tem acesso à obra.
