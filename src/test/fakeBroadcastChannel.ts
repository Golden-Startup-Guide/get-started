// In-memory BroadcastChannel: delivers to every other open channel with the same name,
// never back to the sender, like the browser implementation.
export class FakeBroadcastChannel extends EventTarget {
  static channels = new Set<FakeBroadcastChannel>()
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(readonly name: string) {
    super()
    FakeBroadcastChannel.channels.add(this)
  }

  postMessage(data: unknown) {
    for (const channel of FakeBroadcastChannel.channels) {
      if (channel === this || channel.name !== this.name) continue
      const event = new MessageEvent('message', { data })
      channel.dispatchEvent(event)
      channel.onmessage?.(event)
    }
  }

  close() {
    FakeBroadcastChannel.channels.delete(this)
  }
}
