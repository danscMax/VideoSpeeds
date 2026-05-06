# Privacy Policy — Video Speed Controller

[English](#english) | [Русский](#russian)

Last updated: 2026-05-06

---

<a id="english"></a>

## English

### What we collect

**Nothing.** No analytics, no telemetry, no remote requests.

### What we transmit

**Nothing.** The extension makes zero outbound network requests.

### Where settings live

All extension settings (selected speed, hotkey bindings, slider
position, language, "remember speed" toggle, RuTube hide-title and
hide-Premium switches) are persisted in
[`browser.storage.local`][storage], the per-extension local storage
provided by the browser. Data never leaves your device.

### Migration from the legacy userscript

On first run inside a YouTube or RuTube tab, the extension reads two
keys from page `localStorage` (`youtube-speed-settings` /
`rutube-speed-settings` and the matching `<site>-selected-speed`) so
existing users of the `YouTube & HDRezka Speeds.user.js` userscript
keep their preferences after switching. Reads are local; nothing is
sent anywhere.

### Diagnostics report

The Diagnostics tab in the gear menu has a "Copy report" button that
puts a JSON snapshot on your clipboard. The snapshot includes the
domain (e.g. `youtube.com`), the page path **without query string or
URL fragment**, your user agent, viewport size, the panel's own state,
and recent ratechange events. The report is generated only when YOU
click the button and is placed only on YOUR clipboard — the extension
itself never sends it anywhere. Paste it into a GitHub issue if you
want to send it to the developer.

### Permissions explained

| Permission | Why |
|---|---|
| `storage` | Persist your settings between sessions. |
| `host_permissions: *://*.youtube.com/*, *://rutube.ru/*, *://*.rutube.ru/*` | Inject the speed-control UI into supported video pages. The extension does not run on any other site. |

The Firefox manifest declares
`browser_specific_settings.gecko.data_collection_permissions: { required: ['none'] }`
so the AMO listing makes the zero-collection promise machine-readable.

### Source code

The extension is open source under the GNU General Public License v3.0
or later (GPL-3.0-or-later). Audit the implementation at
[github.com/danscMax/VideoSpeeds](https://github.com/danscMax/VideoSpeeds).

### Contact

File issues or questions on the [GitHub repository][issues].

[storage]: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/local
[issues]: https://github.com/danscMax/VideoSpeeds/issues

---

<a id="russian"></a>

## Русский

### Что мы собираем

**Ничего.** Никакой аналитики, никакой телеметрии, никаких удалённых
запросов.

### Что мы передаём

**Ничего.** Расширение не делает ни одного исходящего сетевого
запроса.

### Где хранятся настройки

Все настройки расширения (выбранная скорость, привязки горячих
клавиш, положение ползунка, язык, переключатель «Запомнить скорость»,
переключатели «Скрыть заголовок плеера» и «Скрыть Premium-баннеры»
для RuTube) сохраняются в
[`browser.storage.local`][storage-ru] — локальном хранилище,
выделенном расширению самим браузером. Данные никогда не покидают
ваше устройство.

### Миграция со старого юзерскрипта

При первом запуске на вкладке YouTube или RuTube расширение читает
два ключа из page `localStorage` (`youtube-speed-settings` /
`rutube-speed-settings` и соответствующий `<site>-selected-speed`),
чтобы существующие пользователи юзерскрипта `YouTube & HDRezka
Speeds.user.js` сохранили настройки после перехода. Чтение
полностью локальное; никуда ничего не отправляется.

### Отчёт диагностики

Во вкладке «Диагностика» в меню есть кнопка «Скопировать отчёт» —
она кладёт в ваш буфер обмена JSON-снимок состояния. Снимок содержит
домен (например, `youtube.com`), путь страницы **без query-string и
URL-фрагмента**, ваш user agent, размер окна, текущее состояние
панели и недавние события смены скорости. Отчёт генерируется только
когда ВЫ нажмёте кнопку и кладётся только в ВАШ буфер обмена —
расширение само никуда его не отправляет.

### Разрешения

| Разрешение | Зачем |
|---|---|
| `storage` | Сохранять ваши настройки между сессиями. |
| `host_permissions: *://*.youtube.com/*, *://rutube.ru/*, *://*.rutube.ru/*` | Встраивать панель управления скоростью в страницы видео. Расширение не работает на других сайтах. |

В Firefox-манифесте задекларировано
`browser_specific_settings.gecko.data_collection_permissions: { required: ['none'] }`,
чтобы листинг AMO мог автоматически проверить обещание о нулевом
сборе данных.

### Исходный код

Расширение распространяется как open source под лицензией
GNU General Public License v3.0 или позднее (GPL-3.0-or-later).
Исходники: [github.com/danscMax/VideoSpeeds](https://github.com/danscMax/VideoSpeeds).

### Контакты

Создавайте issue или задавайте вопросы в [GitHub-репозитории][issues-ru].

[storage-ru]: https://developer.mozilla.org/ru/docs/Mozilla/Add-ons/WebExtensions/API/storage/local
[issues-ru]: https://github.com/danscMax/VideoSpeeds/issues
