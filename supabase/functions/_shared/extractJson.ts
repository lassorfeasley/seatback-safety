/**
 * Extract the first complete JSON object from model output.
 *
 * Models sometimes wrap JSON in markdown fences or append commentary after
 * the object, so a greedy first-`{`-to-last-`}` regex is unreliable. Instead,
 * walk the string with a depth counter (string- and escape-aware) and parse
 * only the first balanced object.
 */
export function extractJson(raw: string): Record<string, unknown> {
  const start = raw.indexOf("{");
  if (start === -1) {
    throw new Error(`No JSON object found in AI response: ${raw.slice(0, 200)}`);
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < raw.length; i++) {
    const ch = raw[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return JSON.parse(raw.slice(start, i + 1)) as Record<string, unknown>;
      }
    }
  }

  throw new Error(`Unterminated JSON object in AI response: ${raw.slice(0, 200)}`);
}
