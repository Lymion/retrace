import { readFileSync } from "node:fs";
import path from "node:path";
import type { AIProvider, AIRequest, ProviderStatus } from "@/server/ai/provider";
import type { ProviderId } from "@/shared/enums";

// A provider that replays recorded replies instead of calling Claude, and
// remembers every request so tests can check what would have been sent.

export class FakeProvider implements AIProvider {
  readonly label: string;
  readonly requests: AIRequest[] = [];
  private readonly replies: string[];
  ready = true;

  constructor(
    readonly id: ProviderId = "api-key",
    replies: string[] = [],
  ) {
    this.label = `fake ${id}`;
    this.replies = [...replies];
  }

  queue(...replies: string[]): this {
    this.replies.push(...replies);
    return this;
  }

  async status(): Promise<ProviderStatus> {
    return { id: this.id, label: this.label, ready: this.ready, detail: "fake" };
  }

  async complete(request: AIRequest): Promise<string> {
    this.requests.push(request);
    const reply = this.replies.shift();
    if (reply === undefined)
      throw new Error(`FakeProvider(${this.id}): no reply queued for ${request.task}`);
    return reply;
  }

  async *stream(request: AIRequest): AsyncIterable<string> {
    const reply = await this.complete(request);
    // Stream in small pieces, like the real thing.
    for (let i = 0; i < reply.length; i += 12) yield reply.slice(i, i + 12);
  }
}

const FIXTURES = path.resolve(import.meta.dirname, "..", "fixtures", "ai");

/** A recorded model reply, as text exactly as the model sent it. */
export function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, name), "utf8");
}
