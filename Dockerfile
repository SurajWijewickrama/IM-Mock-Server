FROM node:20-alpine

WORKDIR /app

# Install dependencies first for better layer caching.
COPY package*.json ./
RUN npm install --omit=dev

# Copy the rest of the app.
COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
