<?php

declare(strict_types=1);

namespace ObsidianSync\Tests;

use ObsidianSync\Jwt;
use PHPUnit\Framework\TestCase;

final class JwtTest extends TestCase
{
    public function testIssueAndDecodeRoundTrip(): void
    {
        $jwt = new Jwt('secret', 3600);

        $token = $jwt->issue('admin', ['role' => 'owner'], now: 1000);
        $payload = $jwt->decode($token, now: 1001);

        self::assertSame('admin', $payload['sub']);
        self::assertSame('owner', $payload['role']);
        self::assertSame(1000, $payload['iat']);
        self::assertSame(4600, $payload['exp']);
    }

    public function testRejectsTamperedSignature(): void
    {
        $jwt = new Jwt('secret');
        $token = $jwt->issue('admin');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Assinatura invalida.');
        $jwt->decode($token . 'x');
    }

    public function testRejectsTokenSignedWithDifferentSecret(): void
    {
        $issuer = new Jwt('secret-a');
        $verifier = new Jwt('secret-b');

        $token = $issuer->issue('admin');

        $this->expectException(\RuntimeException::class);
        $verifier->decode($token);
    }

    public function testRejectsExpiredToken(): void
    {
        $jwt = new Jwt('secret', 100);
        $token = $jwt->issue('admin', now: 1000);

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Token expirado.');
        $jwt->decode($token, now: 2000);
    }

    public function testRejectsMalformedToken(): void
    {
        $jwt = new Jwt('secret');

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('Token mal formado.');
        $jwt->decode('not-a-jwt');
    }
}
