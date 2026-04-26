/**
 * Bilingual dictionary (RU/EN). Ported from
 * `YouTube & HDRezka Speeds.user.js` lines 270-491 with three additions
 * needed by the extension:
 *
 *   - tm.detected.*       coexistence notification (Wave 1.0c)
 *   - migration.*         one-time TM-import notification (Wave 1.4)
 *   - settings.export/import   JSON migration UI (Wave 1.8b workaround for
 *                              GM-storage that the extension can't read; see
 *                              docs/MIGRATION.md)
 *
 * Contract (audit M3): every value is plain text. No `<`, `>`, `&` glyphs;
 * markup is built from trusted templates outside of i18n. Variable
 * interpolation uses `{name}` placeholders -- escape user-supplied values
 * BEFORE substituting them in.
 *
 * Adding a new key: add it to `en` first (the canonical surface), then to
 * `ru`. The DictKey type derives from `en`, so a missing English entry is a
 * compile error and a missing Russian entry is caught by the i18n.spec.ts
 * coverage test.
 */

export const I18N_DICT = {
  en: {
    // menu.*
    'menu.title': 'Playback Speed',
    'menu.version_tip': 'Script version',

    // tabs.*
    'tabs.general': 'General',
    'tabs.general.tip': 'Slider position, behavior and advanced options',
    'tabs.shortcuts': 'Shortcuts',
    'tabs.shortcuts.tip': 'Keyboard shortcuts for changing playback speed',
    'tabs.diag': 'Diagnostics',
    'tabs.diag.tip': 'Script status, copy report, clear cache',

    // general.*
    'general.slider_pos': 'Slider position',
    'general.pos.right': 'Right',
    'general.pos.right.tip': 'Slider on the right of the speed buttons',
    'general.pos.bottom': 'Below',
    'general.pos.bottom.tip': 'Slider on a separate row below the buttons',
    'general.pos.video': 'In player',
    'general.pos.video.tip': "Embed slider into the YouTube player's bottom control bar",

    // behavior.*
    'behavior.section': 'Behavior',
    'behavior.remember': 'Remember last speed',
    'behavior.remember.tip': 'Save the chosen speed and apply it to next videos automatically',
    'behavior.hide_title': 'Hide player title overlay',
    'behavior.hide_title.tip': "Hide the annoying overlay title shown by RuTube's raichu player (including in fullscreen)",
    'behavior.hide_premium': 'Hide Premium banners',
    'behavior.hide_premium.tip': 'Hide RuTube Premium subscription banners and call-to-action blocks (sidebar, header, in-player promos)',

    // advanced.*
    'advanced.section': 'Advanced',
    'advanced.discovery': 'Auto-recover selectors',
    'advanced.discovery.hint': 'When the site updates and breaks our selectors, the script tries 5 strategies to find the player and panel automatically (cache, exact, substring, ancestor-of-video, geometric heuristic). Disable this if a bad cached selector keeps breaking the UI.',
    'advanced.healthcheck': 'Self-diagnostics',
    'advanced.healthcheck.hint': 'Periodically verifies that everything works (panel inserted, speed applied, no rate-resets storm). Shows a red dot on the gear button if something is wrong, with a detailed report on the Diagnostics tab.',

    // hotkeys.*
    'hotkeys.help': 'You can assign multiple combinations to one action -- for example, one for the keyboard and another for a remote. Click the field and press the keys you want.',
    'hotkeys.speedup_label': 'Speed up (+0.1)',
    'hotkeys.speeddown_label': 'Slow down (-0.1)',
    'hotkeys.placeholder': 'Click and press keys...',
    'hotkeys.input.tip': 'Click the field, then press the key combination you want',
    'hotkeys.remove.tip': 'Remove this shortcut',
    'hotkeys.add': 'Add shortcut',
    'hotkeys.add.tip': 'Add another key combination for this action (e.g. for both keyboard and remote control)',
    'hotkeys.reset': 'Reset to default',
    'hotkeys.reset.tip': 'Restore default shortcut',

    // diag.*
    'diag.btn.recheck': 'Run check',
    'diag.btn.recheck.tip': 'Run a status check right now and update the indicator above',
    'diag.btn.copy': 'Copy report',
    'diag.btn.copy.tip': 'Copy a detailed report to your clipboard. Send it to the developer if you have a bug to report.',
    'diag.btn.purge': 'Clear cache',
    'diag.btn.purge.tip': 'Delete remembered player selectors. Useful if the script picked the wrong element and keeps breaking the UI on every page load.',
    'diag.btn.full_reset': 'Reset everything',
    'diag.btn.full_reset.tip': 'Erase ALL settings and cache. The script returns to its fresh-install state. This cannot be undone.',
    'diag.full_reset_confirm': 'Erase ALL settings and selector cache?\n\nThis cannot be undone -- you will lose your shortcuts, language preference, default speed, and discovery cache. Reload the page after the reset.',
    'diag.privacy': 'Reports do not include search queries or URL fragments -- only the domain and the page path.',

    // diag.status.*
    'diag.status.not_checked': 'Not checked yet',
    'diag.status.click_to_check': 'Click "Run check" to test now',
    'diag.status.ok': 'Everything is working',
    'diag.status.last_check': 'Last check: {time}',
    'diag.status.issue_single': 'Issue: {issue}',
    'diag.status.issues_count': '{count} issues found',
    'diag.status.try_again': 'Try "Clear cache" or "Run check" again. Copy the report if it persists.',
    'diag.status.waiting': 'Waiting for video playback',
    'diag.status.waiting_detail': 'Press play on the video to verify everything works',

    // diag.issue.*
    'diag.issue.video_not_found': "video element wasn't found",
    'diag.issue.player_not_found': "player wasn't found",
    'diag.issue.layout_unrecognised': "page layout wasn't recognised",
    'diag.issue.panel_not_inserted': "speed panel didn't appear on the page",
    'diag.issue.speed_not_applied': "playback speed isn't being applied",
    'diag.issue.rate_resets': 'the site keeps resetting your speed',

    // lang.*
    'lang.section_label': 'Language',
    'lang.tooltip_en': 'Switch interface to English',
    'lang.tooltip_ru': 'Switch interface to Russian',

    // toast.*
    'toast.speed_global': 'Speed {speed}x saved as default',
    'toast.shortcut_min': 'At least one shortcut must remain',
    'toast.discovery_on': 'Auto-recover enabled',
    'toast.discovery_off': 'Auto-recover disabled',
    'toast.healthcheck_on': 'Self-diagnostics enabled',
    'toast.healthcheck_off': 'Self-diagnostics disabled',
    'toast.title_hidden': 'Player title hidden',
    'toast.title_shown': 'Player title shown',
    'toast.premium_hidden': 'Premium banners hidden',
    'toast.premium_shown': 'Premium banners shown',
    'toast.diag_ok': 'Everything is working',
    'toast.diag_issues': 'Issues detected -- see Diagnostics tab',
    'toast.diag_waiting': 'Waiting -- start the video first',
    'toast.report_copied': 'Report copied to clipboard',
    'toast.report_copied_short': 'Report copied',
    'toast.report_copy_failed': 'Failed to copy report',
    'toast.cache_cleared': 'Selector cache cleared',
    'toast.reset_done': 'Reset complete -- please reload the page',
    'toast.reset_failed': 'Reset failed: {message}',
    'toast.lang_switched': 'Language switched to English',

    // confirm.*
    'confirm.full_reset': 'Reset everything: all settings and cache will be erased. Continue?',

    // tm.detected.* -- audit C3/H8, surfaced when the userscript is also active.
    'tm.detected.title': 'Userscript already active',
    'tm.detected.body': 'The Tampermonkey userscript and the extension are both running. Disable one of them to avoid duplicate UI and conflicting hotkeys.',

    // migration.* -- audit C5, fired once after first-run TM data import succeeds.
    'migration.tm_imported': 'Imported settings from the previous Tampermonkey installation.',

    // settings.export / import -- Wave 1.8b, manual fallback for the
    // GM-storage data the extension cannot read directly.
    'settings.export': 'Export settings',
    'settings.export.tip': 'Save current settings as a JSON file you can import later or on another browser.',
    'settings.import': 'Import settings',
    'settings.import.tip': 'Load settings from a JSON file previously exported by the userscript or extension.',
    'settings.import.success': 'Settings imported successfully',
    'settings.import.failure': 'Import failed: {message}',
  },
  ru: {
    // menu.*
    'menu.title': 'Скорость воспроизведения',
    'menu.version_tip': 'Версия скрипта',

    // tabs.*
    'tabs.general': 'Общие',
    'tabs.general.tip': 'Положение ползунка, поведение и расширенные опции',
    'tabs.shortcuts': 'Горячие клавиши',
    'tabs.shortcuts.tip': 'Сочетания клавиш для управления скоростью',
    'tabs.diag': 'Диагностика',
    'tabs.diag.tip': 'Статус скрипта, копирование отчёта, очистка кеша',

    // general.*
    'general.slider_pos': 'Положение ползунка',
    'general.pos.right': 'Справа',
    'general.pos.right.tip': 'Ползунок справа от кнопок скорости',
    'general.pos.bottom': 'Снизу',
    'general.pos.bottom.tip': 'Ползунок на отдельной строке под кнопками',
    'general.pos.video': 'В плеере',
    'general.pos.video.tip': 'Встроить ползунок в нижнюю панель плеера YouTube',

    // behavior.*
    'behavior.section': 'Поведение',
    'behavior.remember': 'Запоминать последнюю скорость',
    'behavior.remember.tip': 'Сохранять выбранную скорость и автоматически применять её к следующим видео',
    'behavior.hide_title': 'Скрыть заголовок плеера',
    'behavior.hide_title.tip': 'Скрывать назойливый заголовок поверх плеера RuTube (включая полноэкранный режим)',
    'behavior.hide_premium': 'Скрыть Premium-баннеры',
    'behavior.hide_premium.tip': 'Скрывать баннеры подписки RuTube Premium и призывы к подписке (боковая панель, шапка, реклама в плеере)',

    // advanced.*
    'advanced.section': 'Расширенные',
    'advanced.discovery': 'Авто-восстановление селекторов',
    'advanced.discovery.hint': 'Когда сайт обновляется и ломает наши селекторы, скрипт пробует 5 стратегий поиска плеера и панели автоматически (кеш, точное совпадение, подстрока, предок видео, геометрическая эвристика). Отключите, если повреждённый кеш постоянно ломает интерфейс.',
    'advanced.healthcheck': 'Самодиагностика',
    'advanced.healthcheck.hint': 'Периодически проверяет, что всё работает (панель встроена, скорость применяется, нет шторма сбросов). Показывает красную точку на шестерёнке, если что-то не так, с подробным отчётом во вкладке «Диагностика».',

    // hotkeys.*
    'hotkeys.help': 'Можно назначить несколько комбинаций на одно действие -- например, одну для клавиатуры, другую для пульта. Кликните по полю и нажмите нужные клавиши.',
    'hotkeys.speedup_label': 'Ускорить (+0.1)',
    'hotkeys.speeddown_label': 'Замедлить (-0.1)',
    'hotkeys.placeholder': 'Кликните и нажмите клавиши...',
    'hotkeys.input.tip': 'Кликните по полю и нажмите нужное сочетание клавиш',
    'hotkeys.remove.tip': 'Удалить эту комбинацию',
    'hotkeys.add': 'Добавить комбинацию',
    'hotkeys.add.tip': 'Добавить ещё одну комбинацию для этого действия (например, для клавиатуры и пульта)',
    'hotkeys.reset': 'Сбросить по умолчанию',
    'hotkeys.reset.tip': 'Восстановить сочетание по умолчанию',

    // diag.*
    'diag.btn.recheck': 'Проверить',
    'diag.btn.recheck.tip': 'Запустить проверку прямо сейчас и обновить индикатор выше',
    'diag.btn.copy': 'Копировать отчёт',
    'diag.btn.copy.tip': 'Скопировать подробный отчёт в буфер обмена. Отправьте разработчику, если хотите сообщить об ошибке.',
    'diag.btn.purge': 'Очистить кеш',
    'diag.btn.purge.tip': 'Удалить запомненные селекторы плеера. Полезно, если скрипт выбрал не тот элемент и постоянно ломает интерфейс при каждой загрузке.',
    'diag.btn.full_reset': 'Сбросить всё',
    'diag.btn.full_reset.tip': 'Стереть ВСЕ настройки и кеш. Скрипт вернётся в состояние свежей установки. Это действие нельзя отменить.',
    'diag.full_reset_confirm': 'Удалить ВСЕ настройки и кеш селекторов?\n\nЭто действие нельзя отменить -- вы потеряете горячие клавиши, выбор языка, скорость по умолчанию и кеш discovery. После сброса перезагрузите страницу.',
    'diag.privacy': 'Отчёты не содержат поисковых запросов и фрагментов URL -- только домен и путь страницы.',

    // diag.status.*
    'diag.status.not_checked': 'Ещё не проверено',
    'diag.status.click_to_check': 'Нажмите «Проверить», чтобы запустить сейчас',
    'diag.status.ok': 'Всё работает',
    'diag.status.last_check': 'Последняя проверка: {time}',
    'diag.status.issue_single': 'Проблема: {issue}',
    'diag.status.issues_count': 'Найдено проблем: {count}',
    'diag.status.try_again': 'Попробуйте «Очистить кеш» или «Проверить» ещё раз. Скопируйте отчёт, если проблема сохраняется.',
    'diag.status.waiting': 'Ожидание запуска видео',
    'diag.status.waiting_detail': 'Запустите видео, чтобы проверить, что всё работает',

    // diag.issue.*
    'diag.issue.video_not_found': 'элемент видео не найден',
    'diag.issue.player_not_found': 'плеер не найден',
    'diag.issue.layout_unrecognised': 'разметка страницы не распознана',
    'diag.issue.panel_not_inserted': 'панель скорости не появилась на странице',
    'diag.issue.speed_not_applied': 'скорость воспроизведения не применяется',
    'diag.issue.rate_resets': 'сайт постоянно сбрасывает скорость',

    // lang.*
    'lang.section_label': 'Язык',
    'lang.tooltip_en': 'Переключить интерфейс на английский',
    'lang.tooltip_ru': 'Переключить интерфейс на русский',

    // toast.*
    'toast.speed_global': 'Скорость {speed}x сохранена как глобальная',
    'toast.shortcut_min': 'Должна остаться хотя бы одна комбинация',
    'toast.discovery_on': 'Авто-восстановление включено',
    'toast.discovery_off': 'Авто-восстановление выключено',
    'toast.healthcheck_on': 'Самодиагностика включена',
    'toast.healthcheck_off': 'Самодиагностика выключена',
    'toast.title_hidden': 'Заголовок плеера скрыт',
    'toast.title_shown': 'Заголовок плеера показан',
    'toast.premium_hidden': 'Premium-баннеры скрыты',
    'toast.premium_shown': 'Premium-баннеры показаны',
    'toast.diag_ok': 'Всё работает',
    'toast.diag_issues': 'Обнаружены проблемы -- см. вкладку «Диагностика»',
    'toast.diag_waiting': 'Ожидание -- сначала запустите видео',
    'toast.report_copied': 'Отчёт скопирован в буфер обмена',
    'toast.report_copied_short': 'Отчёт скопирован',
    'toast.report_copy_failed': 'Не удалось скопировать отчёт',
    'toast.cache_cleared': 'Кеш селекторов очищен',
    'toast.reset_done': 'Сброс выполнен -- пожалуйста, перезагрузите страницу',
    'toast.reset_failed': 'Ошибка сброса: {message}',
    'toast.lang_switched': 'Язык переключён на русский',

    // confirm.*
    'confirm.full_reset': 'Сбросить всё: все настройки и кеш будут стёрты. Продолжить?',

    // tm.detected.*
    'tm.detected.title': 'Пользовательский скрипт уже работает',
    'tm.detected.body': 'Tampermonkey-скрипт и расширение запущены одновременно. Отключите один из них, чтобы избежать дублирования интерфейса и конфликтов горячих клавиш.',

    // migration.*
    'migration.tm_imported': 'Настройки из предыдущей установки Tampermonkey успешно импортированы.',

    // settings.export / import
    'settings.export': 'Экспортировать настройки',
    'settings.export.tip': 'Сохранить текущие настройки в JSON-файл для последующего импорта или переноса в другой браузер.',
    'settings.import': 'Импортировать настройки',
    'settings.import.tip': 'Загрузить настройки из JSON-файла, ранее экспортированного из скрипта или расширения.',
    'settings.import.success': 'Настройки успешно импортированы',
    'settings.import.failure': 'Ошибка импорта: {message}',
  },
} as const;

export const SUPPORTED_LANGS = ['en', 'ru'] as const;

export type Lang = (typeof SUPPORTED_LANGS)[number];

/** All translation keys. Derived from the canonical English dictionary so a
 *  missing English entry is a compile error. */
export type DictKey = keyof (typeof I18N_DICT)['en'];
