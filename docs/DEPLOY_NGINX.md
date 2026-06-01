# Nginx: деплой SPA (React Router)

Маршруты вроде `/workouts/calendar` существуют **только в JavaScript** (`react-router-dom`). На сервере нет файла `workouts/calendar` — есть только `index.html` и `/assets/*`.

Если Nginx не настроен на fallback, при **прямом URL** или **обновлении страницы** будет:

```
404 Not Found
nginx/1.x.x
```

---

## Обязательно: `try_files` для SPA

В конфиге сайта (`myworkoutplan.ru` **и** `www.myworkoutplan.ru`) внутри `server { }`:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

**Недостаточно** только:

```nginx
location / {
    index index.html;
}
```

`index` работает только для `/`, но не для `/workouts/calendar`.

---

## Пример доп. конфигурации (FastPanel)

```nginx
location = /index.html {
    add_header Cache-Control "no-cache, no-store, must-revalidate";
    add_header Pragma "no-cache";
    add_header Expires "0";
}

location /assets/ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}

location / {
    try_files $uri $uri/ /index.html;
}

location ~* ^.+\.(jpg|jpeg|gif|png|svg|js|css|ico|webp|woff|woff2)$ {
    try_files $uri =404;
}
```

Порядок: сначала точные `location =` и `/assets/`, затем `location /` с `try_files`.

---

## www и без www

404 на `https://www.myworkoutplan.ru/workouts/calendar` значит, что правило нужно в конфиге **именно www-сайта** (или в общем server block для www).

Рекомендуется редирект одного варианта на другой:

```nginx
# пример: www → без www (в server block для www)
return 301 https://myworkoutplan.ru$request_uri;
```

---

## Проверка после правки

```bash
nginx -t
systemctl reload nginx
```

В браузере (можно incognito):

1. Открыть `https://myworkoutplan.ru/workouts/calendar` напрямую — **не** 404
2. F5 на этой странице — приложение загружается
3. Переход с главной по меню — как раньше

---

## Корень сайта

Document root должен указывать на каталог **`dist/`** после `npm run build`:

- `index.html`
- `assets/index-….js`
- `assets/index-….css`
