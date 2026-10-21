# Lastro — Design System

Sistema interno da construtora para financeiro, orçamento e compras de cada obra.
Perfis: **Obra** (engenheiro, celular no canteiro), **Financeiro** (desktop, tabelas), **Dono** (aprova compras grandes).

Referência visual: cinza claro + cartões brancos de raio grande, faixa preta profunda, acento lima, tipografia geométrica leve. Aplicada a um produto denso em números — **legibilidade de R$ vem antes de enfeite**.

---

## 1. Princípios

1. **Número primeiro.** Valores em R$ sempre com algarismos tabulares, alinhados à direita, mesma casa decimal. Nunca centralizar coluna de valor.
2. **Hierarquia em três níveis.** Valor principal (Outfit 300, grande) → rótulo (Manrope 12, cinza) → detalhe (Manrope 12, cinza claro). Um número por cartão em destaque.
3. **Cor é significado.** Lima = progresso/positivo/ação principal na faixa escura. Vermelho = negativo, erro, gasto acima do feito. Âmbar = aguardando/atenção. Azul = informação/enviado. Nada de cor decorativa.
4. **Calmo, não frio.** Superfícies brancas e raios generosos; texto quase-preto (#111) e não preto puro em blocos longos; o 3D da obra dá vida ao painel.
5. **Canteiro é celular.** Alvos ≥ 44 px, uma ação principal por tela, botões de passo (−/+) para percentual, contraste alto ao sol.

---

## 2. Tokens

Este arquivo é a fonte da verdade dos tokens. No código eles vivem em `design-system/tokens.css` (variáveis CSS) e viram classes do Tailwind em `src/app/globals.css` (`bg-surface`, `text-ink-3`, `rounded-lg`, `shadow-2`, `text-h2`, `font-display`…). Componentes usam só essas classes: **nada de cor, fonte, espaçamento ou raio escrito à mão**. O tema escuro troca as variáveis com `data-tema="escuro"` no `<html>`; a escolha fica salva no navegador (`go-tema`). Mudou um valor aqui? Mude também `design-system/tokens.css` e `design-system/referencias/tema.js`.

### Cor

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#ECECEA` | `#0B0B0B` | fundo da aplicação |
| `--surface` | `#FFFFFF` | `#161616` | cartões, tabelas |
| `--surface-2` | `#F5F5F3` | `#1F1F1F` | campos, linhas zebra, hover |
| `--surface-3` | `#EBEBE7` | `#2A2A2A` | trilho de progresso, chips |
| `--line` | `#E3E3DF` | `#2B2B2B` | divisórias, bordas |
| `--ink` | `#111111` | `#F2F2EE` | texto principal, botão primário |
| `--ink-2` | `#55554F` | `#B3B3AC` | texto secundário |
| `--ink-3` | `#86867F` | `#85857E` | rótulos, placeholders |
| `--on-ink` | `#FFFFFF` | `#111111` | texto sobre `--ink` |
| `--night` | `#101010` | `#000000` | faixa escura (fluxo, IA) |
| `--night-2` | `#1C1C1C` | `#141414` | cartões na faixa escura |
| `--accent` | `#C6DF5F` | `#C6DF5F` | lima — progresso, destaque |
| `--accent-ink` | `#4C6110` | `#C6DF5F` | texto lima legível |
| `--accent-bg` | `#EEF5D2` | `#232B10` | fundo lima suave |
| `--neg` | `#C3352D` | `#FF7A70` | valor negativo, erro |
| `--neg-bg` | `#FBEAE8` | `#3A1714` | fundo de erro |
| `--warn` | `#A8650A` | `#F1B24E` | aguardando, atenção |
| `--warn-bg` | `#FBF0DB` | `#33260E` | |
| `--ok` | `#3C7421` | `#9FD36E` | aprovada, paga |
| `--ok-bg` | `#E8F2DC` | `#1C2A13` | |
| `--info` | `#2D5DB0` | `#93B5F5` | enviado, informação |
| `--info-bg` | `#E5ECF8` | `#16223A` | |
| `--pink` | `#F4A6C6` | `#F4A6C6` | Dono / investidor (uso pontual) |
| `--pink-ink` | `#9C2F5C` | `#F4A6C6` | texto rosa legível (Aguardando dono) |
| `--pink-bg` | `#FBE6EF` | `#3A1826` | fundo rosa suave |
| `--night-3` | `#2B2B2B` | `#262626` | divisórias e trilhos na faixa escura |
| `--night-ink` | `#FFFFFF` | `#FFFFFF` | texto na faixa escura |
| `--night-ink-2` | `#CFCFCA` | `#CFCFCA` | texto secundário na faixa escura |
| `--night-ink-3` | `#9A9A94` | `#9A9A94` | rótulos na faixa escura |
| `--neg-night` | `#FF7A70` | `#FF7A70` | negativo legível na faixa escura |
| `--warn-night` | `#F1B24E` | `#F1B24E` | atenção legível na faixa escura |
| `--fixed-ink` | `#111111` | `#111111` | texto sobre lima (sempre escuro) |
| `--fixed-paper` | `#FFFFFF` | `#FFFFFF` | papel da impressão (sempre branco) |
| `--focus` | `#111111` | `#C6DF5F` | anel de foco (2 px + 2 px offset) |

`--pink-ink` e `--pink-bg` já existiam no `tema.js` exportado; os tokens `--night-*`, `--neg-night`, `--warn-night` e `--fixed-*` registram cores que as telas de referência usavam escritas à mão (faixa escura, texto sobre lima, impressão).

### Tipografia

- **Outfit** (300/400/500) — títulos e números de destaque. Peso leve só ≥ 24 px.
- **Manrope** (400/500/600/700) — interface, tabelas, formulários. `font-variant-numeric: tabular-nums` em todo valor.

| Estilo | Fonte | Tamanho/altura | Peso |
|---|---|---|---|
| display | Outfit | 44/48 | 300 |
| h1 | Outfit | 32/38 | 300 |
| h2 | Outfit | 22/28 | 400 |
| h3 | Manrope | 15/22 | 600 |
| body | Manrope | 14/21 | 500 |
| table | Manrope | 13.5/20 | 500 (valores 600) |
| label | Manrope | 12/16 | 600 |
| caption | Manrope | 11.5/16 | 500 |
| kpi | Outfit | 36/40 | 300, `tnum` |
| título de tela | Outfit | 40/1.05 | 300 |

Celular: body 15, table 14, alvos 44 px.

### Espaçamento (base 4)

`--s-1 4` · `--s-2 8` · `--s-3 12` · `--s-4 16` · `--s-5 20` · `--s-6 24` · `--s-8 32` · `--s-10 40` · `--s-14 56`

Padding de cartão: 20 (desktop) / 16 (celular). Gap entre cartões: 16. Linha de tabela: 44 px (densa 36 px).

### Raio

`--r-xs 6` (etiqueta, checkbox) · `--r-sm 10` (input pequeno, célula) · `--r-md 14` (input, botão quadrado, tooltip) · `--r-lg 22` (cartão) · `--r-xl 30` (painel/faixa) · `--r-pill 999` (botão, nav, filtro)

### Elevação

Quase plana. `--shadow-1: 0 1px 2px rgba(17,17,17,.04)` em cartões; `--shadow-2: 0 12px 32px rgba(17,17,17,.10)` em menus, modais e toasts.

---

## 3. Componentes

### Botões
Pílula, altura 40 (sm 32, celular 48). **Primário** preto (`--ink`/`--on-ink`). **Acento** lima — só na faixa escura ou para a ação final (Liberar, Aprovar). **Secundário** contorno `--line`. **Fantasma** texto. **Perigo** contorno vermelho; vira sólido só na confirmação.
Estados: hover (escurece/`--surface-2`), ativo (escala 0.98), foco (anel `--focus`), desabilitado (opacidade 0.4, sem cursor), carregando (rótulo trocado por "Salvando…" + spinner, largura preservada).

### Etiqueta de situação
Pílula 24 px, ponto + texto, fundo suave da família semântica.
- Compra: Rascunho (neutro) · Aguardando financeiro (âmbar) · Aguardando dono (rosa) · Aprovada (verde) · Paga (lima escuro) · Recusada (vermelho)
- Orçamento: Rascunho · Enviado ao investidor (azul) · Aprovado (verde)
- Cotação: Aberta (azul) · Respondida (âmbar) · Fechada (verde) · Sem resposta (neutro)

### Barra de progresso de etapa
Altura 28, raio pílula, percentual escrito **dentro** (Manrope 12/700). Preenchimento lima com texto `--ink`; trilho `--surface-3`. Se o preenchimento < 14 %, o texto vai para fora, à direita do preenchimento.
**Alerta**: quando `% gasto > % executado`, o trilho ganha marcador vertical do gasto e o trecho excedente fica vermelho hachurado; etiqueta "Gasto 72% · feito 58%".

### Tabela financeira
Cabeçalho 12/600 cinza em caixa normal (não maiúsculas). Valores à direita, tabulares. Negativo: `−R$ 1.240,00` em `--neg` (sinal de menos real, nunca hífen; nunca só cor). Linha de total: fundo `--surface-2`, 700. Linha selecionada: fundo `--accent-bg` + checkbox. Hover: `--surface-2`.

### Linha do tempo
Ponto 10 px na cor do evento, linha 1 px `--line`, data `dd/mm/aaaa hh:mm` em caption, autor em 600.

### Conversa (estilo WhatsApp)
- **Fornecedor**: esquerda, `--surface`, nome em 600.
- **Pessoa** (nossa equipe): direita, `--ink` com texto `--on-ink`.
- **IA**: esquerda, `--night` com selo lima "IA".
- **Sistema**: centralizado, pílula pequena `--surface-3`, caption.
Hora e ✓✓ no canto inferior direito do balão.

### Upload de anexos
Área tracejada 1.5 px, raio 14. Tipos: Nota fiscal, Boleto, Comprovante. Estados: vazio, arrastando (borda `--ink`, fundo `--accent-bg`), enviando (barra), enviado (arquivo + tamanho), erro (vermelho + motivo).

### Filtros
Seletor de obra (pílula com menu), período (Este mês · 30 · 60 · 90 dias · Personalizado), situação (chips multi). Filtros ativos viram chips removíveis.

### Formulário
Rótulo acima (12/600), campo 44 px, raio 14, fundo `--surface-2`. Foco: borda `--ink` + anel. Erro: borda `--neg` + mensagem abaixo com o que fazer. Valor em R$: prefixo fixo, alinhado à direita.
Mensagens: confirmação (verde, "Compra enviada ao financeiro") e erro (vermelho, com lista de campos). Toasts no canto inferior direito por 5 s.

### Estados vazios e carregando
Vazio: título curto + uma frase + uma ação. Carregando: esqueletos `--surface-3` com pulso 1.4 s, nunca spinner em tela cheia.

---

## 4. Padrões de tela

- **Barra superior**: marca à esquerda, navegação em pílulas no centro (ativo preto), seletor de obra + tema + avatar à direita.
- **Faixa escura**: no rodapé do painel (fluxo de caixa, IA). Lima é a cor de dado ali.
- **Obra 3D**: o prédio se constrói pelas etapas — fundação, estrutura, alvenaria, cobertura, acabamento. Partes não executadas aparecem só em contorno.
- **Impressão/PDF**: fundo branco, sem cartões, tipografia preta, tabelas com régua fina, cabeçalho com logo e dados da obra, rodapé com página.

## 5. Escrita

Português do Brasil, frases curtas, verbo no botão ("Liberar pagamento", não "OK"). Datas `dd/mm/aaaa`. Valores `R$ 12.480,00`. Percentuais sem casa decimal em barras (`58%`), com uma casa em relatórios (`58,4%`).

---

## 6. No código

- Componentes: `design-system/componentes/` (peças) e `design-system/padroes/` (barra superior, faixa escura, marca, prédio 3D). Importe sempre de `@ds`. Mapa completo em `design-system/README.md`.
- Vitrine com todos os componentes e estados: `design-system/referencias/Design System.dc.html`.
- Telas de referência (abrem direto no navegador por um servidor local): `design-system/referencias/`.
