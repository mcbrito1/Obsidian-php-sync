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
