<?php

declare(strict_types=1);

namespace ObsidianSync;

/**
 * Responsavel por ler/gravar arquivos do cofre dentro de um diretorio raiz,
 * sempre impedindo "path traversal" (ex.: ../../etc/passwd).
 */
final class Storage
{
    private readonly string $root;

    public function __construct(string $root)
    {
        if (!is_dir($root) && !@mkdir($root, 0775, true) && !is_dir($root)) {
            throw new \RuntimeException("Nao foi possivel criar o diretorio de armazenamento: {$root}");
        }

        $real = realpath($root);
        if ($real === false) {
            throw new \RuntimeException("Diretorio de armazenamento invalido: {$root}");
        }

        $this->root = $real;
    }

    public function root(): string
    {
        return $this->root;
    }

    /**
     * Normaliza um caminho relativo recebido do cliente e garante que ele
     * permaneca dentro da raiz de armazenamento.
     *
     * @throws \InvalidArgumentException quando o caminho e invalido ou escapa da raiz.
     */
    public function resolve(string $relativePath): string
    {
        $relativePath = str_replace('\\', '/', trim($relativePath));

        if ($relativePath === '') {
            throw new \InvalidArgumentException('Caminho vazio.');
        }

        if (str_contains($relativePath, "\0")) {
            throw new \InvalidArgumentException('Caminho invalido.');
        }

        $segments = [];
        foreach (explode('/', $relativePath) as $segment) {
            if ($segment === '' || $segment === '.') {
                continue;
            }
            if ($segment === '..') {
                throw new \InvalidArgumentException('Travessia de diretorio nao permitida.');
            }
            $segments[] = $segment;
        }

        if ($segments === []) {
            throw new \InvalidArgumentException('Caminho invalido.');
        }

        return $this->root . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $segments);
    }

    /**
     * Grava o conteudo no caminho informado (criando subpastas se necessario).
     */
    public function write(string $relativePath, string $contents): void
    {
        $absolute = $this->resolve($relativePath);
        $dir = \dirname($absolute);

        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("Nao foi possivel criar a pasta: {$dir}");
        }

        if (file_put_contents($absolute, $contents) === false) {
            throw new \RuntimeException("Falha ao gravar o arquivo: {$relativePath}");
        }
    }

    public function exists(string $relativePath): bool
    {
        return is_file($this->resolve($relativePath));
    }

    public function read(string $relativePath): string
    {
        $absolute = $this->resolve($relativePath);
        if (!is_file($absolute)) {
            throw new \RuntimeException("Arquivo nao encontrado: {$relativePath}");
        }

        $contents = file_get_contents($absolute);
        if ($contents === false) {
            throw new \RuntimeException("Falha ao ler o arquivo: {$relativePath}");
        }

        return $contents;
    }

    /**
     * Lista todos os arquivos do cofre como caminhos relativos (com "/"),
     * acompanhados de tamanho e data de modificacao.
     *
     * @return list<array{path:string,size:int,mtime:int}>
     */
    public function list(): array
    {
        $iterator = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($this->root, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::LEAVES_ONLY,
        );

        $files = [];
        /** @var \SplFileInfo $file */
        foreach ($iterator as $file) {
            if (!$file->isFile()) {
                continue;
            }

            $relative = substr($file->getPathname(), \strlen($this->root) + 1);
            $relative = str_replace('\\', '/', $relative);

            $files[] = [
                'path' => $relative,
                'size' => $file->getSize(),
                'mtime' => $file->getMTime(),
            ];
        }

        usort($files, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']));

        return $files;
    }
}
