import { describe, expect, it } from 'vitest';
import { extractYouTubeChannelKey } from '../../src/sites/youtube';

/** Build a watch-page-ish document with the given owner links. */
function docWith(hrefs: string[]): Document {
  const doc = document.implementation.createHTMLDocument('watch');
  const base = doc.createElement('base');
  base.href = 'https://www.youtube.com/watch?v=abc';
  doc.head.appendChild(base);
  doc.body.innerHTML = `
    <ytd-watch-metadata>
      <div id="owner">
        <ytd-channel-name id="channel-name">
          ${hrefs.map((h) => `<a href="${h}">name</a>`).join('')}
        </ytd-channel-name>
      </div>
    </ytd-watch-metadata>`;
  return doc;
}

describe('extractYouTubeChannelKey', () => {
  it('reads a relative handle link', () => {
    expect(extractYouTubeChannelKey(docWith(['/@veritasium']))).toBe('yt:@veritasium');
  });

  it('reads an ABSOLUTE handle link with a trailing tab segment', () => {
    // The shape the owner actually hit: other add-ons rewrite the link and
    // YouTube serves /videos on it. This used to yield null.
    expect(
      extractYouTubeChannelKey(docWith(['https://www.youtube.com/@daite_pushku/videos'])),
    ).toBe('yt:@daite_pushku');
  });

  it('accepts a non-ASCII handle', () => {
    expect(extractYouTubeChannelKey(docWith(['/@Дайте_Пушку']))).toBe('yt:@Дайте_Пушку');
  });

  it('falls back to the channel id when no handle is linked', () => {
    expect(extractYouTubeChannelKey(docWith(['/channel/UCabc-123_x/videos']))).toBe(
      'yt:channel/UCabc-123_x',
    );
  });

  it('prefers the handle so one channel cannot end up with two keys', () => {
    const both = ['/channel/UCabc-123_x', '/@veritasium'];
    expect(extractYouTubeChannelKey(docWith(both))).toBe('yt:@veritasium');
    expect(extractYouTubeChannelKey(docWith([...both].reverse()))).toBe('yt:@veritasium');
  });

  it('ignores links that are not channel links', () => {
    expect(extractYouTubeChannelKey(docWith(['/watch?v=xyz', '/results?q=a']))).toBeNull();
    expect(extractYouTubeChannelKey(docWith(['https://example.com/@notyoutube']))).toBeNull();
  });

  it('returns null when the owner block rendered empty', () => {
    expect(extractYouTubeChannelKey(docWith([]))).toBeNull();
  });
});
