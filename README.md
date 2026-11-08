# Buscador pessoal de passagens (dinheiro e milhas)

Ferramenta **de uso pessoal** para consulta **pontual**. Você informa origem, destino e datas, e ela consulta:

| Fonte | Tipo | Como |
|---|---|---|
| `duffel` | dinheiro | API oficial do Duffel (dados estruturados) |
| `seatsaero` | milhas | API do seats.aero, plano Pro, uso pessoal: Smiles, Aeroplan, Flying Blue, United, American e outros (dados em cache) |
| `latam` | dinheiro | robô assistido, link direto |
| `latampass` | milhas | robô assistido, link direto (geralmente exige login) |
| `smiles` | milhas | robô assistido, link direto (a calibrar) |
| `gol` | dinheiro | robô assistido, link direto (a calibrar) |
| `aeroplan` | pontos | robô assistido, link direto |
| `aircanada` | dinheiro | robô assistido, link direto (a calibrar) |
| `westjet` | dinheiro | robô assistido, link direto (a calibrar) |
| `tap` | dinheiro | robô assistido, **você preenche a busca** na janela |
| `milesgo` | milhas | robô assistido, **você preenche a busca** na janela (exige login) |

No fim, a ferramenta mostra o melhor preço em dinheiro e em milhas, compara dinheiro × milhas pelo valor do milheiro e gera um **relatório HTML**.

> **O Duffel não consulta programas de milhas.** Ele retorna só tarifas em dinheiro. As milhas vêm do **seats.aero** e dos robôs nos sites dos programas. LATAM Pass, Azul e TAP Miles&Go não estão no seats.aero; para esses, use os robôs `latampass` e `milesgo`.

## Como funciona o robô (e o que ele não faz)

- Ele abre o **seu Chrome, visível**, como se fosse você navegando. Vai direto à página de resultados e **lê os dados que o próprio site carrega**, sem depender do layout da tela.
- **Login:** é você quem faz, uma única vez, com `npm run login -- <site>`. A sessão fica salva em `.perfil-navegador\`. **A ferramenta nunca vê nem guarda sua senha.**
- **CAPTCHA, verificação ou bloqueio:** o robô **para** e pergunta o que fazer. Você pode resolver na janela ou pular o site. Ele não tenta burlar nada.
- Faz uma busca por vez, um site por vez, com intervalo entre os sites. A mesma busca no mesmo site não se repete por 15 minutos (use `--forcar` para refazer).
- Os resultados dos robôs vêm marcados como **[conferir]**, porque foram extraídos automaticamente. Confira na janela do site antes de comprar ou emitir.
- **Aviso:** os termos de uso desses sites costumam proibir automação. O uso é por sua conta, apenas pessoal e com baixo volume. Em contas de fidelidade logadas, o abuso pode levar a bloqueio da conta. Por isso a ferramenta é pontual e sob comando.

## Instalação (Windows)

1. Instale o **Node.js 22 LTS ou mais novo** (versão 22.18+): https://nodejs.org
2. Extraia o projeto em `C:\Acronis\Denis\PASSAGENS`.
3. No PowerShell:
   ```powershell
   cd C:\Acronis\Denis\PASSAGENS
   npm install
   copy .env.example .env
   notepad .env
   ```
4. No `.env`, preencha `DUFFEL_TOKEN` (veja abaixo) e, se quiser, os valores do milheiro.
5. O robô usa o **Google Chrome** instalado. Se preferir o Edge, use `NAVEGADOR=msedge`. Se não tiver nenhum dos dois: `npx playwright install chromium` e `NAVEGADOR=chromium`.

### Chave do seats.aero (milhas)

1. Assine o plano **Pro** em https://seats.aero (cerca de US$ 10/mês). A API é liberada para assinantes Pro em uso pessoal e não comercial, com limite de cerca de 1.000 chamadas por dia. Cada trecho consultado gasta 1 chamada.
2. Gere a chave em **Settings → API** e cole no `.env`: `SEATS_AERO_KEY=...`.
3. Opcional: `SEATS_AERO_PROGRAMAS=smiles,aeroplan,flyingblue` limita os programas consultados.

Os dados do seats.aero vêm de um **cache** com as buscas recentes deles. A disponibilidade pode ter mudado, então confirme no site do programa antes de transferir pontos ou emitir.

Os nomes de campos da API foram implementados conforme o formato conhecido, mas **a documentação oficial não pôde ser conferida** durante o desenvolvimento. A resposta bruta fica em `capturas\seatsaero\respostas.json`. Se milhas ou taxas vierem estranhas, me envie esse arquivo.

### Token do Duffel

A API do Duffel **não usa e-mail e senha**. Use um token:
1. Entre em https://app.duffel.com com sua conta.
2. Vá em **Developers → Access tokens → Create token** e copie o valor.
3. Cole no `.env`: `DUFFEL_TOKEN=duffel_test_...` ou `duffel_live_...`.

Tokens de **teste** (`duffel_test_`) só retornam a companhia fictícia "Duffel Airways". Para ver **preços reais**, ative o modo *live* no painel do Duffel. Ele pede verificação da conta e dados de cobrança; buscas não são cobradas enquanto a proporção entre buscas e pedidos ficar dentro do limite do Duffel (ver https://duffel.com/pricing).

## Uso

```powershell
# todas as fontes
npm run buscar -- --de NAT --para LIS --ida 2027-01-10 --volta 2027-01-25

# só milhas pela API (rápido, sem abrir navegador)
npm run buscar -- --de GRU --para LIS --ida 2027-01-10 --fontes seatsaero

# só algumas fontes
npm run buscar -- --de GRU --para YYZ --ida 2027-03-05 --fontes duffel,aeroplan,aircanada,westjet

# executiva, 2 adultos, no máximo 1 escala, milheiro a R$ 22
npm run buscar -- --de REC --para LIS --ida 2027-02-01 --classe executiva --adultos 2 --escalas 1 --milheiro 22

# fazer login (uma vez) nos programas
npm run login -- latampass
npm run login -- smiles
npm run login -- milesgo

# calculadora dinheiro x milhas avulsa
npm run comparar -- --dinheiro 2500 --milhas 35000 --taxas 180 --milheiro 20

npm run fontes
```

Cada busca cria uma pasta em `dados\buscas\<data>_<origem>-<destino>\` com:
- `relatorio.html`: abra no navegador;
- `resultados.json`: os dados;
- `capturas\<site>\respostas.json` e `tela.png`: o que o site devolveu, usado para calibrar.

O histórico de todas as buscas fica em `dados\historico.jsonl`.

## Comparador dinheiro × milhas

```
valor por milheiro = (preço em dinheiro − taxas do resgate) / (milhas / 1.000)
custo do resgate   = (milhas / 1.000) × seu valor do milheiro + taxas
```

Exemplo: R$ 2.500 contra 35.000 milhas + R$ 180, com milheiro a R$ 20. A emissão paga R$ 66,29 por milheiro e custa R$ 880, então é melhor emitir com milhas. Diferença menor que 10% conta como "as duas alternativas são competitivas".

O valor do milheiro pode ser definido por programa no `.env` (`MILHEIRO_SMILES`, `MILHEIRO_LATAMPASS`, `MILHEIRO_AEROPLAN`, `MILHEIRO_MILESGO`). Valores em CAD, EUR e USD são convertidos pela PTAX do Banco Central. Para fixar uma cotação: `COTACAO_CAD=4.05`.

## Calibração dos sites (importante na primeira vez)

Os sites das companhias não publicam o formato dos dados e mudam com frequência. Os links marcados "a calibrar" foram montados a partir do padrão das URLs públicas, mas **não puderam ser testados** de onde o projeto foi desenvolvido.

Se um site não abrir os resultados direto, o robô pede que você faça a busca na janela e captura do mesmo jeito. Se os resultados vierem errados ou vazios, me envie o arquivo `capturas\<site>\respostas.json` daquela busca. Com ele dá para ajustar o link em `src/robots/sites.ts` ou o extrator em `src/robots/extrair.ts`.

## Estrutura

```
src/cli.ts              comandos (buscar, login, fontes, comparar)
src/consulta.ts         validação da consulta
src/sources/duffel.ts   API do Duffel
src/sources/seatsaero.ts API do seats.aero (milhas)
src/robots/sites.ts     sites, links diretos e domínios capturados
src/robots/navegador.ts robô assistido (Chrome visível, para em CAPTCHA)
src/robots/extrair.ts   extração dos itinerários a partir do JSON dos sites
src/comparar.ts         dinheiro × milhas
src/cambio.ts           PTAX (Banco Central)
src/relatorio.ts        resumo no terminal + relatório HTML
test/                   testes (npm test)
```

## Segurança

- `.env`, `.perfil-navegador\` (cookies e sessões de login) e `dados\` **não** vão para o git (`.gitignore`).
- Não coloque senhas no `.env`. Os únicos segredos são `DUFFEL_TOKEN` e `SEATS_AERO_KEY`.
