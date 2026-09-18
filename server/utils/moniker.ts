import fs from "node:fs";
import path from "node:path";

function loadWords(filename: string, fallback: string[]): string[] {
  const possiblePaths = [
    path.resolve(process.cwd(), "words", filename),
    path.resolve(import.meta.dirname, "../../words", filename),
    path.resolve(import.meta.dirname, "../words", filename),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      try {
        const lines = fs
          .readFileSync(p, "utf-8")
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (lines.length > 0) return lines;
      } catch {
        // Continue to next path
      }
    }
  }
  return fallback;
}

const adjectives = loadWords("adjectives.txt", [
  "swift", "neon", "cyber", "hyper", "dark", "crimson", "silent", "quantum"
]);
const nouns = loadWords("nouns.txt", [
  "stream", "pulse", "node", "matrix", "beacon", "relay", "portal", "signal"
]);
const verbs = loadWords("verbs.txt", [
  "flow", "sync", "link", "transmit", "broadcast", "glow", "spark", "orbit"
]);

const randomElement = (array: string[]) =>
  array[Math.floor(Math.random() * array.length)];

export function makeRoomName() {
  const adjective = randomElement(adjectives);
  const noun = randomElement(nouns);
  const verb = randomElement(verbs);
  return `${adjective}-${noun}-${verb}`;
}

export function makeUserName() {
  return `${capFirst(randomElement(adjectives))} ${capFirst(
    randomElement(nouns),
  )}`;
}

function capFirst(string: string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}
