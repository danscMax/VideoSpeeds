import { describe, expect, it } from 'vitest';
import { isRutubeVideoPath } from '../../src/ui/insertion';

describe('isRutubeVideoPath', () => {
  it('accepts /video/<id> paths', () => {
    expect(isRutubeVideoPath('/video/abc123/')).toBe(true);
    expect(isRutubeVideoPath('/video/abc123')).toBe(true);
    expect(isRutubeVideoPath('/video/abc123/comments')).toBe(true);
  });

  it('accepts /shorts/<id> paths', () => {
    expect(isRutubeVideoPath('/shorts/abc123/')).toBe(true);
  });

  it('accepts /play/embed/<id> paths', () => {
    expect(isRutubeVideoPath('/play/embed/abc123/')).toBe(true);
  });

  it('rejects channel pages', () => {
    // Regression for the user bug 2026-04-28 where the panel was inserted
    // into the channel banner image because DiscoveryEngine heuristically
    // promoted a muted preview <video> to playerContainer.
    expect(isRutubeVideoPath('/channel/23704195/')).toBe(false);
    expect(isRutubeVideoPath('/u/rutube/')).toBe(false);
    expect(isRutubeVideoPath('/u/rutube/playlists/')).toBe(false);
    expect(isRutubeVideoPath('/profile/123/')).toBe(false);
  });

  it('rejects feed / search / browse / category / trends', () => {
    expect(isRutubeVideoPath('/feed/')).toBe(false);
    expect(isRutubeVideoPath('/search/?query=foo')).toBe(false);
    expect(isRutubeVideoPath('/browse/')).toBe(false);
    expect(isRutubeVideoPath('/category/movies/')).toBe(false);
    expect(isRutubeVideoPath('/tags/news/')).toBe(false);
    expect(isRutubeVideoPath('/trends/')).toBe(false);
  });

  it('rejects root and account pages', () => {
    expect(isRutubeVideoPath('/')).toBe(false);
    expect(isRutubeVideoPath('/auth/')).toBe(false);
    expect(isRutubeVideoPath('/my/')).toBe(false);
    expect(isRutubeVideoPath('/notifications/')).toBe(false);
    expect(isRutubeVideoPath('/history/')).toBe(false);
  });

  it('rejects look-alikes that contain video as a segment', () => {
    // Defensive: someone could craft a /channel/.../video/... URL on RuTube
    // (categories named "video"); our prefix check is anchored at /, so
    // anything that doesn't START with /video/ is rejected.
    expect(isRutubeVideoPath('/channel/abc/video-list/')).toBe(false);
    expect(isRutubeVideoPath('/feed/videos/')).toBe(false);
  });
});
