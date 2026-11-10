# Lastro

Obras com etapas e subetapas, orçamento da obra (itens, margem/BDI, envio ao investidor, aprovação e revisões), cotação com fornecedores (a IA pede os preços pelo WhatsApp, lê as respostas e indica a opção mais viável), compras com vários itens ligadas ao orçamento e aprovação por faixa de valor, financeiro (fluxo de caixa, pagamentos, anexos), relatórios e histórico.

## Acessos

Sistema para várias construtoras: cada uma tem os seus dados, e nenhuma enxerga nada da outra.

Cada pessoa entra com o próprio e-mail e senha. O aparelho fica conectado por 30 dias (ou até clicar em Sair).

- **Construtora nova**: na tela de entrada, "Criar minha construtora" (nome da construtora, seu nome, e-mail e senha). A construtora já nasce com você como dono.
- **Equipe**: o dono cadastra nome, e-mail e área (financeiro ou engenheiro, com as obras) em Configurações › Pessoas. Sai um **link de acesso** que ele copia ou manda pelo WhatsApp. No link, a pessoa digita o e-mail, cria a senha e cai direto no painel da área dela. O link vale 7 dias e uma vez só; para senha esquecida, o dono gera um link novo.
- **Mesma pessoa em mais de uma construtora** (ex.: engenheiro terceirizado): o mesmo e-mail pode estar em várias, com a mesma senha; ao entrar, escolhe em qual. Quem já tem senha e é chamado por outra construtora confirma a senha que já usa no link (o dono de uma construtora não consegue trocar a senha de alguém que também está em outra).

- **Dono**: vê tudo, aprova as compras acima do teto médio e é o único que mexe em Configurações (empresa, tetos, obras, fornecedores e **Pessoas**).
- **Financeiro**: vê todas as obras, libera as compras da faixa média e registra pagamentos.
- **Engenheiro**: vê só as obras marcadas para ele; se tiver mais de uma, escolhe ao entrar.
- **Administração do sistema** (quem vende): os e-mails em `PLATAFORMA_ADMINS` veem no menu do avatar a lista de todas as construtoras, podem bloquear ou liberar cada uma e gerar um link de acesso para o dono que esqueceu a senha. Bloquear tira todo mundo dela na hora; os dados ficam guardados.
- **Proteções**: senha com hash (bcrypt) no banco e, do link, só o hash; 5 senhas erradas seguidas bloqueiam a conta por 15 minutos; no máximo 20 senhas erradas ou construtoras novas por hora por endereço de internet (o cadastro é aberto); desativar a pessoa, trocar a senha ou bloquear a construtora derruba as sessões abertas; em Minha conta dá para trocar a senha e sair de todos os aparelhos. O histórico grava o nome de quem fez cada coisa, inclusive quando um link de acesso foi gerado e usado.
- O e-mail não é confirmado por mensagem: quem cria uma construtora com o e-mail de outra pessoa só ocupa o endereço (não vê dados de ninguém).
- **Separação entre construtoras**: além de cada tela filtrar pela construtora, o próprio banco trava as linhas (RLS do Postgres): as telas usam o papel `app_web`, e cada consulta roda numa transação marcada com a construtora de quem está logado (`src/lib/db.ts`). Só a entrada, o webhook do WhatsApp, os lembretes e a administração usam a conexão sem trava (`sqlSistema`), e marcam a construtora explicitamente.
- Na primeira entrada cada pessoa vê um passo a passo do próprio perfil; dá para rever em Minha conta.

## Cotação e conversa com fornecedores

1. O engenheiro abre uma cotação com itens do orçamento (e, se precisar, itens fora dele) e marca os fornecedores.
2. "Pedir cotação" manda a mensagem pelo WhatsApp de cada fornecedor.
3. A IA lê as respostas (texto, foto ou PDF), pergunta o que falta e preenche a tabela. Áudio ela não ouve: pede por escrito.
4. "Analisar com a IA" indica a opção mais viável (preço, frete, prazo de pagamento, entrega), com explicação.
5. O engenheiro escolhe; vira uma compra por fornecedor, que segue a aprovação por teto. O pedido só vai ao fornecedor depois de aprovado.

A IA nunca fecha compra nem negocia. Qualquer pessoa pode assumir uma conversa (a IA pausa), e resposta que chegou por fora pode ser colada na cotação. Sem a chave da IA, os preços são preenchidos à mão.

**Sem o número oficial do WhatsApp** (variáveis `WHATSAPP_*` vazias), tudo funciona pelo WhatsApp de quem usa o sistema: o pedido de cotação, as perguntas da IA e o pedido de compra ficam prontos na conversa, com o botão **"Mandar pelo meu WhatsApp"** (abre o WhatsApp com o texto escrito); a resposta do fornecedor é colada na cotação (ou em Conversas) e a IA lê. Nesse modo não há lembrete automático. Quando o número oficial for configurado, as mensagens passam a sair e chegar sozinhas, sem mudar nada no que já foi feito.

## Importar contas a pagar do sistema antigo

Em Financeiro › Contas a pagar › **Importar planilha**, o financeiro ou o dono envia o relatório "Documentos a pagar" exportado em .xlsx.

- Cada linha é uma parcela, e o documento é o mesmo "Doc." + obra + fornecedor. Entra como documento do financeiro, já aprovado. As parcelas liquidadas entram pagas, com a data do pagamento, e as outras ficam em aberto.
- O valor é o **líquido**, depois de descontos e retenções. Parcela quitada com líquido zero fica de fora, e a tela mostra a linha.
- A parcela "2.1/3" é o restante de um pagamento parcial e fica ligada à 2ª.
- Antes de gravar, a tela mostra o resumo e você escolhe a obra do sistema para cada obra da planilha. O sistema sugere a de mesmo nome, ou cadastra uma obra nova com as etapas padrão.
- Os documentos ficam no serviço "Sistema anterior › Documentos importados" de cada obra. Fornecedor com o mesmo nome aproveita o cadastro, e os novos são cadastrados.
- Mandar a mesma planilha (ou uma mais nova) de novo não duplica: só os documentos novos entram (`compras.importacao_chave`).
- Numa planilha mais nova, o que foi pago no sistema antigo depois da última importação é baixado aqui: o par da parcela é o vencimento e o valor (pago com juros fica com o valor pago; pago em parte vira parcela paga + o resto, igual ao pagamento parcial do sistema). Parcela já paga aqui não muda.
- Uma obra da planilha pode ficar de fora ("Não importar"), por exemplo as despesas do escritório de outra empresa; dá para importar depois com a mesma planilha.

**Anexos** (Importar planilha › Importar anexos): escolha a pasta baixada do sistema antigo, com uma subpasta por documento com o número dele (ex.: `001840/nota.pdf`). Cada arquivo é anexado ao documento importado de mesmo número, com o tipo pelo nome (XML e "NF" = nota fiscal, "boleto", "comprovante"…). O navegador sobe direto para o armazenamento (R2 ou Storage), com um endereço autorizado pelo servidor para cada arquivo (sem o limite de 4 MB das telas); enviar a pasta de novo pula o que já subiu.

## Contas bancárias e conciliação

Sem ligar o sistema ao banco: as contas são cadastradas à mão e conferidas pelo arquivo do extrato.

- **Contas**: o dono cadastra em Configurações › Contas bancárias, com o saldo no fim de um dia. O saldo da conta é esse saldo, mais o que entrou e saiu nela depois daquele dia. Com conta cadastrada, o "Saldo em caixa" do painel passa a ser a soma das contas.
- **Pagar e receber**: ao registrar um pagamento ou recebimento, escolhe-se a conta (com uma conta só, ela vai sozinha). Na compra, a parcela também pode ser **agendada** para um dia e uma conta: entra no fluxo de caixa nessa data.
- **Conciliação** (Financeiro › Conciliação): o financeiro envia o extrato em **OFX** (no internet banking, às vezes como Money ou Quicken). O mesmo lançamento não entra duas vezes. O sistema compara cada linha com as parcelas e entradas em aberto (mesmo valor, data próxima, e o nome do favorecido quando o banco mostra) e separa em:
  - **Bateu**: um par só. Ela confere e confirma todos de uma vez; a parcela vira paga na data do extrato, nessa conta. Parcela que já estava paga à mão (até 3 dias de diferença) só é ligada à linha.
  - **Escolha o par**: mais de uma parcela com o mesmo valor, ou o nome do extrato não bate com o fornecedor.
  - **Sem par**: lança o documento que falta e o par aparece; tarifa e juros entram no saldo como avulso; o resto pode ser ignorado.
- O extrato traz o saldo do banco: a tela mostra a diferença entre o saldo do sistema e o do banco naquele dia. Toda conferência pode ser desfeita, e fica no histórico com o nome de quem fez.

## Rodar no computador

Precisa de Node 20+ e do **Docker Desktop aberto** (o banco local roda dentro dele; depois de reiniciar o computador, abra o Docker antes).

Crie o arquivo `.env.local` (fica só no seu computador, nunca vai para o Git) com as variáveis da tabela abaixo. No computador bastam `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Secret key do `npx supabase status`) e `SESSION_SECRET`.

```bash
npm install
npm run dev # liga o Supabase local (aplica supabase/migrations) e depois o site
```

### Variáveis de ambiente

| Variável | Para que serve |
|---|---|
| `DATABASE_URL` | Conexão do Postgres do Supabase. No computador: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`. Em produção, a do pooler em modo **Transaction** (porta 6543). |
| `SUPABASE_URL` | Endereço do projeto Supabase (no computador: `http://127.0.0.1:54321`). |
| `SUPABASE_SERVICE_ROLE_KEY` | Chave secreta do Supabase (service role / `sb_secret_...`). Só no servidor, nunca no navegador. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` | Cloudflare R2, onde ficam os arquivos (anexos, fotos, diário): 10 GB grátis. Sem eles, os arquivos vão para o Storage do Supabase (1 GB no plano gratuito). Veja "Arquivos no Cloudflare R2". |
| `SESSION_SECRET` | Assina o cookie de entrada. Texto aleatório de 32+ caracteres. |
| `PLATAFORMA_ADMINS` | E-mails de quem administra o sistema (vende), separados por vírgula. Eles veem a Administração do sistema. |
| `CRON_SECRET` | Senha da rotina diária de lembretes (a Vercel envia sozinha). Texto aleatório de 32+ caracteres. |
| `OPENAI_API_KEY` | IA que lê as respostas dos fornecedores e compara propostas (platform.openai.com → API keys; cobra por uso, então ponha um limite de gasto lá). Sem ela, os preços são preenchidos à mão. |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | WhatsApp Cloud API (Meta). Sem eles, as mensagens saem pelo WhatsApp de quem usa o sistema (botão "Mandar pelo meu WhatsApp"). |
| `WHATSAPP_APP_SECRET` | Segredo do app na Meta: confere a assinatura de cada mensagem que chega. |
| `WHATSAPP_VERIFY_TOKEN` | Texto que você inventa e repete na Meta ao cadastrar o webhook. |

Para gerar textos aleatórios: `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

Testes das regras (faixas, parcelas, fluxo de caixa, fracionamento, frete, propostas, checagem do que a IA devolve): `npm test`.

## Colocar no ar

1. Crie o projeto no Supabase na região São Paulo. No plano gratuito, use o R2 para os arquivos e o backup pelo GitHub (abaixo).
2. Aplique o banco: `npx supabase login`, `npx supabase link --project-ref <ref>`, `npx supabase db push`.
3. Na Vercel, importe o repositório e defina as variáveis da tabela acima. `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` ficam em Project Settings → API Keys do Supabase.
4. Configure o WhatsApp oficial (abaixo): é por ele que saem as cotações e os pedidos.
5. Abra o site e clique em "Criar minha construtora". Ponha o seu e-mail em `PLATAFORMA_ADMINS` para ver a Administração do sistema.

### Arquivos no Cloudflare R2

1. No painel da Cloudflare, R2 Object Storage: ative o R2 (plano gratuito) e crie o bucket `lastro-anexos`.
2. No bucket, Settings › CORS Policy, libere o envio pelo navegador:
   ```json
   [{ "AllowedOrigins": ["https://lastro-tawny.vercel.app"], "AllowedMethods": ["GET", "PUT"], "AllowedHeaders": ["*"], "MaxAgeSeconds": 3600 }]
   ```
3. R2 › Manage API tokens › Create API token: permissão **Object Read & Write**, só no bucket `lastro-anexos`.
4. Na Vercel, as 4 variáveis `R2_*` (tabela acima) e publique de novo (a CSP do site é montada no build com o endereço do R2).

O bucket fica fechado: o servidor assina um link por arquivo, que vale 60 s para abrir e 2 h para enviar (`src/lib/s3-assinado.ts`).

### Backup do banco

A rotina `.github/workflows/backup.yml` copia o banco todo dia às 3h e guarda no R2: `backup/diario/dia-DD.dump` (os últimos ~30 dias) e `backup/mensal/AAAA-MM.dump` (a do dia 1, para sempre). Para ligar, no GitHub (Settings › Secrets and variables › Actions) crie:

| Segredo | Valor |
|---|---|
| `BACKUP_DATABASE_URL` | Supabase › Connect › **Session pooler** (porta 5432), com a senha do banco no lugar de `[YOUR-PASSWORD]`. |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY` | Os mesmos da Vercel. |

Teste na aba Actions › Backup do banco › Run workflow. Para restaurar (num projeto novo ou no mesmo, que é apagado e refeito): baixe o `.dump` do R2 e rode
`pg_restore --no-owner --clean --if-exists -d "<Session pooler>" lastro.dump` (Postgres 17).

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
- Interface: o contrato visual está em `DESIGN.md`; os componentes, em `design-system/` (mapa em `design-system/README.md`), com tema claro e escuro.
- `src/app/api/whatsapp`: webhook da Meta (só aceita chamada assinada); `src/app/api/cron/lembretes`: lembrete diário.
- Anexos ficam num bucket privado; o link de download vale 60 segundos e só sai para quem tem acesso à obra.
