# Lastro — Design System

Sistema interno da construtora para financeiro, orçamento e compras de cada obra.
Perfis: **Obra** (engenheiro, celular no canteiro), **Financeiro** (desktop, tabelas), **Dono** (aprova compras grandes).

Referência visual: branco gelo + cartões claros de raio grande, faixa escura em vinho profundo, acento azul, marca vinho, tipografia geométrica leve. Aplicada a um produto denso em números — **legibilidade de R$ vem antes de enfeite**.

---

## 1. Princípios

1. **Número primeiro.** Valores em R$ sempre com algarismos tabulares, alinhados à direita, mesma casa decimal. Nunca centralizar coluna de valor.
2. **Hierarquia em três níveis.** Valor principal (Outfit 300, grande) → rótulo (Manrope 12, cinza) → detalhe (Manrope 12, cinza claro). Um número por cartão em destaque.
3. **Cor é significado.** Azul = progresso, dado, ação final, enviado. Vinho = dono e marca. Vermelho-laranja = negativo, erro, gasto acima do feito. Âmbar = aguardando/atenção. Verde = aprovado/pago. Nada de cor decorativa.
4. **Calmo, não frio.** Superfícies em branco gelo e raios generosos; texto em tinta vinho (#24161B), nunca preto puro; o 3D da obra dá vida ao painel.
5. **Canteiro é celular.** Alvos ≥ 44 px, uma ação principal por tela, botões de passo (−/+) para percentual, contraste alto ao sol.

---

## 2. Tokens

Este arquivo é a fonte da verdade dos tokens. No código eles vivem em `design-system/tokens.css` (variáveis CSS) e viram classes do Tailwind em `src/app/globals.css` (`bg-surface`, `text-ink-3`, `rounded-lg`, `shadow-2`, `text-h2`, `font-display`…). Componentes usam só essas classes: **nada de cor, fonte, espaçamento ou raio escrito à mão**. O tema escuro troca as variáveis com `data-tema="escuro"` no `<html>`; a escolha fica salva no navegador (`go-tema`). Mudou um valor aqui? Mude também `design-system/tokens.css` e `design-system/referencias/tema.js`.

### Cor

**Paleta A, pelo efeito Helson-Judd**: a "luz" do sistema é azul gelo. Por isso os claros puxam para o azul (branco gelo) e os escuros puxam para o vinho, nunca para o preto puro. O **azul** conduz: progresso, dados e a ação final. O **vinho** é a marca e o que espera pelo dono. O erro é vermelho-laranja, bem separado do vinho.

| Token | Claro | Escuro | Uso |
|---|---|---|---|
| `--bg` | `#ECF0F4` | `#110A0D` | fundo da aplicação (branco gelo) |
| `--surface` | `#FBFCFD` | `#1B1216` | cartões, tabelas |
| `--surface-2` | `#F3F6F9` | `#251A1F` | campos, linhas zebra, hover |
| `--surface-3` | `#E3E9EF` | `#2F2228` | trilho de progresso, chips |
| `--line` | `#D9E0E7` | `#3A2B32` | divisórias, bordas |
| `--ink` | `#24161B` | `#EEF2F6` | texto principal, botão primário (tinta vinho) |
| `--ink-2` | `#5B4C52` | `#B8C1CB` | texto secundário |
| `--ink-3` | `#7A6F75` | `#8B95A0` | rótulos, placeholders |
| `--on-ink` | `#FBFCFD` | `#1B1216` | texto sobre `--ink` |
| `--night` | `#1F1217` | `#0B0608` | faixa escura (fluxo, IA) |
| `--night-2` | `#2C1C22` | `#1A1014` | cartões na faixa escura |
| `--night-3` | `#3A2830` | `#2A1C22` | divisórias e trilhos na faixa escura |
| `--night-ink` | `#F3F6F9` | `#F3F6F9` | texto na faixa escura |
| `--night-ink-2` | `#D2C8CC` | `#D2C8CC` | texto secundário na faixa escura |
| `--night-ink-3` | `#A3969C` | `#A3969C` | rótulos na faixa escura |
| `--accent` | `#2D62DB` | `#7FA3F4` | azul — progresso, ação final, dado |
| `--on-accent` | `#FFFFFF` | `#0E1424` | texto sobre o azul |
| `--accent-ink` | `#2552C2` | `#9DB9F7` | texto azul legível sobre superfície |
| `--accent-bg` | `#E1EAFB` | `#1B2744` | fundo azul suave (seleção, destaque) |
| `--accent-night` | `#7FA3F4` | `#7FA3F4` | azul legível na faixa escura e sobre `--ink` |
| `--vinho` | `#7C1F3B` | `#E07C9B` | marca, Dono (ponto, segmento) |
| `--vinho-ink` | `#7C1F3B` | `#E07C9B` | texto vinho (Aguardando dono) |
| `--vinho-bg` | `#F5E3E9` | `#3A1624` | fundo vinho suave, avatar |
| `--neg` | `#C9432A` | `#FF8A6E` | valor negativo, erro |
| `--neg-bg` | `#FBE7E2` | `#3B1710` | fundo de erro |
| `--neg-night` | `#FF8A6E` | `#FF8A6E` | negativo legível na faixa escura |
| `--warn` | `#9A5B0B` | `#F0B455` | aguardando, atenção |
| `--warn-bg` | `#FAEFD9` | `#33250E` | |
| `--warn-night` | `#F0B455` | `#F0B455` | atenção legível na faixa escura |
| `--ok` | `#2F7A4D` | `#8FD3A8` | aprovada, paga |
| `--ok-bg` | `#E2F0E7` | `#15291D` | |
| `--info` | `#2552C2` | `#9DB9F7` | enviado, informação (mesma família do azul) |
| `--info-bg` | `#E1EAFB` | `#1B2744` | |
| `--fixed-ink` | `#24161B` | `#24161B` | tinta da impressão (sempre escura) |
| `--fixed-paper` | `#FFFFFF` | `#FFFFFF` | papel da impressão (sempre branco) |
| `--focus` | `#2D62DB` | `#7FA3F4` | anel de foco (2 px + 2 px offset) |

As telas de referência (`design-system/referencias/tema.js`) usam os mesmos valores, ainda com os nomes antigos `pink*` para o vinho.

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

Quase plana. `--shadow-1: 0 1px 2px rgba(36,22,27,.04)` em cartões; `--shadow-2: 0 12px 32px rgba(36,22,27,.10)` em menus, modais e toasts.

---

## 3. Componentes

### Botões
Pílula, altura 40 (sm 32, celular 48). **Primário** tinta vinho (`--ink`/`--on-ink`). **Acento** azul (`--accent`/`--on-accent`) — só para a ação final (Liberar, Aprovar). **Secundário** contorno `--line`. **Fantasma** texto. **Perigo** contorno vermelho; vira sólido só na confirmação.
Estados: hover (escurece/`--surface-2`), ativo (escala 0.98), foco (anel `--focus`), desabilitado (opacidade 0.4, sem cursor), carregando (rótulo trocado por "Salvando…" + spinner, largura preservada).

### Etiqueta de situação
Pílula 24 px, ponto + texto, fundo suave da família semântica.
- Compra: Rascunho (neutro) · Aguardando financeiro (âmbar) · Aguardando dono (vinho) · Aprovada (verde) · Paga (azul sólido) · Recusada (vermelho)
- Orçamento: Rascunho · Enviado ao investidor (azul) · Aprovado (verde)
- Cotação: Aberta (azul) · Respondida (âmbar) · Fechada (verde) · Sem resposta (neutro)

### Barra de progresso de etapa
Altura 28, raio pílula, percentual escrito **dentro** (Manrope 12/700). Preenchimento azul com texto `--on-accent`; trilho `--surface-3`. Se o preenchimento < 14 %, o texto vai para fora, à direita do preenchimento.
**Alerta**: quando `% gasto > % executado`, o trilho ganha marcador vertical do gasto e o trecho excedente fica vermelho hachurado; etiqueta "Gasto 72% · feito 58%".

### Tabela financeira
Cabeçalho 12/600 cinza em caixa normal (não maiúsculas). Valores à direita, tabulares. Negativo: `−R$ 1.240,00` em `--neg` (sinal de menos real, nunca hífen; nunca só cor). Linha de total: fundo `--surface-2`, 700. Linha selecionada: fundo `--accent-bg` + checkbox. Hover: `--surface-2`.

### Linha do tempo
Ponto 10 px na cor do evento, linha 1 px `--line`, data `dd/mm/aaaa hh:mm` em caption, autor em 600.

### Conversa (estilo WhatsApp)
- **Fornecedor**: esquerda, `--surface`, nome em 600.
- **Pessoa** (nossa equipe): direita, `--ink` com texto `--on-ink`.
- **IA**: esquerda, `--night` com selo azul "IA".
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

- **Barra superior**: marca à esquerda, navegação em pílulas no centro (ativo em tinta vinho), seletor de obra + tema + avatar à direita.
- **Faixa escura**: no rodapé do painel (fluxo de caixa, IA). Azul (`--accent-night`) é a cor de dado ali.
- **Obra 3D**: o prédio se constrói pelas etapas — fundação, estrutura, alvenaria, cobertura, acabamento. Partes não executadas aparecem só em contorno.
- **Impressão/PDF**: fundo branco, sem cartões, tipografia preta, tabelas com régua fina, cabeçalho com logo e dados da obra, rodapé com página.

## 5. Escrita

Português do Brasil, frases curtas, verbo no botão ("Liberar pagamento", não "OK"). Datas `dd/mm/aaaa`. Valores `R$ 12.480,00`. Percentuais sem casa decimal em barras (`58%`), com uma casa em relatórios (`58,4%`).

---

## 6. No código

- Componentes: `design-system/componentes/` (peças) e `design-system/padroes/` (barra superior, faixa escura, marca, prédio 3D). Importe sempre de `@ds`. Mapa completo em `design-system/README.md`.
- Vitrine com todos os componentes e estados: `design-system/referencias/Design System.dc.html`.
- Telas de referência (abrem direto no navegador por um servidor local): `design-system/referencias/`.
