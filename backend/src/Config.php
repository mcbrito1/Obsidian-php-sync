<?php

declare(strict_types=1);

namespace ObsidianSync;

/**
 * Configuracao da aplicacao carregada a partir de variaveis de ambiente,
 * com valores padrao seguros para facilitar o teste local.
 *
 * As credenciais sao "hardcoded" via ambiente para simplificar a instalacao,
 * exatamente como pedido nos requisitos.
 */
final class Config
{
    public function __construct(
        public readonly string $username,
        public readonly string $password,
        public readonly string $jwtSecret,
        public readonly int $jwtTtl,
        public readonly string $storagePath,
        public readonly int $maxFileSize = 0,
        public readonly int $keepVersions = 0,
        public readonly bool $appDebug = false,
        public readonly string $corsAllowOrigin = '',
        public readonly string $usersFile = '',
    ) {
    }

    /**
     * Cria a configuracao a partir do ambiente ($_ENV / getenv()).
     *
     * @param array<string,string> $env
     */
    public static function fromEnvironment(array $env = []): self
    {
        $get = static function (string $key, string $default) use ($env): string {
            if (array_key_exists($key, $env)) {
                return $env[$key];
            }
            $value = getenv($key);

            return $value === false ? $default : $value;
        };

        $defaultStorage = \dirname(__DIR__) . DIRECTORY_SEPARATOR . 'storage';

        return new self(
            username: $get('SYNC_USER', 'admin'),
            password: $get('SYNC_PASSWORD', 'changeme'),
            jwtSecret: $get('JWT_SECRET', 'please-change-this-secret-in-production'),
            jwtTtl: (int) $get('JWT_TTL', '86400'),
            storagePath: $get('STORAGE_PATH', $defaultStorage),
            maxFileSize: (int) $get('MAX_FILE_SIZE', '0'),
            keepVersions: (int) $get('KEEP_VERSIONS', '0'),
            appDebug: in_array(strtolower($get('APP_DEBUG', 'false')), ['true', '1', 'yes'], true),
            corsAllowOrigin: $get('CORS_ALLOW_ORIGIN', ''),
            usersFile: $get('USERS_FILE', ''),
        );
    }
}
