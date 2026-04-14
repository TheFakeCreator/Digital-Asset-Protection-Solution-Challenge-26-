FROM node:20-slim

WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip \
  && rm -rf /var/lib/apt/lists/*

COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile --prod

COPY src ./src
COPY python ./python

RUN pip3 install --no-cache-dir -r python/requirements.txt
RUN mkdir -p /tmp/uploads

EXPOSE 3001
CMD ["node", "src/index.js"]