<?php

declare(strict_types=1);

namespace ObsidianSync;

/**
 * Responsavel por ler/gravar arquivos do cofre dentro de um diretorio raiz,
 * sempre impedindo "path traversal" (ex.: ../../etc/passwd).
 */
final class Storage
{
    /** Subpasta (oculta) onde versoes anteriores sao guardadas. */
    private const VERSIONS_DIR = '.versions';

    private readonly string $root;

    /**
     * @param int $keepVersions numero de versoes anteriores a manter (0 = desativado).
     */
    public function __construct(string $root, private readonly int $keepVersions = 0)
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

        if ($segments[0] === self::VERSIONS_DIR) {
            throw new \InvalidArgumentException('Caminho reservado.');
        }

        return $this->root . DIRECTORY_SEPARATOR . implode(DIRECTORY_SEPARATOR, $segments);
    }

    /**
     * Grava o conteudo no caminho informado (criando subpastas se necessario).
     */
    public function write(string $relativePath, string $contents): void
    {
        $absolute = $this->resolve($relativePath);

        // Versiona o conteudo anterior antes de sobrescrever.
        if ($this->keepVersions > 0 && is_file($absolute)) {
            $this->snapshot($relativePath, $absolute);
        }

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

    /** Hash sha256 do conteudo de um arquivo (hex). */
    public function hash(string $relativePath): string
    {
        $absolute = $this->resolve($relativePath);
        if (!is_file($absolute)) {
            throw new \RuntimeException("Arquivo nao encontrado: {$relativePath}");
        }

        $hash = hash_file('sha256', $absolute);
        if ($hash === false) {
            throw new \RuntimeException("Falha ao calcular o hash de: {$relativePath}");
        }

        return $hash;
    }

    /**
     * Remove um arquivo do cofre. E idempotente: retorna false se ja nao existia.
     */
    public function delete(string $relativePath): bool
    {
        $absolute = $this->resolve($relativePath);
        if (!is_file($absolute)) {
            return false;
        }

        // Guarda uma versao antes de remover (soft-delete).
        if ($this->keepVersions > 0) {
            $this->snapshot($relativePath, $absolute);
        }

        if (!@unlink($absolute)) {
            throw new \RuntimeException("Falha ao remover o arquivo: {$relativePath}");
        }

        return true;
    }

    /**
     * Copia a versao atual de um arquivo para `.versions/<path>.<timestamp>` e
     * mantem apenas as $keepVersions copias mais recentes.
     */
    private function snapshot(string $relativePath, string $absolute): void
    {
        $versionDir = $this->root . DIRECTORY_SEPARATOR . self::VERSIONS_DIR
            . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        $parent = \dirname($versionDir);

        if (!is_dir($parent) && !@mkdir($parent, 0775, true) && !is_dir($parent)) {
            throw new \RuntimeException("Nao foi possivel criar o diretorio de versoes: {$parent}");
        }

        $base = basename($relativePath);
        $stamp = sprintf('%d.%06d', time(), random_int(0, 999999));
        @copy($absolute, $parent . DIRECTORY_SEPARATOR . $base . '.' . $stamp);

        $this->pruneVersions($parent, $base);
    }

    private function pruneVersions(string $parent, string $base): void
    {
        $matches = glob($parent . DIRECTORY_SEPARATOR . $base . '.*') ?: [];
        if (\count($matches) <= $this->keepVersions) {
            return;
        }

        // Mais antigos primeiro; remove o excedente.
        usort($matches, static fn (string $a, string $b): int => filemtime($a) <=> filemtime($b));
        $excess = \count($matches) - $this->keepVersions;
        for ($i = 0; $i < $excess; $i++) {
            @unlink($matches[$i]);
        }
    }

    /**
     * Localiza a pasta e o prefixo das versoes de um arquivo.
     *
     * @return array{0:string,1:string} [pasta das versoes, nome base do arquivo]
     */
    private function versionLocation(string $relativePath): array
    {
        $this->resolve($relativePath); // valida (traversal, .versions reservado, etc.)

        $versionDir = $this->root . DIRECTORY_SEPARATOR . self::VERSIONS_DIR
            . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);

        return [\dirname($versionDir), basename($relativePath)];
    }

    /**
     * Lista as versoes anteriores guardadas de um arquivo (mais recentes primeiro).
     *
     * @return list<array{id:string,size:int,mtime:int}>
     */
    public function listVersions(string $relativePath): array
    {
        [$parent, $base] = $this->versionLocation($relativePath);

        $matches = glob($parent . DIRECTORY_SEPARATOR . $base . '.*') ?: [];

        $versions = [];
        foreach ($matches as $file) {
            $id = substr(basename($file), \strlen($base) + 1);
            $versions[] = [
                'id' => $id,
                'size' => (int) filesize($file),
                'mtime' => (int) filemtime($file),
            ];
        }

        usort($versions, static fn (array $a, array $b): int => $b['mtime'] <=> $a['mtime']);

        return $versions;
    }

    /**
     * Le o conteudo de uma versao especifica.
     *
     * @throws \InvalidArgumentException quando o id e mal formado.
     * @throws \RuntimeException quando a versao nao existe.
     */
    public function readVersion(string $relativePath, string $id): string
    {
        if (!preg_match('/^\d+\.\d+$/', $id)) {
            throw new \InvalidArgumentException('Identificador de versao invalido.');
        }

        [$parent, $base] = $this->versionLocation($relativePath);
        $file = $parent . DIRECTORY_SEPARATOR . $base . '.' . $id;

        if (!is_file($file)) {
            throw new \RuntimeException("Versao nao encontrada: {$relativePath}@{$id}");
        }

        $contents = file_get_contents($file);
        if ($contents === false) {
            throw new \RuntimeException("Falha ao ler a versao: {$relativePath}@{$id}");
        }

        return $contents;
    }

    /**
     * Lista todos os arquivos do cofre como caminhos relativos (com "/"),
     * acompanhados de hash, tamanho e data de modificacao.
     *
     * @param bool $withHash quando true, inclui o sha256 de cada arquivo.
     *
     * @return list<array{path:string,hash:string,size:int,mtime:int}>
     */
    public function list(bool $withHash = true): array
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

            // Nao expoe o historico de versoes na listagem.
            if (str_starts_with($relative, self::VERSIONS_DIR . '/')) {
                continue;
            }

            $files[] = [
                'path' => $relative,
                'hash' => $withHash ? (string) hash_file('sha256', $file->getPathname()) : '',
                'size' => $file->getSize(),
                'mtime' => $file->getMTime(),
            ];
        }

        usort($files, static fn (array $a, array $b): int => strcmp($a['path'], $b['path']));

        return $files;
    }
}
