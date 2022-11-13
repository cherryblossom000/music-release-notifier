# syntax=docker/dockerfile:1

FROM node:16-alpine AS workspace
WORKDIR /app

RUN apk --no-cache add curl
RUN curl -f https://get.pnpm.io/v6.16.js | node - add --global pnpm

# https://pnpm.io/cli/fetch
COPY pnpm-lock.yaml .
RUN pnpm fetch

COPY . .
RUN pnpm i --offline
RUN pnpm build

FROM workspace
ARG port=3000
COPY --from=workspace /app .

EXPOSE $port
ENTRYPOINT ["node", "."]
