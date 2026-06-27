<?php

declare(strict_types=1);

namespace ObsidianSync\Tests;

use ObsidianSync\Config;
use ObsidianSync\Users;
use PHPUnit\Framework\TestCase;

final class UsersTest extends TestCase
{
    private function config(string $usersFile = ''): Config
    {
        return new Config(
            username: 'admin',
            password: 's3cret',
            jwtSecret: 'x',
            jwtTtl: 3600,
            storagePath: sys_get_temp_dir(),
            usersFile: $usersFile,
        );
    }

    public function testFallbackSingleUserHasWildcardScope(): void
    {
        $users = Users::fromConfig($this->config());

        $record = $users->verify('admin', 's3cret');
        self::assertNotNull($record);
        self::assertSame('*', $record['vaults']);
    }

    public function testVerifyRejectsWrongPassword(): void
    {
        $users = Users::fromConfig($this->config());

        self::assertNull($users->verify('admin', 'errada'));
        self::assertNull($users->verify('ninguem', 's3cret'));
    }

    public function testLoadsScopedUsersFromFile(): void
    {
        $file = tempnam(sys_get_temp_dir(), 'users') ?: '';
        file_put_contents($file, (string) json_encode([
            'admin' => ['password' => 'adm', 'vaults' => '*'],
            'alice' => ['password' => 'pw', 'vaults' => ['pessoal', 'trabalho']],
        ]));

        try {
            $users = Users::fromConfig($this->config($file));

            $admin = $users->verify('admin', 'adm');
            self::assertNotNull($admin);
            self::assertSame('*', $admin['vaults']);

            $alice = $users->verify('alice', 'pw');
            self::assertNotNull($alice);
            self::assertSame(['pessoal', 'trabalho'], $alice['vaults']);

            self::assertNull($users->verify('alice', 'x'));
        } finally {
            @unlink($file);
        }
    }

    public function testScopeHelpers(): void
    {
        self::assertTrue(Users::isAdmin('*'));
        self::assertFalse(Users::isAdmin(['a']));

        self::assertTrue(Users::allows('*', 'qualquer'));
        self::assertTrue(Users::allows(['a', 'b'], 'b'));
        self::assertFalse(Users::allows(['a', 'b'], 'c'));
        self::assertFalse(Users::allows([], 'a'));
    }

    public function testScopeFromClaim(): void
    {
        self::assertSame('*', Users::scopeFromClaim('*'));
        self::assertSame(['a', 'b'], Users::scopeFromClaim(['a', 'b']));
        self::assertSame([], Users::scopeFromClaim(null)); // ausente -> sem acesso
    }
}
