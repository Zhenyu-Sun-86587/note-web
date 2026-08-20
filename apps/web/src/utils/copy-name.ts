export function generateCopyFilename(
  sourceFilename: string,
  existingFilenames: string[],
): string {
  const existingSet = new Set(existingFilenames);

  if (!existingSet.has(sourceFilename)) {
    return sourceFilename;
  }

  // Parse filename into base and ext (.md)
  let base = sourceFilename;
  let ext = "";
  const lastDot = sourceFilename.lastIndexOf(".");
  if (lastDot > 0) {
    base = sourceFilename.slice(0, lastDot);
    ext = sourceFilename.slice(lastDot);
  }

  // Check if base already ends with " copy" or " copy N"
  const copyMatch = base.match(/^(.*?)(?: copy(?: (\d+))?)?$/);
  const cleanBase = copyMatch && copyMatch[1] ? copyMatch[1] : base;

  // Try "cleanBase copy.ext" first
  const firstCandidate = `${cleanBase} copy${ext}`;
  if (!existingSet.has(firstCandidate)) {
    return firstCandidate;
  }

  // Try "cleanBase copy 2.ext", "cleanBase copy 3.ext", ...
  let counter = 2;
  while (counter < 1000) {
    const candidate = `${cleanBase} copy ${counter}${ext}`;
    if (!existingSet.has(candidate)) {
      return candidate;
    }
    counter += 1;
  }

  return `${cleanBase} copy ${Date.now()}${ext}`;
}
