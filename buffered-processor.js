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

        this.blockSize = WEBAUDIO_BLOCK_SIZE * options.processorOptions.blockSizeFactor;
        this.bufferSize = this.blockSize * 2;

        // keep track of buffer content
        this.inputStart = 0;
        this.inputLength = 0;
        this.outputStart = 0;
        this.outputLength = 0;

        // pre-allocate input buffers
        this.inputBuffers = new Array(this.nbInputs);
        for (var i = 0; i < this.nbInputs; i++) {
            this.inputBuffers[i] = new Array(this.nbInputChannels);
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBuffers[i][j] = new Float32Array(this.bufferSize);
            }
        }

        // pre-allocate output buffers
        this.outputBuffers = new Array(this.nbOutputs);
        for (var i = 0; i < this.nbOutputs; i++) {
            this.outputBuffers[i] = new Array(this.nbOutputChannels);
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.outputBuffers[i][j] = new Float32Array(this.bufferSize);
            }
        }

        // pre-allocate input/block arrays that will contain subarrays passed to processBlocks
        this.inputBlocks = new Array(this.nbInputs)
        for (var i = 0; i < this.nbInputs; i++) {
            this.inputBlocks[i] = new Array(this.nbInputChannels);
        }
        this.outputBlocks = new Array(this.nbOutputs)
        for (var i = 0; i < this.nbOutputs; i++) {
            this.outputBlocks[i] = new Array(this.nbOutputChannels);
        }
    }

    process(inputs, outputs, parameters) {
        // when playback is paused, we may stop receiving new samples
        if (inputs[0][0].length != 0) {
            this.readInputs(inputs);
        }

        if (this.inputLength >= this.blockSize) {
            this.prepareBlocksForProcessing();
            this.processBuffered(this.inputBlocks, this.outputBlocks);

            this.inputStart = (this.inputStart + this.blockSize) % this.bufferSize;;
            this.inputLength -= this.blockSize;
            this.outputLength += this.blockSize;

            console.assert(this.inputLength < this.blockSize);
        }

        if (this.outputLength >= WEBAUDIO_BLOCK_SIZE) {
            this.writeOutputs(outputs);
        }

        // don't know if/when we should return false
        return true;
    }

    /** Read next web audio block to input buffer **/
    readInputs(inputs) {
        let cursor = (this.inputStart + this.inputLength) % this.bufferSize;
        console.assert((cursor + WEBAUDIO_BLOCK_SIZE) <= this.bufferSize);

        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                let block = inputs[i][j];
                this.inputBuffers[i][j].set(block, cursor);
            }
        }

        this.inputLength += WEBAUDIO_BLOCK_SIZE;

        console.assert(this.inputLength <= this.bufferSize);
    }

    /** Write next web audio block from output buffer **/
    writeOutputs(outputs) {
        console.assert(this.outputLength >= WEBAUDIO_BLOCK_SIZE);

        let cursor = this.outputStart % this.bufferSize;
        console.assert((cursor + WEBAUDIO_BLOCK_SIZE) <= this.bufferSize);

        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.nbOutputChannels; j++) {
                let block = this.outputBuffers[i][j].subarray(cursor, cursor + WEBAUDIO_BLOCK_SIZE);
                outputs[i][j].set(block);
            }
        }

        this.outputStart = (this.outputStart + WEBAUDIO_BLOCK_SIZE) % this.bufferSize;
        this.outputLength -= WEBAUDIO_BLOCK_SIZE;

        console.assert(this.outputLength >= 0);
    }

    /** Prepare subarrays poiting to blocks to be read/written during processing **/
    prepareBlocksForProcessing() {
        let inputStart = this.inputStart;
        let inputEnd = inputStart + this.blockSize;

        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.nbInputChannels; j++) {
                this.inputBlocks[i][j] = this.inputBuffers[i][j].subarray(inputStart, inputEnd);
            }
        }

        let outputStart = this.outputStart;
        let outputEnd = outputStart + this.blockSize;

        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.nbOutputChannels; j++) {
                this.outputBlocks[i][j] = this.outputBuffers[i][j].subarray(outputStart, outputEnd);
            }
        }
    }

    processBuffered(inputs, outputs) {
        console.assert(false, "Not overriden");
    }
}

module.exports = BufferedProcessor;
