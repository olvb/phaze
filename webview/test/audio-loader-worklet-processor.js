class AudioLoaderWorkletProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = this.onmessage.bind(this);
    this.bufferList = [];
    this.playbackTime = 0;
    console.log('processor constructor called', ...arguments);
  }

  async onmessage(event) {
    console.log('event', event);

    if (event.data.type === 'load') {
      console.log('processing audio file');
      this.loadAudioFile_(event.data.url);
    }
  }

  loadAudioFile_(url) {
    console.log('url: ', url);

    fetch(url)
      .then((response) => response.arrayBuffer())
      .then((arrayBuffer) => this.context.decodeAudioData(arrayBuffer))
      .then((audioBuffer) => {
        this.bufferList.push(audioBuffer);
        return audioBuffer;
      })
      .then((buffer) => console.log(buffer))
      .catch((error) => {
        console.error(`Failed to load audio file ${url}:`, error);
      });
  }

  process(inputs, outputs, parameters) {
    console.log('processor process called');

    const output = outputs[0];
    const bufferCount = this.bufferList.length;
    const channelCount = output.length;

    console.log(bufferCount, channelCount, output);

    for (let i = 0; i < output.length; ++i) {
      for (let j = 0; j < output[i].length; ++j) {
        if (this.playbackTime < bufferCount) {
          for (let k = 0; k < channelCount; ++k) {
            output[k][j] = this.bufferList[Math.floor(this.playbackTime)][k][j];
          }
          this.playbackTime += 1;
        } else {
          // Stop the playback when all audio files have finished.
          return false;
        }
      }
    }

    return true;
  }
}

registerProcessor('audio-loader-worklet-processor', AudioLoaderWorkletProcessor);
