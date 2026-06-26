# Imagem simples para rodar o backend de sincronizacao do Obsidian.
FROM php:8.3-cli-alpine

# Composer (copiado da imagem oficial).
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer

WORKDIR /app

# Instala as dependencias primeiro (melhor cache de build).
COPY composer.json ./
RUN composer install --no-dev --no-interaction --prefer-dist --no-progress

# Copia o restante da aplicacao.
COPY . .

# Diretorio persistente do cofre.
ENV STORAGE_PATH=/data
VOLUME ["/data"]

EXPOSE 8080

# Servidor embutido do PHP servindo a pasta public/.
CMD ["php", "-S", "0.0.0.0:8080", "-t", "public"]
