<?php

declare(strict_types=1);

namespace ObsidianSync;

use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Factory\AppFactory as SlimAppFactory;
use Slim\Routing\RouteCollectorProxy;

/**
 * Monta a aplicacao Slim com todas as rotas e dependencias.
 * Manter isto separado do public/index.php permite testar o app de ponta a ponta.
 */
final class AppFactory
{
    /**
     * @return App<\Psr\Container\ContainerInterface|null>
     */
    public static function create(?Config $config = null): App
    {
        $config ??= Config::fromEnvironment();

        $jwt = new Jwt($config->jwtSecret, $config->jwtTtl);
        $vaults = new Vaults($config->storagePath, $config->keepVersions);

        $app = SlimAppFactory::create();
        $app->addRoutingMiddleware();

        // Trata erros como JSON (sem expor detalhes internos por padrao).
        $errorMiddleware = $app->addErrorMiddleware(true, true, true);
        $errorMiddleware->setDefaultErrorHandler(static function (
            ServerRequestInterface $request,
            \Throwable $exception,
        ) use ($app): ResponseInterface {
            $status = $exception instanceof \Slim\Exception\HttpException
                ? $exception->getCode()
                : 500;

            $response = $app->getResponseFactory()->createResponse($status);
            $response->getBody()->write((string) json_encode([
                'error' => 'request_failed',
                'message' => $exception->getMessage(),
            ], JSON_UNESCAPED_SLASHES));

            return $response->withHeader('Content-Type', 'application/json');
        });

        $auth = new AuthController($config, $jwt);
        $sync = new SyncController($vaults, $config->maxFileSize);
        $authMiddleware = new AuthMiddleware($jwt);

        // Healthcheck publico.
        $app->get('/health', static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write((string) json_encode(['status' => 'ok']));

            return $response->withHeader('Content-Type', 'application/json');
        });

        // Autenticacao publica.
        $app->post('/auth', [$auth, 'login']);

        // Rotas protegidas por Bearer token.
        $app->group('', static function (RouteCollectorProxy $group) use ($sync): void {
            $group->post('/upload', [$sync, 'upload']);
            $group->post('/upload-batch', [$sync, 'uploadBatch']);
            $group->get('/download', [$sync, 'download']);
            $group->get('/list', [$sync, 'list']);
            $group->get('/manifest', [$sync, 'list']);
            $group->get('/versions', [$sync, 'versions']);
            $group->get('/version', [$sync, 'version']);
            $group->delete('/file', [$sync, 'delete']);
        })->add($authMiddleware);

        return $app;
    }
}
