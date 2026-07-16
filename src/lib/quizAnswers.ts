export function answersMatch(
  selectedAnswers: readonly string[],
  correctAnswers: readonly string[],
): boolean {
  const selected = new Set(selectedAnswers);
  const correct = new Set(correctAnswers);

  return (
    selected.size === selectedAnswers.length &&
    correct.size === correctAnswers.length &&
    selected.size === correct.size &&
    [...correct].every((answer) => selected.has(answer))
  );
}
