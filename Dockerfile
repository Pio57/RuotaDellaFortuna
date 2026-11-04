# Fase 1: build del frontend React (Vite) in public/
FROM node:20-alpine AS build
WORKDIR /srv
COPY package.json package-lock.json vite.config.js ./
RUN npm ci
COPY web ./web
RUN npm run build

# Fase 2: solo server e file statici, una sola dipendenza (ws)
FROM node:20-alpine
WORKDIR /srv
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY --from=build /srv/public ./public
ENV NODE_ENV=production PORT=3000 HOST=0.0.0.0 DATA_FILE=/data/sessions.json
EXPOSE 3000
USER node
CMD ["node", "server/index.js"]
