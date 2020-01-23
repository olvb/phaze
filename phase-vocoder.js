"use strict";

const OlaProcessor = require('./ola-processor.js');
const BufferedProcessor = require('./buffered-processor.js');
const FFT = require('fft.js');

class PhaseVocoderProcessor extends OlaProcessor {
    constructor(options) {
        options.processorOptions = {
            numberOfInputChannels: 1,
            numberOfOutputChannels: 1,
            bufferedBlockSize: 512,
            hopSize: 256
        };
        super(options)

        // prepare FFT and pre-allocate buffers
        this.fft = new FFT(this.bufferedBlockSize);
        this.freqComplexBuffer = this.fft.createComplexArray();
        this.timeComplexBuffer = this.fft.createComplexArray();
    }

    processOla(inputs, outputs) {
        // console.log("process ola");
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                var inputChannel = inputs[i][j];
                var outputChannel = outputs[i][j];

                this.fft.realTransform(this.freqComplexBuffer, inputChannel);
                this.fft.completeSpectrum(this.freqComplexBuffer);

                // let complexBufferLength = this.complexBuffer.length;
                // for(var k = 0; k < complexBufferLength; k+= 2) {
                //     this.complexBuffer[k] = 0
                //     this.complexBuffer[k + 1] = 0
                // }

                this.fft.inverseTransform(this.timeComplexBuffer, this.freqComplexBuffer);
                this.fft.fromComplexArray(this.timeComplexBuffer, outputChannel);
            }
        }
    }
}

registerProcessor("phase-vocoder-processor", PhaseVocoderProcessor);

