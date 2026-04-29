# Welcome page — варианты переформулировок

23 фразы из словаря `src/i18n/dict.ts` (ключи `welcome.*`), для каждой — 5 опций (RU + EN парами).

**Как отвечать:** списком вида `1=a, 2=b, 3=своё: «...»`. По любой фразе можно сказать «оставить».

Пример полного ответа:

```
1=a, 2=b, 3=e, 4=a, 5=b, 6=a, 7=b, 8=a, 9=a, 10=b,
11=b, 12=a, 13=b, 14=a, 15=a, 16=a, 17=c, 18=b, 19=d,
20=a, 21=a, 22=d, 23=c
```

---

## Hero

### 1. Title (`welcome.title`)

*Сейчас:* «Сами решаете, как быстро смотреть» / "You decide how fast to watch"

| # | RU | EN |
|---|---|---|
| a | Видео в вашем темпе | Video at your pace |
| b | Управление скоростью на YouTube и RuTube | Speed control for YouTube and RuTube |
| c | Любая скорость, без потолка 2x | Any speed — no 2x ceiling |
| d | Скорость, которую выбираете вы | The speed you choose |
| e | Расширение скорости установлено | Speed extension is ready |

### 2. Subtitle (`welcome.subtitle`)

*Сейчас:* «0.5–10x вместо встроенных 0.5–2x. Кнопки, ползунок, хоткеи.» / "0.5–10x instead of the built-in 0.5–2x. Buttons, slider, hotkeys."

| # | RU | EN |
|---|---|---|
| a | Кнопки, ползунок и горячие клавиши для YouTube и RuTube. Диапазон от 0.5x до 10x. | Buttons, slider, and hotkeys for YouTube and RuTube. From 0.5x to 10x. |
| b | Расширьте диапазон скоростей с 0.5–2x до 0.5–10x на YouTube и RuTube. | Extend the speed range from 0.5–2x to 0.5–10x on YouTube and RuTube. |
| c | Управление скоростью прямо в плеере. Диапазон шире встроенного — до 10x. | Speed control right in the player — wider range than built-in, up to 10x. |
| d | Кнопки 1.5x, 2x, 3x в плеере. Свои значения до 10x. Горячие клавиши. | 1.5x, 2x, 3x buttons in the player. Custom values up to 10x. Hotkeys. |
| e | Скорость 0.5–10x для YouTube и RuTube. Без рекламы и трекинга. | 0.5–10x speed for YouTube and RuTube. No ads, no tracking. |

### 3. Value prop (`welcome.value`)

*Сейчас:* «⚡ Час лекции — за 30 минут.» / "⚡ One-hour lecture — in 30 minutes."

| # | RU | EN |
|---|---|---|
| a | ⚡ Лекции и подкасты в 2-3 раза быстрее | ⚡ Lectures and podcasts 2-3× faster |
| b | ⚡ Часовая лекция за полчаса на 2x | ⚡ A one-hour lecture in half an hour at 2x |
| c | ⚡ Сэкономьте время на длинных видео | ⚡ Save time on long videos |
| d | ⚡ Учиться, слушать и работать — быстрее | ⚡ Learn, listen, work — faster |
| e | (убрать строку value-prop совсем) | (drop the value-prop line entirely) |

---

## Block A — панель в плеере

### 4. Heading (`welcome.step1.title`)

*Сейчас:* «Кнопки скорости в один клик» / "Speed buttons in one click"

| # | RU | EN |
|---|---|---|
| a | Кнопки скорости — прямо в плеере | Speed buttons — right in the player |
| b | Управление скоростью под видео | Speed controls under your video |
| c | Скорость в одном клике | Speed at a click |
| d | Панель скоростей в плеере | Speed panel in the player |
| e | Все скорости — на расстоянии клика | All speeds — one click away |

### 5. Body (`welcome.step1.body`)

*Сейчас:* «Откройте видео на YouTube или RuTube — увидите эту строку под плеером.» / "Open a video on YouTube or RuTube — you will see this row under the player."

| # | RU | EN |
|---|---|---|
| a | Эта панель встраивается под плеер на YouTube и RuTube — вот так: | This panel embeds under the player on YouTube and RuTube — like this: |
| b | На YouTube и RuTube под плеером появляется эта строка с кнопками скорости. | On YouTube and RuTube, this row of speed buttons appears under the player. |
| c | Открыли видео — панель уже там. | Open a video — the panel is already there. |
| d | Зайдите на YouTube или RuTube — панель встраивается автоматически. | Visit YouTube or RuTube — the panel appears automatically. |
| e | На любом видео YouTube или RuTube вы увидите эту панель скорости. | On any YouTube or RuTube video, you'll see this speed panel. |

### 6. Annotation «Клик» (`welcome.ann.clicks`)

*Сейчас:* «**Клик** — временно для этого видео.\n**Двойной клик** — сохранить как основную скорость.» / "**Click** — temporary speed for this video.\n**Double-click** — save as default speed."

| # | RU | EN |
|---|---|---|
| a | **Клик** — изменить скорость только для этого видео. **Двойной клик** — сделать скоростью по умолчанию. | **Click** — change speed for this video only. **Double-click** — make it your default. |
| b | **Клик** — на одно видео. **Двойной клик** — для всех видео сайта. | **Click** — for this video. **Double click** — for every video on the site. |
| c | **Клик** = временно. **Двойной клик** = запомнить. | **Click** = temporary. **Double-click** = remember. |
| d | **Один клик** — попробовать скорость. **Двойной клик** — закрепить как стандартную. | **One click** — try a speed. **Double-click** — lock it as standard. |
| e | **Клик** на скорость — переключиться. **Двойной клик** — закрепить навсегда. | **Click** a speed — switch. **Double-click** — lock it in. |

### 7. Annotation «Ползунок» (`welcome.ann.slider`)

*Сейчас:* «**Ползунок** — тонкая настройка перетаскиванием.» / "**Slider** — fine-tune by dragging."

| # | RU | EN |
|---|---|---|
| a | **Ползунок** — для точных значений между кнопками. | **Slider** — for exact values between buttons. |
| b | **Ползунок** — плавная скорость, например 1.7x или 2.3x. | **Slider** — smooth speed, e.g. 1.7x or 2.3x. |
| c | **Перетащите ползунок** — любая точная скорость до 10x. | **Drag the slider** — any precise speed up to 10x. |
| d | **Ползунок** — между фиксированными кнопками. | **Slider** — between the fixed buttons. |
| e | **Ползунок** — когда нужно мельче кнопочного шага. | **Slider** — when you need finer than the button step. |

### 8. Annotation «Шестерёнка» (`welcome.ann.gear`)

*Сейчас:* «**Шестерёнка** — открыть полные настройки.» / "**Gear** — open full settings."

| # | RU | EN |
|---|---|---|
| a | **Шестерёнка** — все настройки расширения. | **Gear** — all extension settings. |
| b | **Кнопка ⚙** — клавиши, скорости, диагностика. | **⚙ button** — keys, speeds, diagnostics. |
| c | **Шестерёнка** — настройки прямо в плеере, без отдельного окна. | **Gear** — settings inside the player, no separate window. |
| d | **Шестерёнка** — открыть меню настроек. | **Gear** — open the settings menu. |
| e | **⚙** — настроить кнопки, клавиши и поведение. | **⚙** — configure buttons, keys, and behaviour. |

---

## Block B — настройки

### 9. Heading (`welcome.step2.title`)

*Сейчас:* «Включайте кнопки, добавляйте свои» / "Toggle buttons, add your own"

| # | RU | EN |
|---|---|---|
| a | Настройка под себя | Make it yours |
| b | Любые кнопки, любые скорости | Any buttons, any speeds |
| c | Покажите только нужные скорости | Show only the speeds you need |
| d | Настройка кнопок и скоростей | Configure buttons and speeds |
| e | Свой набор скоростей | Your speed lineup |

### 10. Body (`welcome.step2.body`)

*Сейчас:* «Клик по шестерёнке открывает окно настроек прямо в плеере.» / "A click on the gear opens the settings window right inside the player."

| # | RU | EN |
|---|---|---|
| a | Шестерёнка открывает настройки прямо поверх плеера — без отдельных окон. | The gear opens settings on top of the player — no separate windows. |
| b | Все настройки — за один клик, не покидая видео. | All settings — one click away, without leaving the video. |
| c | Меню выезжает из плеера. Внутри — выбор кнопок, клавиши, диагностика. | The settings menu slides out of the player. Inside — button selection, keys, diagnostics. |
| d | Шестерёнка → настройки. | Gear → settings. |
| e | Настройки доступны прямо в плеере YouTube или RuTube. | Settings are available right in the YouTube or RuTube player. |

### 11. Annotation «?» (`welcome.ann.help`)

*Сейчас:* «**?** — снова открыть эту страницу с подсказками.» / "**?** — open this welcome page again."

| # | RU | EN |
|---|---|---|
| a | **?** — снова открыть это руководство. | **?** — reopen this guide. |
| b | **?** — вернуться на страницу-инструкцию. | **?** — back to the welcome page. |
| c | **?** — справка и эта страница. | **?** — help and this page. |
| d | **?** — повторно показать обучение. | **?** — show the tutorial again. |
| e | **?** — гайд по расширению. | **?** — extension guide. |

### 12. Annotation «4 вкладки» (`welcome.ann.tabs`)

*Сейчас:* «**4 вкладки**: настройки, клавиши, диагностика и донат.» / "**4 tabs**: settings, keys, diagnostics and donate."

| # | RU | EN |
|---|---|---|
| a | **4 раздела**: общие, клавиши, диагностика, поддержка. | **4 sections**: general, keys, diagnostics, support. |
| b | **Вкладки**: общие · клавиши · диагностика · поддержать. | **Tabs**: general · keys · diagnostics · support. |
| c | **4 страницы настроек** — каждая для своего. | **4 settings pages** — each for its own thing. |
| d | **Меню**: настройки → клавиши → диагностика → донат. | **Menu**: settings → keys → diagnostics → donate. |
| e | **Вкладки сверху**: общие, клавиши, диагностика, поддержка автора. | **Tabs above**: general, keys, diagnostics, supporting the author. |

### 13. Annotation «Сетка скоростей» (`welcome.ann.presets`)

*Сейчас:* «**Сетка скоростей** — тапайте чтобы вкл/выкл, или введите своё значение до 10x.» / "**Speed grid** — tap to enable/disable, or type your own value up to 10x."

| # | RU | EN |
|---|---|---|
| a | **Какие кнопки видны** — выберите. Можно ввести свою скорость до 10x. | **Pick which buttons show**. Or type a custom speed up to 10x. |
| b | **Кнопки в плеере** — отметьте нужные. Кастомные значения до 10x. | **Buttons in the player** — check the ones you want. Custom values up to 10x. |
| c | **Скорости** — клик по пилюле включает/выключает, любое значение до 10x можно добавить. | **Speeds** — click a pill to toggle, add any value up to 10x. |
| d | **Свой набор скоростей** — отметить или ввести вручную (до 10x). | **Your speed set** — toggle or type manually (up to 10x). |
| e | **Сетка** — какие пресеты показывать. Кастомные значения через поле ниже. | **Grid** — which presets to show. Custom values via the field below. |

---

## Hotkeys editor

### 14. Heading (`welcome.hotkeys.title`)

*Сейчас:* «Точная подстройка с клавиатуры» / "Fine-tune from the keyboard"

| # | RU | EN |
|---|---|---|
| a | Горячие клавиши | Hotkeys |
| b | Свои клавиши для скорости | Your keys for speed control |
| c | Управление с клавиатуры | Keyboard control |
| d | Клавиши под себя | Keys your way |
| e | Скорость с клавиатуры | Speed via keyboard |

### 15. Body (`welcome.hotkeys.body`)

*Сейчас:* «Захватите свои клавиши и выберите размер шага.» / "Capture your own keys and pick how big each step is."

| # | RU | EN |
|---|---|---|
| a | Назначьте свои клавиши и шаг скорости. | Set your own keys and the speed step. |
| b | Не отрывая руки от клавиатуры — мгновенная подстройка. | Without leaving the keyboard — instant adjustment. |
| c | Своя комбинация для ускорения, своя для замедления, свой шаг. | Your combo for faster, your combo for slower, your step. |
| d | Клавиши под ваш сценарий — и можно жать. | Keys to fit your habits — then you're set. |
| e | Подстройка ±0.1x за нажатие. И клавиши, и шаг — настраиваются. | ±0.1x per press by default. Both keys and step are configurable. |

### 16. Capture placeholder (`welcome.hotkeys.placeholder`)

*Сейчас:* «Кликните и нажмите клавиши» / "Click and press keys"

| # | RU | EN |
|---|---|---|
| a | Нажмите комбинацию клавиш | Press a key combination |
| b | Клик — и нажмите клавиши | Click — then press keys |
| c | Запишите сочетание | Record a shortcut |
| d | Клик и сочетание клавиш | Click and key combo |
| e | Назначить клавиши | Assign keys |

### 17. Step label (`welcome.hotkeys.step_label`)

*Сейчас:* «Шаг за нажатие» / "Step per press"

| # | RU | EN |
|---|---|---|
| a | Шаг изменения | Step size |
| b | На сколько менять | Change by |
| c | Размер шага | Step amount |
| d | Шаг скорости | Speed step |
| e | ±x за нажатие | ±x per press |

### 18. Step help (`welcome.hotkeys.step_help`)

*Сейчас:* «На сколько меняется скорость за нажатие. От 0.01 до 1.0.» / "How much speed shifts per press. From 0.01 to 1.0."

| # | RU | EN |
|---|---|---|
| a | Сколько прибавляется/вычитается за нажатие. От 0.01 (тонко) до 1.0 (грубо). | How much is added/subtracted per press. From 0.01 (fine) to 1.0 (coarse). |
| b | Размер шага: 0.1 — стандартно, 0.25 — крупный шаг. | Step: 0.1 — standard, 0.25 — coarse. |
| c | Скорость меняется на это значение при нажатии. Допустимо 0.01–1.0. | Speed changes by this amount per press. Range 0.01–1.0. |
| d | От 0.01 (минимальный шаг) до 1.0 (максимальный). | From 0.01 (smallest step) to 1.0 (largest). |
| e | Меньше — точнее. Больше — резче. | Smaller = more precise. Larger = sharper. |

### 19. More options link (`welcome.hotkeys.more`)

*Сейчас:* «Больше клавиш и второй слот — в настройках расширения →» / "More keys & second slot — in the extension settings →"

| # | RU | EN |
|---|---|---|
| a | Расширенные настройки клавиш — в шестерёнке плеера. | Advanced shortcut config — in the player's gear menu. |
| b | Дополнительный слот и сброс — в настройках расширения. | Extra slot & reset — in the extension settings. |
| c | Больше опций (второй слот, сброс) — в окне настроек. | More options (second slot, reset) — in the settings window. |
| d | Все хоткеи — во вкладке «Клавиши» в настройках. | All shortcuts — in the «Keys» tab in settings. |
| e | Расширенные настройки — в плеере, на шестерёнке. | Advanced settings — in the gear menu inside the player. |

---

## Tips footer

### 20. Re-open tip (`welcome.tips.reopen`)

*Сейчас:* «**Вернуть эту страницу** можно через значок **?** в окне настроек расширения.» / "**Reopen this page** any time via the **?** icon in the extension settings window."

| # | RU | EN |
|---|---|---|
| a | **Открыть снова** — значок **?** в настройках расширения. | **Reopen** — the **?** icon in the extension settings. |
| b | **Эта страница вернётся** через **?** в шестерёнке плеера. | **This page returns** via **?** in the player's gear menu. |
| c | **Перечитать** — кликнуть **?** в окне настроек. | **Re-read** — click **?** in the settings window. |
| d | **Welcome-страница** доступна через **?**. | **Welcome page** is available via **?**. |
| e | **Гайд под рукой** — значок **?** в настройках. | **Guide on hand** — the **?** icon in settings. |

### 21. Pin tip (`welcome.pin.tip`)

*Сейчас:* «**Совет:** закрепите иконку расширения через значок-пазл рядом с адресной строкой.» / "**Tip:** pin the extension via the puzzle icon next to the address bar."

| # | RU | EN |
|---|---|---|
| a | **Закрепите иконку** — пазл рядом с адресной строкой. | **Pin the icon** — puzzle next to the address bar. |
| b | **Под рукой** — закрепите расширение через 🧩 в верхней панели. | **Keep handy** — pin via 🧩 in the toolbar. |
| c | **Иконка ближе** — нажмите пазл вверху браузера и закрепите. | **Icon closer** — click the puzzle at the top and pin. |
| d | **Закрепить** — пазл (🧩) → закрепить. | **Pin it** — puzzle (🧩) → pin. |
| e | **Чтобы быстрее находить** — закрепите расширение в верхней панели браузера. | **For quick access** — pin the extension to the toolbar. |

---

## Donate

### 22. Heading (`welcome.donate.title`)

*Сейчас:* «Если расширение полезно — поддержите автора» / "If it is useful — support the developer"

| # | RU | EN |
|---|---|---|
| a | Расширение помогает? Поддержите автора | Does the extension help? Support the developer |
| b | Без рекламы — на чистом энтузиазме | No ads — built on pure enthusiasm |
| c | Спасибо мотивирует продолжать | A thanks keeps this going |
| d | Спасибо, что попробовали. Если нравится — поддержите | Thanks for trying. If you like it — support |
| e | Сделано в свободное время. Помочь — необязательно, но приятно | Made in spare time. Helping is optional but appreciated |

### 23. Body (`welcome.donate.body`)

*Сейчас:* «Любая сумма приветствуется и очень мотивирует. Никакой рекламы, никакого трекинга.» / "Any tip is welcome and genuinely motivating. No ads, no tracking."

| # | RU | EN |
|---|---|---|
| a | Расширение бесплатное и навсегда без рекламы. Любая поддержка помогает развивать его дальше. | The extension is free and ad-free forever. Any support helps it grow. |
| b | Open-source проект на голом энтузиазме. Любая сумма продлевает мотивацию. | Open-source, built on enthusiasm. Any amount keeps the motivation going. |
| c | Никакого трекинга, никаких баннеров. Поддержите если есть желание. | No tracking, no banners. Support if you feel like it. |
| d | Без сбора данных и без подписок. Любая благодарность приветствуется. | No data collection, no subscriptions. Any thanks is welcome. |
| e | Этот проект — хобби. Любая сумма поможет уделять ему больше времени. | This project is a hobby. Any amount helps me spend more time on it. |
