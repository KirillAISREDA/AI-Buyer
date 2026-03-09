# AI-Buyer — Гайд по деплою на сервер через Claude Code

## Обзор

Этот документ — пошаговая инструкция для разворачивания AI-Buyer на VPS через Claude Code (CC).
Все команды выполняются на сервере через SSH-сессию CC.

---

## Предварительные требования

### Сервер
- **ОС:** Ubuntu 22.04 или 24.04
- **Минимум:** 2 CPU, 4 GB RAM, 40 GB SSD
- **Порты:** открыты 80, 443 (HTTP/HTTPS)
- **Домен:** привязан A-записью к IP сервера (опционально, но нужен для SSL)

### Что нужно подготовить заранее
- **OpenAI API Key** — для работы AI-сервиса (парсинг счетов, поиск цен)
- **Домен** (если нужен HTTPS) — например, `ai-buyer.example.com`
- **Email** — для регистрации SSL-сертификата Let's Encrypt
- **Telegram Bot Token + Chat ID** — если нужны уведомления (опционально)
- **SMTP-данные** — если нужны email-уведомления (опционально)

---

## Этап 1: Подготовка сервера

### 1.1. Обновление системы

```bash
sudo apt update && sudo apt upgrade -y
```

### 1.2. Установка Docker и Docker Compose

```bash
# Установка Docker
curl -fsSL https://get.docker.com | sh

# Добавить текущего пользователя в группу docker
sudo usermod -aG docker $USER

# Перелогиниться (или newgrp docker)
newgrp docker

# Проверка
docker --version
docker compose version
```

### 1.3. Установка Git

```bash
sudo apt install -y git
```

### 1.4. Настройка файрвола (если используется ufw)

```bash
sudo ufw allow 22/tcp    # SSH
sudo ufw allow 80/tcp    # HTTP
sudo ufw allow 443/tcp   # HTTPS
sudo ufw enable
```

---

## Этап 2: Клонирование проекта

```bash
cd /opt
sudo mkdir -p ai-buyer
sudo chown $USER:$USER ai-buyer
git clone https://github.com/KirillAISREDA/AI-Buyer.git ai-buyer
cd ai-buyer
```

---

## Этап 3: Конфигурация (.env)

### 3.1. Создать файл окружения

```bash
cp .env.example .env
```

### 3.2. Заполнить .env реальными значениями

Открыть в редакторе (`nano .env`) и заполнить:

```env
# ===== ОБЯЗАТЕЛЬНЫЕ =====

# Database
POSTGRES_USER=aibuyer
POSTGRES_PASSWORD=<СГЕНЕРИРОВАТЬ_НАДЁЖНЫЙ_ПАРОЛЬ>
POSTGRES_DB=aibuyer

# Redis
REDIS_PASSWORD=<СГЕНЕРИРОВАТЬ_НАДЁЖНЫЙ_ПАРОЛЬ>

# MinIO (S3-совместимое хранилище файлов)
MINIO_ACCESS_KEY=<СГЕНЕРИРОВАТЬ>
MINIO_SECRET_KEY=<СГЕНЕРИРОВАТЬ_НАДЁЖНЫЙ_ПАРОЛЬ>
MINIO_BUCKET=invoices

# AI Service
OPENAI_API_KEY=sk-...ваш_ключ...
OPENAI_MODEL=gpt-4o

# Auth
JWT_SECRET=<СГЕНЕРИРОВАТЬ_ДЛИННУЮ_СЛУЧАЙНУЮ_СТРОКУ>
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Alerts
ALERT_THRESHOLD_PCT=15

# ===== ОПЦИОНАЛЬНЫЕ =====

# Telegram (уведомления при завышении цен)
TELEGRAM_BOT_TOKEN=
TELEGRAM_CHAT_ID=

# Email (SMTP для отправки отчётов)
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=noreply@ai-buyer.local
MANAGER_EMAIL=
```

### 3.3. Генерация паролей через CC

CC может сгенерировать пароли прямо на сервере:

```bash
# Генерация надёжных паролей
openssl rand -base64 32  # для POSTGRES_PASSWORD
openssl rand -base64 32  # для REDIS_PASSWORD
openssl rand -base64 24  # для MINIO_ACCESS_KEY
openssl rand -base64 32  # для MINIO_SECRET_KEY
openssl rand -base64 48  # для JWT_SECRET
```

---

## Этап 4: Первый запуск (без SSL)

### 4.1. Временная конфигурация nginx для HTTP

Перед получением SSL-сертификата nginx нужно запустить без HTTPS.
Отредактировать `deploy/nginx.conf` — временно убрать блок `server` с `listen 443`
и изменить блок с `listen 80`:

```nginx
upstream backend {
    server backend:3001;
}

upstream frontend {
    server frontend:3000;
}

server {
    listen 80;
    server_name ваш-домен.com;

    client_max_body_size 50M;

    # ACME challenge для certbot
    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    # Backend API
    location /api/ {
        proxy_pass http://backend/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # Frontend
    location / {
        proxy_pass http://frontend;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4.2. Сборка и запуск

```bash
cd /opt/ai-buyer

# Сборка всех образов (первый раз займёт 5-10 минут)
docker compose -f docker-compose.prod.yml build

# Запуск
docker compose -f docker-compose.prod.yml up -d

# Проверить что все контейнеры запустились
docker compose -f docker-compose.prod.yml ps
```

Ожидаемый результат — 7 контейнеров в статусе `Up` / `healthy`:
- `aibuyer_db` (postgres)
- `aibuyer_redis`
- `aibuyer_minio`
- `aibuyer_backend`
- `aibuyer_ai`
- `aibuyer_frontend`
- `aibuyer_nginx`

### 4.3. Проверка health-эндпоинтов

```bash
# Backend
curl http://localhost:80/api/health

# AI Service (через внутреннюю сеть Docker)
docker exec aibuyer_backend curl http://ai-service:8000/health
```

### 4.4. Запуск миграций БД

```bash
docker exec aibuyer_backend npm run migration:run
```

---

## Этап 5: SSL-сертификат (Let's Encrypt)

### 5.1. Получение сертификата

```bash
# Используем готовый скрипт из проекта
chmod +x deploy/init-ssl.sh
./deploy/init-ssl.sh ваш-домен.com ваш@email.com
```

### 5.2. Или вручную

```bash
# Получить сертификат
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email ваш@email.com \
  --agree-tos \
  --no-eff-email \
  -d ваш-домен.com
```

### 5.3. Вернуть полный nginx.conf с HTTPS

Восстановить оригинальный `deploy/nginx.conf` с блоком `listen 443`,
заменив путь к сертификатам на ваш домен:

```nginx
ssl_certificate /etc/letsencrypt/live/ваш-домен.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/ваш-домен.com/privkey.pem;
```

### 5.4. Перезапустить nginx

```bash
docker compose -f docker-compose.prod.yml restart nginx
```

---

## Этап 6: Создание первого пользователя

Backend не имеет публичной регистрации. Первого admin-пользователя нужно создать вручную.

### Вариант A: Через API (если есть seed-endpoint)

```bash
# Проверить, есть ли seed-скрипт
docker exec aibuyer_backend npm run seed
```

### Вариант B: Через БД напрямую

```bash
# Подключиться к PostgreSQL
docker exec -it aibuyer_db psql -U aibuyer -d aibuyer

# Посмотреть структуру таблицы users
\d users

# Создать пользователя (пароль нужно хэшировать через bcrypt)
# Лучше сделать это через backend:
```

### Вариант C: Через CC — попросить написать seed-скрипт

Попросите CC: *"Напиши и запусти seed-скрипт для создания admin-пользователя
с email admin@company.com и паролем ..."*

CC создаст временный TypeScript-скрипт, запустит его внутри контейнера backend
и удалит после выполнения.

---

## Этап 7: Проверка работоспособности

### 7.1. Полный чеклист

```bash
# 1. Все контейнеры работают
docker compose -f docker-compose.prod.yml ps

# 2. Логи без ошибок
docker compose -f docker-compose.prod.yml logs --tail=50 backend
docker compose -f docker-compose.prod.yml logs --tail=50 ai-service
docker compose -f docker-compose.prod.yml logs --tail=50 frontend

# 3. Фронтенд открывается
curl -I https://ваш-домен.com

# 4. API отвечает
curl https://ваш-домен.com/api/health

# 5. Авторизация работает
curl -X POST https://ваш-домен.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@company.com","password":"..."}'

# 6. MinIO bucket создан
docker exec aibuyer_minio mc ls local/invoices 2>/dev/null || \
docker exec aibuyer_minio mc mb local/invoices
```

### 7.2. Тест полного pipeline

1. Открыть `https://ваш-домен.com` в браузере
2. Войти под admin
3. Загрузить тестовый счёт (PDF или фото)
4. Дождаться обработки (статусы: uploaded → parsing → parsed → checking → done)
5. Проверить отчёт с оценками цен

---

## Этап 8: Бэкапы и мониторинг

### 8.1. Автоматический бэкап PostgreSQL

```bash
# Создать скрипт бэкапа
cat > /opt/ai-buyer/backup.sh << 'EOF'
#!/bin/bash
BACKUP_DIR=/opt/ai-buyer/backups
mkdir -p $BACKUP_DIR
DATE=$(date +%Y%m%d_%H%M%S)
docker exec aibuyer_db pg_dump -U aibuyer aibuyer | gzip > $BACKUP_DIR/aibuyer_$DATE.sql.gz
# Удалить бэкапы старше 30 дней
find $BACKUP_DIR -name "*.sql.gz" -mtime +30 -delete
echo "Backup done: aibuyer_$DATE.sql.gz"
EOF
chmod +x /opt/ai-buyer/backup.sh

# Добавить в cron (ежедневно в 3:00)
(crontab -l 2>/dev/null; echo "0 3 * * * /opt/ai-buyer/backup.sh >> /var/log/aibuyer-backup.log 2>&1") | crontab -
```

### 8.2. Мониторинг контейнеров

```bash
# Простой health-check скрипт
cat > /opt/ai-buyer/healthcheck.sh << 'EOF'
#!/bin/bash
SERVICES="aibuyer_db aibuyer_redis aibuyer_minio aibuyer_backend aibuyer_ai aibuyer_frontend aibuyer_nginx"
for svc in $SERVICES; do
  STATUS=$(docker inspect --format='{{.State.Status}}' $svc 2>/dev/null)
  if [ "$STATUS" != "running" ]; then
    echo "ALERT: $svc is $STATUS" | logger -t aibuyer
    # Опционально: отправить в Telegram
  fi
done
EOF
chmod +x /opt/ai-buyer/healthcheck.sh

# Проверять каждые 5 минут
(crontab -l 2>/dev/null; echo "*/5 * * * * /opt/ai-buyer/healthcheck.sh") | crontab -
```

---

## Этап 9: Обновление (деплой новой версии)

```bash
cd /opt/ai-buyer

# Скачать обновления
git pull origin main

# Пересобрать и перезапустить
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d

# Запустить миграции (если были изменения в схеме)
docker exec aibuyer_backend npm run migration:run

# Проверить логи
docker compose -f docker-compose.prod.yml logs --tail=20
```

---

## Типичные проблемы и решения

| Проблема | Диагностика | Решение |
|----------|-------------|---------|
| Контейнер не стартует | `docker logs <container>` | Проверить .env, порты |
| Backend не видит БД | `docker exec aibuyer_backend env \| grep DATABASE` | Проверить POSTGRES_PASSWORD в .env |
| AI-сервис 500 | `docker logs aibuyer_ai` | Проверить OPENAI_API_KEY |
| nginx 502 Bad Gateway | `docker logs aibuyer_nginx` | Backend/frontend не готовы — подождать |
| SSL не работает | `docker logs aibuyer_certbot` | Проверить DNS-запись домена |
| MinIO не доступен | `docker logs aibuyer_minio` | Проверить MINIO_ACCESS_KEY/SECRET_KEY |
| Миграции падают | Лог ошибки миграции | Проверить DATABASE_URL, подключение к postgres |
| Счёт застрял в "parsing" | `docker logs aibuyer_ai` + `docker logs aibuyer_backend` | OpenAI API лимит или ошибка OCR |

---

## Команды CC для управления

Полезные команды, которые можно давать Claude Code:

- *"Покажи логи backend за последние 100 строк"*
- *"Перезапусти ai-service"*
- *"Проверь что все контейнеры healthy"*
- *"Сделай бэкап базы данных"*
- *"Обнови проект до последней версии с main"*
- *"Создай пользователя admin@company.com с ролью admin"*
- *"Покажи, сколько счетов обработано и есть ли ошибки"*

---

## Архитектура деплоя (справочно)

```
Internet
    │
    ▼
┌─────────┐
│  Nginx  │ :80/:443 — SSL termination, reverse proxy
└────┬────┘
     │
     ├──► Frontend (Next.js :3000) — SPA-интерфейс
     │
     └──► Backend (NestJS :3001) — REST API
              │
              ├──► PostgreSQL+pgvector — данные, история цен
              ├──► Redis — очереди BullMQ, кэш, сессии
              ├──► MinIO — хранение файлов счетов
              └──► AI Service (FastAPI :8000)
                       │
                       └──► OpenAI API — парсинг, оценка цен
```

**Контейнеры Docker (8 штук):**
postgres, redis, minio, backend, ai-service, frontend, nginx, certbot
