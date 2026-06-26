<?php

declare(strict_types=1);

namespace ObsidianSync;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\Psr7\Response;

/**
 * Protege as rotas exigindo um header "Authorization: Bearer <token>" valido.
 * Em caso de sucesso, injeta o atributo "auth" (payload do JWT) na request.
 */
final class AuthMiddleware implements MiddlewareInterface
{
    public function __construct(private readonly Jwt $jwt)
    {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $header = $request->getHeaderLine('Authorization');

        if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches)) {
            return $this->unauthorized('Token ausente ou mal formado.');
        }

        try {
            $payload = $this->jwt->decode(trim($matches[1]));
        } catch (\RuntimeException $e) {
            return $this->unauthorized($e->getMessage());
        }

        return $handler->handle($request->withAttribute('auth', $payload));
    }

    private function unauthorized(string $message): ResponseInterface
    {
        $response = new Response(401);
        $response->getBody()->write((string) json_encode([
            'error' => 'unauthorized',
            'message' => $message,
        ], JSON_UNESCAPED_SLASHES));

        return $response->withHeader('Content-Type', 'application/json');
    }
}
