export interface BulkImageDraft {
  id: string;
  file: File;
  fileName: string;
  previewUrl: string;
  answerKey: 'A' | 'B' | 'C' | 'D';
}

export function sortImageFilesNaturally(files: File[]): File[] {
  return [...files].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })
  );
}

export function isValidImageFile(file: File): boolean {
  if (file.type && file.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

/**
 * Parses quick answer keys pasted in any common format:
 * - Comma / space / newline separated: "A, B, C, D, A"
 * - Compact string: "ABCDA"
 * - Indexed pairs: "1.A 2.B 3.C", "1:A, 2:B", "Q1-A Q2-D", "1) B"
 */
export function parseQuickAnswerKeys(
  raw: string,
  count: number
): Map<number, 'A' | 'B' | 'C' | 'D'> {
  const result = new Map<number, 'A' | 'B' | 'C' | 'D'>();
  const trimmed = raw.trim();
  if (!trimmed || count <= 0) return result;

  // Match indexed formats first (e.g. "1.A", "1:B", "Q2-C", "3) D", "1 A")
  const indexedMatches = Array.from(
    trimmed.matchAll(/(?:^|[\s,;])(?:q|qu|question)?\s*(\d{1,3})\s*[.:)\-\s]\s*([A-Da-d])(?=$|[\s,;])/gi)
  );
  if (indexedMatches.length > 0) {
    indexedMatches.forEach((m) => {
      const idx = Number(m[1]) - 1;
      const letter = m[2].toUpperCase() as 'A' | 'B' | 'C' | 'D';
      if (idx >= 0 && idx < count) {
        result.set(idx, letter);
      }
    });
    if (result.size > 0) return result;
  }

  // Fallback: sequential list of A/B/C/D tokens ("A,B,C,D" or "ABCD" or "A B C D")
  const tokens = trimmed.match(/[A-Da-d]/g);
  if (tokens && tokens.length > 0) {
    tokens.slice(0, count).forEach((ch, idx) => {
      result.set(idx, ch.toUpperCase() as 'A' | 'B' | 'C' | 'D');
    });
  }

  return result;
}
