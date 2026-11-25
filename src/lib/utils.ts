// Small shared helpers: class-name joining and keyboard-target checks.

type ClassValue = string | false | null | undefined | 0;

/** Joins truthy class names. Callers never pass conflicting utilities, so no merge step is needed. */
export function cn(...inputs: ClassValue[]): string {
  return inputs.filter(Boolean).join(" ");
}

/**
 * True when a key event comes from somewhere the user is typing: inputs,
 * textareas, selects or contenteditable elements (including ones inside
 * custom HTML nodes). Board shortcuts must ignore these.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    target.isContentEditable
  );
}
