<?php

declare(strict_types=1);

namespace ObsidianSync;

/**
 * Resolve um identificador de cofre (header X-Vault-Id) para um Storage isolado
 * em seu proprio subdiretorio, permitindo multiplos cofres no mesmo servidor.
 */
final class Vaults
{
    public function __construct(
        private readonly string $basePath,
        private readonly int $keepVersions = 0,
    ) {
    }

    public function for(string $vaultId): Storage
    {
        $id = $this->normalizeId($vaultId);

        return new Storage($this->basePath . DIRECTORY_SEPARATOR . $id, $this->keepVersions);
    }

    /**
     * Lista os ids dos cofres existentes (subdiretorios validos), ordenados.
     *
     * @return list<string>
     */
    public function list(): array
    {
        if (!is_dir($this->basePath)) {
            return [];
        }

        $ids = [];
        foreach (scandir($this->basePath) ?: [] as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            if (!is_dir($this->basePath . DIRECTORY_SEPARATOR . $entry)) {
                continue;
            }
            // Ignora diretorios com nomes que nao sao ids validos.
            if (!preg_match('/^[A-Za-z0-9._-]+$/', $entry) || str_contains($entry, '..')) {
                continue;
            }
            $ids[] = $entry;
        }

        sort($ids);

        return $ids;
    }

    public function exists(string $vaultId): bool
    {
        return is_dir($this->basePath . DIRECTORY_SEPARATOR . $this->normalizeId($vaultId));
    }

    /**
     * Cria um cofre vazio.
     *
     * @throws \InvalidArgumentException id invalido.
     * @throws \RuntimeException quando ja existe ou falha ao criar.
     */
    public function create(string $vaultId): string
    {
        $id = $this->normalizeId($vaultId);
        $dir = $this->basePath . DIRECTORY_SEPARATOR . $id;

        if (is_dir($dir)) {
            throw new \RuntimeException("Cofre ja existe: {$id}");
        }
        if (!@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new \RuntimeException("Falha ao criar o cofre: {$id}");
        }

        return $id;
    }

    /**
     * Renomeia um cofre.
     *
     * @throws \InvalidArgumentException ids invalidos.
     * @throws \RuntimeException origem inexistente ou destino ja existente.
     */
    public function rename(string $from, string $to): string
    {
        $fromId = $this->normalizeId($from);
        $toId = $this->normalizeId($to);
        $fromDir = $this->basePath . DIRECTORY_SEPARATOR . $fromId;
        $toDir = $this->basePath . DIRECTORY_SEPARATOR . $toId;

        if (!is_dir($fromDir)) {
            throw new \RuntimeException("Cofre nao encontrado: {$fromId}");
        }
        if (is_dir($toDir)) {
            throw new \RuntimeException("Cofre destino ja existe: {$toId}");
        }
        if (!@rename($fromDir, $toDir)) {
            throw new \RuntimeException("Falha ao renomear o cofre.");
        }

        return $toId;
    }

    /** Remove um cofre e todo o seu conteudo. Idempotente. */
    public function delete(string $vaultId): bool
    {
        $id = $this->normalizeId($vaultId);
        $dir = $this->basePath . DIRECTORY_SEPARATOR . $id;

        if (!is_dir($dir)) {
            return false;
        }

        $items = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );
        foreach ($items as $item) {
            $item->isDir() ? @rmdir($item->getPathname()) : @unlink($item->getPathname());
        }

        return @rmdir($dir);
    }

    /**
     * Valida e normaliza o id do cofre. Vazio vira "default".
     *
     * @throws \InvalidArgumentException quando o id contem caracteres perigosos.
     */
    public function normalizeId(string $vaultId): string
    {
        $id = trim($vaultId);
        if ($id === '') {
            return 'default';
        }

        if (!preg_match('/^[A-Za-z0-9._-]+$/', $id) || str_contains($id, '..')) {
            throw new \InvalidArgumentException('Identificador de cofre invalido.');
        }

        return $id;
    }
}
