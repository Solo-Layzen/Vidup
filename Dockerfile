FROM node:20-slim

# yt-dlp + ffmpeg (indispensables pour le traitement vidéo)
RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod +x /usr/local/bin/yt-dlp \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Les dépendances d'abord : cette couche reste en cache tant que package.json
# ne change pas (builds Render plus rapides).
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund

COPY . .

# Builder l'application
RUN npm run build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Render fournit son propre PORT (10000 par défaut) ; 3000 sert au `docker run` local.
ENV PORT=3000
EXPOSE 3000

# `next start` écoute sur 0.0.0.0 et lit automatiquement la variable PORT.
CMD ["npm", "run", "start"]
