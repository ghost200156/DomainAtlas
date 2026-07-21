FROM node:24-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
WORKDIR /app

FROM base AS development-dependencies-env
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS production-dependencies-env
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

FROM base AS build-env
COPY --from=development-dependencies-env /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM base
COPY package.json ./
COPY --from=production-dependencies-env /app/node_modules ./node_modules
COPY --from=build-env /app/build ./build
CMD ["node", "node_modules/@react-router/serve/bin.cjs", "./build/server/index.js"]
