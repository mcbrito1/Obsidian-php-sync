<?php

declare(strict_types=1);

namespace ObsidianSync;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Endpoints de sincronizacao: upload, download e listagem de arquivos.
 *
 * O conteudo trafega em base64 para que arquivos binarios (imagens, PDFs,
 * anexos do Obsidian) sejam suportados sem corrupcao.
 */
final class SyncController
{
    public function __construct(
        private readonly Vaults $vaults,
        private readonly int $maxFileSize = 0,
    ) {
    }

    /**
     * POST /upload
     * Body JSON: { "path": "Notas/foo.md", "content": "<base64>" }
     */
    public function upload(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $storage = $this->storageFor($request);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_vault', 'message' => $e->getMessage()]);
        }

        $data = self::parseBody($request);

        $result = $this->writeOne($storage, $data);
        if (isset($result['error'])) {
            return self::json($response, $result['status'], $result['body']);
        }

        return self::json($response, 200, $result['body']);
    }

    /**
     * POST /upload-batch
     * Body JSON: { "files": [ { "path", "content" }, ... ] }
     * Envia varios arquivos em uma unica requisicao.
     */
    public function uploadBatch(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $storage = $this->storageFor($request);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_vault', 'message' => $e->getMessage()]);
        }

        $data = self::parseBody($request);
        $files = $data['files'] ?? null;
        if (!\is_array($files)) {
            return self::json($response, 422, [
                'error' => 'invalid_request',
                'message' => 'Campo "files" (array) e obrigatorio.',
            ]);
        }

        $results = [];
        foreach ($files as $entry) {
            if (!\is_array($entry)) {
                return self::json($response, 422, [
                    'error' => 'invalid_request',
                    'message' => 'Cada item de "files" deve ser um objeto.',
                ]);
            }
            $result = $this->writeOne($storage, $entry);
            if (isset($result['error'])) {
                return self::json($response, $result['status'], $result['body']);
            }
            $results[] = $result['body'];
        }

        return self::json($response, 200, ['status' => 'ok', 'files' => $results]);
    }

    /**
     * Valida e grava um unico arquivo. Retorna um array com 'body' e, em caso
     * de falha, 'error' + 'status'.
     *
     * @param array<string,mixed> $data
     * @return array{body:array<string,mixed>,error?:bool,status?:int}
     */
    private function writeOne(Storage $storage, array $data): array
    {
        $path = isset($data['path']) ? (string) $data['path'] : '';
        if ($path === '') {
            return ['error' => true, 'status' => 422, 'body' => [
                'error' => 'invalid_request',
                'message' => 'Campo "path" e obrigatorio.',
            ]];
        }

        if (!array_key_exists('content', $data)) {
            return ['error' => true, 'status' => 422, 'body' => [
                'error' => 'invalid_request',
                'message' => 'Campo "content" e obrigatorio.',
            ]];
        }

        $decoded = base64_decode((string) $data['content'], true);
        if ($decoded === false) {
            return ['error' => true, 'status' => 422, 'body' => [
                'error' => 'invalid_request',
                'message' => 'Campo "content" deve estar em base64 valido.',
            ]];
        }

        if ($this->maxFileSize > 0 && \strlen($decoded) > $this->maxFileSize) {
            return ['error' => true, 'status' => 413, 'body' => [
                'error' => 'file_too_large',
                'message' => "Arquivo excede o limite de {$this->maxFileSize} bytes.",
                'path' => $path,
            ]];
        }

        try {
            $storage->write($path, $decoded);
        } catch (\InvalidArgumentException $e) {
            return ['error' => true, 'status' => 422, 'body' => [
                'error' => 'invalid_path',
                'message' => $e->getMessage(),
            ]];
        }

        return ['body' => ['status' => 'ok', 'path' => $path, 'size' => \strlen($decoded)]];
    }

    /**
     * GET /download?path=Notas/foo.md
     * Resposta JSON: { "path": ..., "content": "<base64>", "size": ..., "mtime": ... }
     */
    public function download(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $path = (string) ($request->getQueryParams()['path'] ?? '');
        if ($path === '') {
            return self::json($response, 422, [
                'error' => 'invalid_request',
                'message' => 'Parametro "path" e obrigatorio.',
            ]);
        }

        try {
            $storage = $this->storageFor($request);
            if (!$storage->exists($path)) {
                return self::json($response, 404, [
                    'error' => 'not_found',
                    'message' => "Arquivo nao encontrado: {$path}",
                ]);
            }

            $contents = $storage->read($path);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_path', 'message' => $e->getMessage()]);
        }

        return self::json($response, 200, [
            'path' => $path,
            'content' => base64_encode($contents),
            'size' => \strlen($contents),
        ]);
    }

    /**
     * GET /list -> { "files": [ { "path", "hash", "size", "mtime" }, ... ] }
     * GET /manifest -> idem (nome semantico usado pelo cliente para o delta sync).
     */
    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        try {
            $storage = $this->storageFor($request);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_vault', 'message' => $e->getMessage()]);
        }

        return self::json($response, 200, ['files' => $storage->list()]);
    }

    /**
     * DELETE /file?path=Notas/foo.md
     * Idempotente: retorna 200 mesmo que o arquivo ja nao exista.
     */
    public function delete(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $path = (string) ($request->getQueryParams()['path'] ?? '');
        if ($path === '') {
            return self::json($response, 422, [
                'error' => 'invalid_request',
                'message' => 'Parametro "path" e obrigatorio.',
            ]);
        }

        try {
            $deleted = $this->storageFor($request)->delete($path);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_path', 'message' => $e->getMessage()]);
        }

        return self::json($response, 200, [
            'status' => 'ok',
            'path' => $path,
            'deleted' => $deleted,
        ]);
    }

    /** Resolve o Storage do cofre indicado no header X-Vault-Id (ou "default"). */
    private function storageFor(ServerRequestInterface $request): Storage
    {
        return $this->vaults->for($request->getHeaderLine('X-Vault-Id'));
    }

    /**
     * @return array<string,mixed>
     */
    private static function parseBody(ServerRequestInterface $request): array
    {
        $parsed = $request->getParsedBody();
        if (\is_array($parsed) && $parsed !== []) {
            return $parsed;
        }

        $raw = (string) $request->getBody();
        if ($raw === '') {
            return [];
        }

        $decoded = json_decode($raw, true);

        return \is_array($decoded) ? $decoded : [];
    }

    /**
     * @param array<string,mixed> $payload
     */
    private static function json(ResponseInterface $response, int $status, array $payload): ResponseInterface
    {
        $response->getBody()->write((string) json_encode($payload, JSON_UNESCAPED_SLASHES));

        return $response
            ->withStatus($status)
            ->withHeader('Content-Type', 'application/json');
    }
}
