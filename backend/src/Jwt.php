<?php

declare(strict_types=1);

namespace ObsidianSync;

/**
 * Implementacao minima e auto-contida de JWT (HS256).
 *
 * Evita dependencias externas mantendo o backend leve e 100% testavel.
 * Cobre apenas o necessario para autenticacao Bearer: emitir e validar tokens.
 */
final class Jwt
{
    public function __construct(
        private readonly string $secret,
        private readonly int $ttl = 86400,
    ) {
    }

    /**
     * Emite um token assinado para o "subject" informado.
     *
     * @param array<string,mixed> $extraClaims
     */
    public function issue(string $subject, array $extraClaims = [], ?int $now = null): string
    {
        $now ??= time();

        $header = ['alg' => 'HS256', 'typ' => 'JWT'];
        $payload = array_merge($extraClaims, [
            'sub' => $subject,
            'iat' => $now,
            'exp' => $now + $this->ttl,
        ]);

        $segments = [
            self::base64UrlEncode(self::jsonEncode($header)),
            self::base64UrlEncode(self::jsonEncode($payload)),
        ];

        $signingInput = implode('.', $segments);
        $segments[] = self::base64UrlEncode($this->sign($signingInput));

        return implode('.', $segments);
    }

    /**
     * Valida o token e retorna o payload decodificado.
     *
     * @return array<string,mixed>
     *
     * @throws \RuntimeException quando o token e invalido, mal formado ou expirou.
     */
    public function decode(string $token, ?int $now = null): array
    {
        $now ??= time();

        $parts = explode('.', $token);
        if (\count($parts) !== 3) {
            throw new \RuntimeException('Token mal formado.');
        }

        [$encodedHeader, $encodedPayload, $encodedSignature] = $parts;

        $expected = $this->sign($encodedHeader . '.' . $encodedPayload);
        $provided = self::base64UrlDecode($encodedSignature);

        if (!hash_equals($expected, $provided)) {
            throw new \RuntimeException('Assinatura invalida.');
        }

        $payload = json_decode(self::base64UrlDecode($encodedPayload), true);
        if (!\is_array($payload)) {
            throw new \RuntimeException('Payload invalido.');
        }

        if (isset($payload['exp']) && $now >= (int) $payload['exp']) {
            throw new \RuntimeException('Token expirado.');
        }

        return $payload;
    }

    private function sign(string $input): string
    {
        return hash_hmac('sha256', $input, $this->secret, true);
    }

    private static function jsonEncode(mixed $value): string
    {
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);
    }

    private static function base64UrlEncode(string $data): string
    {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }

    private static function base64UrlDecode(string $data): string
    {
        $remainder = \strlen($data) % 4;
        if ($remainder !== 0) {
            $data .= str_repeat('=', 4 - $remainder);
        }

        $decoded = base64_decode(strtr($data, '-_', '+/'), true);

        return $decoded === false ? '' : $decoded;
    }
}
