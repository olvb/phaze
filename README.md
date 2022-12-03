## Phaze: a real-time web audio pitch-shifter

Phaze is a real-time pitch-shifter based on the the method described [here][1], implemented as a Web Audio [AudioWorkletProcessor][2]. It supports mono and multi-channel processing.

[1]: https://www.researchgate.net/publication/228756320_New_phase-vocoder_techniques_for_real-time_pitch_shifting
[2]: https://developer.mozilla.org/docs/Web/API/AudioWorkletProcessor

### Installation and demo

Visit the online demo [here](https://olvb.github.io/phaze/www/), or run

```shell
git clone https://github.com/olvb/phaze && cd phaze
npm install
npm run build && npm run start
```
and open http://localhost:8080/ with Chrome or Firefox.
