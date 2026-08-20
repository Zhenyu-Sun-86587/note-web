FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
COPY tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/server/package.json apps/server/package.json
COPY apps/server/tsconfig.json apps/server/tsconfig.json
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package*.json ./
COPY --from=build /app/apps/server/package.json apps/server/package.json
RUN npm ci --omit=dev --workspace apps/server
COPY --from=build /app/apps/server/dist apps/server/dist
COPY --from=build /app/apps/web/dist apps/web/dist

USER node
EXPOSE 3000
CMD ["node", "apps/server/dist/index.js"]
