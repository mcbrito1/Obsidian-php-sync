# Plugin — Obsidian PHP Sync

Plugin do Obsidian que sincroniza o cofre com o [backend PHP](../backend).

## Requisitos

- Node.js 18+
- Um backend rodando (veja [`../backend`](../backend))

## Build

```bash
npm install
npm run build        # type-check + gera main.js
# ou, em desenvolvimento (rebuild automático):
npm run dev
```

## Instalação no Obsidian

1. Crie a pasta `<seu-cofre>/.obsidian/plugins/obsidian-php-sync/`.
2. Copie para ela os arquivos **`manifest.json`** e **`main.js`** (gerado pelo build).
3. No Obsidian: **Configurações → Plugins da comunidade**, ative **PHP Sync**.

## Uso

1. Abra **Configurações → PHP Sync**.
2. Preencha **URL do servidor**, **Usuário** e **Senha**.
3. Clique em **Testar Conexão / Autenticar** — o token é salvo nas configurações.
4. Dispare a sincronização:
   - pelo ícone 🔄 **Iniciar Sincronização** na barra lateral (ribbon), ou
   - pela paleta de comandos (`Ctrl/Cmd+P`) → **Iniciar Sincronização**.

### Estratégia de sincronização (delta de 3 vias)

A sincronização compara o estado **local**, o **remoto** (`/manifest`, com hash
sha256) e o **último sync** salvo, para transferir apenas o que mudou
(`src/syncPlan.ts`):

- Arquivo novo de um lado → enviado/baixado.
- Arquivo removido de um lado (e inalterado no outro) → a exclusão é **propagada**.
- Editado só de um lado → enviado naquele sentido.
- **Conflito** (editado nos dois lados) → vence a versão de **`mtime` maior**.

Arquivos binários (imagens, PDFs, anexos) são suportados: o conteúdo trafega
em base64 (`src/base64.ts`) e é gravado via `vault.createBinary/modifyBinary`.
Exclusões locais usam a lixeira configurada do Obsidian (`fileManager.trashFile`).

### Automação e filtros

- **Auto-sync** ao iniciar, por intervalo (minutos) e/ou ao alterar arquivos
  (com debounce de 5s) — tudo opcional nas configurações.
- **Filtros glob** include/exclude (`.obsidian/` e `.trash/` excluídos por
  padrão) — veja `src/filter.ts`.
- **Re-autenticação automática** quando o token expira (401).
- **Barra de status** com progresso e horário do último sync.
- **ID do cofre** (header `X-Vault-Id`) para usar vários cofres no mesmo servidor.

## Arquitetura (por que é testável)

A lógica de rede e de sincronização vive em `src/`, **sem importar `obsidian`**:

- `SyncClient.ts` recebe a função HTTP por injeção (o `requestUrl` do Obsidian
  em produção, um fake nos testes).
- `syncPlan.ts` e `base64.ts` são funções puras.

`main.ts` é a única camada acoplada ao Obsidian (Plugin, Settings Tab, ribbon,
acesso ao `vault`).

## Testes

```bash
npm test         # Vitest
```

Cobre a conversão base64 (round-trip de texto/binário e vetores conhecidos),
a estratégia de sincronização e o `SyncClient` (auth, headers Bearer,
upload/download/list e tratamento de erros) com um cliente HTTP falso.
