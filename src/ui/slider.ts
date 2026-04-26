/**
 * Speed slider -- a single range input + numeric label, with a coloured
 * fill that tracks the value. Renders a fragment; click handlers attach
 * in Wave 1.8b.
 *
 * The slider's "fill" is implemented as a CSS gradient on the track,
 * recomputed whenever the value changes (`updateSliderFill`). The original
 * userscript does the same in .user.js:2630-2645.
 */

import { safeSetInnerHTML } from './safe-html';

const CONTAINER_CLASS = 'speed-slider-container';
const INPUT_CLASS = 'speed-slider';
const LABEL_CLASS = 'speed-slider-label';

export interface SliderOptions {
  current: number;
  min: number;
  max: number;
  step?: number;
}

export function renderSlider(opts: SliderOptions): HTMLElement {
  const step = opts.step ?? 0.05;
  const container = document.createElement('div');
  container.className = CONTAINER_CLASS;
  safeSetInnerHTML(
    container,
    `<input type="range" class="${INPUT_CLASS}" min="${opts.min}" max="${opts.max}" step="${step}" value="${opts.current}">` +
      `<span class="${LABEL_CLASS}">${opts.current.toFixed(2)}x</span>`,
  );
  // Initial paint of the gradient fill.
  const input = container.querySelector<HTMLInputElement>(`.${INPUT_CLASS}`);
  if (input) updateSliderFill(input);
  return container;
}

/**
 * Update both the gradient fill and the numeric label to match the slider's
 * current value. Idempotent; safe to call from input/change handlers.
 */
export function updateSliderFill(input: HTMLInputElement): void {
  const min = parseFloat(input.min) || 0;
  const max = parseFloat(input.max) || 1;
  const value = parseFloat(input.value) || min;
  const percent = ((value - min) / (max - min)) * 100;
  // CSS variable picked up by styles.ts. Using a var keeps the actual
  // colour (accent) stylable from one place.
  input.style.setProperty('--vs-slider-fill', `${percent.toFixed(2)}%`);

  const container = input.closest(`.${CONTAINER_CLASS}`);
  const label = container?.querySelector<HTMLElement>(`.${LABEL_CLASS}`);
  if (label) label.textContent = value.toFixed(2) + 'x';
}

/**
 * Imperative setter -- updates value + fill + label without firing the
 * slider's input event. Used by the controller after a click on a preset
 * button so the slider visually tracks the change.
 */
export function setSliderValue(container: Element, speed: number): void {
  const input = container.querySelector<HTMLInputElement>(`.${INPUT_CLASS}`);
  if (!input) return;
  input.value = String(speed);
  updateSliderFill(input);
}
