"use strict";

const WEBAUDIO_BLOCK_SIZE = 128;
class OLAProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        // TODO
        this.nbInputs = options.numberOfInputs;
        this.nbOutputs = options.numberOfOutputs;
        this.nbInputChannels = 1; //options.numberOfInputChannels;
        this.nbOutputChannels = 1; //options.numberOfOutputChannels;

        this.blockSize = options.processorOptions.blockSize;
         // TODO for now, the only support hop size is the size of a web audio block
        this.hopSize = WEBAUDIO_BLOCK_SIZE;

        this.nbOverlaps = this.blockSize / this.hopSize;

        // pre-allocate input buffers
        this.inputBuffers = new Array(this.nbInputs);
        for (var i = 0; i < this.nbInputs; i++) {
            this.inputBuffers[i] = new Array(this.nbInputChannels);
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBuffers[i][j] = new Float32Array(this.blockSize + WEBAUDIO_BLOCK_SIZE);
                this.inputBuffers[i][j].fill(0);
            }
        }

        // pre-allocate output buffers
        this.outputBuffers = new Array(this.nbOutputs);
        for (var i = 0; i < this.nbOutputs; i++) {
            this.outputBuffers[i] = new Array(this.nbOutputChannels);
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.outputBuffers[i][j] = new Float32Array(this.blockSize);
                this.outputBuffers[i][j].fill(0);
            }
        }

        // pre-allocate input buffers to send and head pointers to copy from
        // (cannot directly send a pointer/subarray because input may be modified)
        this.inputBuffersHead = new Array(this.nbInputs);
        this.inputBuffersToSend = new Array(this.nbInputs);
        for (var i = 0; i < this.nbInputs; i++) {
            this.inputBuffersHead[i] = new Array(this.nbInputChannels);
            this.inputBuffersToSend[i] = new Array(this.nbInputChannels);
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBuffersHead[i][j] = this.inputBuffers[i][j] .subarray(0, this.blockSize);
                this.inputBuffersToSend[i][j] = new Float32Array(this.blockSize);
            }
        }

        // pre-allocate output buffers to retrieve
        // (cannot send a pointer/subarray because new output has to be add to exising output)
        this.outputBuffersToRetrieve = new Array(this.nbOutputs);
        for (var i = 0; i < this.nbOutputs; i++) {
            this.outputBuffersToRetrieve[i] = new Array(this.nbOutputChannels);
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.outputBuffersToRetrieve[i][j] = new Float32Array(this.blockSize);
                this.outputBuffersToRetrieve[i][j].fill(0);
            }
        }
    }

    /** Read next web audio block to input buffers **/
    readInputs(inputs) {
        // when playback is paused, we may stop receiving new samples
        if (inputs[0][0].length == 0) {
            for (var i = 0; i < this.nbInputs; i++) {
                for (var j = 0; j < this.nbInputChannels; j++) {
                    this.inputBuffers[i][j].fill(0, this.blockSize);
                }
            }
            return;
        }

        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                let webAudioBlock = inputs[i][j];
                this.inputBuffers[i][j].set(webAudioBlock, this.blockSize);
            }
        }
    }

    /** Write next web audio block from output buffers **/
    writeOutputs(outputs) {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                let webAudioBlock = this.outputBuffers[i][j].subarray(0, WEBAUDIO_BLOCK_SIZE);
                outputs[i][j].set(webAudioBlock);
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
                this.outputBuffers[i][j].subarray(this.blockSize - WEBAUDIO_BLOCK_SIZE).fill(0);
            }
        }
    }

    /** Copy contents of input buffers to buffer actually sent to process **/
    prepareInputBuffersToSend() {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBuffersToSend[i][j].set(this.inputBuffersHead[i][j]);
            }
        }
    }

    /** Add contents of output buffers just processed to output buffers **/
    handleOutputBuffersToRetrieve() {
        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.nbOutputChannels; j++) {
                for (var k = 0; k < this.blockSize; k++) {
                    this.outputBuffers[i][j][k] += this.outputBuffersToRetrieve[i][j][k] / this.nbOverlaps;
                }
            }
        }
    }

    process(inputs, outputs, params) {
        this.readInputs(inputs);
        this.shiftInputBuffers();
        this.prepareInputBuffersToSend()
        this.processOLA(this.inputBuffersToSend, this.outputBuffersToRetrieve, params);
        this.handleOutputBuffersToRetrieve();
        this.writeOutputs(outputs);
        this.shiftOutputBuffers();

        return true;
    }

    processOLA(inputs, outputs, params) {
        console.assert(false, "Not overriden");
    }
}

module.exports = OLAProcessor;
