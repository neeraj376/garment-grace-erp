export function templateBodyExamples(message: string, example: string): string[] {
  return /\{\{1\}\}/.test(message) ? [example] : [];
}