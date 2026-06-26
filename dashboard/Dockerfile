# Imagem de desenvolvimento do dashboard (Vite com hot-reload).
FROM node:20-alpine

WORKDIR /app

# Instala dependencias primeiro (melhor cache). O codigo e montado via volume
# no docker-compose, entao o node_modules fica em um volume anonimo.
COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5173

CMD ["npm", "run", "dev", "--", "--host"]
