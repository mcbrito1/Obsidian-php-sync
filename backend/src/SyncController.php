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
    public function __construct(private readonly Storage $storage)
    {
    }

    /**
     * POST /upload
     * Body JSON: { "path": "Notas/foo.md", "content": "<base64>" }
     */
    public function upload(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = self::parseBody($request);

        $path = isset($data['path']) ? (string) $data['path'] : '';
        if ($path === '') {
            return self::json($response, 422, [
                'error' => 'invalid_request',
                'message' => 'Campo "path" e obrigatorio.',
            ]);
        }

        if (!array_key_exists('content', $data)) {
            return self::json($response, 422, [
                'error' => 'invalid_request',
                'message' => 'Campo "content" e obrigatorio.',
            ]);
        }

        $decoded = base64_decode((string) $data['content'], true);
        if ($decoded === false) {
            return self::json($response, 422, [
                'error' => 'invalid_request',
                'message' => 'Campo "content" deve estar em base64 valido.',
            ]);
        }

        try {
            $this->storage->write($path, $decoded);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_path', 'message' => $e->getMessage()]);
        }

        return self::json($response, 200, [
            'status' => 'ok',
            'path' => $path,
            'size' => \strlen($decoded),
        ]);
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
            if (!$this->storage->exists($path)) {
                return self::json($response, 404, [
                    'error' => 'not_found',
                    'message' => "Arquivo nao encontrado: {$path}",
                ]);
            }

            $contents = $this->storage->read($path);
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
     * GET /list -> { "files": [ { "path", "size", "mtime" }, ... ] }
     */
    public function list(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return self::json($response, 200, ['files' => $this->storage->list()]);
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
