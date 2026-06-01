# PocketBase: варианты упражнений

Инструкция для Admin UI (`/_/`). Подробнее о деплое — `README.md`.

## Модель данных

```
workouts
  └── workout_exercises          (порядок, active_variant_index)
        └── workout_exercise_variants   (упражнение в слоте 0..9)
              └── sets                  (подходы только этого варианта)
```

- Слот **0** — «Основное», обязателен при сохранении.
- Слоты **1–9** — альтернативы (макс. 10 на блок).
- У каждого варианта **свои** подходы.

---

## 1. `workout_exercises` — поле `active_variant_index`

| Параметр | Значение |
|----------|----------|
| Type | Number |
| **Required** | **нет (OFF)** |
| Min / Max | `0` / `9` |

> **Важно:** не включайте **Required** для этого поля. В PocketBase значение **`0`** («Основное») при Required часто даёт ошибку `Cannot be blank`. Frontend всегда отправляет `active_variant_index: 0` при create — поле будет заполнено и без Required.

Поле **Default** в UI PocketBase может отсутствовать — это нормально.

---

## 1.1. `workout_exercise_variants.variant_index`

| Параметр | Значение |
|----------|----------|
| Type | Number |
| **Required** | **нет (OFF)** — та же причина: слот **0** = «Основное» |
| Min / Max | `0` / `9` |

Уникальность слотов обеспечивает **unique index** `(workout_exercise, variant_index)`, не Required.

---

## 2. Коллекция `workout_exercise_variants`

| Field | Type | Options |
|-------|------|---------|
| `workout_exercise` | Relation → `workout_exercises` | Max 1, Required, Cascade delete |
| `exercise` | Relation → `exercises` | Max 1, Required |
| `variant_index` | Number | Min `0`, Max `9`, **Required: OFF** (см. §1.1) |

**Unique index:** `workout_exercise` + `variant_index`.

---

## 3. `sets` — поле `workout_exercise_variant`

| Параметр | Значение |
|----------|----------|
| Type | Relation → `workout_exercise_variants` |
| Required | да (после финализации) |
| Cascade delete | да |

Legacy-поле `sets.workout_exercise`: если удалить из схемы не удаётся — оставьте **Required: OFF**. Frontend пишет только `workout_exercise_variant`.

### 3.1. `sets.status`

| Параметр | Значение |
|----------|----------|
| Type | Select (рекомендуется **single**; если multiple — max 1) |
| Values | **`planned`**, **`done`**, **`failed`**, **`skipped`** |
| Default | `planned` |

> Не используйте `completed` — фронт пишет **`done`**. Старые `completed` при чтении мапятся в `done`.

API (multi-select): в ответе может быть `"status": ["done"]`. При create/update фронт отправляет массив из одного значения, напр. `["planned"]`.

---

## 4. API Rules

> В **Create** rules используйте `@request.body`, не `@request.data`.

### `workouts`

| Rule | Выражение |
|------|-----------|
| List / View | `user = @request.auth.id` |
| Create | `@request.auth.id != "" && user = @request.auth.id` |
| Update / Delete | `@request.auth.id != "" && user = @request.auth.id` |

#### `workouts.workout_status`

| Параметр | Значение |
|----------|----------|
| Type | Select, multiple (max 1) |
| Values | `planned`, `done`, `failed`, `skipped` |
| Default в PB | **нет** — в UI и при create всегда fallback **`planned`** |
| Независимость | не связан с `sets.status`; задаётся пользователем в шапке тренировки |

Фронт при create/update всегда отправляет `workout_status: ["planned"]` и т.д. Пустое поле в API → отображение `planned`.

Цвет ячейки в календаре (`MonthCalendar`) берётся из `workout_status`, **не** из `sets.status`.

### `workout_exercises`

| Rule | Выражение |
|------|-----------|
| List / View | `workout.user = @request.auth.id` |
| Create | `@request.auth.id != "" && @collection.workouts.id ?= @request.body.workout && @collection.workouts.user ?= @request.auth.id` |
| Update / Delete | `@request.auth.id != "" && workout.user = @request.auth.id` |

### `workout_exercise_variants`

| Rule | Выражение |
|------|-----------|
| List / View | `workout_exercise.workout.user = @request.auth.id` |
| Create | `@request.auth.id != "" && @collection.workout_exercises.id ?= @request.body.workout_exercise && @collection.workout_exercises.workout.user ?= @request.auth.id` |
| Update / Delete | `@request.auth.id != "" && workout_exercise.workout.user = @request.auth.id` |

### `sets`

| Rule | Выражение |
|------|-----------|
| List / View | `workout_exercise_variant.workout_exercise.workout.user = @request.auth.id` |
| Create | `@request.auth.id != "" && @collection.workout_exercise_variants.id ?= @request.body.workout_exercise_variant && @collection.workout_exercise_variants.workout_exercise.workout.user ?= @request.auth.id` |
| Update / Delete | `@request.auth.id != "" && workout_exercise_variant.workout_exercise.workout.user = @request.auth.id` |

---

## 5. Миграция (только для старых данных)

```bash
PB_URL=https://api.example.com \
PB_ADMIN_EMAIL=admin@example.com \
PB_ADMIN_PASSWORD=secret \
node scripts/migrate-variants.mjs
```

Если база пустая — миграция **не нужна**.

---

## 6. Финализация (после теста приложения)

1. `sets.workout_exercise_variant` → Required
2. Удалить `sets.workout_exercise`
3. Опционально: `workout_exercises.exercise` → optional или удалить

---

## 7. Проверка в Admin

- [ ] `active_variant_index = 0` сохраняется (Required OFF)
- [ ] Variant 0 + 1 на один блок
- [ ] Unique: два `variant_index=0` на блок → ошибка
- [ ] Удаление `workout_exercises` → cascade variants + sets

## 8. Проверка в приложении

- [ ] Create: тренировка с «Основное» + подходы
- [ ] Create: «Вариант 1» с другим упражнением и подходами
- [ ] View: карусель, подходы, смена `active_variant_index`
- [ ] Edit: сохранение без потери variant 0 / variant 1

## 9. Частые ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `active_variant_index` Cannot be blank при `0` | Required ON на Number | Required **OFF** (§1) |
| Статус в UI сбрасывается / не сохраняется | PB отдаёт `["completed"]` или short `plan` | Values в PB: `planned`, `done`, `failed`, `skipped` (§3.1) |
| `workout_exercise` Cannot be blank в `sets` | Required ON на legacy-поле | Required OFF или удалить поле |
| Invalid rule `workout_exercise` в `sets` | Поле удалено, rule ссылается на него | Rules только через `workout_exercise_variant` |
| Create rule `@request.data` | Устаревший синтаксис | Использовать `@request.body` |
