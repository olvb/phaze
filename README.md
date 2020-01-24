## Phaze: a real-time web audio pitch-shifter

Phaze is a real-time pitch-shifter based on the the method described [here][1], implemented as a Web Audio [AudioWorkletProcessor][2]. It supports mono and multi-channel processing.

Please note that AudioWorkletProcessors are currently (January 2020) only supported by Chrome.

[1]: https://www.researchgate.net/publication/228756320_New_phase-vocoder_techniques_for_real-time_pitch_shifting
[2]: https://developer.mozilla.org/docs/Web/API/AudioWorkletProcessor

### Installation and demo

```shell
git clone https://github.com/olvb/phaze && cd phaze
npm run build && npm run start
```
