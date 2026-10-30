# Forca em Grupo

Jogo da forca multiplayer em tempo real. Os jogadores entram com a conta Google, escolhem um código de sala e jogam juntos, em turnos, contra a mesma palavra.

## Como funciona

- **Login:** Google Identity Services. O servidor valida o token do Google antes de aceitar a conexão.
- **Salas:** cada código de sala é um Durable Object do Cloudflare, que guarda o estado do jogo em memória.
- **Tempo real:** a comunicação entre jogadores e servidor usa WebSocket.
- **Animações:** GSAP (desenho da forca, queda das letras, aviso de turno).
- **Pontuação:** 10 pontos por letra certa (por ocorrência) e 20 de bônus para quem completa a palavra. Quem erra passa a vez, e os erros são compartilhados (limite de 6).

## Estrutura do projeto

```
├── wrangler.jsonc      Configuração do Cloudflare Worker
├── src/
│   └── index.js        Servidor: login Google, rotas e classe Room
└── public/
    └── index.html      Interface do jogo e animações GSAP
```

## Configuração

### 1. Client ID do Google

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/) e crie um projeto.
2. Configure a **Tela de consentimento OAuth** (público: Externo).
3. Em **Credenciais**, crie um **ID do cliente OAuth** do tipo **Aplicativo da Web**.
4. Em **Origens JavaScript autorizadas**, adicione:
   - `http://localhost:8787` (testes locais)
   - a URL do seu Worker no Cloudflare, sem barra no final
5. Copie o ID do cliente (termina em `.apps.googleusercontent.com`) e cole em `wrangler.jsonc`, no campo `GOOGLE_CLIENT_ID`.

> O Client Secret não é necessário.

### 2. Publicação no Cloudflare

Com o repositório conectado ao Cloudflare (**Workers & Pages → Create application → Import a repository**), cada commit na branch `main` publica o jogo automaticamente.

Para publicar manualmente:

```bash
npx wrangler login
npx wrangler deploy
```

> O campo `name` do `wrangler.jsonc` deve ser igual ao nome do projeto no Cloudflare.

### 3. Teste local (opcional)

```bash
npx wrangler dev
```

Abra `http://localhost:8787`. Para testar o multiplayer, use duas janelas (uma anônima, com outra conta Google) e o mesmo código de sala.

## Como jogar

1. Entre com a conta Google.
2. Digite um código de sala e compartilhe o link com os amigos.
3. Na sua vez, clique em uma letra ou use o teclado.
4. Quando a rodada terminar, clique em **Nova rodada**.

## Personalização

- **Palavras:** edite a lista `WORDS` em `src/index.js` (use letras maiúsculas e sem acento).
- **Número de erros:** altere `MAX_ERRORS` em `src/index.js` (o desenho da forca tem 6 partes).
- **Visual:** as cores ficam nas variáveis CSS no início do `public/index.html`.

## Tecnologias

Cloudflare Workers, Durable Objects, WebSocket, Google Identity Services, GSAP.
