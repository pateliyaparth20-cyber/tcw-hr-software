FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/super-admin/package.json apps/super-admin/package.json
COPY prisma prisma
RUN npm ci
COPY . .
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
ENV NEXT_TELEMETRY_DISABLED=1
ENV API_INTERNAL_URL=http://api:4000
RUN npm run build
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 3000 3001 4000
CMD ["npm","run","start:api"]
