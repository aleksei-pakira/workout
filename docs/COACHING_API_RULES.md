# Coaching: API Rules (без хука)

Права тренера и coached performer задаются **только API Rules** в PocketBase Admin.  
JS-хук `pb_hooks/coaching.pb.js` **не используется**.

> В **Create** rules — `@request.body`, не `@request.data`.  
> Оператор **`!`** не поддерживается. Вместо `!(@collection... ?=` …)` используйте **`?!=`**.

---

## Роли и поведение

| Роль | План (календарь) | Статусы | Упражнения |
|------|------------------|---------|------------|
| Solo performer | полный CRUD | да | полный CRUD |
| Coached, `client_can_edit_plans = false` | только просмотр | да | полный CRUD |
| Coached, `client_can_edit_plans = true` | полный CRUD | да | полный CRUD |
| Trainer (свой аккаунт) | полный CRUD | да | полный CRUD |
| Trainer (календарь клиента) | полный CRUD клиента | да | библиотека клиента |

---

## Общие фрагменты

**Просмотр плана** (List/View `workouts`, поле `user`):

```text
@request.auth.id != "" && (
  user = @request.auth.id ||
  (
    @collection.trainer_clients.trainer ?= @request.auth.id &&
    @collection.trainer_clients.client ?= user
  )
)
```

**Структурный CRUD плана** (Create/Delete `workouts`; Create/Update/Delete `workout_exercises`, variants; Create/Delete `sets`):

```text
@request.auth.id != "" && (
  (
    <OWNER> = @request.auth.id &&
    (
      @collection.trainer_clients.client ?!= @request.auth.id ||
      (
        @collection.client_settings.performer ?= @request.auth.id &&
        @collection.client_settings.client_can_edit_plans = true
      )
    )
  )
  ||
  (
    @collection.trainer_clients.trainer ?= @request.auth.id &&
    @collection.trainer_clients.client ?= <OWNER>
  )
)
```

`<OWNER>` — `user`, `workout.user`, `workout_exercise.workout.user` и т.д.

**Update статусов** (`workouts`, `sets` — coached может менять статусы):

```text
@request.auth.id != "" && (
  <OWNER> = @request.auth.id ||
  (
    @collection.trainer_clients.trainer ?= @request.auth.id &&
    @collection.trainer_clients.client ?= <OWNER>
  )
)
```

**CRUD библиотеки** (`custom_exercises`, `user_exercise_library`, поле `user`):

```text
@request.auth.id != "" && (
  user = @request.auth.id ||
  (
    @collection.trainer_clients.trainer ?= @request.auth.id &&
    @collection.trainer_clients.client ?= user
  )
)
```

---

## Коллекции (кратко)

| Коллекция | List/View | Create | Update | Delete |
|-----------|-----------|--------|--------|--------|
| `workouts` | просмотр | структурный CRUD | статусы + edit | структурный CRUD |
| `workout_exercises` | `workout.user` | через `@request.body.workout` | структурный | структурный |
| `workout_exercise_variants` | `workout_exercise.workout.user` | через `@request.body.workout_exercise` | структурный | структурный |
| `sets` | длинная цепочка | через variant id | **статусы** | структурный |
| `exercises` | public + `created_by` | `created_by = auth` | owner/trainer | owner/trainer |
| `custom_exercises` | `user` | `user` | `user` | `user` |
| `user_exercise_library` | `user` | `user` | `user` | `user` |
| `trainer_clients` | trainer или client | `client = auth` | trainer | trainer/client |
| `client_settings` | performer/trainer | performer/trainer | **только trainer** | — |
| `users` | см. ниже | регистрация | `id = auth` | — |

---

## `users` (auth)

List/View:

```text
@request.auth.id != "" && (
  id = @request.auth.id ||
  (role = "trainer" && invite_code != "") ||
  (
    @collection.trainer_clients.trainer ?= @request.auth.id &&
    @collection.trainer_clients.client ?= id
  ) ||
  (
    @collection.trainer_clients.client ?= @request.auth.id &&
    @collection.trainer_clients.trainer ?= id
  )
)
```

Update: `id = @request.auth.id`

---

## После join клиента

1. Запись `trainer_clients` (client = performer).
2. Запись `client_settings` (`performer`, `client_can_edit_plans: false`) — создаётся в `JoinTrainerPage` или тренером.

---

## Ограничение без хука

API Rules **не могут** ограничить Update только полем `status`. Coached performer теоретически может отправить PATCH с другими полями через API. UI и запрет Create/Delete структуры покрывают обычное использование.

---

## Фронтенд

- `canEditPlans` — структура плана (тренер всегда `true`).
- `canChangeStatuses` — статусы на календаре.
- `canManageExerciseLibrary` — CRUD упражнений.

См. `src/lib/permissions.js`, `CoachSessionContext`.
