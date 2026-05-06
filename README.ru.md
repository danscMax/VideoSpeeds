# Video Speed Controller (YouTube + RuTube)

[English](README.md) | **Русский**

Кроссбраузерное расширение, которое добавляет **кнопки скорости,
ползунок и настраиваемые горячие клавиши** в плееры YouTube и RuTube.
Двуязычный интерфейс (English / Русский), без телеметрии, настройки
хранятся локально.

> Распространяется в трёх формах из одного исходника:
> - Chrome MV3 (`.zip`) для Chrome Web Store
> - Firefox MV3 (`.xpi`) для Mozilla Add-ons (AMO)
> - Userscript в стиле Tampermonkey (`.user.js`) для тех, кто
>   предпочитает Tampermonkey / Violentmonkey

## Возможности

- **Пресеты скорости по сайтам** — 9 кнопок на YouTube (1x ... 4x),
  7 на RuTube (1x ... 3x).
- **Ползунок** с теми же min/max что у кнопок, заливка в цвет
  акцента.
- **Один клик** → временная скорость только для этого видео.
- **Двойной клик** → закрепить как глобальную скорость для сайта.
- **Горячие клавиши** — Ctrl+C (+0.1) / Ctrl+V (-0.1) по умолчанию,
  полностью переназначаемые в настройках.
- **Меню на шестерёнке** — 3 вкладки (Общие, Клавиши, Диагностика)
  с переключателем EN/RU, тогглом положения ползунка и (только для
  RuTube) переключателями скрытия заголовка плеера / Premium-баннеров.
- **Иконка в тулбаре** — копия меню в плеере, доступна без открытия
  видео.
- **Самодиагностика** — watchdog обнаруживает поломку селекторов
  после обновлений сайта и пробует 5 стратегий восстановления (кеш,
  точное совпадение, подстрока, предок, геометрическая эвристика).
- **Двуязычный** — 96 ключей i18n, EN/RU; язык определяется
  автоматически из `navigator.languages` при первом запуске.
- **Приватность** — все настройки в `browser.storage.local`. Никакой
  телеметрии, никакой аналитики, никаких удалённых запросов.
  Декларация AMO data-collection: `{ required: ['none'] }`.

## Скриншоты

| Панель YouTube | Панель RuTube |
|---|---|
| ![YouTube](dist-store-assets/screenshots/01-youtube-panel.jpg) | ![RuTube](dist-store-assets/screenshots/03-rutube-panel.jpg) |

| Настройки (YouTube) | Настройки (RuTube) |
|---|---|
| ![YT settings](dist-store-assets/screenshots/02-youtube-settings.jpg) | ![RuTube settings](dist-store-assets/screenshots/04-rutube-settings.jpg) |

## Установка

### Chrome / Edge / Brave (MV3)

1. Сборка: `npm install && npx wxt build`
2. Открыть `chrome://extensions`, включить «Режим разработчика»
3. **Загрузить распакованное расширение** → `.output/chrome-mv3/`

После публикации в Web Store устанавливайте через листинг.

> Для Windows-пользователей с кириллицей в пути проекта: сначала
> скопируйте `.output/chrome-mv3/` в `C:\Temp\videospeeds-build\` —
> Chrome `--load-extension=` не принимает не-ASCII пути.

### Firefox (MV3)

1. Сборка: `npx wxt build -b firefox --mv3`
2. `npx web-ext run --source-dir=.output/firefox-mv3` — запустится
   свежий Firefox с временно установленным расширением

Для постоянной установки отправьте AMO-сборку (`npx wxt zip -b
firefox --mv3`) или подпишите локально через `web-ext sign`.

### Tampermonkey / Violentmonkey

1. Сборка: `npm run build:userscript`
2. Откройте `dist-userscript/video-speeds.user.js` в браузере —
   TM/VM предложит установку.

## Миграция со старого юзерскрипта

При первом запуске расширение импортирует настройки из page
`localStorage`. GM-хранилище недоступно веб-расширениям; если вы
использовали старый `YouTube & HDRezka Speeds.user.js`, см.
[docs/MIGRATION.md] о вариантах (открыть юзерскрипт один раз в
последней версии или использовать кнопки JSON Export/Import в
настройках).

[docs/MIGRATION.md]: docs/MIGRATION.md

## Разработка

- `npm run typecheck` — TypeScript strict, должен проходить
- `npm test` — Vitest unit-тесты (197 тестов на storage, discovery,
  контроллер скорости, i18n, нормализация горячих клавиш и пр.)
- `npm run test:smoke:full` — Playwright через CDP прогоняет каждый
  клик пресета, перетаскивание ползунка, горячие клавиши,
  переключение языка, тогглы настроек, SPA-переходы; делает
  скриншоты
- `npm run test:smoke:cdp` — лёгкий smoke (только рендер панели)
- `npm run build` / `npm run build:firefox` / `npm run build:userscript`

См. [docs/CAVEATS.md] про build-time особенности (кириллица в
путях, падения Playwright-launch на некоторых Windows-конфигах,
Firefox MAIN-world тайминг) и локальный CDP-smoke рецепт.

[docs/CAVEATS.md]: docs/CAVEATS.md

## Связанный проект

[HDRezkaSpeeds](https://github.com/danscMax/HDRezkaSpeeds) — тот же
контроллер скорости для **HDRezka**. Два расширения сделаны
отдельно, чтобы каждое могло объявлять узкие `host_permissions` в
манифесте — это ускоряет ревью в Chrome Web Store и AMO.

## Лицензия

GNU General Public License v3.0 или позднее (GPL-3.0-or-later) —
см. [LICENSE](LICENSE). Copyright (C) 2026 MaxScorpy.

Это свободное программное обеспечение: вы можете распространять и
модифицировать его на условиях GNU General Public License,
опубликованной Free Software Foundation, версии 3 или любой более
поздней. Программа распространяется в надежде, что она будет
полезна, но БЕЗ КАКИХ-ЛИБО ГАРАНТИЙ — см. файл LICENSE для полных
условий.
