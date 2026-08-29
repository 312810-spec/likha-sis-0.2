//! Deterministic, accessibility-safe theme derivation from a single seed
//! color (the dominant color extracted from a school's uploaded logo --
//! see `super::logo`). Pure color math, no I/O -- kept separate from
//! image decoding so the accessibility-contrast guarantee can be tested
//! exhaustively without needing real image bytes.
//!
//! System semantic colors (success/warning/error/danger) are never
//! touched here -- see `docs/product/PRODUCT-CONTRACT.md` §8. This module
//! only derives the brand-personalizable set: primary/secondary/accent/
//! selected-surface/restrained-surface, plus a paired text color for each
//! of primary/secondary/accent chosen to guarantee WCAG AA contrast.

/// WCAG AA minimum contrast ratio for normal-size text.
const MIN_TEXT_CONTRAST: f64 = 4.5;
/// WCAG AA minimum contrast ratio for UI components / large text --
/// applied to the surface tokens, which carry text less demandingly than
/// a solid button label.
const MIN_SURFACE_CONTRAST: f64 = 3.0;

/// LIKHA's fixed default body text color (light mode only -- branding is
/// deliberately light-mode-only this milestone, see the module doc on
/// `derive_theme`), matched to `--color-text` in
/// `src/ui/theme/styles.css`. Surface tokens are checked against this so
/// ordinary body text stays legible on a branded surface.
const FIXED_BODY_TEXT: Rgb = Rgb {
    r: 0x1b,
    g: 0x24,
    b: 0x30,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rgb {
    pub r: u8,
    pub g: u8,
    pub b: u8,
}

impl Rgb {
    pub const WHITE: Rgb = Rgb {
        r: 255,
        g: 255,
        b: 255,
    };
    pub const BLACK: Rgb = Rgb { r: 0, g: 0, b: 0 };

    pub fn to_hex(self) -> String {
        format!("#{:02x}{:02x}{:02x}", self.r, self.g, self.b)
    }
}

/// A fully-derived, ready-to-store brand palette. Every field is an
/// already-computed hex color -- the frontend applies these as CSS custom
/// property overrides at app-shell mount time, never recomputing them.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BrandTheme {
    pub primary: String,
    pub primary_text: String,
    pub secondary: String,
    pub secondary_text: String,
    pub accent: String,
    pub accent_text: String,
    pub selected_surface: String,
    pub restrained_surface: String,
}

#[derive(Debug, Clone, Copy)]
struct Hsl {
    h: f64,
    s: f64,
    l: f64,
}

fn rgb_to_hsl(c: Rgb) -> Hsl {
    let r = c.r as f64 / 255.0;
    let g = c.g as f64 / 255.0;
    let b = c.b as f64 / 255.0;
    let max = r.max(g).max(b);
    let min = r.min(g).min(b);
    let l = (max + min) / 2.0;

    if (max - min).abs() < f64::EPSILON {
        return Hsl { h: 0.0, s: 0.0, l };
    }

    let d = max - min;
    let s = if l > 0.5 {
        d / (2.0 - max - min)
    } else {
        d / (max + min)
    };
    let h = if (max - r).abs() < f64::EPSILON {
        (g - b) / d + if g < b { 6.0 } else { 0.0 }
    } else if (max - g).abs() < f64::EPSILON {
        (b - r) / d + 2.0
    } else {
        (r - g) / d + 4.0
    };

    Hsl { h: h * 60.0, s, l }
}

fn hue_to_rgb(p: f64, q: f64, mut t: f64) -> f64 {
    if t < 0.0 {
        t += 1.0;
    }
    if t > 1.0 {
        t -= 1.0;
    }
    if t < 1.0 / 6.0 {
        return p + (q - p) * 6.0 * t;
    }
    if t < 1.0 / 2.0 {
        return q;
    }
    if t < 2.0 / 3.0 {
        return p + (q - p) * (2.0 / 3.0 - t) * 6.0;
    }
    p
}

fn hsl_to_rgb(hsl: Hsl) -> Rgb {
    if hsl.s <= 0.0 {
        let v = (hsl.l.clamp(0.0, 1.0) * 255.0).round() as u8;
        return Rgb { r: v, g: v, b: v };
    }

    let h = ((hsl.h % 360.0) + 360.0) % 360.0 / 360.0;
    let l = hsl.l.clamp(0.0, 1.0);
    let s = hsl.s.clamp(0.0, 1.0);
    let q = if l < 0.5 {
        l * (1.0 + s)
    } else {
        l + s - l * s
    };
    let p = 2.0 * l - q;

    let to_u8 = |v: f64| (v.clamp(0.0, 1.0) * 255.0).round() as u8;
    Rgb {
        r: to_u8(hue_to_rgb(p, q, h + 1.0 / 3.0)),
        g: to_u8(hue_to_rgb(p, q, h)),
        b: to_u8(hue_to_rgb(p, q, h - 1.0 / 3.0)),
    }
}

fn srgb_channel_to_linear(c: u8) -> f64 {
    let c = c as f64 / 255.0;
    if c <= 0.03928 {
        c / 12.92
    } else {
        ((c + 0.055) / 1.055).powf(2.4)
    }
}

/// WCAG relative luminance, https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
fn relative_luminance(c: Rgb) -> f64 {
    0.2126 * srgb_channel_to_linear(c.r)
        + 0.7152 * srgb_channel_to_linear(c.g)
        + 0.0722 * srgb_channel_to_linear(c.b)
}

/// WCAG contrast ratio, https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio --
/// always >= 1.0, symmetric in its two arguments.
pub fn contrast_ratio(a: Rgb, b: Rgb) -> f64 {
    let la = relative_luminance(a);
    let lb = relative_luminance(b);
    let (lighter, darker) = if la >= lb { (la, lb) } else { (lb, la) };
    (lighter + 0.05) / (darker + 0.05)
}

/// Finds a lightness at hue/saturation `(h, s)` that reaches
/// `min_contrast` against `text`, searching from the extreme that gives
/// `text` the most contrast toward `original_l`, so the result stays as
/// close to the seed color's own lightness as the contrast requirement
/// allows. Always terminates: at the search's starting extreme the
/// contrast against either pure white or pure black text is guaranteed
/// to exceed any threshold up to 21:1.
fn contrast_safe_lightness(h: f64, s: f64, text: Rgb, original_l: f64, min_contrast: f64) -> f64 {
    let text_is_white = text.r as u32 + text.g as u32 + text.b as u32 > 384;
    let steps = 200;

    // White text needs a dark-enough background: search from the darkest
    // background back up toward the original lightness, stopping at the
    // last (lightest) step that still passes. Black text is the mirror
    // image: search from the lightest background down.
    let ordered_ls: Vec<f64> = if text_is_white {
        (0..=steps).map(|i| i as f64 / steps as f64).collect()
    } else {
        (0..=steps).rev().map(|i| i as f64 / steps as f64).collect()
    };

    let mut best_passing: Option<f64> = None;
    for l in ordered_ls {
        let candidate = hsl_to_rgb(Hsl { h, s, l });
        if contrast_ratio(candidate, text) >= min_contrast {
            best_passing = Some(l);
            // Keep searching toward original_l for as long as we still
            // pass, so the result stays as close to the seed's own
            // lightness as the contrast floor allows.
            if (l - original_l).abs() < 1.0 / steps as f64 {
                break;
            }
        } else if best_passing.is_some() {
            // We were passing and just stopped passing -- the previous
            // step was the closest-to-original passing value.
            break;
        }
    }

    best_passing.unwrap_or(if text_is_white { 0.0 } else { 1.0 })
}

fn derive_role(h: f64, s: f64, min_contrast: f64) -> (Rgb, Rgb, String, String) {
    let white_l = contrast_safe_lightness(h, s, Rgb::WHITE, 0.5, min_contrast);
    let black_l = contrast_safe_lightness(h, s, Rgb::BLACK, 0.5, min_contrast);
    let white_candidate = hsl_to_rgb(Hsl { h, s, l: white_l });
    let black_candidate = hsl_to_rgb(Hsl { h, s, l: black_l });

    // Prefer whichever pairing keeps the color closer to the requested
    // hue/saturation's natural mid-lightness (0.5) -- i.e. whichever
    // needed a smaller lightness adjustment -- so the derived brand color
    // stays as visually close to the source logo as contrast allows.
    if (white_l - 0.5).abs() <= (black_l - 0.5).abs() {
        (
            white_candidate,
            Rgb::WHITE,
            white_candidate.to_hex(),
            Rgb::WHITE.to_hex(),
        )
    } else {
        (
            black_candidate,
            Rgb::BLACK,
            black_candidate.to_hex(),
            Rgb::BLACK.to_hex(),
        )
    }
}

fn derive_surface(h: f64, base_s: f64, base_l: f64) -> String {
    let mut l = base_l;
    let s = base_s;
    // Push lighter, in fine steps, until the surface has enough contrast
    // for the fixed default body text to remain legible on it, capped
    // just short of pure white so it stays visually distinct from
    // `--color-bg`.
    while l < 0.98
        && contrast_ratio(hsl_to_rgb(Hsl { h, s, l }), FIXED_BODY_TEXT) < MIN_SURFACE_CONTRAST
    {
        l += 0.01;
    }
    hsl_to_rgb(Hsl { h, s, l }).to_hex()
}

/// Derives a full, accessibility-safe brand palette from a single seed
/// color (the dominant color extracted from an uploaded logo).
/// Deterministic: the same seed always produces the same palette.
///
/// **Light-mode only, deliberately narrow for this first slice** (see
/// `docs/adr/0045-school-branding.md`) -- dark mode keeps its existing
/// fixed default palette regardless of branding. A school's palette
/// never touches the semantic success/warning/error/danger tokens.
pub fn derive_theme(seed: Rgb) -> BrandTheme {
    let seed_hsl = rgb_to_hsl(seed);

    let (_primary_rgb, _primary_text_rgb, primary, primary_text) =
        derive_role(seed_hsl.h, seed_hsl.s.max(0.35), MIN_TEXT_CONTRAST);

    let secondary_h = seed_hsl.h - 30.0;
    let (_secondary_rgb, _secondary_text_rgb, secondary, secondary_text) =
        derive_role(secondary_h, seed_hsl.s.max(0.35), MIN_TEXT_CONTRAST);

    let accent_h = seed_hsl.h + 150.0;
    let (_accent_rgb, _accent_text_rgb, accent, accent_text) =
        derive_role(accent_h, seed_hsl.s.max(0.35), MIN_TEXT_CONTRAST);

    let selected_surface = derive_surface(seed_hsl.h, (seed_hsl.s * 0.6).min(0.35), 0.90);
    let restrained_surface = derive_surface(seed_hsl.h, (seed_hsl.s * 0.35).min(0.2), 0.95);

    BrandTheme {
        primary,
        primary_text,
        secondary,
        secondary_text,
        accent,
        accent_text,
        selected_surface,
        restrained_surface,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn contrast_ratio_of_black_and_white_is_the_maximum_21_to_1() {
        let ratio = contrast_ratio(Rgb::BLACK, Rgb::WHITE);
        assert!((ratio - 21.0).abs() < 0.01, "got {ratio}");
    }

    #[test]
    fn contrast_ratio_of_a_color_with_itself_is_1_to_1() {
        let c = Rgb {
            r: 120,
            g: 80,
            b: 200,
        };
        assert!((contrast_ratio(c, c) - 1.0).abs() < 0.0001);
    }

    #[test]
    fn contrast_ratio_is_symmetric() {
        let a = Rgb {
            r: 200,
            g: 30,
            b: 30,
        };
        let b = Rgb {
            r: 30,
            g: 200,
            b: 200,
        };
        assert!((contrast_ratio(a, b) - contrast_ratio(b, a)).abs() < 0.0001);
    }

    #[test]
    fn rgb_hsl_round_trip_preserves_color_within_rounding_tolerance() {
        let originals = [
            Rgb {
                r: 30,
                g: 144,
                b: 255,
            },
            Rgb {
                r: 220,
                g: 20,
                b: 60,
            },
            Rgb {
                r: 10,
                g: 200,
                b: 90,
            },
            Rgb {
                r: 128,
                g: 128,
                b: 128,
            },
            Rgb::WHITE,
            Rgb::BLACK,
        ];
        for original in originals {
            let round_tripped = hsl_to_rgb(rgb_to_hsl(original));
            assert!(
                (original.r as i16 - round_tripped.r as i16).abs() <= 1
                    && (original.g as i16 - round_tripped.g as i16).abs() <= 1
                    && (original.b as i16 - round_tripped.b as i16).abs() <= 1,
                "{original:?} round-tripped to {round_tripped:?}"
            );
        }
    }

    #[test]
    fn derived_primary_always_meets_wcag_aa_text_contrast_against_its_own_text_color() {
        // A spread of hues and saturations, including a very light and a
        // very dark seed -- the exact cases that need lightness pushed
        // hardest to reach the contrast floor.
        let seeds = [
            Rgb {
                r: 30,
                g: 144,
                b: 255,
            }, // a bright blue
            Rgb {
                r: 255,
                g: 240,
                b: 200,
            }, // a very light/pale seed
            Rgb {
                r: 20,
                g: 20,
                b: 30,
            }, // a very dark seed
            Rgb {
                r: 220,
                g: 20,
                b: 60,
            }, // a saturated red
            Rgb {
                r: 128,
                g: 128,
                b: 128,
            }, // a grey (zero-saturation) seed
            Rgb {
                r: 10,
                g: 200,
                b: 90,
            }, // a saturated green
        ];

        for seed in seeds {
            let theme = derive_theme(seed);
            let primary = parse_hex(&theme.primary);
            let primary_text = parse_hex(&theme.primary_text);
            let ratio = contrast_ratio(primary, primary_text);
            assert!(
                ratio >= MIN_TEXT_CONTRAST - 0.01,
                "seed {seed:?}: primary {} vs text {} only reached {ratio:.2}:1",
                theme.primary,
                theme.primary_text
            );
        }
    }

    #[test]
    fn derived_secondary_and_accent_also_meet_wcag_aa_text_contrast() {
        let theme = derive_theme(Rgb {
            r: 30,
            g: 144,
            b: 255,
        });

        assert!(
            contrast_ratio(
                parse_hex(&theme.secondary),
                parse_hex(&theme.secondary_text)
            ) >= MIN_TEXT_CONTRAST - 0.01
        );
        assert!(
            contrast_ratio(parse_hex(&theme.accent), parse_hex(&theme.accent_text))
                >= MIN_TEXT_CONTRAST - 0.01
        );
    }

    #[test]
    fn surface_tokens_meet_wcag_aa_ui_contrast_against_fixed_body_text() {
        let theme = derive_theme(Rgb {
            r: 200,
            g: 30,
            b: 180,
        });

        let selected_ratio = contrast_ratio(parse_hex(&theme.selected_surface), FIXED_BODY_TEXT);
        let restrained_ratio =
            contrast_ratio(parse_hex(&theme.restrained_surface), FIXED_BODY_TEXT);

        assert!(
            selected_ratio >= MIN_SURFACE_CONTRAST - 0.01,
            "got {selected_ratio:.2}:1"
        );
        assert!(
            restrained_ratio >= MIN_SURFACE_CONTRAST - 0.01,
            "got {restrained_ratio:.2}:1"
        );
    }

    #[test]
    fn theme_derivation_is_deterministic_for_the_same_seed() {
        let seed = Rgb {
            r: 77,
            g: 130,
            b: 200,
        };

        let first = derive_theme(seed);
        let second = derive_theme(seed);

        assert_eq!(first, second);
    }

    #[test]
    fn secondary_and_accent_are_visually_distinct_from_primary() {
        let theme = derive_theme(Rgb {
            r: 30,
            g: 144,
            b: 255,
        });

        assert_ne!(theme.primary, theme.secondary);
        assert_ne!(theme.primary, theme.accent);
        assert_ne!(theme.secondary, theme.accent);
    }

    #[test]
    fn a_pure_grey_zero_saturation_seed_does_not_panic_and_still_derives_a_valid_theme() {
        let theme = derive_theme(Rgb {
            r: 128,
            g: 128,
            b: 128,
        });

        assert!(theme.primary.starts_with('#'));
        assert_eq!(theme.primary.len(), 7);
    }

    #[test]
    fn selected_surface_and_restrained_surface_are_distinct() {
        let theme = derive_theme(Rgb {
            r: 30,
            g: 144,
            b: 255,
        });

        assert_ne!(theme.selected_surface, theme.restrained_surface);
    }

    fn parse_hex(hex: &str) -> Rgb {
        let hex = hex.trim_start_matches('#');
        Rgb {
            r: u8::from_str_radix(&hex[0..2], 16).unwrap(),
            g: u8::from_str_radix(&hex[2..4], 16).unwrap(),
            b: u8::from_str_radix(&hex[4..6], 16).unwrap(),
        }
    }
}
