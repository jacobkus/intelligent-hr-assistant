export interface Chunk {
  content: string;
  sectionTitle: string | null;
  chunkIndex: number;
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkMarkdownBySections(content: string): Chunk[] {
  const chunks: Chunk[] = [];
  const lines = content.split("\n");

  let currentSection: string[] = [];
  let currentTitle: string | null = null;
  let chunkIndex = 0;

  const TARGET_MAX_TOKENS = 500;
  const OVERLAP_TOKENS = 75; // ~50-100 token overlap

  function flushChunk() {
    if (currentSection.length === 0) return;

    const chunkContent = currentSection.join("\n").trim();
    if (!chunkContent) return;

    const tokens = estimateTokens(chunkContent);

    // If chunk is too large, split it further by paragraphs
    if (tokens > TARGET_MAX_TOKENS) {
      const paragraphs = chunkContent.split("\n\n").filter((p) => p.trim());
      let buffer: string[] = [];
      let bufferTokens = 0;

      for (const para of paragraphs) {
        const paraTokens = estimateTokens(para);

        if (
          bufferTokens + paraTokens > TARGET_MAX_TOKENS &&
          buffer.length > 0
        ) {
          // Flush current buffer
          chunks.push({
            content: buffer.join("\n\n").trim(),
            sectionTitle: currentTitle,
            chunkIndex: chunkIndex++,
          });

          // Start new buffer with overlap (last paragraph)
          const overlapText = buffer[buffer.length - 1];
          buffer = overlapText ? [overlapText, para] : [para];
          bufferTokens = estimateTokens(buffer.join("\n\n"));
        } else {
          buffer.push(para);
          bufferTokens += paraTokens;
        }
      }

      // Flush remaining buffer
      if (buffer.length > 0) {
        chunks.push({
          content: buffer.join("\n\n").trim(),
          sectionTitle: currentTitle,
          chunkIndex: chunkIndex++,
        });
      }
    } else {
      // Chunk is within target size
      chunks.push({
        content: chunkContent,
        sectionTitle: currentTitle,
        chunkIndex: chunkIndex++,
      });
    }

    // Prepare overlap for next chunk (last ~75 tokens worth of text)
    const overlapChars = OVERLAP_TOKENS * 4;
    const overlapStart = Math.max(0, chunkContent.length - overlapChars);
    const overlapText = chunkContent.slice(overlapStart).trim();

    currentSection = overlapText ? [overlapText] : [];
  }

  for (const line of lines) {
    // Check if line is a markdown header (## or ###)
    const headerMatch = line.match(/^(#{2,3})\s+(.+)$/);

    if (headerMatch) {
      // Flush previous section before starting new one
      flushChunk();
      currentTitle = headerMatch[2].trim();
      currentSection = [line]; // Start new section with header
    } else {
      currentSection.push(line);

      // Check if current section exceeds target max
      const currentTokens = estimateTokens(currentSection.join("\n"));
      if (currentTokens > TARGET_MAX_TOKENS) {
        flushChunk();
      }
    }
  }

  // Flush any remaining content
  flushChunk();

  return chunks;
}
