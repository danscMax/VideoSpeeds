// RATE-SPY v2: диагностика сбросов playbackRate + decode-ошибок на YouTube.
// Вставить целиком в консоль DevTools на странице видео. Воспроизвести
// проблему (перемотка до сброса скорости / мигания) и прислать весь
// вывод с префиксом [RATE-SPY].
//
// Что фиксирует v2 сверх v1:
//  - кодек потока (Stats for nerds) в момент каждой ошибки/emptied
//  - пересоздание элемента <video> (метка __spyId: если после сбоя
//    у текущего <video> её нет — элемент НОВЫЙ, слушатели расширения умерли)
//  - MediaError (code/message) с события 'error'
(() => {
  const d = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'playbackRate');
  Object.defineProperty(HTMLMediaElement.prototype, 'playbackRate', {
    get() { return d.get.call(this); },
    set(v) {
      const stack = (new Error()).stack.split('\n').slice(2, 6).join(' | ');
      console.warn(`[RATE-SPY] playbackRate=${v} писал:`, stack);
      return d.set.call(this, v);
    },
    configurable: true,
  });

  let nextId = 1;
  const codec = () => {
    try {
      const s = document.getElementById('movie_player')?.getStatsForNerds?.();
      return s ? `codecs=${s.codecs ?? '?'} res=${s.resolution ?? '?'}` : 'stats unavailable';
    } catch (e) { return `stats error: ${e.message}`; }
  };

  const snapshot = (label) => {
    const vids = [...document.querySelectorAll('video')];
    console.warn(`[RATE-SPY] SNAPSHOT(${label}): video count=${vids.length}, ` +
      vids.map(v => `id=${v.__spyId ?? 'НОВЫЙ(без метки!)'} rate=${v.playbackRate} src=${(v.currentSrc || '').slice(0, 60)}`).join(' || '));
    console.warn(`[RATE-SPY] SNAPSHOT(${label}): ${codec()}`);
  };

  const arm = (vid) => {
    if (vid.__spyArmed) return;
    vid.__spyArmed = true;
    vid.__spyId = nextId++;
    console.log(`[RATE-SPY] armed on video __spyId=${vid.__spyId}`);
    for (const ev of ['ratechange', 'seeking', 'seeked', 'playing', 'pause', 'loadstart'])
      vid.addEventListener(ev, () =>
        console.log(`[RATE-SPY] ${ev} vid=${vid.__spyId} rate=${vid.playbackRate} t=${vid.currentTime.toFixed(1)}`));
    for (const ev of ['emptied', 'abort', 'stalled'])
      vid.addEventListener(ev, () => snapshot(ev));
    vid.addEventListener('error', () => {
      const e = vid.error;
      console.error(`[RATE-SPY] MediaError vid=${vid.__spyId} code=${e?.code} msg="${e?.message}"`);
      snapshot('error');
    });
  };

  document.querySelectorAll('video').forEach(arm);
  // Ловим появление НОВЫХ <video> — прямое доказательство пересоздания.
  new MutationObserver(() => document.querySelectorAll('video').forEach(arm))
    .observe(document.documentElement, { childList: true, subtree: true });

  window.addEventListener('yt-navigate-start', () => console.log('[RATE-SPY] yt-navigate-start'));
  window.addEventListener('yt-navigate-finish', () => { console.log('[RATE-SPY] yt-navigate-finish'); snapshot('nav-finish'); });

  snapshot('start');
  console.log('[RATE-SPY] v2 armed. При сбое пришлите ВЕСЬ вывод, особенно SNAPSHOT-строки.');
})();
