#!/bin/bash
# Initial SSL certificate setup with certbot
# Usage: ./deploy/init-ssl.sh your-domain.com your@email.com

set -e

DOMAIN=$1
EMAIL=$2

if [ -z "$DOMAIN" ] || [ -z "$EMAIL" ]; then
  echo "Usage: $0 <domain> <email>"
  exit 1
fi

echo "Obtaining SSL certificate for $DOMAIN..."

# Start nginx without SSL first (for ACME challenge)
docker compose -f docker-compose.prod.yml up -d nginx

# Get certificate
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email "$EMAIL" \
  --agree-tos \
  --no-eff-email \
  -d "$DOMAIN"

# Update nginx cert path
sed -i "s|/etc/letsencrypt/live/ai-buyer/|/etc/letsencrypt/live/$DOMAIN/|g" deploy/nginx.conf

# Restart nginx with SSL
docker compose -f docker-compose.prod.yml restart nginx

echo "SSL certificate obtained and configured for $DOMAIN"
