#!/bin/sh

# Create a cron schedule based on environment
# Default: every minute for testing
CRON_SCHEDULE="${CRON_SCHEDULE:-* * * * *}"

# Add cron job
echo "$CRON_SCHEDULE cd /app && node dist/scrape.js >> /app/out/cron.log 2>&1" > /etc/crontabs/root

# Run cron in foreground
crond -f -l 2