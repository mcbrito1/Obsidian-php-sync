<?php

declare(strict_types=1);

namespace ObsidianSync;

/**
 * Registro de usuarios e seus escopos de acesso a cofres.
 *
 * Sem USERS_FILE configurado, mantem o comportamento antigo: um unico usuario
 * (SYNC_USER/SYNC_PASSWORD) com acesso a todos os cofres ("*").
 *
 * Com USERS_FILE, carrega um JSON no formato:
 *   {
 *     "admin": { "password": "...", "vaults": "*" },
 *     "alice": { "password": "...", "vaults": ["pessoal", "trabalho"] }
 *   }
 */
final class Users
{
    /**
     * @param array<string,array{password:string,vaults:string[]|string}> $users
     */
    public function __construct(private readonly array $users)
    {
    }

    public static function fromConfig(Config $config): self
    {
        if ($config->usersFile !== '' && is_file($config->usersFile)) {
            $raw = file_get_contents($config->usersFile);
            if ($raw !== false) {
                $decoded = json_decode($raw, true);
                if (\is_array($decoded)) {
                    return new self(self::normalize($decoded));
                }
            }
        }

        // Fallback: usuario unico do ambiente, com acesso a todos os cofres.
        return new self([
            $config->username => ['password' => $config->password, 'vaults' => '*'],
        ]);
    }

    /**
     * @param array<mixed> $raw
     * @return array<string,array{password:string,vaults:string[]|string}>
     */
    private static function normalize(array $raw): array
    {
        $users = [];
        foreach ($raw as $name => $entry) {
            if (!\is_string($name) || !\is_array($entry)) {
                continue;
            }

            $password = isset($entry['password']) ? (string) $entry['password'] : '';
            $rawVaults = $entry['vaults'] ?? '*';

            if (\is_array($rawVaults)) {
                $vaults = array_values(array_map(static fn ($v): string => (string) $v, $rawVaults));
            } elseif ($rawVaults === '*') {
                $vaults = '*';
            } elseif (\is_string($rawVaults) && $rawVaults !== '') {
                $vaults = [$rawVaults];
            } else {
                $vaults = []; // valor inesperado -> sem acesso (restritivo)
            }

            $users[$name] = ['password' => $password, 'vaults' => $vaults];
        }

        return $users;
    }

    /**
     * Valida credenciais; retorna o registro do usuario ou null.
     *
     * @return array{password:string,vaults:string[]|string}|null
     */
    public function verify(string $username, string $password): ?array
    {
        $record = $this->users[$username] ?? null;
        if ($record === null) {
            return null;
        }

        if (!hash_equals($record['password'], $password)) {
            return null;
        }

        return $record;
    }

    /**
     * Normaliza um claim de escopo do token (mixed do JWT) para "*" ou lista.
     *
     * @return string[]|string
     */
    public static function scopeFromClaim(mixed $claim): array|string
    {
        if ($claim === '*') {
            return '*';
        }
        if (\is_array($claim)) {
            return array_values(array_map(static fn ($v): string => (string) $v, $claim));
        }

        return []; // ausente/desconhecido -> sem acesso
    }

    /**
     * @param string[]|string $scope
     */
    public static function allows(array|string $scope, string $vaultId): bool
    {
        if ($scope === '*') {
            return true;
        }

        return \is_array($scope) && \in_array($vaultId, $scope, true);
    }

    /**
     * @param string[]|string $scope
     */
    public static function isAdmin(array|string $scope): bool
    {
        return $scope === '*';
    }
}
