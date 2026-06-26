# Obsidian PHP Sync

Sistema simples de sincronização para o [Obsidian](https://obsidian.md), composto
por duas partes independentes:

| Parte | Tecnologia | Pasta |
|-------|------------|-------|
| **Backend REST** | PHP 8.1+ · Slim Framework 4 | [`backend/`](backend) |
| **Plugin** | TypeScript · API do Obsidian | [`plugin/`](plugin) |

O plugin faz uma **sincronização delta de 3 vias** (por hash): envia/baixa apenas
o que mudou, propaga exclusões e resolve conflitos pela versão mais recente
(`mtime`). Inclui auto-sync, filtros glob, múltiplos cofres e versionamento no
servidor.

## Estrutura de pastas

```
Obsidian-php-sync/
├── backend/                  # API REST em PHP (Slim 4)
│   ├── public/index.php      # Front controller + carregamento do .env
│   ├── src/                  # Código da aplicação (PSR-4: ObsidianSync\)
│   │   ├── AppFactory.php     # Monta o app Slim e registra as rotas
│   │   ├── Config.php         # Configuração via variáveis de ambiente
│   │   ├── Jwt.php            # JWT HS256 auto-contido (sem dependências)
│   │   ├── AuthController.php # POST /auth
│   │   ├── AuthMiddleware.php # Valida o Bearer token
│   │   ├── SyncController.php # upload/upload-batch/download/manifest/file
│   │   ├── Vaults.php         # Isolamento de múltiplos cofres (X-Vault-Id)
│   │   └── Storage.php        # I/O com proteção a traversal + versionamento
│   ├── tests/                # Testes PHPUnit (unitários + integração)
│   ├── composer.json
│   ├── phpunit.xml
│   ├── phpstan.neon
│   ├── Dockerfile
│   └── .env.example
│
├── plugin/                   # Plugin do Obsidian
│   ├── manifest.json
│   ├── main.ts               # Plugin: Settings Tab, Ribbon, comando, auto-sync
│   ├── src/                  # Lógica pura e testável (não importa "obsidian")
│   │   ├── SyncClient.ts      # Cliente HTTP (auth/upload/download/manifest/delete)
│   │   ├── syncPlan.ts        # Sync delta de 3 vias + buildLastSync
│   │   ├── filter.ts          # Filtros glob include/exclude
│   │   ├── hash.ts            # sha256 (Web Crypto)
│   │   ├── base64.ts          # Conversão base64 ↔ binário portável
│   │   └── types.ts
│   ├── tests/                # Testes Vitest (+ mock de "obsidian")
│   ├── esbuild.config.mjs
│   ├── eslint.config.mjs
│   ├── package.json
│   └── tsconfig.json
│
└── .github/workflows/ci.yml  # CI: testes/lint/build do backend e do plugin
```

## Início rápido

### 1. Backend

```bash
cd backend
composer install
cp .env.example .env          # ajuste usuário/senha/segredo
composer start                # http://localhost:8080
```

Ou via Docker:

```bash
cd backend
docker build -t obsidian-sync .
docker run -p 8080:8080 -v "$PWD/data:/data" \
  -e SYNC_USER=admin -e SYNC_PASSWORD=s3cret obsidian-sync
```

### 2. Plugin

```bash
cd plugin
npm install
npm run build                 # gera main.js
```

Copie `manifest.json` e `main.js` para
`<seu-cofre>/.obsidian/plugins/obsidian-php-sync/`, ative o plugin no Obsidian,
abra **Configurações → PHP Sync**, preencha URL/usuário/senha, clique em
**Testar Conexão / Autenticar** e use o comando **Iniciar Sincronização**.

## Testes

```bash
cd backend && composer test && composer phpstan    # PHPUnit (44) + PHPStan
cd plugin  && npm run lint && npm test && npm run build   # ESLint + Vitest (49) + build
```

CI (GitHub Actions, `.github/workflows/ci.yml`) roda tudo isso em cada PR/push.

Detalhes em [`backend/README.md`](backend/README.md) e [`plugin/README.md`](plugin/README.md).
