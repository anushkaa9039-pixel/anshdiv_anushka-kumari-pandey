FROM node:20-alpine
   WORKDIR /app
   COPY . .
   USER node
   ENV PORT=3000
   EXPOSE 3000
   HEALTHCHECK CMD wget -qO- http://localhost:3000/api/health >/dev/null || exit 1
   CMD ["node", "server/server.js"]
