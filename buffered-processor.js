"use strict";

const WEBAUDIO_BLOCK_SIZE = 128;

class BufferedProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super()

        this.nbInputs = options.numberOfInputs;
        this.nbOutputs = options.numberOfOutputs;

        this.nbInputChannels = options.processorOptions.numberOfInputChannels;
        // TODO there is already a built-in option for this apparently
        this.nbOutputChannels = options.processorOptions.numberOfOutputChannels;

        console.assert(options.processorOptions.bufferedBlockSize % WEBAUDIO_BLOCK_SIZE == 0, `Block size must be multiple of ${WEBAUDIO_BLOCK_SIZE}`);

        this.bufferedBlockSize = options.processorOptions.bufferedBlockSize;
        this.inputWriteCursor = this.bufferedBlockSize - WEBAUDIO_BLOCK_SIZE;

        // pre-allocate input buffers
        this.inputBuffers = new Array(this.nbInputs);
        for (var i = 0; i < this.nbInputs; i++) {
            this.inputBuffers[i] = new Array(this.nbInputChannels);
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBuffers[i][j] = new Float32Array(this.bufferedBlockSize);
                this.inputBuffers[i][j].fill(0);
            }
        }

        // pre-allocate output buffers
        this.outputBuffers = new Array(this.nbOutputs);
        for (var i = 0; i < this.nbOutputs; i++) {
            this.outputBuffers[i] = new Array(this.nbOutputChannels);
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.outputBuffers[i][j] = new Float32Array(this.bufferedBlockSize);
                this.outputBuffers[i][j].fill(0);
            }
        }
    }

    /** Shift left content of input buffers to receive new web audio block **/
    shiftInputBuffers() {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBuffers[i][j].copyWithin(0, WEBAUDIO_BLOCK_SIZE);
            }
        }
    }

    /** Shift left content of output buffers to receive new web audio block **/
    shiftOutputBuffers() {
        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.outputBuffers[i][j].copyWithin(0, WEBAUDIO_BLOCK_SIZE);
            }
        }
    }

    /** Read next web audio block to input buffers **/
    readInputs(inputs) {
        // when playback is paused, we may stop receiving new samples
        if (inputs[0][0].length != 0) {
            for (var i = 0; i < this.nbInputs; i++) {
                for (var j = 0; j < this.nbInputChannels; j++) {
                    let block = inputs[i][j];
                    this.inputBuffers[i][j].set(block, this.inputWriteCursor);
                }
            }
        } else {
            for (var i = 0; i < this.nbInputs; i++) {
                for (var j = 0; j < this.nbInputChannels; j++) {
                    this.inputBuffers[i][j].fill(0, this.inputWriteCursor, this.bufferedBlockSize);
                }
            }
        }
    }

    /** Write next web audio block from output buffers **/
    writeOutputs(outputs) {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                let block = this.outputBuffers[i][j].subarray(0, WEBAUDIO_BLOCK_SIZE);
                outputs[i][j].set(block);
            }
        }
    }

    process(inputs, outputs, parameters) {
        // console.log("process");
        this.readInputs(inputs);
        this.processBuffered(this.inputBuffers, this.outputBuffers, parameters);
        this.writeOutputs(outputs);

        this.shiftInputBuffers();
        this.shiftOutputBuffers();

        return true;
    }

    processBuffered(inputs, outputs) {
        console.assert(false, "Not overriden");
    }
}

module.exports = BufferedProcessor;
