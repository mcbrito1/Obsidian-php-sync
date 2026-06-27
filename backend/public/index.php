<?php

declare(strict_types=1);

use ObsidianSync\AppFactory;

require __DIR__ . '/../vendor/autoload.php';

// Carrega um arquivo .env simples (KEY=VALUE), se existir, sem dependencias externas.
$envFile = __DIR__ . '/../.env';
if (is_file($envFile)) {
    foreach ((file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []) as $line) {
        $line = trim($line);
        if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
            continue;
        }
        [$key, $value] = explode('=', $line, 2);
        $key = trim($key);
        $value = trim($value, " \t\"'");
        if (getenv($key) === false) {
            putenv("{$key}={$value}");
            $_ENV[$key] = $value;
        }
    }
}

AppFactory::create()->run();
