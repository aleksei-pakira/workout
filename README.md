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

```bash
npm install
npm run dev      # разработка
npm run build    # продакшен-сборка
npm run preview  # preview dist/
```

## PocketBase (Backend)

URL API: **`VITE_PB_URL`** (см. `.env.example`). Fallback: `http://127.0.0.1:8090`.

```bash
cp .env.example .env
# VITE_PB_URL=https://api.ваш-домен.ru
npm run build
```

Логика подключения: `src/lib/pocketbase.js`.

Настройка схемы и rules для вариантов упражнений: **`docs/POCKETBASE_VARIANTS.md`**.

### Запуск PocketBase (локально)

```bash
./pocketbase serve
```

- API: `http://127.0.0.1:8090`
- Admin UI: `http://127.0.0.1:8090/_/`

## Коллекции PocketBase

### Упражнения
- **`exercises`** — публичные (`is_public = true`) и приватные (`created_by`, `is_public = false`)
- **`user_exercise_library`** — «добавленные в мои» (связка `user` ↔ `exercise`)

### Тренировки
- **`workouts`** — тренировки пользователя
- **`workout_exercises`** — блок упражнения в тренировке (`order_index`, **`active_variant_index`**)
- **`workout_exercise_variants`** — варианты упражнения в блоке (`variant_index` 0..9)
- **`sets`** — подходы, привязаны к **`workout_exercise_variant`** (не к блоку напрямую)

### Модель вариантов
- Слот **0** = «Основное», слоты **1–9** = альтернативы
- У каждого варианта **свои** подходы (вес, повторы, статус)
- **`active_variant_index`** — какой вариант открыт по умолчанию

Утилиты frontend: `src/lib/workoutVariants.js`, `src/lib/workoutVariantConstants.js`.

## Деплой

- **Frontend** — статический сайт (`dist/` на Nginx и т.п.)
- **PocketBase** — отдельно на VPS/сервере
- Prod: `VITE_PB_URL` указывает на prod API

## Ручное тестирование

### Создание
- [ ] Создать тренировку с «Основное» + подходами
- [ ] Листнуть карусель → «Вариант 1», другое упражнение и другие подходы
- [ ] Сохранить → в PB: variants + sets на каждый variant

### Просмотр
- [ ] Открывается `active_variant_index`
- [ ] ← → меняет упражнение и таблицу подходов
- [ ] Смена статуса подхода сохраняется
- [ ] После перезагрузки — тот же активный вариант

### Редактирование
- [ ] Загружаются все variants + sets
- [ ] Добавить пустой вариант через карусель и сохранить
- [ ] Подходы variant 1 не затрагивают variant 0

### Календарь / Home
- [ ] В ячейке дня — имя **активного** варианта
- [ ] HomePage: статистика без ошибок

## Что нельзя пушить в GitHub
- `node_modules/`
- `dist/`
- `.env`, `.env.*` (секреты)
- `pb_data/` (данные PocketBase)
