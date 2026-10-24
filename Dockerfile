FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
COPY --chown=node:node . .
RUN npm run check && npm test \
    && mkdir -p /data && chown node:node /data
USER node
EXPOSE 3000
CMD ["node", "server.mjs"]
