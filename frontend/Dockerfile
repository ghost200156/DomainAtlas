FROM node:24-alpine AS base
WORKDIR /app

FROM base AS development-dependencies-env
COPY package.json package-lock.json ./
RUN npm ci

FROM base AS production-dependencies-env
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM base AS build-env
COPY --from=development-dependencies-env /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base
COPY package.json ./
COPY --from=production-dependencies-env /app/node_modules ./node_modules
COPY --from=build-env /app/build ./build
CMD ["node", "node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"]
