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

export function shuffleAnswers(
  answers: readonly string[],
  random: () => number = Math.random,
): string[] {
  const shuffled = [...answers];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}
