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
}
