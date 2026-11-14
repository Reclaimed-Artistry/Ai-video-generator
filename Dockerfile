FROM node:22-bookworm-slim

# libass inside ffmpeg-static needs fontconfig + DejaVu fonts to burn captions
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates fontconfig fonts-dejavu-core \
  && fc-cache -f \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN chmod +x ./scripts/docker-entrypoint.sh

# Build-time placeholder so Next.js module evaluation succeeds before runtime secrets attach
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build" npm run build

ENV PORT=3000
ENV STORAGE_DIR=/app/storage
EXPOSE 3000

ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
