# Backend — Obsidian PHP Sync (Slim 4)

API REST mínima que recebe e devolve os arquivos do cofre do Obsidian.

## Requisitos

- PHP 8.1+ com extensão `json`
- [Composer](https://getcomposer.org/)

## Instalação e execução

```bash
composer install
cp .env.example .env     # ajuste as credenciais
composer start           # = php -S 0.0.0.0:8080 -t public
```

A API sobe em `http://localhost:8080`.

### Docker

```bash
docker build -t obsidian-sync .
docker run -p 8080:8080 -v "$PWD/data:/data" \
  -e SYNC_USER=admin -e SYNC_PASSWORD=s3cret obsidian-sync
```

## Configuração (variáveis de ambiente)

| Variável | Padrão | Descrição |
|----------|--------|-----------|
| `SYNC_USER` | `admin` | Usuário aceito no `/auth` |
| `SYNC_PASSWORD` | `changeme` | Senha aceita no `/auth` |
| `JWT_SECRET` | *(troque!)* | Segredo HMAC para assinar os tokens |
| `JWT_TTL` | `86400` | Validade do token, em segundos |
| `STORAGE_PATH` | `backend/storage` | Onde os arquivos são salvos |

As variáveis podem vir do ambiente ou de um arquivo `.env` na raiz do backend.

## Endpoints

| Método | Rota | Auth | Descrição |
|--------|------|------|-----------|
| `GET` | `/health` | — | Healthcheck (`{"status":"ok"}`) |
| `POST` | `/auth` | — | Recebe `{username,password}` e devolve `{token,...}` |
| `POST` | `/upload` | Bearer | Recebe `{path, content}` (content em **base64**) |
| `GET` | `/download?path=…` | Bearer | Devolve `{path, content (base64), size}` |
| `GET` | `/list` | Bearer | Lista `{files:[{path,size,mtime}]}` |

Rotas protegidas exigem o header `Authorization: Bearer <token>`.

### Exemplos com `curl`

```bash
# Autenticar
TOKEN=$(curl -s -X POST http://localhost:8080/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"changeme"}' | jq -r .token)

# Upload (conteúdo em base64)
curl -X POST http://localhost:8080/upload \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"path\":\"Notas/ola.md\",\"content\":\"$(printf '# Olá' | base64)\"}"

# Listar e baixar
curl http://localhost:8080/list -H "Authorization: Bearer $TOKEN"
curl "http://localhost:8080/download?path=Notas/ola.md" -H "Authorization: Bearer $TOKEN"
```

## Segurança

- Os caminhos passam por `Storage::resolve()`, que **bloqueia path traversal**
  (`..`, byte nulo, caminhos absolutos) — os arquivos nunca escapam de `STORAGE_PATH`.
- A comparação de credenciais e da assinatura JWT usa `hash_equals()`
  (resistente a timing attacks).
- Troque `JWT_SECRET`, `SYNC_USER` e `SYNC_PASSWORD` antes de expor o serviço.
- Coloque o serviço atrás de HTTPS (proxy reverso) em produção.

## Testes

```bash
composer test    # PHPUnit
```

Cobre o JWT, a camada de armazenamento (incluindo path traversal) e o app
completo de ponta a ponta (auth → upload → list → download).
