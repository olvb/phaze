"use strict";

const wavesAudio = require('waves-audio');
const wavesUI = require('waves-ui');
const wavesLoaders = require('waves-loaders');

let audioContext = wavesAudio.audioContext;

let loader = new wavesLoaders.AudioBufferLoader();

async function init() {
    const buffer = await loader.load('./sample.wav');

    let playerEngine = await setupEngine(buffer);
    let playControl = new wavesAudio.PlayControl(playerEngine);
    playControl.setLoopBoundaries(0, buffer.duration);
    playControl.loop = true;

    setupPlayPauseButton(playControl);
    setupTimeline(buffer, playControl);
}

async function setupEngine(buffer) {
    let playerEngine = new wavesAudio.PlayerEngine(buffer);
    playerEngine.buffer = buffer;
    playerEngine.cyclic = true;

    await audioContext.audioWorklet.addModule('phase-vocoder.js');
    let phaseVocoderNode = new AudioWorkletNode(audioContext, 'phase-vocoder-processor');

    playerEngine.connect(phaseVocoderNode);
    phaseVocoderNode.connect(audioContext.destination);

    return playerEngine;
}

function setupPlayPauseButton(playControl) {
    let $playButton = document.querySelector('button');
    $playButton.addEventListener('click', function() {
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }

        if (this.dataset.playing === 'false') {
            playControl.start();
            this.dataset.playing = 'true';
        } else if (this.dataset.playing === 'true') {
            playControl.pause();
            this.dataset.playing = 'false';
        }
    }, false);
}

function setupTimeline(buffer, playControl) {
    let $timeline = document.querySelector('#timeline');

    const width = $timeline.getBoundingClientRect().width;
    const height = 200;
    const duration = buffer.duration;
    const pixelsPerSecond = width / duration;

    let timeline = new wavesUI.core.Timeline(pixelsPerSecond, width);
    timeline.createTrack($timeline, height, 'main');
    let waveformLayer = new wavesUI.helpers.WaveformLayer(buffer, {
        height: height
    });

    // cursor
    let cursorData = { position: 0 };
    let cursorLayer = new wavesUI.core.Layer('entity', cursorData, {
      height: height
    });

    let timeContext = new wavesUI.core.LayerTimeContext(timeline.timeContext);
    cursorLayer.setTimeContext(timeContext);
    cursorLayer.configureShape(wavesUI.shapes.Cursor, {
        x: (data) => { return data.position; }
    }, {
        color: 'red'
    });

    timeline.addLayer(waveformLayer, 'main');
    timeline.addLayer(cursorLayer, 'main');

    timeline.tracks.render();
    timeline.tracks.update();

    // cursor animation loop
    (function loop() {
        cursorData.position = playControl.currentPosition;
        timeline.tracks.update(cursorLayer);

        requestAnimationFrame(loop);
    }());
}

window.addEventListener('load', init);
