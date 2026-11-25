import { describe, expect, it } from "vitest";
import { createSSEParser, type RawSSEFrame } from "@/lib/sseParser";

describe("createSSEParser", () => {
  it("parses SSE frames split arbitrarily across TCP chunks including Hebrew UTF-8 text", () => {
    const frames: RawSSEFrame[] = [];
    const parser = createSSEParser((f) => frames.push(f));

    parser.feed("event: agent_step\n");
    parser.feed('data: {"agent":"deal-orchestrator-agent","msg":"חיפוש ');
    parser.feed('מבצעים"}\n\nevent: deal_ranked\ndata: {"rank":1}\n\n');
    parser.end();

    expect(frames).toHaveLength(2);
    expect(frames[0].event).toBe("agent_step");
    expect(frames[0].data.msg).toBe("חיפוש מבצעים");
    expect(frames[1].event).toBe("deal_ranked");
    expect(frames[1].data.rank).toBe(1);
  });

  it("handles malformed JSON gracefully without crashing the stream", () => {
    const frames: RawSSEFrame[] = [];
    const parser = createSSEParser((f) => frames.push(f));

    parser.feed("event: error\ndata: {not-valid-json\n\n");
    parser.end();

    expect(frames).toHaveLength(1);
    expect(frames[0].event).toBe("error");
    expect(frames[0].data.raw).toBe("{not-valid-json");
  });
});
