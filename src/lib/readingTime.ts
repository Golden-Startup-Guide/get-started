/** About how long a text takes to read, in whole minutes, at 200 words a minute. */
export function readingMinutes(text: string): number {
  return Math.round(text.split(/\s+/).filter(Boolean).length / 200)
}
