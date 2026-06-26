<?php

declare(strict_types=1);

namespace ObsidianSync\Tests;

use ObsidianSync\AppFactory;
use ObsidianSync\Config;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class AppTest extends TestCase
{
    private string $storage;
    private App $app;

    protected function setUp(): void
    {
        $this->storage = sys_get_temp_dir() . '/obsidian-app-test-' . uniqid('', true);

        $config = new Config(
            username: 'admin',
            password: 's3cret',
            jwtSecret: 'test-secret',
            jwtTtl: 3600,
            storagePath: $this->storage,
        );

        $this->app = AppFactory::create($config);
    }

    protected function tearDown(): void
    {
        if (is_dir($this->storage)) {
            $items = new \RecursiveIteratorIterator(
                new \RecursiveDirectoryIterator($this->storage, \FilesystemIterator::SKIP_DOTS),
                \RecursiveIteratorIterator::CHILD_FIRST,
            );
            foreach ($items as $item) {
                $item->isDir() ? rmdir($item->getPathname()) : unlink($item->getPathname());
            }
            rmdir($this->storage);
        }
    }

    public function testHealthEndpointIsPublic(): void
    {
        $response = $this->dispatch('GET', '/health');

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['status' => 'ok'], $this->jsonOf($response));
    }

    public function testAuthRejectsInvalidCredentials(): void
    {
        $response = $this->dispatch('POST', '/auth', ['username' => 'admin', 'password' => 'wrong']);

        self::assertSame(401, $response->getStatusCode());
        self::assertSame('invalid_credentials', $this->jsonOf($response)['error']);
    }

    public function testAuthReturnsTokenForValidCredentials(): void
    {
        $token = $this->authenticate();

        self::assertNotEmpty($token);
    }

    public function testProtectedRouteRequiresToken(): void
    {
        $response = $this->dispatch('GET', '/list');

        self::assertSame(401, $response->getStatusCode());
    }

    public function testFullUploadDownloadRoundTrip(): void
    {
        $token = $this->authenticate();
        $original = "# Minha Nota\n\nConteudo com acento: ção.";

        // Upload
        $upload = $this->dispatch('POST', '/upload', [
            'path' => 'Notas/nota.md',
            'content' => base64_encode($original),
        ], $token);
        self::assertSame(200, $upload->getStatusCode());
        self::assertSame('ok', $this->jsonOf($upload)['status']);

        // List
        $list = $this->dispatch('GET', '/list', null, $token);
        self::assertSame(200, $list->getStatusCode());
        $files = $this->jsonOf($list)['files'];
        self::assertSame('Notas/nota.md', $files[0]['path']);

        // Download
        $download = $this->dispatch('GET', '/download?path=Notas/nota.md', null, $token);
        self::assertSame(200, $download->getStatusCode());
        $payload = $this->jsonOf($download);
        self::assertSame($original, base64_decode($payload['content']));
    }

    public function testDownloadMissingFileReturns404(): void
    {
        $token = $this->authenticate();

        $response = $this->dispatch('GET', '/download?path=nao-existe.md', null, $token);

        self::assertSame(404, $response->getStatusCode());
    }

    public function testUploadRejectsPathTraversal(): void
    {
        $token = $this->authenticate();

        $response = $this->dispatch('POST', '/upload', [
            'path' => '../escape.md',
            'content' => base64_encode('x'),
        ], $token);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('invalid_path', $this->jsonOf($response)['error']);
    }

    public function testUploadValidatesRequiredFields(): void
    {
        $token = $this->authenticate();

        $response = $this->dispatch('POST', '/upload', ['content' => base64_encode('x')], $token);

        self::assertSame(422, $response->getStatusCode());
    }

    private function authenticate(): string
    {
        $response = $this->dispatch('POST', '/auth', ['username' => 'admin', 'password' => 's3cret']);
        self::assertSame(200, $response->getStatusCode());

        return $this->jsonOf($response)['token'];
    }

    /**
     * @param array<string,mixed>|null $body
     */
    private function dispatch(string $method, string $path, ?array $body = null, ?string $token = null): ResponseInterface
    {
        $parts = explode('?', $path, 2);
        $uri = $parts[0];
        $query = $parts[1] ?? '';

        $request = (new ServerRequestFactory())->createServerRequest($method, $uri);
        if ($query !== '') {
            parse_str($query, $params);
            $request = $request->withQueryParams($params);
        }

        if ($token !== null) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $token);
        }

        if ($body !== null) {
            $stream = (new StreamFactory())->createStream((string) json_encode($body));
            $request = $request
                ->withHeader('Content-Type', 'application/json')
                ->withBody($stream);
        }

        return $this->app->handle($request);
    }

    /**
     * @return array<string,mixed>
     */
    private function jsonOf(ResponseInterface $response): array
    {
        $response->getBody()->rewind();

        return json_decode((string) $response->getBody(), true);
    }
}
