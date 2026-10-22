# Minimal build, added from docker-compose.yml's side (J10) since frontend/ had no Dockerfile
# yet. Darsh owns frontend/** -- please review/adjust (build args, nginx config, etc.) rather
# than treat this as final. Only used behind docker-compose's "web" profile; nothing else
# depends on it.
FROM node:22-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Vite env vars are baked in at build time, not read at container runtime -- the browser talks
# to the backend directly at this URL, not through the docker network, so it must be reachable
# from the host (localhost:4000), not the in-network service name.
ARG VITE_API_BASE_URL=http://localhost:4000/api
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_USE_MOCK=false
ENV VITE_USE_MOCK=$VITE_USE_MOCK
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
