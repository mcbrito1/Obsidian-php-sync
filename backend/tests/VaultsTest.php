<?php

declare(strict_types=1);

namespace ObsidianSync\Tests;

use ObsidianSync\Vaults;
use PHPUnit\Framework\TestCase;

final class VaultsTest extends TestCase
{
    private string $base;

    protected function setUp(): void
    {
        $this->base = sys_get_temp_dir() . '/obsidian-vaults-test-' . uniqid('', true);
    }

    protected function tearDown(): void
    {
        if (!is_dir($this->base)) {
            return;
        }
        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->base, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($this->base);
    }

    public function testVaultIsolatesContent(): void
    {
        $vaults = new Vaults($this->base);

        $vaults->for('alice')->write('nota.md', 'da alice');
        $vaults->for('bob')->write('nota.md', 'do bob');

        self::assertSame('da alice', $vaults->for('alice')->read('nota.md'));
        self::assertSame('do bob', $vaults->for('bob')->read('nota.md'));
        self::assertFalse($vaults->for('alice')->exists('outra.md'));
    }

    public function testEmptyIdBecomesDefault(): void
    {
        $vaults = new Vaults($this->base);
        self::assertSame('default', $vaults->normalizeId(''));
        self::assertSame('default', $vaults->normalizeId('  '));
    }

    /**
     * @dataProvider invalidIds
     */
    public function testRejectsDangerousIds(string $id): void
    {
        $vaults = new Vaults($this->base);

        $this->expectException(\InvalidArgumentException::class);
        $vaults->normalizeId($id);
    }

    /**
     * @return array<string,array{0:string}>
     */
    public static function invalidIds(): array
    {
        return [
            'traversal' => ['../etc'],
            'slash' => ['a/b'],
            'dotdot' => ['..'],
            'space' => ['my vault'],
        ];
    }

    public function testListEnumeratesExistingVaults(): void
    {
        $vaults = new Vaults($this->base);
        $vaults->for('alice')->write('a.md', 'x');
        $vaults->for('bob')->write('b.md', 'y');

        self::assertSame(['alice', 'bob'], $vaults->list());
    }

    public function testListIsEmptyWhenNoVaults(): void
    {
        $vaults = new Vaults($this->base . '/inexistente');
        self::assertSame([], $vaults->list());
    }

    public function testCreateAndExists(): void
    {
        $vaults = new Vaults($this->base);

        self::assertFalse($vaults->exists('novo'));
        self::assertSame('novo', $vaults->create('novo'));
        self::assertTrue($vaults->exists('novo'));
    }

    public function testCreateRejectsDuplicate(): void
    {
        $vaults = new Vaults($this->base);
        $vaults->create('dup');

        $this->expectException(\RuntimeException::class);
        $vaults->create('dup');
    }

    public function testRenameMovesContent(): void
    {
        $vaults = new Vaults($this->base);
        $vaults->for('antigo')->write('nota.md', 'conteudo');

        self::assertSame('novo', $vaults->rename('antigo', 'novo'));
        self::assertFalse($vaults->exists('antigo'));
        self::assertSame('conteudo', $vaults->for('novo')->read('nota.md'));
    }

    public function testRenameFailsWhenDestinationExists(): void
    {
        $vaults = new Vaults($this->base);
        $vaults->create('a');
        $vaults->create('b');

        $this->expectException(\RuntimeException::class);
        $vaults->rename('a', 'b');
    }

    public function testDeleteRemovesVaultAndIsIdempotent(): void
    {
        $vaults = new Vaults($this->base);
        $vaults->for('lixo')->write('nota.md', 'x');

        self::assertTrue($vaults->delete('lixo'));
        self::assertFalse($vaults->exists('lixo'));
        self::assertFalse($vaults->delete('lixo'));
    }
}
