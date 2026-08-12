# Store listing copy (Chrome Web Store + AMO)

Drop-in copy for the listing forms. EN sections are canonical; Russian
translations follow each. Paste the matching language into the store's
per-locale fields (CWS and AMO both take a separate RU listing).

## Short description and item name — NOT here

Both live in `public/_locales/{en,ru}/messages.json` (`extName`,
`extDescription`), because Chrome renders them straight from the package and
ignores anything typed into the dashboard. This file used to keep a second
copy; by the time the two were compared they disagreed on every word, and the
copy nobody could see was the one being pushed to AMO. `push-amo-listing.mjs`
now reads `_locales` for the summary, so editing it there updates both stores.
Chrome caps it at 132 characters — half of AMO's limit, and the binding one.

## Detailed description (under 16,000 characters)

```
Watch lectures, tutorials and reviews in less time. Video Speed
Controller puts a row of speed buttons right under the YouTube,
RuTube and Dzen player — one click takes a slow talk up to 2x, one more click
brings it back to 1x. A slider and customizable hotkeys give you exact
control.

WHAT IT DOES

- 9 preset speed buttons on YouTube (1x, 1.5x, 1.75x, 2x, 2.25x, 2.5x,
  2.75x, 3x, 3.25x) and 9 on RuTube (1x through 3x in 0.25 steps),
  positioned right below the video. The 1x preset is included by
  default so a fast-forwarded video can return to normal in a single
  click. The button row is customizable (you can add speeds up to 4x).
- Slider for in-between values, with a coloured fill and a value
  tooltip that follows the thumb so you always see the exact rate.
- Single-click on a button = temporary speed for this video only.
  Double-click = save as the default for new videos. The saved speed
  is marked with a small accent dot in the corner of its button.
- Configurable hotkeys — assign multiple combinations per action so a
  remote and a keyboard can both trigger speed changes. Rebind them and
  set the step size in Settings → Keys.
- In-player gear menu with four tabs:
  - General: slider position (right / below / inside player), language
    switch (English / Russian), preset chips grouped by range
    (slower than 1×, 1×–2×, faster than 2×), behaviour toggles.
  - Keys: rebind speed-up / speed-down, add additional combos,
    reset to defaults.
  - Diagnostics: copy a structured report for bug submissions; clear
    cached selectors if a site update breaks the panel.
  - Support: feedback form (sends to the developer's Telegram via a
    Cloudflare Worker — no third-party analytics).
- Toolbar popup mirrors the in-player menu so you can adjust settings
  without opening a video.
- Dzen video and VK Video are supported as OPT-IN sites: they are not
  requested at install time, so an update never disables the extension.
  Open a video there, click the extension icon and press "Allow" once.
  On VK the extension only ever runs on the video section.
- RuTube-only quality-of-life toggles: hide the overlay player title,
  hide Premium subscription banners.
- Accessibility: aria-labels on the gear button, aria-live status
  announcements for diagnostic state and speed changes,
  prefers-reduced-motion support. In fullscreen the panel steps out of the
  way — no extension UI on top of the picture; the shortcuts keep working.

WHY IT'S RELIABLE

When YouTube or RuTube ships a layout change, the panel recovers
automatically through a five-strategy discovery chain (cached selector
-> exact match -> substring match -> walk up from the video element
-> geometric heuristic). A built-in watchdog detects broken state,
purges bad cache entries, and re-attaches the panel. If the player
SPA-navigates between videos, the panel re-mounts via a MutationObserver
without losing your settings.

PRIVACY

- All settings stored locally in browser.storage.local.
- Zero telemetry, zero analytics, zero remote calls.
- The AMO data_collection_permissions disclosure is set to "none".
- Source available on GitHub for review.

LANGUAGES

English and Russian. UI language is auto-detected from your browser on
first run; switch any time from the gear menu.

AFTER YOU INSTALL

A short walkthrough opens automatically in a new tab: what each control
does, how to set your keyboard shortcuts, and how to pin the icon to the
toolbar. It takes about a minute, and you can close it and start using
the extension right away.
```

(Roughly 1,800 characters out of the 16,000 limit -- room to grow.)

### Russian translation

```
Смотрите лекции, разборы и обзоры за меньшее время. Video Speed
Controller ставит ряд кнопок скорости прямо под плеером YouTube,
RuTube и Дзена — один клик разгоняет размеренную речь до 2x, ещё один
возвращает к 1x. Ползунок и настраиваемые горячие клавиши дают точный
контроль.

ЧТО УМЕЕТ

- 9 кнопок скорости на YouTube (1x, 1.5x, 1.75x, 2x, 2.25x, 2.5x,
  2.75x, 3x, 3.25x) и 9 на RuTube (от 1x до 3x с шагом 0.25) — прямо
  под видео. Кнопка 1x включена по умолчанию: ускоренное видео
  возвращается к обычной скорости одним кликом. Список кнопок
  настраивается (можно добавить до 4x).
- Ползунок для промежуточных значений с цветной заливкой и
  всплывающей подписью над бегунком — точное значение видно всегда.
- Один клик по кнопке — временная скорость только для этого видео.
  Двойной клик — сохранить как скорость по умолчанию для новых видео.
  Сохранённая кнопка отмечена маленькой точкой в углу.
- Настраиваемые горячие клавиши: несколько комбинаций на одно
  действие (например, клавиатура и пульт разом), переназначаются в
  настройках.
- Меню на шестерёнке в плеере с вкладками:
  - «Общие»: положение ползунка (справа / под плеером / внутри),
    язык интерфейса (English / Русский), кнопки скорости
    сгруппированы по диапазонам (медленнее 1×, 1×–2×, быстрее 2×).
  - «Клавиши»: переназначение ускорения/замедления, дополнительные
    комбинации, сброс к умолчанию.
  - «Диагностика»: скопировать структурированный отчёт для баг-репорта;
    очистить кеш селекторов, если обновление сайта сломало панель.
  - «Поддержать»: форма обратной связи (уходит в Telegram
    разработчика через Cloudflare Worker — без сторонней аналитики).
- Иконка в тулбаре открывает то же меню без открытия видео.
- Видео Дзена и VK Video подключаются ПО ЖЕЛАНИЮ: доступ к ним не
  запрашивается при установке, поэтому обновление никогда не выключает
  расширение. Откройте там видео, нажмите на иконку расширения и один
  раз подтвердите «Разрешить». На VK расширение работает только в
  разделе видео.
- Только для RuTube: переключатели скрытия заголовка плеера и
  Premium-баннеров.
- Доступность: aria-labels на шестерёнке, объявления через aria-live
  при смене скорости и статуса диагностики, поддержка
  prefers-reduced-motion. В полноэкранном режиме панель не мешает —
  интерфейс расширения не показывается поверх картинки, хоткеи работают.

ПОЧЕМУ РАБОТАЕТ НАДЁЖНО

Когда YouTube или RuTube меняет вёрстку, панель восстанавливается сама
через цепочку из пяти стратегий поиска (кеш селектора → точное
совпадение → подстрока → подъём от элемента видео → геометрическая
эвристика). Встроенный watchdog замечает поломку, чистит плохой кеш и
заново прикрепляет панель. При SPA-переходе между видео панель
пере-монтируется через MutationObserver, не теряя ваши настройки.

ПРИВАТНОСТЬ

- Все настройки хранятся локально в browser.storage.local.
- Никакой телеметрии, аналитики и удалённых вызовов.
- Декларация AMO data_collection_permissions = "none".
- Исходники открыты на GitHub для проверки.

ЯЗЫКИ

Английский и русский. Язык интерфейса определяется автоматически по
языку браузера при первом запуске; переключается в меню в любой момент.

СРАЗУ ПОСЛЕ УСТАНОВКИ

В новой вкладке автоматически откроётся короткая инструкция: что делает
каждый элемент, как назначить свои горячие клавиши и как закрепить
значок на панели. Занимает около минуты — можно закрыть и сразу
пользоваться.
```

## Single-purpose statement (CWS requires this)

> Manage video playback speed on YouTube and RuTube via in-player
> buttons, a slider, and configurable keyboard shortcuts.

Russian: Управление скоростью воспроизведения на YouTube и RuTube через
кнопки в плеере, ползунок и настраиваемые горячие клавиши.

## Permissions justification (CWS requires this)

| Permission | Why |
|---|---|
| `storage` | Persist user preferences (speed presets, hotkeys, language, slider position). |
| `activeTab` | Read the address of the tab you clicked the extension on, so the popup can show settings for that site and offer the one-click opt-in on Dzen. Scoped to that click; no background access to browsing history. |
| `host_permissions: *://*.youtube.com/*, *://rutube.ru/*, *://*.rutube.ru/*` | Inject the speed-control UI on the supported video sites. |
| `optional_host_permissions: *://dzen.ru/*, *://*.dzen.ru/*, *://vkvideo.ru/*, *://*.vkvideo.ru/*, *://vk.com/video*, *://vk.ru/video*` | Same speed-control UI on Dzen video and VK Video, requested only when the user opens that site and clicks "Allow" in the extension popup. Optional so that adding a site cannot disable the extension for existing users. The VK patterns are scoped to the video section — the extension never runs on the rest of vk.com. |

(No `tabs`, no `activeTab` for the popup -- the existing host_permissions
already grant URL access for the toolbar popup's active-tab check.)

## Categories

- Chrome Web Store: **Productivity** (or **Tools**)
- AMO: **Tabs** (or **Other**)

## Tags / keywords (where the store accepts them)

`video speed`, `playback speed`, `keyboard shortcuts`

(Kept to a few focused tags on purpose. The sister HDRezka listing was
rejected by CWS in 2026-05 for keyword stuffing after a longer list —
brand/site terms like youtube/rutube live in host_permissions and the
natural description, not a keyword pile. Benefit-first copy ranks on the
same terms without tripping the filter.)

## Screenshots to upload

Five 1280x800 JPEGs in `dist-store-assets/screenshots/`, designed for
the Chrome Web Store size + format constraints (CWS rejects anything
that isn't exactly 1280x800 / 640x400 and won't accept PNGs with an
alpha channel). Recommended upload order:

1. `01-youtube-panel.jpg` — full mock YouTube watch page with the
   panel docked under the player.
2. `02-youtube-settings.jpg` — same page with the settings modal open;
   shows preset grid + slider position + behaviour toggles in one
   image.
3. `03-rutube-panel.jpg` — full mock RuTube watch page with the panel.
4. `04-rutube-settings.jpg` — RuTube settings modal; demonstrates the
   RuTube-specific "Hide player title" / "Hide Premium banners" rows.
5. `05-welcome-page.jpg` — welcome onboarding (light theme; adds
   visual variety to the otherwise dark deck).

Re-generate any time with: `node tests/store-screenshots/render.mjs`
(needs an extension build under `.output/chrome-mv3/`; run
`npm run build` first).

## Privacy policy URL (CWS + AMO require this)

`https://github.com/danscMax/VideoSpeeds/blob/main/PRIVACY.md`
(GitHub renders the Markdown directly — no Pages setup needed.)

## Files to upload

Current version is **0.7.1** (`package.json` is the source of truth — the
zips are named from it, so read the version there instead of trusting this
table if the two ever disagree). Regenerate with `npm run zip` +
`npm run zip:firefox`.

| Store | File |
|---|---|
| Chrome Web Store | `.output/video-speeds-0.7.1-chrome.zip` |
| Firefox AMO (extension) | `.output/video-speeds-0.7.1-firefox.zip` |
| Firefox AMO (sources) | `.output/video-speeds-0.7.1-sources.zip` |
