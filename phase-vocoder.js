"use strict";

const BufferedProcessor = require('./buffered-processor.js');
const FFT = require('fft.js');

class PhaseVocoderProcessor extends BufferedProcessor {
    constructor(options) {
        options.processorOptions = {
            numberOfInputChannels: 1,
            numberOfOutputChannels: 1,
            blockSizeFactor: 4
        };
        super(options)

        // prepare FFT and pre-allocate buffers
        this.fft = new FFT(this.blockSize);
        this.freqComplexBuffer = this.fft.createComplexArray();
        this.timeComplexBuffer = this.fft.createComplexArray();
    }

    processBuffered(inputs, outputs) {
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

