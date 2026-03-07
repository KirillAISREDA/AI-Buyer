# AI-Buyer — Архитектура продукта

## 1. Концепция

**AI-Buyer** — система автоматического контроля закупок с использованием ИИ. Вдохновлена идеей «Ревизора» (Totum Online), но реализована на современном стеке с собственной архитектурой.

### Что делает система

1. **Принимает счета** — загрузка документов (PDF, DOCX, XLSX, фото) от снабженцев
2. **Извлекает данные** — AI парсит документ: поставщик, позиции, цены, НДС, допрасходы
3. **Проверяет цены** — ищет рыночные цены через веб-поиск и сравнивает с историей закупок
4. **Формирует отчёт** — оценка каждой позиции: норма / завышение / требует внимания
5. **Уведомляет** — отправляет отчёт в Telegram / email ответственному лицу
6. **Копит историю** — ведёт базу закупок, строит аналитику по поставщикам и ценовой динамике

### Целевая аудитория

- Строительные компании (закупка МТР)
- Производственные предприятия (закупка сырья и комплектующих)
- Ритейл (регулярные закупки товаров)
- Любой бизнес с регулярными закупками у множества поставщиков

---

## 2. Технологический стек

| Компонент | Технология | Назначение |
|-----------|-----------|------------|
| Backend API | NestJS (TypeScript) | REST/GraphQL API, бизнес-логика, авторизация |
| Database | PostgreSQL + pgvector | Хранение данных + векторный поиск товаров |
| AI Service | Python (FastAPI) | OCR, парсинг документов, LLM-вызовы, веб-поиск цен |
| Frontend | Next.js + React + TypeScript | SPA-интерфейс для пользователей |
| Queue | BullMQ (Redis) | Асинхронная обработка счетов |
| Cache | Redis | Кэш, сессии, очереди задач |
| File Storage | MinIO (S3-compatible) | Хранение загруженных документов |
| Notifications | — | Telegram Bot API, email (nodemailer) |

---

## 3. Архитектура системы

```
┌─────────────────────────────────────────────────────────┐
│                      FRONTEND                            │
│              Next.js + React + TypeScript                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │Dashboard │ │ Счета    │ │Поставщики│ │ Аналитика  │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
└────────────────────────┬────────────────────────────────┘
                         │ HTTP/WebSocket
┌────────────────────────▼────────────────────────────────┐
│                    BACKEND (NestJS)                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │
│  │Auth      │ │Invoices  │ │Suppliers │ │Reports     │ │
│  │Module    │ │Module    │ │Module    │ │Module      │ │
│  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐                │
│  │Users     │ │Products  │ │Notify    │                │
│  │Module    │ │Module    │ │Module    │                │
│  └──────────┘ └──────────┘ └──────────┘                │
└───────┬─────────────┬──────────────┬────────────────────┘
        │             │              │
   ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
   │PostgreSQL│   │ Redis   │   │ MinIO   │
   │+pgvector │   │(BullMQ) │   │  (S3)   │
   └─────────┘   └────┬────┘   └─────────┘
                      │
              ┌───────▼────────┐
              │  AI SERVICE    │
              │  (Python/      │
              │   FastAPI)     │
              │ ┌────────────┐ │
              │ │Doc Parser  │ │  ← OCR + LLM extraction
              │ │Price Search│ │  ← Web search + comparison
              │ │Evaluator   │ │  ← Price assessment
              │ │Embeddings  │ │  ← Vector search matching
              │ └────────────┘ │
              └────────────────┘
```

---

## 4. Модули Backend (NestJS)

### 4.1 Auth Module
- JWT-аутентификация (access + refresh tokens)
- Роли: `admin`, `manager` (ревизор), `uploader` (снабженец)
- Guards и декораторы для RBAC

### 4.2 Users Module
- CRUD пользователей
- Привязка к организации (multi-tenant)
- Профили и настройки уведомлений

### 4.3 Invoices Module (ключевой)
- Загрузка файлов счетов → сохранение в MinIO
- Создание задачи на обработку → BullMQ
- Статусы: `uploaded` → `processing` → `parsed` → `checking` → `done` / `error`
- CRUD по счетам, фильтрация, пагинация

### 4.4 Products Module
- Справочник товарных позиций (автопополнение при обработке счетов)
- Нормализация наименований (через AI)
- Хранение эмбеддингов для векторного поиска похожих товаров
- История цен по позициям

### 4.5 Suppliers Module
- Справочник поставщиков (автопополнение при обработке)
- Статистика по поставщику: средний уровень цен, отклонения
- Привязка юрлиц одного поставщика

### 4.6 Reports Module
- Генерация отчётов по счёту: позиции, рыночные цены, оценка
- Сводные отчёты: по периоду, поставщику, категории
- Экспорт в PDF / XLSX

### 4.7 Notifications Module
- Telegram Bot (отправка отчётов, алерты о завышениях)
- Email-уведомления
- Настраиваемые правила (порог завышения, обязательные уведомления)

---

## 5. AI Service (Python / FastAPI)

### 5.1 Endpoints

```
POST /api/v1/parse-invoice        — Парсинг документа (OCR + LLM)
POST /api/v1/search-prices        — Поиск рыночных цен по позиции
POST /api/v1/evaluate-invoice     — Комплексная оценка счёта
POST /api/v1/normalize-product    — Нормализация названия товара
POST /api/v1/embed-product        — Генерация эмбеддинга товара
POST /api/v1/find-similar         — Поиск похожих товаров (vector search)
GET  /api/v1/health               — Health check
```

### 5.2 Парсинг документа (Pipeline)

```
Файл → Определение формата → OCR (если нужно) → LLM-извлечение данных
                                                        ↓
                                              Структурированный JSON:
                                              {
                                                supplier: {...},
                                                items: [{name, qty, unit, price, total}],
                                                vat: {included: bool, rate: 20, amount: ...},
                                                extra_costs: [{type: "delivery", amount: ...}],
                                                total: ...,
                                                currency: "RUB"
                                              }
```

### 5.3 Технологии AI Service

| Задача | Инструмент |
|--------|-----------|
| OCR | Tesseract / PaddleOCR / GPT-4o vision |
| Парсинг таблиц из PDF | Camelot / pdfplumber |
| Парсинг XLSX/DOCX | openpyxl / python-docx |
| LLM для извлечения данных | OpenAI GPT-4o / GPT-4o-mini |
| Веб-поиск цен | Perplexity API / SerpAPI / Custom scraper |
| Оценка стоимости | OpenAI GPT-4o-mini (structured output) |
| Эмбеддинги | OpenAI text-embedding-3-small |
| Векторный поиск | pgvector (через PostgreSQL) |

---

## 6. Схема базы данных (PostgreSQL)

### Основные таблицы

```sql
-- Организации (multi-tenant)
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Пользователи
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'uploader',  -- admin, manager, uploader
    telegram_chat_id BIGINT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Поставщики
CREATE TABLE suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(255) NOT NULL,
    inn VARCHAR(12),
    legal_entities JSONB DEFAULT '[]',  -- [{name, inn}] для объединения юрлиц
    stats JSONB DEFAULT '{}',  -- агрегированная статистика
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Счета
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    uploaded_by UUID REFERENCES users(id),
    supplier_id UUID REFERENCES suppliers(id),
    file_key VARCHAR(500) NOT NULL,  -- путь в MinIO
    original_filename VARCHAR(255),
    status VARCHAR(50) DEFAULT 'uploaded',
    raw_data JSONB,          -- результат парсинга AI
    vat_info JSONB,          -- информация о НДС
    extra_costs JSONB,       -- допрасходы
    total_amount DECIMAL(15,2),
    currency VARCHAR(3) DEFAULT 'RUB',
    invoice_date DATE,
    save_to_history BOOLEAN DEFAULT true,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Позиции счёта
CREATE TABLE invoice_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id),
    name_original VARCHAR(500),   -- как в счёте
    name_normalized VARCHAR(500), -- нормализованное
    quantity DECIMAL(15,4),
    unit VARCHAR(50),
    price_per_unit DECIMAL(15,2),
    total_price DECIMAL(15,2),
    market_price DECIMAL(15,2),       -- найденная рыночная цена
    market_price_source TEXT,         -- URL источника
    price_history_avg DECIMAL(15,2),  -- средняя по истории
    assessment VARCHAR(50),           -- ok, overpriced, attention, unknown
    assessment_details JSONB,         -- детали оценки от AI
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Справочник товаров
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID REFERENCES organizations(id),
    name VARCHAR(500) NOT NULL,
    category VARCHAR(255),
    unit VARCHAR(50),
    embedding VECTOR(1536),  -- pgvector
    last_known_price DECIMAL(15,2),
    avg_price DECIMAL(15,2),
    price_updated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- История цен
CREATE TABLE price_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID REFERENCES products(id),
    supplier_id UUID REFERENCES suppliers(id),
    invoice_id UUID REFERENCES invoices(id),
    price DECIMAL(15,2) NOT NULL,
    quantity DECIMAL(15,4),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Отчёты
CREATE TABLE reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID REFERENCES invoices(id),
    org_id UUID REFERENCES organizations(id),
    type VARCHAR(50),  -- invoice_check, period_summary, supplier_analysis
    data JSONB NOT NULL,
    sent_via JSONB DEFAULT '[]',  -- [{channel: "telegram", sent_at: ...}]
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 7. Frontend (Next.js)

### Страницы

| Роут | Описание |
|------|----------|
| `/login` | Вход |
| `/dashboard` | Сводка: последние счета, алерты, статистика |
| `/invoices` | Список счетов, фильтры, загрузка нового |
| `/invoices/[id]` | Детали счёта: позиции, оценки, рыночные цены |
| `/suppliers` | Справочник поставщиков, статистика |
| `/suppliers/[id]` | Профиль поставщика: история, средние цены |
| `/products` | Справочник товаров |
| `/analytics` | Графики: динамика цен, экономия, топ-поставщики |
| `/settings` | Настройки организации, уведомления, API-ключи |
| `/admin/users` | Управление пользователями (admin) |

### Ключевые компоненты

- **InvoiceUploader** — drag & drop загрузка файлов с прогрессом
- **InvoiceDetails** — таблица позиций с цветовой индикацией (зелёный/жёлтый/красный)
- **PriceChart** — график динамики цен по товару (recharts)
- **SupplierCard** — карточка поставщика с рейтингом
- **AlertBanner** — баннер с критическими завышениями
- **ReportExporter** — экспорт отчётов в PDF/XLSX

---

## 8. Структура проекта

```
D:\Dev\AI-Buyer\
├── README.md
├── CLAUDE.md                 # Инструкции для Claude Code
├── docker-compose.yml        # Локальная разработка
├── docker-compose.prod.yml   # Продакшн (VPS)
├── .env.example
│
├── backend/                  # NestJS
│   ├── package.json
│   ├── tsconfig.json
│   ├── nest-cli.json
│   ├── src/
│   │   ├── main.ts
│   │   ├── app.module.ts
│   │   ├── config/           # Конфигурация (ConfigModule)
│   │   ├── common/           # Общие утилиты, фильтры, пайпы
│   │   ├── auth/             # Auth module
│   │   ├── users/            # Users module
│   │   ├── invoices/         # Invoices module
│   │   ├── products/         # Products module
│   │   ├── suppliers/        # Suppliers module
│   │   ├── reports/          # Reports module
│   │   ├── notifications/    # Notifications module
│   │   └── queue/            # BullMQ workers
│   └── test/
│
├── ai-service/               # Python FastAPI
│   ├── pyproject.toml
│   ├── requirements.txt
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── routers/
│   │   │   ├── parse.py
│   │   │   ├── search.py
│   │   │   └── evaluate.py
│   │   ├── services/
│   │   │   ├── ocr.py
│   │   │   ├── llm.py
│   │   │   ├── price_search.py
│   │   │   ├── evaluator.py
│   │   │   └── embeddings.py
│   │   ├── models/           # Pydantic models
│   │   └── prompts/          # LLM промпты
│   └── tests/
│
├── frontend/                 # Next.js
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/              # App Router
│   │   ├── components/       # UI-компоненты
│   │   ├── hooks/            # Custom hooks
│   │   ├── lib/              # API-клиент, утилиты
│   │   ├── store/            # Zustand store
│   │   └── types/            # TypeScript типы
│   └── public/
│
└── deploy/                   # Деплой
    ├── nginx.conf
    ├── Dockerfile.backend
    ├── Dockerfile.ai-service
    ├── Dockerfile.frontend
    └── scripts/
        ├── setup-vps.sh
        └── deploy.sh
```

---

## 9. Деплой на VPS

### Минимальные требования VPS
- 2 CPU, 4 GB RAM, 40 GB SSD
- Ubuntu 22.04 / 24.04
- Docker + Docker Compose

### Сервисы в docker-compose.prod.yml

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg16
    volumes: [postgres_data:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: aibuyer
      POSTGRES_USER: aibuyer
      POSTGRES_PASSWORD: ${DB_PASSWORD}

  redis:
    image: redis:7-alpine

  minio:
    image: minio/minio
    command: server /data --console-address ":9001"
    volumes: [minio_data:/data]

  backend:
    build: {context: ., dockerfile: deploy/Dockerfile.backend}
    depends_on: [postgres, redis, minio]
    environment:
      DATABASE_URL: postgresql://aibuyer:${DB_PASSWORD}@postgres:5432/aibuyer
      REDIS_URL: redis://redis:6379

  ai-service:
    build: {context: ., dockerfile: deploy/Dockerfile.ai-service}
    environment:
      OPENAI_API_KEY: ${OPENAI_API_KEY}

  frontend:
    build: {context: ., dockerfile: deploy/Dockerfile.frontend}

  nginx:
    image: nginx:alpine
    ports: ["80:80", "443:443"]
    volumes:
      - ./deploy/nginx.conf:/etc/nginx/nginx.conf
      - certbot_data:/etc/letsencrypt
```

### CI/CD
- GitHub Actions: lint → test → build → push images → deploy to VPS via SSH

---

## 10. Фазы разработки

### Фаза 1 — MVP (2-3 недели)
- [ ] Базовая структура проекта (mono-repo)
- [ ] Docker Compose для локальной разработки
- [ ] Backend: Auth + Users + базовый Invoices (загрузка файла)
- [ ] AI Service: парсинг PDF/XLSX счёта (OCR + LLM)
- [ ] Frontend: логин, загрузка счёта, просмотр результата
- [ ] PostgreSQL схема + миграции

### Фаза 2 — Ценовой контроль (2 недели)
- [ ] AI Service: веб-поиск цен по позициям
- [ ] AI Service: оценка счёта (сравнение с рынком)
- [ ] Backend: Products + Suppliers (автопополнение)
- [ ] Backend: BullMQ pipeline обработки счёта
- [ ] Frontend: таблица результатов с цветовой индикацией

### Фаза 3 — История и аналитика (1-2 недели)
- [ ] Backend: история цен, pgvector для поиска товаров
- [ ] Frontend: аналитика, графики, профили поставщиков
- [ ] Уведомления: Telegram Bot

### Фаза 4 — Продакшн (1 неделя)
- [ ] Docker-образы, docker-compose.prod.yml
- [ ] Деплой на VPS, настройка домена, SSL
- [ ] GitHub Actions CI/CD
- [ ] Мониторинг и логирование
