
export interface TextChunk {
    id: string;
    text: string;
    source: string;
    index: number;
    embedding?: number[]; // Cached embedding vector
}

export const chunkText = (text: string, source: string, chunkSize: number = 1000, overlap: number = 200): TextChunk[] => {
    const chunks: TextChunk[] = [];
    const cleanText = text.replace(/\s+/g, ' ').trim();

    if (cleanText.length === 0) return [];

    let start = 0;
    let index = 0;

    while (start < cleanText.length) {
        let end = start + chunkSize;

        // If we're not at the end of text, try to find a sentence break or space to end the chunk
        if (end < cleanText.length) {
            // fast forward to last punctuation
            const lastPunctuation = Math.max(
                cleanText.lastIndexOf('.', end),
                cleanText.lastIndexOf('?', end),
                cleanText.lastIndexOf('!', end)
            );

            if (lastPunctuation !== -1 && lastPunctuation > start + chunkSize * 0.5) {
                end = lastPunctuation + 1;
            } else {
                // Fallback to last space
                const lastSpace = cleanText.lastIndexOf(' ', end);
                if (lastSpace !== -1 && lastSpace > start) {
                    end = lastSpace;
                }
            }
        }

        const chunkText = cleanText.slice(start, end).trim();
        if (chunkText.length > 0) {
            chunks.push({
                id: crypto.randomUUID(),
                text: chunkText,
                source,
                index
            });
            index++;
        }

        start = end - overlap;
        // Prevent infinite loop if overlap is too big or logic fails
        if (start >= end) start = end;
    }

    return chunks;
};
