const song_name = './short_sample_audio.mp3';

class MyWorkletNode extends AudioWorkletNode {
  constructor(context, processorname) {
    super(context, processorname);
    this.currentBufferIndex = 0;
    this.nextBufferIndex = 1;
    this.buffers = [];
    this.isPlaying = false;
    this.isAppending = false;
  }

  // async loadBuffers() {
  //   const bufferUrl = [song_name, song_name];
  //   const promises = bufferUrl.map((url) => fetch(url).then((response) => response.arrayBuffer()));
  //   const buffers = await Promise.all(promises);
  //   this.buffers = buffers.map((buffer) => {
  //     // Assume audioData is an ArrayBuffer containing the raw audio data.
  //     const audioDataLength = buffer.byteLength;
  //     const paddedLength = Math.ceil(audioDataLength / 4) * 4;
  //     const paddedData = new ArrayBuffer(paddedLength);

  //     // Copy the original audio data into the padded buffer.
  //     const audioDataView = new DataView(buffer);
  //     const paddedDataView = new DataView(paddedData);
  //     for (let i = 0; i < audioDataLength; i++) {
  //       paddedDataView.setInt8(i, audioDataView.getInt8(i));
  //     }

  //     // Convert the padded data to a Float32Array.
  //     return new Float32Array(paddedDataView.buffer);
  //   });
  //   console.log(this.buffers);
  // }

  async loadBuffers() {
    const bufferUrl = [song_name, song_name];
    const promises = bufferUrl.map((url) => fetch(url).then((response) => response.arrayBuffer()));
    const audioBuffers = await Promise.all(promises.map((promise) => promise.then((buffer) => this.decodeAudioData(buffer))));
    console.log(...audioBuffers);

    this.buffers.push(...audioBuffers);
    // buffers.forEach((buffer) => {
    //   const audioContext = new AudioContext();
    //   const numChannels = 1;
    //   const sampleRate = audioContext.sampleRate;
    //   const length = buffer.byteLength;
    //   console.log(numChannels, length, sampleRate, buffer);

    //   const audioBuffer = audioContext.createBuffer(numChannels, length, sampleRate);

    //   for (let channel = 0; channel < numChannels; channel++) {
    //     const nowBuffering = audioBuffer.getChannelData(channel);
    //     for (let i = 0; i < length; i++) {
    //       nowBuffering[i] = this.buffers[channel][i];
    //     }
    //   }

    // this.buffers.push(audioBuffer);
  }

  process(inputs, outputs, parameters) {
    console.log('worklet processing');

    const output = outputs[0][0];

    for (let i = 0; i < output.length; i++) {
      if (!this.isPlaying) break;
      if (this.isAppending) {
        this.buffers.push(this.nextBuffer);
        this.isAppending = false;
      }
      output[i] = this.buffers[this.currentBufferIndex][i];

      if (++i >= output.length) break;

      output[i] = this.buffers[this.currentBufferIndex][i];

      if (++i >= output.length) break;

      output[i] = this.buffers[this.currentBufferIndex][i];
    }

    if (output.length < 3) {
      this.currentBufferIndex++;
      if (this.currentBufferIndex >= this.buffers.length) {
        this.isPlaying = false;
      } else if (this.currentBufferIndex === this.nextBufferIndex) {
        this.nextBufferIndex++;
        this.isAppending = true;
        fetch(song_name)
          .then((response) => response.arrayBuffer())
          .then((buffer) => {
            this.nextBuffer = new Float32Array(buffer);
          });
      }
    }

    return true;
  }
}

function main() {
  document.querySelector('.start').addEventListener('click', async () => {
    const context = new AudioContext();

    await context.audioWorklet.addModule('audio-loader-worklet-processor.js');
    const workletNode = new MyWorkletNode(context, 'audio-loader-worklet-processor');
    workletNode.port.postMessage('Hello, processor!');
    await workletNode.loadBuffers().then(() => {
      workletNode.isPlaying = true;
      console.log('isplaying set to true');
    });

    console.log('done buffering');

    // Create an instance of the audio buffer source node
    const bufferSourceNode = context.createBufferSource();

    console.log(workletNode.buffers[0]);
    // Set the buffer for the audio buffer source node
    bufferSourceNode.buffer = workletNode.buffers[0];

    console.log(bufferSourceNode);
    // Connect the audio buffer source node to the worklet node
    bufferSourceNode.connect(workletNode);

    // Connect the worklet node to the destination
    workletNode.connect(context.destination);

    // Start the audio buffer source node
    bufferSourceNode.start();

    document.querySelector('.loading-spinner').addEventListener('click', () => {
      console.log('clicked');
      console.log(workletNode);

      context.resume();
      console.log(context.state);
    });
  });
}

window.addEventListener('load', main);
