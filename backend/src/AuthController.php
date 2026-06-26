<?php

declare(strict_types=1);

namespace ObsidianSync;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Endpoint de autenticacao. Compara as credenciais recebidas com as
 * credenciais configuradas no ambiente e devolve um token JWT.
 */
final class AuthController
{
    public function __construct(
        private readonly Config $config,
        private readonly Jwt $jwt,
    ) {
    }

    public function login(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $data = self::parseBody($request);

        $username = (string) ($data['username'] ?? '');
        $password = (string) ($data['password'] ?? '');

        $userOk = hash_equals($this->config->username, $username);
        $passOk = hash_equals($this->config->password, $password);

        if (!$userOk || !$passOk) {
            return self::json($response, 401, [
                'error' => 'invalid_credentials',
                'message' => 'Usuario ou senha invalidos.',
            ]);
        }

        $token = $this->jwt->issue($username);

        return self::json($response, 200, [
            'token' => $token,
            'token_type' => 'Bearer',
            'expires_in' => $this->config->jwtTtl,
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
