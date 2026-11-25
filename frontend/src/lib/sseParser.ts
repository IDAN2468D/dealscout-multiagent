export interface RawSSEFrame {
  event: string;
  data: Record<string, unknown>;
}

/**
 * Chunk-boundary-safe SSE frame parser supporting arbitrary TCP packet splits.
 */
export function createSSEParser(onFrame: (frame: RawSSEFrame) => void) {
  let buffer = "";

  const flushBlock = (block: string) => {
    const trimmed = block.trim();
    if (!trimmed) return;

    let eventName = "message";
    const dataLines: string[] = [];

    for (const rawLine of trimmed.split(/\r?\n/)) {
      if (rawLine.startsWith(":")) continue;
      if (rawLine.startsWith("event:")) {
        eventName = rawLine.slice(6).trim();
      } else if (rawLine.startsWith("data:")) {
        dataLines.push(rawLine.slice(5).trimStart());
      }
    }

    if (dataLines.length === 0) return;
    const rawData = dataLines.join("\n");
    try {
      const parsed = JSON.parse(rawData) as Record<string, unknown>;
      onFrame({ event: eventName, data: parsed });
    } catch {
      onFrame({ event: eventName, data: { raw: rawData } });
    }
  };

  return {
    feed(chunk: string) {
      buffer += chunk.replace(/\r\n/g, "\n");
      let boundaryIdx = buffer.indexOf("\n\n");
      while (boundaryIdx !== -1) {
        const block = buffer.slice(0, boundaryIdx);
        buffer = buffer.slice(boundaryIdx + 2);
        flushBlock(block);
        boundaryIdx = buffer.indexOf("\n\n");
      }
    },
    end() {
      if (buffer.trim()) {
        flushBlock(buffer);
        buffer = "";
      }
    },
  };
}
