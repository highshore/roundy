// The carousel-count, font and Answer-First/real-photo controls are consumed by new generation and rendering. Publishing remains unchanged.
export type MarketingEditorialSettings = {
  feed_daily_max_posts: number;
  carousel_mode: 'fixed' | 'alternating';
  carousel_default_slides: 3 | 5;
  carousel_min_real_photos_5: number;
  carousel_min_real_photos_3: number;
  carousel_ai_thumbnail_enabled: boolean;
  carousel_answer_first_enabled: boolean;
  story_preview_auto_enabled: boolean;
  carousel_title_font_size_px: number;
  carousel_body_font_size_px: number;
};

export const EDITORIAL_SETTINGS_DEFAULTS: MarketingEditorialSettings = {
  feed_daily_max_posts: 1,
  carousel_mode: 'fixed',
  carousel_default_slides: 5,
  carousel_min_real_photos_5: 3,
  carousel_min_real_photos_3: 2,
  carousel_ai_thumbnail_enabled: false,
  carousel_answer_first_enabled: false,
  story_preview_auto_enabled: false,
  carousel_title_font_size_px: 72,
  carousel_body_font_size_px: 36
};

const NUMERIC_RANGES: Record<string, [number, number]> = {
  feed_daily_max_posts: [1, 10],
  carousel_default_slides: [3, 5],
  carousel_min_real_photos_5: [0, 5],
  carousel_min_real_photos_3: [0, 3],
  carousel_title_font_size_px: [24, 160],
  carousel_body_font_size_px: [16, 80]
};

type ValidPatch = { ok: true; patch: Partial<MarketingEditorialSettings> };
type InvalidPatch = { ok: false; error: string };

// Accept partial updates so saving editorial preferences cannot overwrite existing automation settings.
export function parseEditorialSettingsPatch(input: unknown): ValidPatch | InvalidPatch {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS'};
  }
  const values = input as Record<string, unknown>;
  const keys = Object.keys(values);
  if (!keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(EDITORIAL_SETTINGS_DEFAULTS, key))) {
    return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS'};
  }
  const patch: Record<string, unknown> = {};
  for (const key of keys) {
    const value = values[key];
    if (key === 'carousel_mode') {
      if (value !== 'fixed' && value !== 'alternating') return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS:carousel_mode'};
    } else if (key === 'carousel_default_slides') {
      if (value !== 3 && value !== 5) return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS:carousel_default_slides'};
    } else if (Object.prototype.hasOwnProperty.call(NUMERIC_RANGES, key)) {
      const [min, max] = NUMERIC_RANGES[key];
      if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
        return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS:' + key};
      }
    } else if (typeof EDITORIAL_SETTINGS_DEFAULTS[key as keyof MarketingEditorialSettings] === 'boolean') {
      if (typeof value !== 'boolean') return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS:' + key};
    } else {
      return {ok: false, error: 'INVALID_EDITORIAL_SETTINGS:' + key};
    }
    patch[key] = value;
  }
  return {ok: true, patch: patch as Partial<MarketingEditorialSettings>};
}
