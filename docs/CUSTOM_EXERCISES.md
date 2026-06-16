# Пользовательские упражнения (custom exercises)

Краткая справка по модели и фронтенду.

## PocketBase

### Коллекция `custom_exercises`

| Field | Type | Notes |
|-------|------|-------|
| `custom_exercise_name` | Text | Required |
| `set_columns` | JSON | Массив до 5 столбцов: `{ key, label, type, options? }` |
| `user` | Relation → `users` | Required |

Типы столбцов: `text`, `number`, `list` (для `list` — минимум 2 варианта в `options`).

### `workout_exercise_variants`

- `exercise` и `custom_exercise` — **взаимоисключающие** (XOR): один из них заполнен.
- `exercise` — optional (не Required).

### `sets`

- Классические подходы: `weight`, `reps`, `status`.
- Пользовательские: поле `values` (JSON), ключи совпадают с `set_columns[].key`.

## Фронтенд

- **Управление шаблонами:** вкладка «Пользовательские» на `/exercises`.
- **Выбор в тренировке:** третья вкладка в выпадающем списке упражнений («Пользовательские»).
- **Таблица подходов:** `DynamicSetTable` вместо weight/reps/status.
- **Объём:** не считается для блоков с пользовательскими упражнениями.

## Схема столбцов

Нормализация в `src/lib/exerciseSetSchema.js` (`normalizeSetColumns`, `draftRowsToColumns`).

Пример `set_columns`:

```json
[
  { "key": "distance", "label": "Дистанция", "type": "number" },
  { "key": "pace", "label": "Темп", "type": "text" },
  { "key": "surface", "label": "Покрытие", "type": "list", "options": ["Асфальт", "Грунт"] }
]
```

Пример `sets.values`:

```json
{ "distance": "5", "pace": "5:30", "surface": "Асфальт" }
```
