const legacyDemoProjectName = 'TaskOS Demo Commerce';
const canonicalDemoProjectName = 'Checkout Reliability Lab';

export function displayProjectName(name: string) {
  return name === legacyDemoProjectName ? canonicalDemoProjectName : name;
}

export function compactInvestigationTitle(name: string | undefined, projectName: string) {
  const fallback = `${displayProjectName(projectName)} investigation`;
  if (!name || name.trim().length > 76 || looksLikePrompt(name)) return fallback;
  return shortenAtWord(name, 64);
}

export function compactFindingTitle(title: string) {
  return shortenAtWord(title, 72);
}

function looksLikePrompt(value: string) {
  return /^(test|verify|investigate|reproduce|run)\b/i.test(value.trim());
}

function shortenAtWord(value: string, maximumLength: number) {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maximumLength) return normalized;

  const shortened = normalized.slice(0, maximumLength + 1).replace(/\s+\S*$/, '').trim();
  return `${shortened || normalized.slice(0, maximumLength).trim()}…`;
}
