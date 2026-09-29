FROM node:18-slim

RUN apt-get update && apt-get install -y \
    chromium \
    libatk-bridge2.0-0 libatk1.0-0 libatspi2.0-0 libcups2 libdrm2 libgbm1 libgtk-3-0 libnss3 libxcomposite1 libxdamage1 libxrandr2 libxss1 libasound2 \
    libpangocairo-1.0-0 libpango-1.0-0 libcairo2 -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 10000
CMD ["node", "index.js"]
