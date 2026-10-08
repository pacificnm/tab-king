// Minimal typings for signalsmith-stretch (MIT), which ships none. Only what Mp3Engine uses.
declare module 'signalsmith-stretch' {
  export interface StretchSchedule {
    /** AudioContext time at which this change takes effect (the node compensates for its own latency). */
    output?: number
    active?: boolean
    /** Position in the loaded input buffers, in seconds. */
    input?: number
    /** Playback rate; 0.5 = half speed. Pitch is preserved. */
    rate?: number
    semitones?: number
  }

  export interface StretchNode extends AudioWorkletNode {
    /** Last input position reported by the worklet, in seconds (see setUpdateInterval). */
    inputTime: number
    schedule(change: StretchSchedule, adjustPrevious?: number): Promise<unknown>
    /** Append sample buffers (one Float32Array per channel); pass the buffers as `transfer` to avoid a copy. */
    addBuffers(buffers: Float32Array[], transfer?: Transferable[]): Promise<number>
    dropBuffers(toSeconds?: number): Promise<unknown>
    stop(when?: number): Promise<unknown>
    configure(options: {
      blockMs?: number
      intervalMs?: number
      splitComputation?: boolean
      preset?: string
    }): Promise<unknown>
    setUpdateInterval(
      seconds: number,
      callback?: (inputTimeSeconds: number) => void
    ): Promise<unknown>
  }

  interface SignalsmithStretch {
    (audioContext: BaseAudioContext, options?: AudioWorkletNodeOptions): Promise<StretchNode>
    /** URL of a module that registers the processor (used instead of a Blob URL, which our CSP forbids). */
    moduleUrl?: string
  }
  const SignalsmithStretch: SignalsmithStretch
  export default SignalsmithStretch
}
