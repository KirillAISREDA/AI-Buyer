# Как работать с AI-Buyer через Claude Code

## Быстрый старт

### 1. Подготовка проекта

```bash
# Создай папку проекта
mkdir D:\Dev\AI-Buyer
cd D:\Dev\AI-Buyer

# Скопируй туда 3 файла:
# - CLAUDE.md      (инструкции для Claude Code)
# - SPEC.md        (техническое задание)
# - ARCHITECTURE.md (архитектура — для справки)

# Инициализируй git
git init
git add .
git commit -m "docs: add project specification and architecture"
```

### 2. Создай репозиторий на GitHub

```bash
# На github.com создай репозиторий AI-Buyer (private)
git remote add origin git@github.com:YOUR_USERNAME/AI-Buyer.git
git push -u origin main
```

### 3. Запусти Claude Code

```bash
# Установи Claude Code (если ещё нет)
npm install -g @anthropic-ai/claude-code

# Перейди в папку проекта
cd D:\Dev\AI-Buyer

# Запусти Claude Code
claude
```

### 4. Первая команда для Claude Code

Вставь это в Claude Code:

```
Прочитай CLAUDE.md и SPEC.md. Начни реализацию с Шага 1 — инициализация проекта:
1. Создай docker-compose.yml для локальной разработки (postgres с pgvector, redis, minio)
2. Создай .env.example
3. Инициализируй NestJS backend
4. Инициализируй Next.js frontend  
5. Создай структуру Python AI service
6. Сделай git commit

После каждого подшага подтверждай что код работает.
```

### 5. Последующие команды

После завершения каждого шага давай следующую команду:

```
Продолжай по CLAUDE.md — выполни Шаг 2: Backend Auth и Users.
Создай entities, DTOs, модули, контроллеры, сервисы. 
Настрой JWT, guards, RBAC. Добавь Swagger.
Убедись что backend запускается и auth endpoints работают.
Сделай git commit.
```

И так далее по шагам. Каждый шаг — отдельная команда.

---

## Советы по работе с Claude Code

### Будьте конкретны
Плохо: «Сделай фронтенд»
Хорошо: «Создай страницу /invoices с таблицей счетов, фильтрами по статусу и дате, пагинацией. Используй Zustand для стейта и /lib/api.ts для запросов.»

### Один шаг за раз
Не просите сделать всё сразу. Шаг за шагом — надёжнее.

### Проверяйте после каждого шага
```bash
# Backend
cd backend && npm run build && npm run test

# Frontend  
cd frontend && npm run build

# AI Service
cd ai-service && python -m pytest

# Всё вместе
docker compose up -d
```

### Фиксируйте прогресс
```bash
git add . && git commit -m "feat: step N description"
git push
```

### Если что-то сломалось
```
Последний коммит сломал сборку backend. Ошибка:
[вставьте ошибку]

Исправь это, не меняя ранее работавший код. 
```

---

## Деплой на VPS

Когда прототип готов локально:

```
Выполни Шаг 9 из CLAUDE.md: подготовь деплой.
1. Создай Dockerfile для каждого сервиса
2. Создай docker-compose.prod.yml
3. Создай nginx.conf с проксированием на backend и frontend
4. Создай скрипт setup-vps.sh для первичной настройки сервера
5. Создай скрипт deploy.sh для обновления на сервере
6. Создай GitHub Actions workflow для CI/CD
```

Затем на VPS:
```bash
ssh user@your-vps
git clone git@github.com:YOUR_USERNAME/AI-Buyer.git
cd AI-Buyer
cp .env.example .env
# Заполни .env реальными значениями
bash deploy/scripts/setup-vps.sh
docker compose -f docker-compose.prod.yml up -d
```
