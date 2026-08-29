//! Decodes an uploaded school logo and extracts a single dominant seed
//! color for `super::theme::derive_theme`. Kept separate from the pure
//! color math in `theme.rs` so the accessibility-contrast guarantees
//! there can be tested without needing real image bytes, and so this
//! module's own image-format/size concerns stay isolated.

use image::{GenericImageView, ImageReader};

use crate::branding::theme::Rgb;
use crate::error::{AppError, AppResult};

/// A generously-sized logo is still tiny compared to this -- large enough
/// for any reasonable school logo, small enough that storing it as a
/// SQLite BLOB (inside the already-encrypted working database, see
/// `docs/adr/0045-school-branding.md`) is never a concern.
pub const MAX_LOGO_BYTES: usize = 2 * 1024 * 1024;

/// A decompression-bomb guard: a small, well-under-`MAX_LOGO_BYTES`
/// *compressed* file can still claim an enormous pixel grid, forcing a
/// huge in-memory allocation the moment it's decoded -- the byte-size
/// check above does not protect against this. Checked via
/// `ImageReader::into_dimensions` (a header-only read for PNG/JPEG, no
/// full decode) *before* `decode()` ever allocates a pixel buffer. 50
/// megapixels is far beyond any real logo (a worst-case RGBA buffer at
/// this cap is a bounded ~200MB, not unbounded) yet generous enough that
/// no legitimate upload should ever hit it.
const MAX_LOGO_PIXELS: u64 = 50_000_000;

/// Bucket width for color quantization when finding the most frequent
/// color -- coarse enough that near-identical anti-aliased pixel shades
/// count as "the same" color, fine enough to keep genuinely different
/// brand colors distinct.
const QUANTIZE_STEP: u8 = 32;

/// Sample at most this many pixels from the decoded image (evenly
/// strided across the whole image, not just a corner) -- large logos
/// don't need every pixel inspected to find a dominant color, and this
/// keeps extraction time bounded regardless of upload size.
const MAX_SAMPLED_PIXELS: usize = 20_000;

/// Fallback seed used only when every sampled pixel was excluded as
/// background/transparent (e.g. an all-white or fully transparent logo)
/// -- a neutral mid-tone that `theme::derive_theme` already handles
/// gracefully (see its `a_pure_grey_zero_saturation_seed...` test),
/// never a panic or a silent default-theme substitution.
const FALLBACK_SEED: Rgb = Rgb {
    r: 120,
    g: 120,
    b: 120,
};

/// Decodes `bytes` (PNG or JPEG) and returns the dominant non-background
/// color, for `theme::derive_theme` to build a palette from. Rejects
/// oversized or undecodable input; never panics on malformed input.
pub fn extract_dominant_color(bytes: &[u8]) -> AppResult<Rgb> {
    if bytes.is_empty() {
        return Err(AppError::InvalidImage("empty file".to_string()));
    }
    if bytes.len() > MAX_LOGO_BYTES {
        return Err(AppError::InvalidImage("file too large".to_string()));
    }

    let reader = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::InvalidImage("unsupported or corrupt image".to_string()))?;
    let (claimed_width, claimed_height) = reader
        .into_dimensions()
        .map_err(|_| AppError::InvalidImage("unsupported or corrupt image".to_string()))?;
    if (claimed_width as u64) * (claimed_height as u64) > MAX_LOGO_PIXELS {
        return Err(AppError::InvalidImage(
            "image dimensions too large".to_string(),
        ));
    }

    // Re-read: `into_dimensions` consumes the reader (it's the header-only
    // peek), so decoding needs a fresh one -- cheap, since `bytes` is
    // already in memory and capped at `MAX_LOGO_BYTES`.
    let img = ImageReader::new(std::io::Cursor::new(bytes))
        .with_guessed_format()
        .map_err(|_| AppError::InvalidImage("unsupported or corrupt image".to_string()))?
        .decode()
        .map_err(|_| AppError::InvalidImage("unsupported or corrupt image".to_string()))?;

    let (width, height) = img.dimensions();
    let total_pixels = (width as u64) * (height as u64);
    let stride = ((total_pixels / MAX_SAMPLED_PIXELS as u64).max(1)) as u32;

    // (pixel count, sum of R, sum of G, sum of B) per quantized bucket --
    // summed rather than just tallying the bucket's own center so the
    // returned color is the bucket's true average, not a quantization
    // artifact.
    type BucketTotals = (u32, u64, u64, u64);
    let mut counts: std::collections::HashMap<(u8, u8, u8), BucketTotals> =
        std::collections::HashMap::new();

    let mut index: u64 = 0;
    for y in 0..height {
        for x in 0..width {
            index += 1;
            if !index.is_multiple_of(stride as u64) {
                continue;
            }
            let pixel = img.get_pixel(x, y);
            let [r, g, b, a] = pixel.0;

            if a < 128 {
                continue; // transparent background
            }
            let is_near_white = r > 245 && g > 245 && b > 245;
            let is_near_black = r < 10 && g < 10 && b < 10;
            if is_near_white || is_near_black {
                continue;
            }

            let bucket = (quantize(r), quantize(g), quantize(b));
            let entry = counts.entry(bucket).or_insert((0, 0, 0, 0));
            entry.0 += 1;
            entry.1 += r as u64;
            entry.2 += g as u64;
            entry.3 += b as u64;
        }
    }

    let dominant = counts.into_values().max_by_key(|(count, ..)| *count).map(
        |(count, r_sum, g_sum, b_sum)| Rgb {
            r: (r_sum / count as u64) as u8,
            g: (g_sum / count as u64) as u8,
            b: (b_sum / count as u64) as u8,
        },
    );

    Ok(dominant.unwrap_or(FALLBACK_SEED))
}

fn quantize(channel: u8) -> u8 {
    (channel / QUANTIZE_STEP) * QUANTIZE_STEP
}

#[cfg(test)]
mod tests {
    use super::*;
    use image::{Rgba, RgbaImage};

    fn encode_png(img: &RgbaImage) -> Vec<u8> {
        let mut bytes: Vec<u8> = Vec::new();
        img.write_to(
            &mut std::io::Cursor::new(&mut bytes),
            image::ImageFormat::Png,
        )
        .unwrap();
        bytes
    }

    fn solid_image(width: u32, height: u32, color: [u8; 4]) -> RgbaImage {
        RgbaImage::from_pixel(width, height, Rgba(color))
    }

    #[test]
    fn a_solid_color_logo_yields_that_same_color_as_dominant() {
        let img = solid_image(40, 40, [30, 144, 255, 255]);
        let bytes = encode_png(&img);

        let dominant = extract_dominant_color(&bytes).unwrap();

        // Quantization can shift a channel by up to QUANTIZE_STEP.
        assert!((dominant.r as i16 - 30).abs() <= QUANTIZE_STEP as i16);
        assert!((dominant.g as i16 - 144).abs() <= QUANTIZE_STEP as i16);
        assert!((dominant.b as i16 - 255).abs() <= QUANTIZE_STEP as i16);
    }

    #[test]
    fn a_colored_mark_on_a_white_background_ignores_the_background() {
        let mut img = solid_image(50, 50, [255, 255, 255, 255]);
        // A colored "logo mark" occupying a minority of the pixels.
        for y in 15..35 {
            for x in 15..35 {
                img.put_pixel(x, y, Rgba([200, 20, 20, 255]));
            }
        }
        let bytes = encode_png(&img);

        let dominant = extract_dominant_color(&bytes).unwrap();

        assert!(
            dominant.r > 150 && dominant.g < 100 && dominant.b < 100,
            "expected the red mark to dominate, got {dominant:?}"
        );
    }

    #[test]
    fn a_transparent_background_around_a_mark_is_also_ignored() {
        let mut img = solid_image(50, 50, [0, 0, 0, 0]); // fully transparent
        for y in 15..35 {
            for x in 15..35 {
                img.put_pixel(x, y, Rgba([10, 200, 90, 255]));
            }
        }
        let bytes = encode_png(&img);

        let dominant = extract_dominant_color(&bytes).unwrap();

        assert!(
            dominant.g > 150 && dominant.r < 100,
            "expected the green mark to dominate, got {dominant:?}"
        );
    }

    #[test]
    fn an_all_white_logo_falls_back_to_the_neutral_seed_instead_of_panicking() {
        let img = solid_image(30, 30, [255, 255, 255, 255]);
        let bytes = encode_png(&img);

        let dominant = extract_dominant_color(&bytes).unwrap();

        assert_eq!(dominant, FALLBACK_SEED);
    }

    #[test]
    fn a_small_file_claiming_an_enormous_pixel_grid_is_rejected_before_decoding() {
        // A decompression-bomb shape: a solid color compresses so well
        // that a genuinely huge claimed image still produces a tiny file
        // well under MAX_LOGO_BYTES -- the byte-size check alone would
        // let this through; MAX_LOGO_PIXELS must catch it instead,
        // before a full-size pixel buffer is ever allocated.
        let huge = solid_image(9000, 9000, [10, 10, 10, 255]); // 81 megapixels
        let bytes = encode_png(&huge);
        assert!(
            bytes.len() < MAX_LOGO_BYTES,
            "test setup: expected a solid-color PNG this size to compress well under the byte cap"
        );

        let result = extract_dominant_color(&bytes);

        assert!(matches!(result, Err(AppError::InvalidImage(_))));
    }

    #[test]
    fn empty_bytes_are_rejected_not_panicked_on() {
        let result = extract_dominant_color(&[]);
        assert!(matches!(result, Err(AppError::InvalidImage(_))));
    }

    #[test]
    fn garbage_bytes_are_rejected_not_panicked_on() {
        let result = extract_dominant_color(b"this is not an image file at all");
        assert!(matches!(result, Err(AppError::InvalidImage(_))));
    }

    #[test]
    fn oversized_input_is_rejected_before_attempting_to_decode() {
        let oversized = vec![0u8; MAX_LOGO_BYTES + 1];
        let result = extract_dominant_color(&oversized);
        assert!(matches!(result, Err(AppError::InvalidImage(_))));
    }

    #[test]
    fn a_large_image_still_extracts_promptly_via_pixel_sampling() {
        // Large enough that sampling every pixel would be wasteful; this
        // just proves it completes and returns a sane result, not a
        // strict timing assertion (which would be flaky in CI).
        let img = solid_image(2000, 2000, [80, 40, 160, 255]);
        let bytes = encode_png(&img);

        let dominant = extract_dominant_color(&bytes).unwrap();

        assert!((dominant.r as i16 - 80).abs() <= QUANTIZE_STEP as i16);
    }
}
