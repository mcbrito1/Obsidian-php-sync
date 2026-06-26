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
    /** @var App<\Psr\Container\ContainerInterface|null> */
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

    public function testManifestReturnsHashes(): void
    {
        $token = $this->authenticate();
        $this->dispatch('POST', '/upload', [
            'path' => 'a.md',
            'content' => base64_encode('conteudo'),
        ], $token);

        $response = $this->dispatch('GET', '/manifest', null, $token);

        self::assertSame(200, $response->getStatusCode());
        $files = $this->jsonOf($response)['files'];
        self::assertSame('a.md', $files[0]['path']);
        self::assertSame(hash('sha256', 'conteudo'), $files[0]['hash']);
    }

    public function testDeleteRemovesFile(): void
    {
        $token = $this->authenticate();
        $this->dispatch('POST', '/upload', [
            'path' => 'lixo.md',
            'content' => base64_encode('x'),
        ], $token);

        $del = $this->dispatch('DELETE', '/file?path=lixo.md', null, $token);
        self::assertSame(200, $del->getStatusCode());
        self::assertTrue($this->jsonOf($del)['deleted']);

        $download = $this->dispatch('GET', '/download?path=lixo.md', null, $token);
        self::assertSame(404, $download->getStatusCode());
    }

    public function testDeleteIsIdempotent(): void
    {
        $token = $this->authenticate();

        $del = $this->dispatch('DELETE', '/file?path=nunca-existiu.md', null, $token);

        self::assertSame(200, $del->getStatusCode());
        self::assertFalse($this->jsonOf($del)['deleted']);
    }

    public function testDeleteRejectsPathTraversal(): void
    {
        $token = $this->authenticate();

        $response = $this->dispatch('DELETE', '/file?path=../escape.md', null, $token);

        self::assertSame(422, $response->getStatusCode());
    }

    public function testUploadBatchStoresMultipleFiles(): void
    {
        $token = $this->authenticate();

        $response = $this->dispatch('POST', '/upload-batch', [
            'files' => [
                ['path' => 'a.md', 'content' => base64_encode('AAA')],
                ['path' => 'sub/b.md', 'content' => base64_encode('BBB')],
            ],
        ], $token);

        self::assertSame(200, $response->getStatusCode());
        self::assertCount(2, $this->jsonOf($response)['files']);

        $list = $this->dispatch('GET', '/list', null, $token);
        $paths = array_column($this->jsonOf($list)['files'], 'path');
        self::assertSame(['a.md', 'sub/b.md'], $paths);
    }

    public function testVaultsAreIsolatedByHeader(): void
    {
        $token = $this->authenticate();

        $this->dispatch('POST', '/upload', [
            'path' => 'nota.md',
            'content' => base64_encode('do cofre A'),
        ], $token, ['X-Vault-Id' => 'alice']);

        // Cofre "bob" não enxerga o arquivo da "alice".
        $listBob = $this->dispatch('GET', '/list', null, $token, ['X-Vault-Id' => 'bob']);
        self::assertSame([], $this->jsonOf($listBob)['files']);

        $listAlice = $this->dispatch('GET', '/list', null, $token, ['X-Vault-Id' => 'alice']);
        self::assertCount(1, $this->jsonOf($listAlice)['files']);
    }

    public function testInvalidVaultIdReturns422(): void
    {
        $token = $this->authenticate();

        $response = $this->dispatch('GET', '/list', null, $token, ['X-Vault-Id' => '../escape']);

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('invalid_vault', $this->jsonOf($response)['error']);
    }

    public function testFileSizeLimitReturns413(): void
    {
        $config = new Config(
            username: 'admin',
            password: 's3cret',
            jwtSecret: 'test-secret',
            jwtTtl: 3600,
            storagePath: $this->storage,
            maxFileSize: 4,
        );
        $app = AppFactory::create($config);

        $auth = (new ServerRequestFactory())->createServerRequest('POST', '/auth')
            ->withHeader('Content-Type', 'application/json');
        $auth->getBody()->write((string) json_encode(['username' => 'admin', 'password' => 's3cret']));
        $auth->getBody()->rewind();
        $token = json_decode((string) $app->handle($auth)->getBody(), true)['token'];

        $req = (new ServerRequestFactory())->createServerRequest('POST', '/upload')
            ->withHeader('Authorization', 'Bearer ' . $token)
            ->withHeader('Content-Type', 'application/json');
        $req->getBody()->write((string) json_encode([
            'path' => 'grande.md',
            'content' => base64_encode('conteudo grande demais'),
        ]));
        $req->getBody()->rewind();

        $response = $app->handle($req);

        self::assertSame(413, $response->getStatusCode());
        self::assertSame('file_too_large', json_decode((string) $response->getBody(), true)['error']);
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
     * @param array<string,string> $headers
     */
    private function dispatch(
        string $method,
        string $path,
        ?array $body = null,
        ?string $token = null,
        array $headers = [],
    ): ResponseInterface {
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

        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
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
