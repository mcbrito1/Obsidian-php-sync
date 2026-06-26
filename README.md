# Obsidian PHP Sync

Sistema simples de sincronização para o [Obsidian](https://obsidian.md), composto
por duas partes independentes:

| Parte | Tecnologia | Pasta |
|-------|------------|-------|
| **Backend REST** | PHP 8.1+ · Slim Framework 4 | [`backend/`](backend) |
| **Plugin** | TypeScript · API do Obsidian | [`plugin/`](plugin) |

O plugin envia (`upload`) todos os arquivos do cofre para o servidor e baixa
(`download`) os arquivos que existem no servidor mas não localmente — uma
sincronização aditiva e não destrutiva.

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
│   │   ├── SyncController.php # POST /upload, GET /download, GET /list
│   │   └── Storage.php        # Leitura/escrita com proteção a path traversal
│   ├── tests/                # Testes PHPUnit (unitários + integração)
│   ├── composer.json
│   ├── phpunit.xml
│   ├── Dockerfile
│   └── .env.example
│
└── plugin/                   # Plugin do Obsidian
    ├── manifest.json
    ├── main.ts               # Plugin: Settings Tab, Ribbon, comando, sync
    ├── src/                  # Lógica pura e testável (não importa "obsidian")
    │   ├── SyncClient.ts      # Cliente HTTP (auth/upload/download/list)
    │   ├── syncPlan.ts        # Estratégia de sincronização
    │   ├── base64.ts          # Conversão base64 ↔ binário portável
    │   └── types.ts
    ├── tests/                # Testes Vitest
    ├── esbuild.config.mjs
    ├── package.json
    └── tsconfig.json
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
cd backend && composer test     # PHPUnit  (22 testes)
cd plugin  && npm test          # Vitest   (19 testes)
```

Detalhes em [`backend/README.md`](backend/README.md) e [`plugin/README.md`](plugin/README.md).
