<?php

declare(strict_types=1);

namespace ObsidianSync;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Gestao de cofres: listar, criar, renomear e excluir.
 *
 * - Listagem: filtrada pelo escopo do usuario.
 * - Mutacoes (criar/renomear/excluir): apenas administradores (escopo "*").
 */
final class VaultController
{
    public function __construct(private readonly Vaults $vaults)
    {
    }

    /** GET /vaults -> { vaults: [ids...] } (filtrado pelo escopo). */
    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $scope = self::scope($request);
        $all = $this->vaults->list();

        $visible = \is_array($scope)
            ? array_values(array_filter($all, static fn (string $id): bool => \in_array($id, $scope, true)))
            : $all;

        return self::json($response, 200, ['vaults' => $visible]);
    }

    /** POST /vaults  body { id } (admin). */
    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        if (!Users::isAdmin(self::scope($request))) {
            return self::forbidden($response);
        }

        $data = self::parseBody($request);
        $id = (string) ($data['id'] ?? '');
        if ($id === '') {
            return self::json($response, 422, ['error' => 'invalid_request', 'message' => 'Campo "id" e obrigatorio.']);
        }

        try {
            $created = $this->vaults->create($id);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_vault', 'message' => $e->getMessage()]);
        } catch (\RuntimeException $e) {
            return self::json($response, 409, ['error' => 'conflict', 'message' => $e->getMessage()]);
        }

        return self::json($response, 201, ['status' => 'ok', 'vault' => $created]);
    }

    /**
     * PUT /vaults/{id}  body { newId } (admin).
     *
     * @param array<string,string> $args
     */
    public function rename(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!Users::isAdmin(self::scope($request))) {
            return self::forbidden($response);
        }

        $data = self::parseBody($request);
        $newId = (string) ($data['newId'] ?? '');
        if ($newId === '') {
            return self::json($response, 422, ['error' => 'invalid_request', 'message' => 'Campo "newId" e obrigatorio.']);
        }

        try {
            $renamed = $this->vaults->rename($args['id'] ?? '', $newId);
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_vault', 'message' => $e->getMessage()]);
        } catch (\RuntimeException $e) {
            return self::json($response, 409, ['error' => 'conflict', 'message' => $e->getMessage()]);
        }

        return self::json($response, 200, ['status' => 'ok', 'vault' => $renamed]);
    }

    /**
     * DELETE /vaults/{id} (admin). Idempotente.
     *
     * @param array<string,string> $args
     */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        if (!Users::isAdmin(self::scope($request))) {
            return self::forbidden($response);
        }

        try {
            $deleted = $this->vaults->delete($args['id'] ?? '');
        } catch (\InvalidArgumentException $e) {
            return self::json($response, 422, ['error' => 'invalid_vault', 'message' => $e->getMessage()]);
        }

        return self::json($response, 200, ['status' => 'ok', 'deleted' => $deleted]);
    }

    /**
     * @return string[]|string
     */
    private static function scope(ServerRequestInterface $request): array|string
    {
        $auth = $request->getAttribute('auth');

        return Users::scopeFromClaim(\is_array($auth) ? ($auth['vaults'] ?? null) : null);
    }

    private static function forbidden(ResponseInterface $response): ResponseInterface
    {
        return self::json($response, 403, [
            'error' => 'forbidden',
            'message' => 'Apenas administradores podem gerenciar cofres.',
        ]);
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
