FROM node:20-alpine

WORKDIR /app

# Install cron and build tools for TypeScript
RUN apk add --no-cache bash curl 

# Copy app and install dependencies
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Compile TypeScript (optional)
RUN npx tsc

# Copy entrypoint script
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Start cron in foreground
CMD ["/entrypoint.sh"]