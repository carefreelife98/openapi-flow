export function explicitExpectedStatusFromScenario(
  scenario: string,
): number | undefined {
  const patterns = [
    /\b(?:expect|expects|expected|assert|asserts|verify|verifies)\s+HTTP\s+(\d{3})\b/gi,
    /\bHTTP\s+(\d{3})(?:\s*응답)?(?:을|를)?\s*기대/gu,
  ];
  const statuses = new Set<number>();
  for (const pattern of patterns) {
    for (const match of scenario.matchAll(pattern)) {
      const status = Number(match[1]);
      if (status < 100 || status > 599) {
        throw new Error('scenario expected HTTP status must be 100–599');
      }
      statuses.add(status);
    }
  }
  if (statuses.size > 1) {
    throw new Error('scenario declares conflicting expected HTTP statuses');
  }
  return statuses.values().next().value;
}
