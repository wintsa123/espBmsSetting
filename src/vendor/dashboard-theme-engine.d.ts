export type Appearance = 'system' | 'light' | 'dark';
export interface CustomColors { primary: string; secondary: string | null; tertiary: string | null; style: string }
export interface ThemePreferences { theme: Appearance; accent: string; customColors: CustomColors; systemColors?: unknown }
export const presets: { v: string; t: string; primary: string; secondary?: string; tertiary?: string }[];
export const androidStyles: { id: string; label: string; variant: number }[];
export function hex(value: unknown): string | null;
export function custom(value?: Partial<CustomColors>): CustomColors;
export function randomCustom(previous?: Partial<CustomColors>, random?: () => number): CustomColors;
export function normalize(value?: object): ThemePreferences;
export function colors(preferences: ThemePreferences, dark: boolean): Record<string, string>;
export function apply(preferences: ThemePreferences): Record<string, string>;
