const minorWords = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'via', 'vs', 'with']);

/** Title case UI headings without changing acronyms, brand casing, or Korean text. */
export function headingText(value: string): string {
  const clean = value.replace(/[,.!?;…]+(?=\s|$)/gu, '').replace(/:+(?=\s*$)/u, '');
  const words = [...clean.matchAll(/[A-Za-z][A-Za-z’']*/g)];
  let index = 0;
  return clean.replace(/[A-Za-z][A-Za-z’']*/g, word => {
    const position = index++;
    if (position > 0 && position < words.length - 1 && minorWords.has(word.toLowerCase())) return word.toLowerCase();
    return word[0].toUpperCase() + word.slice(1);
  });
}
