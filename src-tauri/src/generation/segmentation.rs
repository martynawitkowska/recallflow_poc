use std::ops::Range;

pub(crate) const TARGET_CHUNK_CHARS: usize = 8_000;
pub(crate) const CONTEXT_OVERLAP_CHARS: usize = 800;
const BOUNDARY_WINDOW_CHARS: usize = 1_000;

#[derive(Clone, Debug, Eq, PartialEq)]
pub(crate) struct TranscriptChunk {
    pub id: String,
    pub source_index: usize,
    pub context: String,
    pub primary_context_bytes: Range<usize>,
    pub primary_source_bytes: Range<usize>,
    pub timestamp_range: Option<(String, String)>,
}

pub(crate) fn normalize_transcript(value: &str) -> String {
    value.replace("\r\n", "\n").replace('\r', "\n")
}

pub(crate) fn segment_transcript(value: &str) -> Result<(String, Vec<TranscriptChunk>), String> {
    let normalized = normalize_transcript(value);
    if normalized.trim().is_empty() {
        return Err("Paste study material before generating a quiz.".to_owned());
    }

    let char_bytes = normalized
        .char_indices()
        .map(|(byte, _)| byte)
        .chain(std::iter::once(normalized.len()))
        .collect::<Vec<_>>();
    let char_count = char_bytes.len() - 1;
    let mut primary_char_start = 0;
    let mut primary_ranges = Vec::new();

    while primary_char_start < char_count {
        let remaining = char_count - primary_char_start;
        let primary_char_end = if remaining <= TARGET_CHUNK_CHARS {
            char_count
        } else {
            choose_boundary(&normalized, &char_bytes, primary_char_start)
        };
        primary_ranges.push(primary_char_start..primary_char_end);
        primary_char_start = primary_char_end;
    }

    let chunks = primary_ranges
        .into_iter()
        .enumerate()
        .map(|(source_index, primary_chars)| {
            let context_char_start = primary_chars.start.saturating_sub(CONTEXT_OVERLAP_CHARS);
            let context_char_end = (primary_chars.end + CONTEXT_OVERLAP_CHARS).min(char_count);
            let context_source_bytes = char_bytes[context_char_start]..char_bytes[context_char_end];
            let primary_source_bytes =
                char_bytes[primary_chars.start]..char_bytes[primary_chars.end];
            let primary_context_bytes = (primary_source_bytes.start - context_source_bytes.start)
                ..(primary_source_bytes.end - context_source_bytes.start);
            let primary_text = &normalized[primary_source_bytes.clone()];

            TranscriptChunk {
                id: format!("chunk-{:04}", source_index + 1),
                source_index,
                context: normalized[context_source_bytes].to_owned(),
                primary_context_bytes,
                primary_source_bytes,
                timestamp_range: timestamp_range(primary_text),
            }
        })
        .collect();

    Ok((normalized, chunks))
}

fn choose_boundary(text: &str, char_bytes: &[usize], start: usize) -> usize {
    let target = start + TARGET_CHUNK_CHARS;
    let low = target.saturating_sub(BOUNDARY_WINDOW_CHARS).max(start + 1);
    let high = (target + BOUNDARY_WINDOW_CHARS).min(char_bytes.len() - 1);
    let mut best: Option<(u8, usize, usize)> = None;

    for char_index in low..=high {
        let byte = char_bytes[char_index];
        let priority = boundary_priority(text, byte);
        if priority < 5 {
            let candidate = (priority, char_index.abs_diff(target), char_index);
            if best.is_none_or(|current| candidate < current) {
                best = Some(candidate);
            }
        }
    }

    best.map(|(_, _, index)| index).unwrap_or(target)
}

fn boundary_priority(text: &str, byte: usize) -> u8 {
    let before = &text[..byte];
    let after = &text[byte..];
    let line = after.lines().next().unwrap_or_default().trim_start();

    if (byte == 0 || before.ends_with('\n')) && (line.starts_with('#') || is_timestamp(line)) {
        0
    } else if before.ends_with("\n\n") || after.starts_with("\n\n") {
        1
    } else if before
        .chars()
        .next_back()
        .is_some_and(|character| matches!(character, '.' | '!' | '?'))
        && after.chars().next().is_none_or(char::is_whitespace)
    {
        2
    } else if before.chars().next_back().is_some_and(char::is_whitespace)
        || after.chars().next().is_some_and(char::is_whitespace)
    {
        3
    } else {
        5
    }
}

fn is_timestamp(line: &str) -> bool {
    let token = line
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .trim_matches(['[', ']']);
    let parts = token.split(':').collect::<Vec<_>>();
    matches!(parts.len(), 2 | 3)
        && parts
            .iter()
            .all(|part| part.len() == 2 && part.bytes().all(|byte| byte.is_ascii_digit()))
}

fn timestamp_range(text: &str) -> Option<(String, String)> {
    let timestamps = text
        .lines()
        .filter_map(|line| {
            let token = line
                .trim_start()
                .split_whitespace()
                .next()?
                .trim_matches(['[', ']']);
            is_timestamp(token).then(|| token.to_owned())
        })
        .collect::<Vec<_>>();
    Some((timestamps.first()?.clone(), timestamps.last()?.clone()))
}

#[cfg(test)]
mod tests {
    use super::{normalize_transcript, segment_transcript, CONTEXT_OVERLAP_CHARS};

    #[test]
    fn primary_regions_partition_normalized_input_and_overlap_only_context() {
        let source = (0..30)
            .map(|index| format!("## Topic {index}\r\n{}", "sentence. ".repeat(500)))
            .collect::<Vec<_>>()
            .join("\r\n\r\n");
        let (normalized, chunks) = segment_transcript(&source).unwrap();
        let reconstructed = chunks
            .iter()
            .map(|chunk| &normalized[chunk.primary_source_bytes.clone()])
            .collect::<String>();

        assert_eq!(reconstructed, normalized);
        assert!(chunks.len() > 1);
        for pair in chunks.windows(2) {
            assert_eq!(
                pair[0].primary_source_bytes.end,
                pair[1].primary_source_bytes.start
            );
            assert!(pair[0].context.chars().count() <= 8_000 + CONTEXT_OVERLAP_CHARS * 2 + 1_000);
        }
    }

    #[test]
    fn segmentation_is_unicode_safe_for_short_and_unbroken_material() {
        for source in [
            "Zażółć gęślą jaźń 🧠 e\u{301} 日本語",
            &"🧪".repeat(20_000),
            &"bez interpunkcji ".repeat(1_000),
        ] {
            let (normalized, chunks) = segment_transcript(source).unwrap();
            assert_eq!(
                chunks
                    .iter()
                    .map(|chunk| &normalized[chunk.primary_source_bytes.clone()])
                    .collect::<String>(),
                normalized
            );
        }
    }

    #[test]
    fn headings_paragraphs_sentences_and_timestamps_are_safe_boundaries() {
        let source = format!(
            "{}\n\n[12:34] New topic\n{}",
            "First topic sentence. ".repeat(380),
            "Second topic sentence. ".repeat(380)
        );
        let (_normalized, chunks) = segment_transcript(&source).unwrap();
        assert!(chunks.len() >= 2);
        assert!(chunks[1]
            .timestamp_range
            .as_ref()
            .is_some_and(|(start, _)| start == "12:34"));
        assert_eq!(normalize_transcript("a\r\nb\rc"), "a\nb\nc");
    }

    #[test]
    fn near_limit_input_is_complete_and_bounded() {
        let source = "ą".repeat(500_000);
        let (normalized, chunks) = segment_transcript(&source).unwrap();
        assert_eq!(normalized.chars().count(), 500_000);
        assert_eq!(chunks.first().unwrap().primary_source_bytes.start, 0);
        assert_eq!(
            chunks.last().unwrap().primary_source_bytes.end,
            normalized.len()
        );
        assert!(chunks.len() < 70);
    }

    #[test]
    fn empty_material_is_rejected() {
        assert!(segment_transcript(" \r\n ").is_err());
    }
}
