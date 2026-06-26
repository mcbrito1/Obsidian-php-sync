# Dashboard — Obsidian PHP Sync

Interface web (React + Vite) para inspecionar os cofres e **mesclar arquivos**
visualmente (estilo Meld), conversando com o [backend](../backend).

## Recursos

- **Login** com usuário/senha (mesmo `POST /auth`); o JWT fica no `localStorage`.
- **Vault**: seletor de cofre, estatísticas (nº de arquivos, tamanho total, última
  modificação), tabela com `path / tamanho / data / hash` e preview do conteúdo.
- **Merge (estilo Meld)** com [`@codemirror/merge`](https://www.npmjs.com/package/@codemirror/merge):
  colunas lado a lado, chunks com aceitar/rejeitar e edição inline. Cada lado pode vir de:
  - um **cofre** (`X-Vault-Id`) — compara o mesmo arquivo entre dois cofres; ou
  - uma **versão** anterior (histórico em `.versions/`, via `GET /versions` e `/version`).
  O resultado (lado B) é salvo de volta com `POST /upload`.

## Desenvolvimento

A forma recomendada é via Docker (sobe backend + dashboard juntos):

```bash
# na raiz do repositório
docker compose up --build
# Dashboard: http://localhost:5173   (login: admin / changeme)
```

Ou localmente, sem Docker (requer o backend rodando em `http://localhost:8080`):

```bash
npm install
npm run dev          # http://localhost:5173
```

O Vite faz **proxy** de `/api` para o backend (`VITE_PROXY_TARGET`, padrão
`http://localhost:8080`), então o navegador fala apenas com a própria origem —
sem CORS.

## Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Servidor de desenvolvimento (HMR) |
| `npm run build` | Type-check + build de produção (`dist/`) |
| `npm test` | Testes (Vitest + Testing Library) |
| `npm run lint` | `tsc --noEmit` + ESLint |

## Arquitetura

- `src/api.ts` — cliente HTTP (login/manifest/download/upload/versions); injeta
  `Authorization` e `X-Vault-Id`. Lógica pura e testável (`src/base64.ts`).
- `src/auth.ts` — token no `localStorage`.
- `src/components/` — `Login`, `VaultInfo`, `MergeTool`.

Os testes cobrem o cliente de API (com `fetch` falso), a conversão base64 e o
fluxo de login.
