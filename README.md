# Workout Tracker

Трекер тренировок на **React + Vite** с бэкендом **PocketBase**.

## Стек
- **Frontend**: React, Vite, CSS Modules
- **Routing**: `react-router-dom`
- **Backend**: PocketBase

## Требования
- Node.js (рекомендуется LTS)
- PocketBase (запускается отдельно)

## Быстрый старт (Frontend)
Установка:

```bash
npm install
```

Запуск dev-сервера:

```bash
npm run dev
```

Сборка:

```bash
npm run build
```

Preview сборки:

```bash
npm run preview
```

## PocketBase (Backend)
Приложение ожидает, что PocketBase доступен по адресу `http://127.0.0.1:8090`.

URL PocketBase сейчас задан хардкодом в:
- `src/lib/pocketbase.js`

### Запуск PocketBase (пример)
Скачай PocketBase и запусти:

```bash
./pocketbase serve
```

По умолчанию:
- API: `http://127.0.0.1:8090`
- Admin UI: `http://127.0.0.1:8090/_/`

## Коллекции PocketBase (минимально необходимые)
Упражнения:
- **`exercises`**: публичная библиотека (используется `is_public = true`)
- **`user_exercises`**: упражнения, которые пользователь создаёт сам (приватные)
- **`user_exercise_library`**: “добавленные в мои” (связка `user` ↔ `exercise`)

Тренировки:
- **`workouts`**
- **`workout_exercises`**
- **`sets`**

## Деплой (важно)
- **Frontend (Vite)** можно деплоить как статический сайт (GitHub Pages / Vercel / Netlify).
- **PocketBase** нужно деплоить отдельно (сервер/VPS/Render/Fly.io и т.п.).

Для продакшна рекомендуется вынести URL PocketBase в переменные окружения (например `VITE_PB_URL`), чтобы удобно разделять dev/prod конфигурации.

## Что нельзя пушить в GitHub
- `node_modules/`
- `dist/`
- `.env`, `.env.*` (секреты)
- `pb_data/` (данные PocketBase)
