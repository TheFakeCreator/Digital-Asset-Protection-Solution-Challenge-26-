FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY src ./src
COPY python ./python

RUN mkdir -p uploads

EXPOSE 3001

CMD ["node", "src/index.js"]