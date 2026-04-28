import { describe, expect, it } from 'vitest';
import { safeSetInnerHTML } from '../../src/ui/safe-html';

function host(): HTMLElement {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

describe('safeSetInnerHTML', () => {
  it('replaces existing children', () => {
    const el = host();
    el.appendChild(document.createElement('span'));
    el.appendChild(document.createElement('p'));
    expect(el.children.length).toBe(2);
    safeSetInnerHTML(el, '<button>ok</button>');
    expect(el.children.length).toBe(1);
    expect(el.firstElementChild?.tagName).toBe('BUTTON');
    expect(el.firstElementChild?.textContent).toBe('ok');
  });

  it('preserves SVG namespace on inline <svg>', () => {
    // Regression for the AMO innerHTML rewrite (2026-04-28). The whole
    // module exists to render Lucide-style SVG icons in the panel; if
    // DOMParser('text/html') ever loses the SVG namespace, those icons
    // become inert <svg> HTMLElements that don't paint.
    const el = host();
    safeSetInnerHTML(
      el,
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>',
    );
    const svg = el.firstElementChild;
    expect(svg).toBeTruthy();
    expect(svg?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    const circle = svg?.firstElementChild;
    expect(circle?.namespaceURI).toBe('http://www.w3.org/2000/svg');
    expect(circle?.tagName).toBe('circle');
  });

  it('moves multiple top-level nodes', () => {
    const el = host();
    safeSetInnerHTML(el, '<span>a</span><span>b</span>plain');
    expect(el.childNodes.length).toBe(3);
    expect((el.childNodes[0] as Element).tagName).toBe('SPAN');
    expect((el.childNodes[1] as Element).tagName).toBe('SPAN');
    expect(el.childNodes[2].nodeType).toBe(Node.TEXT_NODE);
    expect(el.childNodes[2].textContent).toBe('plain');
  });

  it('clears the element on empty string', () => {
    const el = host();
    el.appendChild(document.createElement('div'));
    expect(el.children.length).toBe(1);
    safeSetInnerHTML(el, '');
    expect(el.children.length).toBe(0);
    expect(el.childNodes.length).toBe(0);
  });

  it('treats nested element trees correctly', () => {
    const el = host();
    safeSetInnerHTML(
      el,
      '<div class="row"><button data-vs-speed="2">2x</button><span>label</span></div>',
    );
    const row = el.firstElementChild as HTMLElement;
    expect(row.className).toBe('row');
    expect(row.children.length).toBe(2);
    const btn = row.querySelector('button');
    expect(btn?.dataset.vsSpeed).toBe('2');
    expect(btn?.textContent).toBe('2x');
  });

  it('does not write to .innerHTML directly', () => {
    // Defensive — Mozilla static analyzer regression. We rely on
    // DOMParser + replaceChildren, never `element.innerHTML = ...`.
    // Reading the function source verifies the implementation contract.
    const src = safeSetInnerHTML.toString();
    expect(src.includes('innerHTML')).toBe(false);
  });
});
