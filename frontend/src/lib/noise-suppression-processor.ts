import { LocalTrack, Track } from "livekit-client";

/**
 * LiveKit TrackProcessor that applies adaptive noise suppression
 * to audio tracks using a Web Audio API AudioWorklet.
 *
 * Architecture: Mic → AudioWorklet (noise gate) → Processed Track → LiveKit
 */
export class NoiseSuppresionTrackProcessor {
  name = "noise-suppression";
  processedTrack?: MediaStreamTrack;

  private audioContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private workletNode?: AudioWorkletNode;
  private destinationNode?: MediaStreamAudioDestinationNode;

  async init({
    track,
  }: {
    track: LocalTrack<Track.Kind>;
    element?: HTMLMediaElement;
  }) {
    const originalTrack = track.mediaStreamTrack;

    this.audioContext = new AudioContext({ sampleRate: 48000 });

    if (this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }

    await this.audioContext.audioWorklet.addModule(
      "/worklets/noise-suppression-worklet.js",
    );

    this.sourceNode = this.audioContext.createMediaStreamSource(
      new MediaStream([originalTrack]),
    );
    this.workletNode = new AudioWorkletNode(
      this.audioContext,
      "noise-suppression-processor",
    );
    this.destinationNode = this.audioContext.createMediaStreamDestination();

    this.sourceNode.connect(this.workletNode);
    this.workletNode.connect(this.destinationNode);

    this.processedTrack = this.destinationNode.stream.getAudioTracks()[0];
  }

  async restart({
    track,
    element,
  }: {
    track: LocalTrack<Track.Kind>;
    element?: HTMLMediaElement;
  }) {
    await this.destroy();
    await this.init({ track, element });
  }

  async destroy() {
    try {
      this.sourceNode?.disconnect();
    } catch {}
    try {
      this.workletNode?.disconnect();
    } catch {}

    if (this.processedTrack) {
      try {
        this.processedTrack.stop();
      } catch {}
      this.processedTrack = undefined;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      try {
        await this.audioContext.close();
      } catch {}
    }

    this.audioContext = undefined;
    this.sourceNode = undefined;
    this.workletNode = undefined;
    this.destinationNode = undefined;
  }
}

/** Check if AudioWorklet noise suppression is supported in this browser */
export function supportsNoiseSuppression(): boolean {
  return (
    typeof AudioWorkletNode !== "undefined" &&
    typeof AudioContext !== "undefined"
  );
}

const NC_STORAGE_KEY = "call-noise-cancellation-enabled";

export function loadNCPreference(): boolean {
  try {
    const val = localStorage.getItem(NC_STORAGE_KEY);
    return val === "true";
  } catch {
    return false;
  }
}

export function saveNCPreference(enabled: boolean) {
  try {
    localStorage.setItem(NC_STORAGE_KEY, String(enabled));
  } catch {}
}
