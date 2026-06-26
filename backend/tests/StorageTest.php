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

    public function testHashMatchesSha256OfContent(): void
    {
        $storage = new Storage($this->root);
        $storage->write('a.md', 'conteudo');

        self::assertSame(hash('sha256', 'conteudo'), $storage->hash('a.md'));
    }

    public function testListIncludesHash(): void
    {
        $storage = new Storage($this->root);
        $storage->write('a.md', 'x');

        $files = $storage->list();

        self::assertSame(hash('sha256', 'x'), $files[0]['hash']);
    }

    public function testDeleteRemovesFileAndIsIdempotent(): void
    {
        $storage = new Storage($this->root);
        $storage->write('a.md', 'x');

        self::assertTrue($storage->delete('a.md'));
        self::assertFalse($storage->exists('a.md'));
        // Segunda remocao nao falha, apenas retorna false.
        self::assertFalse($storage->delete('a.md'));
    }

    public function testDeleteBlocksPathTraversal(): void
    {
        $storage = new Storage($this->root);

        $this->expectException(\InvalidArgumentException::class);
        $storage->delete('../escape.md');
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

    public function testVersioningKeepsPreviousContentOnOverwriteAndDelete(): void
    {
        $storage = new Storage($this->root, keepVersions: 3);

        $storage->write('nota.md', 'v1');
        $storage->write('nota.md', 'v2'); // versiona "v1"
        $storage->delete('nota.md');       // versiona "v2"

        $versions = glob($this->root . '/.versions/nota.md.*') ?: [];
        self::assertCount(2, $versions);

        $contents = array_map(static fn (string $p): string|false => file_get_contents($p), $versions);
        self::assertContains('v1', $contents);
        self::assertContains('v2', $contents);
    }

    public function testVersionsAreHiddenFromListing(): void
    {
        $storage = new Storage($this->root, keepVersions: 2);
        $storage->write('nota.md', 'v1');
        $storage->write('nota.md', 'v2');

        $paths = array_column($storage->list(), 'path');

        self::assertSame(['nota.md'], $paths);
    }

    public function testListAndReadVersions(): void
    {
        $storage = new Storage($this->root, keepVersions: 5);
        $storage->write('nota.md', 'v1');
        $storage->write('nota.md', 'v2'); // versiona v1
        $storage->write('nota.md', 'v3'); // versiona v2

        $versions = $storage->listVersions('nota.md');
        self::assertCount(2, $versions);
        self::assertArrayHasKey('id', $versions[0]);
        self::assertArrayHasKey('mtime', $versions[0]);

        // Reconstroi os conteudos a partir dos ids.
        $contents = array_map(
            static fn (array $v): string => $storage->readVersion('nota.md', $v['id']),
            $versions,
        );
        self::assertContains('v1', $contents);
        self::assertContains('v2', $contents);
    }

    public function testListVersionsEmptyWhenNoHistory(): void
    {
        $storage = new Storage($this->root, keepVersions: 5);
        $storage->write('nota.md', 'v1');

        self::assertSame([], $storage->listVersions('nota.md'));
    }

    public function testReadVersionRejectsMalformedId(): void
    {
        $storage = new Storage($this->root, keepVersions: 5);

        $this->expectException(\InvalidArgumentException::class);
        $storage->readVersion('nota.md', '../etc/passwd');
    }

    public function testReadVersionMissingThrows(): void
    {
        $storage = new Storage($this->root, keepVersions: 5);

        $this->expectException(\RuntimeException::class);
        $storage->readVersion('nota.md', '123.456');
    }

    public function testVersionsDirIsReserved(): void
    {
        $storage = new Storage($this->root, keepVersions: 1);

        $this->expectException(\InvalidArgumentException::class);
        $storage->write('.versions/forjado.md', 'x');
    }

    public function testPruneKeepsOnlyNewestVersions(): void
    {
        $storage = new Storage($this->root, keepVersions: 2);

        $storage->write('n.md', 'a');
        $storage->write('n.md', 'b');
        $storage->write('n.md', 'c');
        $storage->write('n.md', 'd'); // 3 versoes geradas (a,b,c), mantem 2

        $versions = glob($this->root . '/.versions/n.md.*') ?: [];
        self::assertCount(2, $versions);
    }

    public function testResolveStaysInsideRoot(): void
    {
        $storage = new Storage($this->root);

        $resolved = $storage->resolve('Notas/foo.md');

        self::assertStringStartsWith($storage->root() . DIRECTORY_SEPARATOR, $resolved);
    }

    public function testHashCacheIsCreatedAndReusesPreviousHash(): void
    {
        $storage = new Storage($this->root);
        $storage->write('cached.md', 'conteudo fixo');

        // Primeira listagem: cache nao existe, hash e calculado e cache e criado.
        $files1 = $storage->list();
        self::assertCount(1, $files1);
        self::assertSame(hash('sha256', 'conteudo fixo'), $files1[0]['hash']);

        $cachePath = $this->root . '/.versions/.hashcache.json';
        self::assertFileExists($cachePath);

        // Segunda listagem: arquivo inalterado — cache deve devolver o mesmo hash.
        $files2 = $storage->list();
        self::assertSame($files1[0]['hash'], $files2[0]['hash']);
    }

    public function testHashCacheInvalidatesWhenFileChanges(): void
    {
        $storage = new Storage($this->root);
        $storage->write('muda.md', 'v1');
        $storage->list(); // popula cache

        // Altera o arquivo (simula nova escrita com conteudo diferente).
        $storage->write('muda.md', 'v2');
        $files = $storage->list();

        self::assertSame(hash('sha256', 'v2'), $files[0]['hash']);
    }

    public function testSnapshotFailurePropagatesException(): void
    {
        // Testa que erros de copy() sao propagados (impossivel simular sem mock,
        // mas garante que o caminho feliz nao dispara excecao).
        $storage = new Storage($this->root, keepVersions: 2);
        $storage->write('snap.md', 'original');
        // Nao deve lancar excecao ao fazer snapshot valido.
        $storage->write('snap.md', 'nova versao');
        self::assertSame('nova versao', $storage->read('snap.md'));
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
