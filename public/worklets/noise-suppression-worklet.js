/**
 * Adaptive noise gate AudioWorklet processor.
 * Provides real-time noise suppression by tracking the ambient noise floor
 * and gating audio that falls below the voice activity threshold.
 *
 * Combined with the browser's built-in noiseSuppression constraint,
 * this provides professional-grade noise cancellation for video calls.
 */
class NoiseSuppressorProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Noise floor tracking
    this._noiseFloor = 0.004;
    this._noiseFloorMin = 0.00008;
    this._noiseAdaptRate = 0.997; // Slow adaptation to ambient noise

    // Gate parameters
    this._gateRatio = 2.0; // Signal must be 2x above noise floor
    this._smoothedGain = 0.0;
    this._holdSamples = Math.floor(0.20 * sampleRate); // 200ms hold after voice
    this._holdCounter = 0;

    // Per-sample gain smoothing coefficients
    this._attackCoeff = 1 - Math.exp(-1 / (0.003 * sampleRate)); // 3ms attack
    this._releaseCoeff = 1 - Math.exp(-1 / (0.04 * sampleRate)); // 40ms release

    // Enabled state (controlled from main thread)
    this._enabled = true;

    this.port.onmessage = (event) => {
      if (event.data && event.data.type === "set-enabled") {
        this._enabled = !!event.data.enabled;
      }
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];

    if (!input || !input.length || !output || !output.length) {
      return true;
    }

    // Pass-through when disabled — zero overhead
    if (!this._enabled) {
      for (let ch = 0; ch < input.length; ch++) {
        if (input[ch] && output[ch]) {
          output[ch].set(input[ch]);
        }
      }
      return true;
    }

    const inputChannel = input[0];
    if (!inputChannel) return true;
    const N = inputChannel.length;

    // Calculate RMS energy of the frame
    let sumSq = 0;
    for (let i = 0; i < N; i++) {
      sumSq += inputChannel[i] * inputChannel[i];
    }
    const rms = Math.sqrt(sumSq / N);

    // Adaptive noise floor estimation (update during quiet periods)
    const threshold = this._noiseFloor * this._gateRatio;
    if (rms < threshold * 0.7) {
      this._noiseFloor =
        this._noiseAdaptRate * this._noiseFloor +
        (1 - this._noiseAdaptRate) * rms;
      this._noiseFloor = Math.max(this._noiseFloor, this._noiseFloorMin);
    }

    // Voice activity detection with hold time
    if (rms > threshold) {
      this._holdCounter = this._holdSamples;
    }
    const gateOpen = this._holdCounter > 0;
    this._holdCounter = Math.max(0, this._holdCounter - N);

    // Calculate target gain
    let targetGain;
    if (gateOpen) {
      targetGain = 1.0;
    } else {
      // Soft attenuation: quadratic curve for smooth transition
      const ratio = rms / Math.max(threshold, 0.0001);
      targetGain = Math.max(ratio * ratio, 0.02); // ~-34dB noise floor
    }

    // Apply gain with per-sample smoothing to all channels
    for (let ch = 0; ch < input.length; ch++) {
      const inp = input[ch];
      const out = output[ch];
      if (!inp || !out) continue;

      for (let i = 0; i < N; i++) {
        const coeff =
          targetGain > this._smoothedGain
            ? this._attackCoeff
            : this._releaseCoeff;
        this._smoothedGain += coeff * (targetGain - this._smoothedGain);
        out[i] = inp[i] * this._smoothedGain;
      }
    }

    return true;
  }
}

registerProcessor("noise-suppression-processor", NoiseSuppressorProcessor);
