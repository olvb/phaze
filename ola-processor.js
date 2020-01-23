"use strict";

const BufferedProcessor = require('./buffered-processor.js');

class OlaProcessor extends BufferedProcessor {
    constructor(options) {
        super(options)


        this.nbInputs = options.numberOfInputs;
        this.nbOutputs = options.numberOfOutputs;

        this.nbInputChannels = options.processorOptions.numberOfInputChannels;
        // TODO there is already a built-in option for this apparently
        this.nbOutputChannels = options.processorOptions.numberOfOutputChannels;

        this.hopSize = options.processorOptions.hopSize;
        this.olaInputWriteCursor = this.bufferedBlockSize;

        // pre-allocate input buffers
        this.olaInputBuffers = new Array(this.nbInputs);
        this.olaInputBuffersHead = new Array(this.nbInputs);
        this.olaInputBuffersTail = new Array(this.nbInputs);
        for (var i = 0; i < this.nbInputs; i++) {
            this.olaInputBuffers[i] = new Array(this.nbInputChannels);
            this.olaInputBuffersHead[i] = new Array(this.nbInputChannels);
            this.olaInputBuffersTail[i] = new Array(this.nbInputChannels);

            for (var j = 0; j < this.nbInputChannels; j++) {
                this.olaInputBuffers[i][j] = new Float32Array(this.bufferedBlockSize * 2);
                this.olaInputBuffers[i][j].fill(0);

                this.olaInputBuffersHead[i][j] = this.olaInputBuffers[i][j].subarray(0, this.bufferedBlockSize);
                this.olaInputBuffersTail[i][j] = this.olaInputBuffers[i][j].subarray(this.bufferedBlockSize);
            }
        }

        // pre-allocate output buffers
        this.olaOutputBuffers = new Array(this.nbOutputs);
        this.olaOutputBuffersHead = new Array(this.nbInputs);
        this.olaOutputBuffersTail = new Array(this.nbInputs);
        for (var i = 0; i < this.nbOutputs; i++) {
            this.olaOutputBuffers[i] = new Array(this.nbOutputChannels);
            this.olaOutputBuffersHead[i] = new Array(this.nbOutputChannels);
            this.olaOutputBuffersTail[i] = new Array(this.nbOutputChannels);

            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.olaOutputBuffers[i][j] = new Float32Array(this.bufferedBlockSize * 2);
                this.olaOutputBuffers[i][j].fill(0);

                this.olaOutputBuffersHead[i][j] = this.olaOutputBuffers[i][j].subarray(0, this.bufferedBlockSize);
                this.olaOutputBuffersTail[i][j] = this.olaOutputBuffers[i][j].subarray(this.bufferedBlockSize);
            }
        }
    }

    /** Shift left content of input buffers to process next overlapping block **/
    shiftOlaInputBuffers() {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.olaInputBuffers[i][j].copyWithin(0, this.hopSize);
            }
        }
    }

    /** Shift left content of output buffers to process next overlapping block **/
    shiftOlaOutputBuffers() {
        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.olaOutputBuffers[i][j].copyWithin(0, this.hopSize);
            }
        }
    }

    /** Read next buffered block to ola input buffers **/
    readOlaInputs(inputs) {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.olaInputBuffersTail[i][j].set(inputs[i][j]);
            }
        }
    }

    /** Write next buffered block from ola output buffers **/
    writeOlaOutputs(outputs) {
        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.nbOutputChannels; j++) {
                outputs[i][j].set(this.olaOutputBuffersHead[i][j]);
            }
        }
    }

    processBuffered(inputsBuffers, outputBuffers, parameters) {
        // console.log("process buffered");
        this.readOlaInputs(inputsBuffers);
        for (var i = 0; i < this.bufferedBlockSize / this.hopSize; i++) {
            this.processOla(this.olaInputBuffersTail, this.olaOutputBuffersTail, parameters);
            this.shiftOlaInputBuffers();
            this.shiftOlaOutputBuffers();
        }

        this.writeOlaOutputs(outputBuffers);
    }

    processOla(inputs, outputs, parameters) {
        console.assert(false, "Not overriden");
    }
}

module.exports = OlaProcessor;
