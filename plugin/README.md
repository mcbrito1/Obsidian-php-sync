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

### Estratégia de sincronização

- **Upload:** todos os arquivos locais são enviados ao servidor.
- **Download:** arquivos presentes no servidor e ausentes localmente são baixados.
- Nada é apagado — a sincronização é aditiva (veja `src/syncPlan.ts`).

Arquivos binários (imagens, PDFs, anexos) são suportados: o conteúdo trafega
em base64 (`src/base64.ts`) e é gravado via `vault.createBinary/modifyBinary`.

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
