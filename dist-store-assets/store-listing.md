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
Watch lectures, tutorials and reviews in less time. This extension puts a
row of speed buttons right under the player on YouTube, RuTube, Dzen and
VK Video: one click and a slow talk moves at twice the pace, one more
click brings it back to normal.

What it does

- Speed buttons under the video. Out of the box they run from 1x to
  3.25x on YouTube and to 3x on the other sites. Which buttons you see
  is up to you — pick them in the settings from a range that goes from
  0.5x to 4x.
- A slider for anything in between, with the exact rate shown above the
  handle as you drag. It stops at your fastest button by default; raise
  its ceiling to 10x in the settings if you want more.
- One click sets the speed for the video you are watching. A double
  click makes it the speed every new video starts at — the saved button
  is marked with a dot in the corner.
- Keyboard shortcuts, several combinations per action if you like, so a
  remote and a keyboard can both do the job. Rebind them and set the
  step in the settings.
- A gear menu inside the player: where the slider sits, interface
  language, which speed buttons to show, how the panel behaves. There is
  also a feedback form that reaches the developer directly, and a report
  you can copy in one click if a site update ever knocks the panel out.
- The toolbar icon opens the same menu without opening a video first.
- Dzen and VK Video are opt-in. Nothing is requested when you install:
  open a video there, click the icon and allow it once. On VK the
  extension only ever runs in the video section.
- On RuTube you can also hide the title that sits on top of the player
  and the Premium banners.
- In fullscreen the panel keeps out of the picture, while the speed you
  chose is confirmed by a large label. The shortcuts keep working.

When a site changes

Video sites redesign without warning, and a panel pinned to one spot
disappears the moment they do. This one looks for the player five
different ways in turn and re-attaches itself wherever it turns up. The
check runs continuously, so there is nothing for you to fix by hand.

Privacy

Your settings stay in your own browser. The extension collects no
statistics, tracks nothing you watch and sends nothing anywhere. The
source code is open, so any of this can be checked.

Languages

English and Russian. The interface follows your browser on first run and
can be switched from the menu at any time.

Right after you install

A short guide opens in a new tab: what each control does, how to set
your shortcuts, how to pin the icon to the toolbar. A minute to read,
then close it and get on with it.
```

(Roughly 1,800 characters out of the 16,000 limit -- room to grow.)

### Russian translation

```
Смотрите лекции, разборы и обзоры быстрее. Расширение ставит ряд кнопок
скорости прямо под плеером YouTube, RuTube, Дзена и VK Видео: один клик —
и размеренная речь идёт вдвое быстрее, ещё один возвращает обычную
скорость.

Что умеет

- Кнопки скорости под видео. Из коробки — от 1× до 3.25× на YouTube и до
  3× на остальных сайтах. Какие кнопки видны, решаете вы: набор
  собирается в настройках из значений от 0.5× до 4×.
- Ползунок для промежуточных значений: точное число видно над бегунком,
  пока вы его тянете. По умолчанию он доходит до вашей самой быстрой
  кнопки, а в настройках предел поднимается до 10×.
- Один клик задаёт скорость для этого видео. Двойной — делает её той, с
  которой начинаются все новые; сохранённая кнопка помечена точкой в
  углу.
- Горячие клавиши. На одно действие можно назначить несколько сочетаний
  — скажем, чтобы работали и клавиатура, и пульт. Сочетания и шаг
  меняются в настройках.
- Меню на шестерёнке прямо в плеере: где показывать ползунок, язык
  интерфейса, набор кнопок, поведение панели. Там же форма обратной
  связи — письмо приходит разработчику, — и отчёт, который копируется
  одной кнопкой, если после обновления сайта панель собьётся.
- Значок на панели браузера открывает то же меню, не открывая видео.
- Дзен и VK Видео подключаются по желанию. При установке доступ к ним не
  запрашивается: откройте там ролик, нажмите на значок и один раз
  разрешите. На VK расширение работает только в разделе видео.
- На RuTube можно вдобавок убрать заголовок поверх плеера и баннеры
  Premium.
- В полноэкранном режиме панель не загораживает картинку, а выбранная
  скорость подтверждается крупной плашкой. Горячие клавиши продолжают
  работать.

Если сайт изменится

Видеосайты меняют вёрстку без предупреждения, и панель, привязанная к
одному месту, после этого просто исчезает. Эта ищет плеер пятью
способами по очереди и прикрепляется туда, где он оказался. Проверка
идёт постоянно, так что чинить руками ничего не нужно.

Приватность

Настройки хранятся в вашем браузере. Расширение не собирает статистику,
не следит за тем, что вы смотрите, и никуда ничего не отправляет.
Исходный код открыт — всё это можно проверить.

Языки

Русский и английский. При первом запуске язык берётся из браузера, потом
переключается в меню.

Сразу после установки

В новой вкладке откроется короткая инструкция: что делает каждый
элемент, как назначить горячие клавиши и как закрепить значок на панели.
Минута чтения — и можно закрывать.
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

Six 1280x800 JPEGs in `dist-store-assets/screenshots/`, designed for
the Chrome Web Store size + format constraints (CWS rejects anything
that isn't exactly 1280x800 / 640x400 and won't accept PNGs with an
alpha channel). Upload order matters: **Chrome shows only the first
five**, AMO takes all six.

1. `01-youtube-panel.jpg` — full mock YouTube watch page with the
   panel docked under the player.
2. `02-youtube-settings.jpg` — same page with the settings modal open;
   shows preset grid + slider position + behaviour toggles in one
   image.
3. `03-dzen-panel.jpg` — Dzen with the panel under its player. Third
   on purpose: Dzen's own player has no speed control of any kind, so
   this is the one image no competitor's listing can show. Added
   2026-08-12 — the deck had promised Dzen since 0.7.0 while showing
   only YouTube and RuTube.
4. `04-rutube-panel.jpg` — full mock RuTube watch page with the panel.
5. `05-rutube-settings.jpg` — RuTube settings modal; demonstrates the
   RuTube-specific "Hide player title" / "Hide Premium banners" rows.
6. `06-welcome-page.jpg` — welcome onboarding (light theme; adds
   visual variety to the otherwise dark deck). Falls outside Chrome's
   five-image limit deliberately: it is the least persuasive frame for
   somebody deciding whether to install.

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
