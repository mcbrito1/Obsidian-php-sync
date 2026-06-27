<?php

declare(strict_types=1);

namespace ObsidianSync;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

/**
 * Garante que o usuario autenticado tem acesso ao cofre indicado no header
 * X-Vault-Id. Deve rodar depois do AuthMiddleware (que injeta o atributo "auth").
 */
final class VaultAccessMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly Vaults $vaults)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $auth = $request->getAttribute('auth');
        $scope = Users::scopeFromClaim(\is_array($auth) ? ($auth['vaults'] ?? null) : null);

        try {
            $vaultId = $this->vaults->normalizeId($request->getHeaderLine('X-Vault-Id'));
        } catch (\InvalidArgumentException $e) {
            return $this->error(422, 'invalid_vault', $e->getMessage());
        }

        if (!Users::allows($scope, $vaultId)) {
            return $this->error(403, 'forbidden_vault', "Sem acesso ao cofre: {$vaultId}");
        }

        return $handler->handle($request);
    }

    private function error(int $status, string $error, string $message): ResponseInterface
    {
        $response = new Response($status);
        $response->getBody()->write((string) json_encode([
            'error' => $error,
            'message' => $message,
        ], JSON_UNESCAPED_SLASHES));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
