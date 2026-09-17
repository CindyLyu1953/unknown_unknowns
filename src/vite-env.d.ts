/// <reference types="vite/client" />

declare module '*.mjs' {
  export function conceptLabelFontSize(zoom: number, importance: 1 | 2 | 3, selected?: boolean): number;
}
