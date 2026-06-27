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

        // CORS opcional: quando CORS_ALLOW_ORIGIN estiver configurado, adiciona os
        // headers necessarios em todas as respostas e responde ao preflight OPTIONS.
        if ($config->corsAllowOrigin !== '') {
            $corsOrigin = $config->corsAllowOrigin;
            $app->add(static function (
                ServerRequestInterface $request,
                \Psr\Http\Server\RequestHandlerInterface $handler,
            ) use ($corsOrigin): ResponseInterface {
                $response = $handler->handle($request);
                return $response
                    ->withHeader('Access-Control-Allow-Origin', $corsOrigin)
                    ->withHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
                    ->withHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Vault-Id');
            });

            // Rota catch-all para preflight OPTIONS.
            $app->options('/{routes:.+}', static function (
                ServerRequestInterface $request,
                ResponseInterface $response,
            ): ResponseInterface {
                return $response->withStatus(204);
            });
        }

        // Trata erros como JSON (sem expor detalhes internos por padrao).
        $errorMiddleware = $app->addErrorMiddleware($config->appDebug, true, true);
        $errorMiddleware->setDefaultErrorHandler(static function (
            ServerRequestInterface $request,
            \Throwable $exception,
        ) use ($app, $config): ResponseInterface {
            $isHttp = $exception instanceof \Slim\Exception\HttpException;
            $status = $isHttp ? $exception->getCode() : 500;

            $message = ($isHttp || $config->appDebug)
                ? $exception->getMessage()
                : 'Erro interno.';

            $response = $app->getResponseFactory()->createResponse($status);
            $response->getBody()->write((string) json_encode([
                'error' => 'request_failed',
                'message' => $message,
            ], JSON_UNESCAPED_SLASHES));

            return $response->withHeader('Content-Type', 'application/json');
        });

        $users = Users::fromConfig($config);
        $auth = new AuthController($config, $jwt, $users);
        $sync = new SyncController($vaults, $config->maxFileSize);
        $vaultCtrl = new VaultController($vaults);
        $authMiddleware = new AuthMiddleware($jwt);
        $vaultAccess = new VaultAccessMiddleware($vaults);

        // Healthcheck publico.
        $app->get('/health', static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $response->getBody()->write((string) json_encode(['status' => 'ok']));

            return $response->withHeader('Content-Type', 'application/json');
        });

        // Autenticacao publica.
        $app->post('/auth', [$auth, 'login']);

        // Rotas protegidas por Bearer token.
        $app->group('', static function (RouteCollectorProxy $group) use ($sync, $vaultCtrl, $vaultAccess): void {
            // Rotas que operam sobre um cofre (header X-Vault-Id): exigem acesso ao cofre.
            $group->group('', static function (RouteCollectorProxy $data) use ($sync): void {
                $data->post('/upload', [$sync, 'upload']);
                $data->post('/upload-batch', [$sync, 'uploadBatch']);
                $data->get('/download', [$sync, 'download']);
                $data->get('/list', [$sync, 'list']);
                $data->get('/manifest', [$sync, 'list']);
                $data->get('/versions', [$sync, 'versions']);
                $data->get('/version', [$sync, 'version']);
                $data->delete('/file', [$sync, 'delete']);
            })->add($vaultAccess);

            // Gestao de cofres (listagem filtrada por escopo; mutacoes admin-only).
            $group->get('/vaults', [$vaultCtrl, 'index']);
            $group->post('/vaults', [$vaultCtrl, 'create']);
            $group->put('/vaults/{id}', [$vaultCtrl, 'rename']);
            $group->delete('/vaults/{id}', [$vaultCtrl, 'delete']);
        })->add($authMiddleware);

        return $app;
    }
}
