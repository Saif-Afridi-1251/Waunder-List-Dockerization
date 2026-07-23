# syntax=docker/dockerfile:1

FROM node:24.5.0-alpine AS dependencies
WORKDIR /usr/src/app

# Copy dependency manifests first so this layer is cached until dependencies change.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:24.5.0-alpine AS runtime
WORKDIR /usr/src/app

ENV NODE_ENV=production \
    PORT=8080 \
    HOST=0.0.0.0

COPY --from=dependencies /usr/src/app/node_modules ./node_modules
COPY --chown=node:node . .

USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 8080) + '/health').then((r) => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["npm", "start"]
