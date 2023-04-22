'use strict';

const wavesAudio = require('waves-audio');
const wavesUI = require('waves-ui');
const wavesLoaders = require('waves-loaders');
const Sockette = require('sockette');
//const Tone = require('tone');

const ws = new Sockette('ws://localhost:3001', {
  timeout: 5e3,
  maxAttempts: 10,
  onopen: (e) => console.log('Connected', e),
  onmessage: (e) => handleBuffer(e),
  onreconnect: (e) => console.log('Reconnecting...', e),
  onmaximum: (e) => console.log('Stop Attempting!', e),
  onclose: (e) => console.log('Closed!', e),
  onerror: (e) => console.log('Error:', e),
});

let audioContext = wavesAudio.audioContext;
let loader = new wavesLoaders.AudioBufferLoader();

var speedFactor = 1.0;
var pitchFactor = 1.0;

function init() {
  let $start = document.querySelector('#start');
  $start.addEventListener('click', loadTrack);

  let $startLocal = document.querySelector('#start-local');
  $startLocal.addEventListener('click', handleLocalBuffer);
}

// async function loadTrack() {
//   //const $link = document.querySelector('#link');
//   //ws.send($link.value);
//   alert('message: ', videoId);
//   ws.send('https://www.youtube.com/watch?v=R5i3tAcCcd0');
// }

async function handleBuffer(event) {
  const audioContext = new AudioContext();
  console.log(event.data, typeof event.data);
  const buffer = await event.data.arrayBuffer();
  console.log(buffer);
  const audioBuffer = await audioContext.decodeAudioData(buffer);
  handleAudioBuffer(audioBuffer);
}

async function handleLocalBuffer() {
  const buffer = await loader.load('./bossaura.mp3');
  let [playerEngine, phaseVocoderNode] = await setupEngine(buffer);
  let playControl = new wavesAudio.PlayControl(playerEngine);
  playControl.setLoopBoundaries(0, buffer.duration);
  playControl.loop = true;

  setupPlayPauseButton(playControl);
  setupSpeedSlider(playControl, phaseVocoderNode);
  setupPitchSlider(phaseVocoderNode);
  setupTimeline(buffer, playControl);

  let $controls = document.querySelector('.controls');
  $controls.style.display = 'flex';
}

async function handleAudioBuffer(buffer) {
  if (audioContext.audioWorklet === undefined) {
    handleNoWorklet();
    return;
  }
  let [playerEngine, phaseVocoderNode] = await setupEngine(buffer);
  let playControl = new wavesAudio.PlayControl(playerEngine);
  playControl.setLoopBoundaries(0, buffer.duration);
  playControl.loop = true;

  setupPlayPauseButton(playControl);
  setupSpeedSlider(playControl, phaseVocoderNode);
  setupPitchSlider(phaseVocoderNode);
  setupTimeline(buffer, playControl);

  let $controls = document.querySelector('.controls');
  $controls.style.display = 'flex';
}

function handleNoWorklet() {
  let $noWorklet = document.querySelector('#no-worklet');
  $noWorklet.style.display = 'block';
  let $timeline = document.querySelector('.timeline');
  $timeline.style.display = 'none';
  let $controls = document.querySelector('.controls');
  $controls.style.display = 'none';
}

async function setupEngine(buffer) {
  let playerEngine = new wavesAudio.PlayerEngine(buffer);
  playerEngine.buffer = buffer;
  playerEngine.cyclic = true;

  await audioContext.audioWorklet.addModule('phase-vocoder.js');
  let phaseVocoderNode = new AudioWorkletNode(audioContext, 'phase-vocoder-processor');
  playerEngine.connect(phaseVocoderNode);
  phaseVocoderNode.connect(audioContext.destination);

  return [playerEngine, phaseVocoderNode];
}

function setupPlayPauseButton(playControl) {
  let $playButton = document.querySelector('#play-pause');
  let $playIcon = $playButton.querySelector('.play');
  let $pauseIcon = $playButton.querySelector('.pause');
  $playButton.addEventListener(
    'click',
    function () {
      if (audioContext.state === 'suspended') {
        audioContext.resume();
      }

      if (this.dataset.playing === 'false') {
        playControl.start();
        this.dataset.playing = 'true';
        $playIcon.style.display = 'none';
        $pauseIcon.style.display = 'inline';
      } else if (this.dataset.playing === 'true') {
        playControl.pause();
        this.dataset.playing = 'false';
        $pauseIcon.style.display = 'none';
        $playIcon.style.display = 'inline';
      }
    },
    false
  );
}

function setupSpeedSlider(playControl, phaseVocoderNode) {
  let pitchFactorParam = phaseVocoderNode.parameters.get('pitchFactor');
  let $speedSlider = document.querySelector('#speed');
  let $valueLabel = document.querySelector('#speed-value');
  $speedSlider.addEventListener(
    'input',
    function () {
      speedFactor = parseFloat(this.value);
      playControl.speed = speedFactor;
      pitchFactorParam.value = (pitchFactor * 1) / speedFactor;
      $valueLabel.innerHTML = speedFactor.toFixed(2);
    },
    false
  );
}

function setupPitchSlider(phaseVocoderNode) {
  let pitchFactorParam = phaseVocoderNode.parameters.get('pitchFactor');
  let $pitchSlider = document.querySelector('#pitch');
  let $valueLabel = document.querySelector('#pitch-value');
  $pitchSlider.addEventListener(
    'input',
    function () {
      pitchFactor = parseFloat(this.value);
      pitchFactorParam.value = (pitchFactor * 1) / speedFactor;

      $valueLabel.innerHTML = pitchFactor.toFixed(2);
    },
    false
  );
}

function setupTimeline(buffer, playControl) {
  let $timeline = document.querySelector('#timeline');

  const width = $timeline.getBoundingClientRect().width;
  //const height = document.querySelector('.workletContainer').height;
  const height = Math.trunc((width * 3) / 8);
  const duration = buffer.duration;
  const pixelsPerSecond = width / duration;

  let timeline = new wavesUI.core.Timeline(pixelsPerSecond, width);
  timeline.createTrack($timeline, height, 'main');
  let waveformLayer = new wavesUI.helpers.WaveformLayer(buffer, {
    height: height,
  });

  // cursor
  let cursorData = { position: 0 };
  let cursorLayer = new wavesUI.core.Layer('entity', cursorData, {
    height: height,
  });

  let timeContext = new wavesUI.core.LayerTimeContext(timeline.timeContext);
  cursorLayer.setTimeContext(timeContext);
  cursorLayer.configureShape(
    wavesUI.shapes.Cursor,
    {
      x: (data) => {
        return data.position;
      },
    },
    {
      color: 'red',
    }
  );

  timeline.addLayer(waveformLayer, 'main');
  timeline.addLayer(cursorLayer, 'main');

  timeline.tracks.render();
  timeline.tracks.update();

  // cursor animation loop
  (function loop() {
    cursorData.position = playControl.currentPosition;
    timeline.tracks.update(cursorLayer);

    requestAnimationFrame(loop);
  })();
}

window.addEventListener('load', init);

window.addEventListener('message', (message) => {
  // message.data === selectedVideo
  //ws.send(`https://www.youtube.com/watch?v=${message.data}`);
  if (window.ReactNativeWebView) {
    window.ReactNativeWebView.postMessage('Passed on data to server');
  }
});

// Will keep this in case anything breaks, but as of now Tone JS is not as good as the phazer package
// async function processTONEJSAudio() {
//   await Tone.start();
//   const player = new Tone.GrainPlayer({
//     url: './bossaura.mp3',
//     grainSize: 1,
//     overlap: 1,
//     detune: -100,
//   });
//   await Tone.loaded();

//   // Connect the GrainPlayer to the Tone.js output
//   player.toDestination();
//   player.start();
//   console.log(player.buffer);

//   // // start the audio playback
//   document.querySelector('#play').addEventListener('click', async () => {
//     // player.detune = -200;
//     console.log(player.buffer);
//     console.log(player);
//     player.start();
//   });
// }

// function stream2buffer(stream) {
//   //stream.forEach((e) => console.log(e));
//   console.log(stream.arrayBuffer());

//   return new Promise((resolve, reject) => {
//     const _buf = [];
//     console.log(stream);

//     stream.on('data', (chunk) => _buf.push(chunk));
//     stream.on('end', () => resolve(Buffer.concat(_buf)));
//     stream.on('error', (err) => reject(err));
//   });
// }
