/**
 * Which output device the app's own AudioContexts (MP3 playback, count-in) play through (PRF-3). The synth's context is
 * owned by alphaTab and switched through the engine instead.
 */
let deviceId: string | null = null
const contexts = new Set<WeakRef<AudioContext>>()

/** `AudioContext.setSinkId` (Chromium 110+) is not in TypeScript's DOM typings yet. */
type Routable = AudioContext & { setSinkId(id: string): Promise<void> }

async function apply(ctx: AudioContext): Promise<void> {
  try {
    await (ctx as Routable).setSinkId(deviceId ?? '')
  } catch (e) {
    // The saved device is gone (unplugged) or refused: stay on whatever the context was using.
    console.warn('Could not switch audio output device', e)
  }
}

export const outputDeviceId = (): string | null => deviceId

/** Route a new context to the chosen device now, and again whenever the choice changes. */
export function routeToOutputDevice(ctx: AudioContext): void {
  contexts.add(new WeakRef(ctx))
  if (deviceId !== null) void apply(ctx)
}

/** Choose the device (`null` = system default) for every registered context. */
export function setOutputDevice(id: string | null): void {
  if (id === deviceId) return
  deviceId = id
  for (const ref of contexts) {
    const ctx = ref.deref()
    if (ctx) void apply(ctx)
    else contexts.delete(ref)
  }
}
