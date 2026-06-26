<?php

declare(strict_types=1);

namespace ObsidianSync\Tests;

use ObsidianSync\Storage;
use PHPUnit\Framework\TestCase;

final class StorageTest extends TestCase
{
    private string $root;

    protected function setUp(): void
    {
        $this->root = sys_get_temp_dir() . '/obsidian-sync-test-' . uniqid('', true);
    }

    protected function tearDown(): void
    {
        if (is_dir($this->root)) {
            $this->removeDir($this->root);
        }
    }

    public function testWriteCreatesNestedDirectoriesAndReadsBack(): void
    {
        $storage = new Storage($this->root);

        $storage->write('Notas/Diario/2026-06-26.md', '# Ola mundo');

        self::assertTrue($storage->exists('Notas/Diario/2026-06-26.md'));
        self::assertSame('# Ola mundo', $storage->read('Notas/Diario/2026-06-26.md'));
    }

    public function testListReturnsSortedRelativePaths(): void
    {
        $storage = new Storage($this->root);
        $storage->write('b.md', 'b');
        $storage->write('a/c.md', 'cc');

        $files = $storage->list();
        $paths = array_column($files, 'path');

        self::assertSame(['a/c.md', 'b.md'], $paths);
        self::assertSame(2, $files[0]['size']); // "cc"
        self::assertSame(1, $files[1]['size']); // "b"
    }

    public function testWriteSupportsBinaryContent(): void
    {
        $storage = new Storage($this->root);
        $binary = random_bytes(256);

        $storage->write('anexos/img.bin', $binary);

        self::assertSame($binary, $storage->read('anexos/img.bin'));
    }

    /**
     * @dataProvider maliciousPaths
     */
    public function testResolveBlocksPathTraversal(string $path): void
    {
        $storage = new Storage($this->root);

        $this->expectException(\InvalidArgumentException::class);
        $storage->resolve($path);
    }

    /**
     * @return array<string,array{0:string}>
     */
    public static function maliciousPaths(): array
    {
        return [
            'parent traversal' => ['../escape.md'],
            'nested traversal' => ['Notas/../../escape.md'],
            'empty' => [''],
            'only slashes' => ['///'],
            'null byte' => ["foo\0.md"],
        ];
    }

    public function testResolveStaysInsideRoot(): void
    {
        $storage = new Storage($this->root);

        $resolved = $storage->resolve('Notas/foo.md');

        self::assertStringStartsWith($storage->root() . DIRECTORY_SEPARATOR, $resolved);
    }

    private function removeDir(string $dir): void
    {
        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
        }
        rmdir($dir);
    }
}
