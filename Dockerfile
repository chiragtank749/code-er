ARG BASE_IMAGE=node:22-alpine
FROM ${BASE_IMAGE}
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY lab ./lab
RUN mkdir -p /data && chown node:node /data
USER node
ENV PORT=3000 HOST=0.0.0.0 DATA_DIR=/data
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "lab/server.mjs"]
