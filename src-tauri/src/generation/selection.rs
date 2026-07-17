use super::{evidence::ValidatedCandidate, extract_json_object};
use crate::models::{QuestionType, QuizFile, QuizQuestion};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet, VecDeque};

#[derive(Clone, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QualityMetadata {
    pub requested_count: usize,
    pub generated_candidate_count: usize,
    pub deterministic_rejection_count: usize,
    pub semantic_rejection_count: usize,
    pub duplicate_count: usize,
    pub selected_count: usize,
    pub incomplete_coverage: bool,
    pub duplicate_analysis_incomplete: bool,
}

#[derive(Clone, Debug, Deserialize, Eq, PartialEq)]
#[serde(deny_unknown_fields)]
pub(crate) struct DuplicateGroups {
    pub groups: Vec<Vec<String>>,
}

pub(crate) fn parse_duplicate_groups(
    response: &str,
    known_ids: &HashSet<String>,
) -> Result<DuplicateGroups, String> {
    let json = extract_json_object(response)?;
    let groups: DuplicateGroups = serde_json::from_str(json)
        .map_err(|_| "OpenAI returned invalid duplicate analysis.".to_owned())?;
    let mut seen = HashSet::new();
    for group in &groups.groups {
        if group.len() < 2
            || group
                .iter()
                .any(|id| !known_ids.contains(id) || !seen.insert(id.clone()))
        {
            return Err("OpenAI returned invalid duplicate analysis.".to_owned());
        }
    }
    Ok(groups)
}

pub(crate) fn exact_deduplicate(
    mut candidates: Vec<ValidatedCandidate>,
) -> (Vec<ValidatedCandidate>, usize) {
    candidates.sort_by(candidate_order);
    let mut seen = HashSet::new();
    let before = candidates.len();
    candidates.retain(|item| seen.insert(exact_key(item)));
    let removed = before - candidates.len();
    (candidates, removed)
}

pub(crate) fn apply_semantic_groups(
    mut candidates: Vec<ValidatedCandidate>,
    groups: &DuplicateGroups,
) -> (Vec<ValidatedCandidate>, usize) {
    candidates.sort_by(candidate_order);
    let order = candidates
        .iter()
        .enumerate()
        .map(|(index, item)| (item.candidate.candidate_id.as_str(), index))
        .collect::<HashMap<_, _>>();
    let mut remove = HashSet::new();
    for group in &groups.groups {
        let keep = group.iter().min_by_key(|id| order[id.as_str()]).unwrap();
        remove.extend(group.iter().filter(|id| *id != keep).cloned());
    }
    let removed = remove.len();
    candidates.retain(|item| !remove.contains(&item.candidate.candidate_id));
    (candidates, removed)
}

pub(crate) fn select_balanced(
    candidates: Vec<ValidatedCandidate>,
    requested_count: usize,
) -> Vec<ValidatedCandidate> {
    let mut topics = HashMap::<String, Vec<ValidatedCandidate>>::new();
    for candidate in candidates {
        topics
            .entry(normalize(&candidate.candidate.topic))
            .or_default()
            .push(candidate);
    }
    let mut topics = topics.into_values().collect::<Vec<_>>();
    for topic in &mut topics {
        *topic = chunk_round_robin(std::mem::take(topic));
    }
    topics.sort_by(|left, right| candidate_order(&left[0], &right[0]));

    if requested_count < topics.len() {
        return distributed_indices(topics.len(), requested_count)
            .into_iter()
            .map(|index| topics[index].remove(0))
            .collect();
    }

    let mut queues = topics.into_iter().map(VecDeque::from).collect::<Vec<_>>();
    let mut selected = Vec::new();
    while selected.len() < requested_count {
        let mut progressed = false;
        for queue in &mut queues {
            if let Some(candidate) = queue.pop_front() {
                selected.push(candidate);
                progressed = true;
                if selected.len() == requested_count {
                    break;
                }
            }
        }
        if !progressed {
            break;
        }
    }
    selected
}

pub(crate) fn finalize_quiz(candidates: Vec<ValidatedCandidate>) -> QuizFile {
    QuizFile {
        title: "Generated quiz".to_owned(),
        description: Some(
            "Questions grounded in and verified against your study material.".to_owned(),
        ),
        video_url: None,
        questions: candidates
            .into_iter()
            .enumerate()
            .map(|(index, item)| QuizQuestion {
                id: format!("q-{:04}", index + 1),
                question_type: item.candidate.question_type,
                question: item.candidate.question,
                answers: item.candidate.answers,
                correct_answers: item.candidate.correct_answers,
                explanation: Some(item.candidate.explanation),
                mnemonic: None,
            })
            .collect(),
    }
}

fn exact_key(item: &ValidatedCandidate) -> String {
    let mut answers = item
        .candidate
        .correct_answers
        .iter()
        .map(|answer| normalize(answer))
        .collect::<Vec<_>>();
    answers.sort();
    format!(
        "{}\u{0}{}",
        normalize(&item.candidate.question),
        answers.join("\u{0}")
    )
}

fn normalize(value: &str) -> String {
    value
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
        .to_lowercase()
}

fn candidate_order(left: &ValidatedCandidate, right: &ValidatedCandidate) -> std::cmp::Ordering {
    candidate_order_key(left).cmp(&candidate_order_key(right))
}

fn candidate_order_key(item: &ValidatedCandidate) -> (usize, usize, &str) {
    (
        item.evidence_source_bytes.start,
        question_type_order(item.candidate.question_type),
        item.candidate.candidate_id.as_str(),
    )
}

fn question_type_order(question_type: QuestionType) -> usize {
    match question_type {
        QuestionType::SingleChoice => 0,
        QuestionType::MultipleChoice => 1,
        QuestionType::TrueFalse => 2,
    }
}

fn chunk_round_robin(mut candidates: Vec<ValidatedCandidate>) -> Vec<ValidatedCandidate> {
    candidates.sort_by(candidate_order);
    let mut chunks = Vec::<(String, VecDeque<ValidatedCandidate>)>::new();
    for candidate in candidates {
        if let Some((_, queue)) = chunks
            .iter_mut()
            .find(|(chunk, _)| *chunk == candidate.candidate.chunk_id)
        {
            queue.push_back(candidate);
        } else {
            chunks.push((
                candidate.candidate.chunk_id.clone(),
                VecDeque::from([candidate]),
            ));
        }
    }
    let mut result = Vec::new();
    loop {
        let mut progressed = false;
        for (_, queue) in &mut chunks {
            if let Some(candidate) = queue.pop_front() {
                result.push(candidate);
                progressed = true;
            }
        }
        if !progressed {
            return result;
        }
    }
}

fn distributed_indices(total: usize, count: usize) -> Vec<usize> {
    match count {
        0 => Vec::new(),
        1 => vec![(total - 1) / 2],
        _ => (0..count)
            .map(|index| index * (total - 1) / (count - 1))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        generation::{
            evidence::validate_candidate_set, segmentation::segment_transcript, QuestionCandidate,
        },
        models::QuestionType,
    };

    fn validated(
        id: &str,
        topic: &str,
        question: &str,
        source_position: usize,
    ) -> ValidatedCandidate {
        let source = format!("{}evidence for {id}", "x".repeat(source_position));
        let (_, chunks) = segment_transcript(&source).unwrap();
        let candidate = QuestionCandidate {
            candidate_id: id.to_owned(),
            chunk_id: chunks[0].id.clone(),
            topic: topic.to_owned(),
            question_type: QuestionType::SingleChoice,
            question: question.to_owned(),
            answers: vec!["Yes".to_owned(), "No".to_owned()],
            correct_answers: vec!["Yes".to_owned()],
            explanation: "Grounded.".to_owned(),
            evidence_quote: format!("evidence for {id}"),
        };
        validate_candidate_set(vec![candidate], &chunks).0.remove(0)
    }

    #[test]
    fn exact_and_semantic_duplicates_keep_the_earliest_candidate() {
        let a = validated("a", "Topic", " What   is ATP? ", 10);
        let b = validated("b", "Topic", "what is atp?", 20);
        let c = validated("c", "Topic", "How is ATP made?", 30);
        let (exact, removed) = exact_deduplicate(vec![c.clone(), b, a.clone()]);
        assert_eq!(removed, 1);
        assert_eq!(exact[0].candidate.candidate_id, "a");
        let groups = DuplicateGroups {
            groups: vec![vec!["a".to_owned(), "c".to_owned()]],
        };
        let (semantic, removed) = apply_semantic_groups(exact, &groups);
        assert_eq!(removed, 1);
        assert_eq!(semantic[0].candidate.candidate_id, "a");
    }

    #[test]
    fn malformed_semantic_groups_cannot_remove_unknown_candidates() {
        let known = HashSet::from(["a".to_owned(), "b".to_owned()]);
        for value in [
            r#"{"groups":[["a"]]}"#,
            r#"{"groups":[["a","unknown"]]}"#,
            r#"{"groups":[["a","b"],["a","b"]]}"#,
        ] {
            assert!(parse_duplicate_groups(value, &known).is_err());
        }
    }

    #[test]
    fn selection_round_robins_topics_and_distributes_small_limits() {
        let candidates = vec![
            validated("a1", "A", "A one?", 10),
            validated("a2", "A", "A two?", 20),
            validated("b1", "B", "B one?", 30),
            validated("c1", "C", "C one?", 40),
        ];
        let selected = select_balanced(candidates.clone(), 4);
        assert_eq!(
            selected
                .iter()
                .map(|item| item.candidate.candidate_id.as_str())
                .collect::<Vec<_>>(),
            ["a1", "b1", "c1", "a2"]
        );
        let distributed = select_balanced(candidates, 2);
        assert_eq!(
            distributed
                .iter()
                .map(|item| item.candidate.topic.as_str())
                .collect::<Vec<_>>(),
            ["A", "C"]
        );
    }

    #[test]
    fn fewer_candidates_and_empty_input_never_create_filler_or_an_empty_quiz() {
        let selected = select_balanced(vec![validated("a", "A", "A?", 10)], 8);
        assert_eq!(selected.len(), 1);
        let quiz = finalize_quiz(selected);
        assert_eq!(quiz.questions[0].id, "q-0001");
        assert!(select_balanced(Vec::new(), 8).is_empty());
    }

    #[test]
    fn selection_is_independent_of_input_completion_order() {
        let a = validated("a", "A", "A?", 30);
        let b = validated("b", "B", "B?", 10);
        let first = select_balanced(vec![a.clone(), b.clone()], 2);
        let second = select_balanced(vec![b, a], 2);
        assert_eq!(first, second);
    }
}
