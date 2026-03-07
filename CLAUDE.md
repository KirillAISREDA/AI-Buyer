# CLAUDE.md — Инструкции для Claude Code

## Проект: AI-Buyer

AI-система автоматического контроля закупок. Принимает счета от поставщиков, извлекает данные через AI, сравнивает цены с рынком и историей, формирует отчёты.

## Стек

- **Backend**: NestJS + TypeScript + PostgreSQL (pgvector) + Redis (BullMQ) + MinIO
- **AI Service**: Python + FastAPI + OpenAI API + Tesseract/PaddleOCR
- **Frontend**: Next.js 14 (App Router) + React + TypeScript + Tailwind CSS + Zustand + Recharts

## Структура проекта

```
/backend       — NestJS API (порт 3001)
/ai-service    — Python FastAPI (порт 8000)
/frontend      — Next.js (порт 3000)
/deploy        — Dockerfiles, nginx, скрипты деплоя
```

## Команды

### Backend
```bash
cd backend
npm install
npm run start:dev          # запуск в dev-режиме
npm run build              # сборка
npm run test               # тесты
npm run migration:run      # миграции TypeORM
npm run migration:generate -- -n MigrationName
npm run lint               # ESLint
```

### AI Service
```bash
cd ai-service
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000   # dev
pytest                                       # тесты
```

### Frontend
```bash
cd frontend
npm install
npm run dev                # dev-сервер на :3000
npm run build              # production build
npm run lint               # ESLint + TypeScript check
```

### Docker (всё вместе)
```bash
docker compose up -d                          # локальная разработка
docker compose -f docker-compose.prod.yml up  # продакшн
```

## Конвенции кода

### Backend (NestJS)
- Каждый модуль в отдельной папке: `module.ts`, `controller.ts`, `service.ts`, `*.entity.ts`, `*.dto.ts`
- Используй TypeORM для работы с PostgreSQL
- DTO через class-validator + class-transformer
- Все ответы через стандартные NestJS exceptions (HttpException, NotFoundException и т.д.)
- Конфигурация через @nestjs/config + .env
- Swagger через @nestjs/swagger — документируй все endpoints

### AI Service (Python)
- FastAPI + Pydantic v2 для моделей
- Промпты для LLM хранить в `/ai-service/app/prompts/` как .txt или .py
- Каждый сервис в отдельном файле в `services/`
- Используй httpx для HTTP-запросов (async)
- Логирование через structlog
- Все endpoint-ы в `routers/`

### Frontend (Next.js)
- App Router (папка `app/`)
- Server Components по умолчанию, Client Components только где нужна интерактивность
- Стили — только Tailwind CSS (никакого CSS Modules)
- Состояние — Zustand (не Redux)
- API-вызовы через `/lib/api.ts` (обёртка над fetch)
- Формы — react-hook-form + zod

## Переменные окружения (.env)

```env
# Database
DATABASE_URL=postgresql://aibuyer:password@localhost:5432/aibuyer

# Redis
REDIS_URL=redis://localhost:6379

# MinIO
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin
MINIO_BUCKET=invoices

# AI Service
AI_SERVICE_URL=http://localhost:8000
OPENAI_API_KEY=sk-...

# Auth
JWT_SECRET=your-secret-here
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# Telegram
TELEGRAM_BOT_TOKEN=...
```

## База данных

- PostgreSQL 16 + расширение pgvector
- Миграции через TypeORM (backend)
- Основные таблицы: organizations, users, suppliers, invoices, invoice_items, products, price_history, reports
- Все ID — UUID
- Все даты — TIMESTAMPTZ

## Порядок реализации (для Claude Code)

### Шаг 1: Инициализация проекта
1. Создай корневой `package.json` (workspaces не нужны — отдельные проекты)
2. Инициализируй NestJS backend: `nest new backend --strict`
3. Инициализируй Next.js frontend: `npx create-next-app@latest frontend --typescript --tailwind --app --src-dir`
4. Инициализируй Python AI service: создай структуру с FastAPI
5. Создай `docker-compose.yml` с postgres (pgvector), redis, minio
6. Создай `.env.example`

### Шаг 2: Backend — Auth и Users
1. Настрой TypeORM + PostgreSQL connection
2. Создай entities: Organization, User
3. Реализуй AuthModule: register, login (JWT), refresh token
4. Реализуй UsersModule: CRUD, роли (admin/manager/uploader)
5. Создай Guards: JwtAuthGuard, RolesGuard

### Шаг 3: Backend — Invoices (загрузка)
1. Настрой MinIO client (nestjs-minio или @aws-sdk/client-s3)
2. Создай Invoice entity + миграцию
3. Реализуй InvoicesModule: upload file → save to MinIO → create record
4. Настрой BullMQ: producer (при загрузке) + consumer (обработка)
5. Endpoint для получения статуса обработки

### Шаг 4: AI Service — Парсинг
1. Создай FastAPI app с health check
2. Реализуй OCR pipeline: PDF → images → text (Tesseract)
3. Реализуй LLM extraction: text → structured JSON (OpenAI)
4. Реализуй парсинг XLSX (openpyxl) и DOCX (python-docx)
5. Endpoint POST /api/v1/parse-invoice

### Шаг 5: Связка Backend ↔ AI
1. Backend BullMQ worker вызывает AI service для парсинга
2. Результат сохраняется в invoice.raw_data
3. Создаются записи invoice_items
4. Обновляется статус invoice

### Шаг 6: AI — Поиск цен и оценка
1. Реализуй price_search: поиск цен через Perplexity/SerpAPI
2. Реализуй evaluator: сравнение цен (рынок vs счёт vs история)
3. Реализуй нормализацию товаров и эмбеддинги
4. Backend: обновляй invoice_items с рыночными ценами и оценками

### Шаг 7: Frontend — MVP
1. Layout: sidebar navigation, header с user info
2. Login page
3. Dashboard: последние счета, статистика
4. Invoice upload page: drag & drop + прогресс
5. Invoice detail page: таблица позиций с оценками
6. Suppliers list page

### Шаг 8: Уведомления
1. Telegram Bot: отправка отчёта по завершении проверки
2. Email: nodemailer с шаблонами

### Шаг 9: Деплой
1. Dockerfiles для каждого сервиса
2. docker-compose.prod.yml
3. nginx.conf с SSL (certbot)
4. GitHub Actions workflow

## Важные правила

- **Не используй** monorepo tools (nx, turborepo) — держи проекты отдельными
- **Всегда** добавляй Swagger декораторы к endpoints
- **Всегда** валидируй входные данные (DTO в NestJS, Pydantic в Python)
- **Никогда** не храни секреты в коде — только .env
- **Используй** transactions в PostgreSQL для связанных операций
- **Пиши** осмысленные commit messages на английском
- **Создавай** миграции для каждого изменения схемы БД
