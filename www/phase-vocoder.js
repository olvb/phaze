(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
'use strict';

function FFT(size) {
  this.size = size | 0;
  if (this.size <= 1 || (this.size & (this.size - 1)) !== 0)
    throw new Error('FFT size must be a power of two and bigger than 1');

  this._csize = size << 1;

  // NOTE: Use of `var` is intentional for old V8 versions
  var table = new Array(this.size * 2);
  for (var i = 0; i < table.length; i += 2) {
    const angle = Math.PI * i / this.size;
    table[i] = Math.cos(angle);
    table[i + 1] = -Math.sin(angle);
  }
  this.table = table;

  // Find size's power of two
  var power = 0;
  for (var t = 1; this.size > t; t <<= 1)
    power++;

  // Calculate initial step's width:
  //   * If we are full radix-4 - it is 2x smaller to give inital len=8
  //   * Otherwise it is the same as `power` to give len=4
  this._width = power % 2 === 0 ? power - 1 : power;

  // Pre-compute bit-reversal patterns
  this._bitrev = new Array(1 << this._width);
  for (var j = 0; j < this._bitrev.length; j++) {
    this._bitrev[j] = 0;
    for (var shift = 0; shift < this._width; shift += 2) {
      var revShift = this._width - shift - 2;
      this._bitrev[j] |= ((j >>> shift) & 3) << revShift;
    }
  }

  this._out = null;
  this._data = null;
  this._inv = 0;
}
module.exports = FFT;

FFT.prototype.fromComplexArray = function fromComplexArray(complex, storage) {
  var res = storage || new Array(complex.length >>> 1);
  for (var i = 0; i < complex.length; i += 2)
    res[i >>> 1] = complex[i];
  return res;
};

FFT.prototype.createComplexArray = function createComplexArray() {
  const res = new Array(this._csize);
  for (var i = 0; i < res.length; i++)
    res[i] = 0;
  return res;
};

FFT.prototype.toComplexArray = function toComplexArray(input, storage) {
  var res = storage || this.createComplexArray();
  for (var i = 0; i < res.length; i += 2) {
    res[i] = input[i >>> 1];
    res[i + 1] = 0;
  }
  return res;
};

FFT.prototype.completeSpectrum = function completeSpectrum(spectrum) {
  var size = this._csize;
  var half = size >>> 1;
  for (var i = 2; i < half; i += 2) {
    spectrum[size - i] = spectrum[i];
    spectrum[size - i + 1] = -spectrum[i + 1];
  }
};

FFT.prototype.transform = function transform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._transform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.realTransform = function realTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 0;
  this._realTransform4();
  this._out = null;
  this._data = null;
};

FFT.prototype.inverseTransform = function inverseTransform(out, data) {
  if (out === data)
    throw new Error('Input and output buffers must be different');

  this._out = out;
  this._data = data;
  this._inv = 1;
  this._transform4();
  for (var i = 0; i < out.length; i++)
    out[i] /= this.size;
  this._out = null;
  this._data = null;
};

// radix-4 implementation
//
// NOTE: Uses of `var` are intentional for older V8 version that do not
// support both `let compound assignments` and `const phi`
FFT.prototype._transform4 = function _transform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform2(outOff, off, step);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleTransform4(outOff, off, step);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var quarterLen = len >>> 2;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      // Full case
      var limit = outOff + quarterLen;
      for (var i = outOff, k = 0; i < limit; i += 2, k += step) {
        const A = i;
        const B = A + quarterLen;
        const C = B + quarterLen;
        const D = C + quarterLen;

        // Original values
        const Ar = out[A];
        const Ai = out[A + 1];
        const Br = out[B];
        const Bi = out[B + 1];
        const Cr = out[C];
        const Ci = out[C + 1];
        const Dr = out[D];
        const Di = out[D + 1];

        // Middle values
        const MAr = Ar;
        const MAi = Ai;

        const tableBr = table[k];
        const tableBi = inv * table[k + 1];
        const MBr = Br * tableBr - Bi * tableBi;
        const MBi = Br * tableBi + Bi * tableBr;

        const tableCr = table[2 * k];
        const tableCi = inv * table[2 * k + 1];
        const MCr = Cr * tableCr - Ci * tableCi;
        const MCi = Cr * tableCi + Ci * tableCr;

        const tableDr = table[3 * k];
        const tableDi = inv * table[3 * k + 1];
        const MDr = Dr * tableDr - Di * tableDi;
        const MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        const T0r = MAr + MCr;
        const T0i = MAi + MCi;
        const T1r = MAr - MCr;
        const T1i = MAi - MCi;
        const T2r = MBr + MDr;
        const T2i = MBi + MDi;
        const T3r = inv * (MBr - MDr);
        const T3i = inv * (MBi - MDi);

        // Final values
        const FAr = T0r + T2r;
        const FAi = T0i + T2i;

        const FCr = T0r - T2r;
        const FCi = T0i - T2i;

        const FBr = T1r + T3i;
        const FBi = T1i - T3r;

        const FDr = T1r - T3i;
        const FDi = T1i + T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;
        out[C] = FCr;
        out[C + 1] = FCi;
        out[D] = FDr;
        out[D + 1] = FDi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleTransform2 = function _singleTransform2(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const evenI = data[off + 1];
  const oddR = data[off + step];
  const oddI = data[off + step + 1];

  const leftR = evenR + oddR;
  const leftI = evenI + oddI;
  const rightR = evenR - oddR;
  const rightI = evenI - oddI;

  out[outOff] = leftR;
  out[outOff + 1] = leftI;
  out[outOff + 2] = rightR;
  out[outOff + 3] = rightI;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleTransform4 = function _singleTransform4(outOff, off,
                                                             step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Ai = data[off + 1];
  const Br = data[off + step];
  const Bi = data[off + step + 1];
  const Cr = data[off + step2];
  const Ci = data[off + step2 + 1];
  const Dr = data[off + step3];
  const Di = data[off + step3 + 1];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T0i = Ai + Ci;
  const T1r = Ar - Cr;
  const T1i = Ai - Ci;
  const T2r = Br + Dr;
  const T2i = Bi + Di;
  const T3r = inv * (Br - Dr);
  const T3i = inv * (Bi - Di);

  // Final values
  const FAr = T0r + T2r;
  const FAi = T0i + T2i;

  const FBr = T1r + T3i;
  const FBi = T1i - T3r;

  const FCr = T0r - T2r;
  const FCi = T0i - T2i;

  const FDr = T1r - T3i;
  const FDi = T1i + T3r;

  out[outOff] = FAr;
  out[outOff + 1] = FAi;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = FCi;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

// Real input radix-4 implementation
FFT.prototype._realTransform4 = function _realTransform4() {
  var out = this._out;
  var size = this._csize;

  // Initial step (permute and transform)
  var width = this._width;
  var step = 1 << width;
  var len = (size / step) << 1;

  var outOff;
  var t;
  var bitrev = this._bitrev;
  if (len === 4) {
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform2(outOff, off >>> 1, step >>> 1);
    }
  } else {
    // len === 8
    for (outOff = 0, t = 0; outOff < size; outOff += len, t++) {
      const off = bitrev[t];
      this._singleRealTransform4(outOff, off >>> 1, step >>> 1);
    }
  }

  // Loop through steps in decreasing order
  var inv = this._inv ? -1 : 1;
  var table = this.table;
  for (step >>= 2; step >= 2; step >>= 2) {
    len = (size / step) << 1;
    var halfLen = len >>> 1;
    var quarterLen = halfLen >>> 1;
    var hquarterLen = quarterLen >>> 1;

    // Loop through offsets in the data
    for (outOff = 0; outOff < size; outOff += len) {
      for (var i = 0, k = 0; i <= hquarterLen; i += 2, k += step) {
        var A = outOff + i;
        var B = A + quarterLen;
        var C = B + quarterLen;
        var D = C + quarterLen;

        // Original values
        var Ar = out[A];
        var Ai = out[A + 1];
        var Br = out[B];
        var Bi = out[B + 1];
        var Cr = out[C];
        var Ci = out[C + 1];
        var Dr = out[D];
        var Di = out[D + 1];

        // Middle values
        var MAr = Ar;
        var MAi = Ai;

        var tableBr = table[k];
        var tableBi = inv * table[k + 1];
        var MBr = Br * tableBr - Bi * tableBi;
        var MBi = Br * tableBi + Bi * tableBr;

        var tableCr = table[2 * k];
        var tableCi = inv * table[2 * k + 1];
        var MCr = Cr * tableCr - Ci * tableCi;
        var MCi = Cr * tableCi + Ci * tableCr;

        var tableDr = table[3 * k];
        var tableDi = inv * table[3 * k + 1];
        var MDr = Dr * tableDr - Di * tableDi;
        var MDi = Dr * tableDi + Di * tableDr;

        // Pre-Final values
        var T0r = MAr + MCr;
        var T0i = MAi + MCi;
        var T1r = MAr - MCr;
        var T1i = MAi - MCi;
        var T2r = MBr + MDr;
        var T2i = MBi + MDi;
        var T3r = inv * (MBr - MDr);
        var T3i = inv * (MBi - MDi);

        // Final values
        var FAr = T0r + T2r;
        var FAi = T0i + T2i;

        var FBr = T1r + T3i;
        var FBi = T1i - T3r;

        out[A] = FAr;
        out[A + 1] = FAi;
        out[B] = FBr;
        out[B + 1] = FBi;

        // Output final middle point
        if (i === 0) {
          var FCr = T0r - T2r;
          var FCi = T0i - T2i;
          out[C] = FCr;
          out[C + 1] = FCi;
          continue;
        }

        // Do not overwrite ourselves
        if (i === hquarterLen)
          continue;

        // In the flipped case:
        // MAi = -MAi
        // MBr=-MBi, MBi=-MBr
        // MCr=-MCr
        // MDr=MDi, MDi=MDr
        var ST0r = T1r;
        var ST0i = -T1i;
        var ST1r = T0r;
        var ST1i = -T0i;
        var ST2r = -inv * T3i;
        var ST2i = -inv * T3r;
        var ST3r = -inv * T2i;
        var ST3i = -inv * T2r;

        var SFAr = ST0r + ST2r;
        var SFAi = ST0i + ST2i;

        var SFBr = ST1r + ST3i;
        var SFBi = ST1i - ST3r;

        var SA = outOff + quarterLen - i;
        var SB = outOff + halfLen - i;

        out[SA] = SFAr;
        out[SA + 1] = SFAi;
        out[SB] = SFBr;
        out[SB + 1] = SFBi;
      }
    }
  }
};

// radix-2 implementation
//
// NOTE: Only called for len=4
FFT.prototype._singleRealTransform2 = function _singleRealTransform2(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;

  const evenR = data[off];
  const oddR = data[off + step];

  const leftR = evenR + oddR;
  const rightR = evenR - oddR;

  out[outOff] = leftR;
  out[outOff + 1] = 0;
  out[outOff + 2] = rightR;
  out[outOff + 3] = 0;
};

// radix-4
//
// NOTE: Only called for len=8
FFT.prototype._singleRealTransform4 = function _singleRealTransform4(outOff,
                                                                     off,
                                                                     step) {
  const out = this._out;
  const data = this._data;
  const inv = this._inv ? -1 : 1;
  const step2 = step * 2;
  const step3 = step * 3;

  // Original values
  const Ar = data[off];
  const Br = data[off + step];
  const Cr = data[off + step2];
  const Dr = data[off + step3];

  // Pre-Final values
  const T0r = Ar + Cr;
  const T1r = Ar - Cr;
  const T2r = Br + Dr;
  const T3r = inv * (Br - Dr);

  // Final values
  const FAr = T0r + T2r;

  const FBr = T1r;
  const FBi = -T3r;

  const FCr = T0r - T2r;

  const FDr = T1r;
  const FDi = T3r;

  out[outOff] = FAr;
  out[outOff + 1] = 0;
  out[outOff + 2] = FBr;
  out[outOff + 3] = FBi;
  out[outOff + 4] = FCr;
  out[outOff + 5] = 0;
  out[outOff + 6] = FDr;
  out[outOff + 7] = FDi;
};

},{}],2:[function(require,module,exports){
"use strict";

const WEBAUDIO_BLOCK_SIZE = 128;

/** Overlap-Add Node */
class OLAProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super(options);

        this.nbInputs = options.numberOfInputs;
        this.nbOutputs = options.numberOfOutputs;

        this.blockSize = options.processorOptions.blockSize;
         // TODO for now, the only support hop size is the size of a web audio block
        this.hopSize = WEBAUDIO_BLOCK_SIZE;

        this.nbOverlaps = this.blockSize / this.hopSize;

        // pre-allocate input buffers (will be reallocated if needed)
        this.inputBuffers = new Array(this.nbInputs);
        this.inputBuffersHead = new Array(this.nbInputs);
        this.inputBuffersToSend = new Array(this.nbInputs);
        // default to 1 channel per input until we know more
        for (var i = 0; i < this.nbInputs; i++) {
            this.allocateInputChannels(i, 1);
        }
        // pre-allocate input buffers (will be reallocated if needed)
        this.outputBuffers = new Array(this.nbOutputs);
        this.outputBuffersToRetrieve = new Array(this.nbOutputs);
        // default to 1 channel per output until we know more
        for (var i = 0; i < this.nbOutputs; i++) {
            this.allocateOutputChannels(i, 1);
        }
    }

    /** Handles dynamic reallocation of input/output channels buffer
     (channel numbers may vary during lifecycle) **/
    reallocateChannelsIfNeeded(inputs, outputs) {
        for (var i = 0; i < this.nbInputs; i++) {
            let nbChannels = inputs[i].length;
            if (nbChannels != this.inputBuffers[i].length) {
                this.allocateInputChannels(i, nbChannels);
            }
        }

        for (var i = 0; i < this.nbOutputs; i++) {
            let nbChannels = outputs[i].length;
            if (nbChannels != this.outputBuffers[i].length) {
                this.allocateOutputChannels(i, nbChannels);
            }
        }
    }

    allocateInputChannels(inputIndex, nbChannels) {
        // allocate input buffers

        this.inputBuffers[inputIndex] = new Array(nbChannels);
        for (var i = 0; i < nbChannels; i++) {
            this.inputBuffers[inputIndex][i] = new Float32Array(this.blockSize + WEBAUDIO_BLOCK_SIZE);
            this.inputBuffers[inputIndex][i].fill(0);
        }

        // allocate input buffers to send and head pointers to copy from
        // (cannot directly send a pointer/subarray because input may be modified)
        this.inputBuffersHead[inputIndex] = new Array(nbChannels);
        this.inputBuffersToSend[inputIndex] = new Array(nbChannels);
        for (var i = 0; i < nbChannels; i++) {
            this.inputBuffersHead[inputIndex][i] = this.inputBuffers[inputIndex][i] .subarray(0, this.blockSize);
            this.inputBuffersToSend[inputIndex][i] = new Float32Array(this.blockSize);
        }
    }

    allocateOutputChannels(outputIndex, nbChannels) {
        // allocate output buffers
        this.outputBuffers[outputIndex] = new Array(nbChannels);
        for (var i = 0; i < nbChannels; i++) {
            this.outputBuffers[outputIndex][i] = new Float32Array(this.blockSize);
            this.outputBuffers[outputIndex][i].fill(0);
        }

        // allocate output buffers to retrieve
        // (cannot send a pointer/subarray because new output has to be add to exising output)
        this.outputBuffersToRetrieve[outputIndex] = new Array(nbChannels);
        for (var i = 0; i < nbChannels; i++) {
            this.outputBuffersToRetrieve[outputIndex][i] = new Float32Array(this.blockSize);
            this.outputBuffersToRetrieve[outputIndex][i].fill(0);
        }
    }

    /** Read next web audio block to input buffers **/
    readInputs(inputs) {
        // when playback is paused, we may stop receiving new samples
        if (inputs[0][0].length == 0) {
            for (var i = 0; i < this.nbInputs; i++) {
                for (var j = 0; j < this.inputBuffers[i].length; j++) {
                    this.inputBuffers[i][j].fill(0, this.blockSize);
                }
            }
            return;
        }

        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.inputBuffers[i].length; j++) {
                let webAudioBlock = inputs[i][j];
                this.inputBuffers[i][j].set(webAudioBlock, this.blockSize);
            }
        }
    }

    /** Write next web audio block from output buffers **/
    writeOutputs(outputs) {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.inputBuffers[i].length; j++) {
                let webAudioBlock = this.outputBuffers[i][j].subarray(0, WEBAUDIO_BLOCK_SIZE);
                outputs[i][j].set(webAudioBlock);
            }
        }
    }

    /** Shift left content of input buffers to receive new web audio block **/
    shiftInputBuffers() {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.inputBuffers[i].length; j++) {
                this.inputBuffers[i][j].copyWithin(0, WEBAUDIO_BLOCK_SIZE);
            }
        }
    }

    /** Shift left content of output buffers to receive new web audio block **/
    shiftOutputBuffers() {
        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.outputBuffers[i].length; j++) {
                this.outputBuffers[i][j].copyWithin(0, WEBAUDIO_BLOCK_SIZE);
                this.outputBuffers[i][j].subarray(this.blockSize - WEBAUDIO_BLOCK_SIZE).fill(0);
            }
        }
    }

    /** Copy contents of input buffers to buffer actually sent to process **/
    prepareInputBuffersToSend() {
        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < this.inputBuffers[i].length; j++) {
                this.inputBuffersToSend[i][j].set(this.inputBuffersHead[i][j]);
            }
        }
    }

    /** Add contents of output buffers just processed to output buffers **/
    handleOutputBuffersToRetrieve() {
        for (var i = 0; i < this.nbOutputs; i++) {
            for (var j = 0; j < this.outputBuffers[i].length; j++) {
                for (var k = 0; k < this.blockSize; k++) {
                    this.outputBuffers[i][j][k] += this.outputBuffersToRetrieve[i][j][k] / this.nbOverlaps;
                }
            }
        }
    }

    process(inputs, outputs, params) {
        this.reallocateChannelsIfNeeded(inputs, outputs);

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

},{}],3:[function(require,module,exports){
"use strict";

const OLAProcessor = require('./ola-processor.js');
const FFT = require('fft.js');

const BUFFERED_BLOCK_SIZE = 2048;

function genHannWindow(length) {
    let win = new Float32Array(length);
    for (var i = 0; i < length; i++) {
        win[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / length));
    }
    return win;
}

class PhaseVocoderProcessor extends OLAProcessor {
    static get parameterDescriptors() {
        return [{
            name: 'pitchFactor',
            defaultValue: 1.0
        }];
    }

    constructor(options) {
        options.processorOptions = {
            blockSize: BUFFERED_BLOCK_SIZE,
        };
        super(options);

        this.fftSize = this.blockSize;
        this.timeCursor = 0;

        this.hannWindow = genHannWindow(this.blockSize);

        // prepare FFT and pre-allocate buffers
        this.fft = new FFT(this.fftSize);
        this.freqComplexBuffer = this.fft.createComplexArray();
        this.freqComplexBufferShifted = this.fft.createComplexArray();
        this.timeComplexBuffer = this.fft.createComplexArray();
        this.magnitudes = new Float32Array(this.fftSize / 2 + 1);
        this.peakIndexes = new Int32Array(this.magnitudes.length);
        this.nbPeaks = 0;
    }

    processOLA(inputs, outputs, parameters) {
        // no automation, take last value
        const pitchFactor = parameters.pitchFactor[parameters.pitchFactor.length - 1];

        for (var i = 0; i < this.nbInputs; i++) {
            for (var j = 0; j < inputs[i].length; j++) {
                // big assumption here: output is symetric to input
                var input = inputs[i][j];
                var output = outputs[i][j];

                this.applyHannWindow(input);

                this.fft.realTransform(this.freqComplexBuffer, input);

                this.computeMagnitudes();
                this.findPeaks();
                this.shiftPeaks(pitchFactor);

                this.fft.completeSpectrum(this.freqComplexBufferShifted);
                this.fft.inverseTransform(this.timeComplexBuffer, this.freqComplexBufferShifted);
                this.fft.fromComplexArray(this.timeComplexBuffer, output);

                this.applyHannWindow(output);
            }
        }

        this.timeCursor += this.hopSize;
    }

    /** Apply Hann window in-place */
    applyHannWindow(input) {
        for (var i = 0; i < this.blockSize; i++) {
            input[i] = input[i] * this.hannWindow[i];
        }
    }

    /** Compute squared magnitudes for peak finding **/
    computeMagnitudes() {
        var i = 0, j = 0;
        while (i < this.magnitudes.length) {
            let real = this.freqComplexBuffer[j];
            let imag = this.freqComplexBuffer[j + 1];
            // no need to sqrt for peak finding
            this.magnitudes[i] = real ** 2 + imag ** 2;
            i+=1;
            j+=2;
        }
    }

    /** Find peaks in spectrum magnitudes **/
    findPeaks() {
        this.nbPeaks = 0;
        var i = 2;
        let end = this.magnitudes.length - 2;

        while (i < end) {
            let mag = this.magnitudes[i];

            if (this.magnitudes[i - 1] >= mag || this.magnitudes[i - 2] >= mag) {
                i++;
                continue;
            }
            if (this.magnitudes[i + 1] >= mag || this.magnitudes[i + 2] >= mag) {
                i++;
                continue;
            }

            this.peakIndexes[this.nbPeaks] = i;
            this.nbPeaks++;
            i += 2;
        }
    }

    /** Shift peaks and regions of influence by pitchFactor into new specturm */
    shiftPeaks(pitchFactor) {
        // zero-fill new spectrum
        this.freqComplexBufferShifted.fill(0);

        for (var i = 0; i < this.nbPeaks; i++) {
            let peakIndex = this.peakIndexes[i];
            let peakIndexShifted = Math.round(peakIndex * pitchFactor);

            if (peakIndexShifted > this.magnitudes.length) {
                break;
            }

            // find region of influence
            var startIndex = 0;
            var endIndex = this.fftSize;
            if (i > 0) {
                let peakIndexBefore = this.peakIndexes[i - 1];
                startIndex = peakIndex - Math.floor((peakIndex - peakIndexBefore) / 2);
            }
            if (i < this.nbPeaks - 1) {
                let peakIndexAfter = this.peakIndexes[i + 1];
                endIndex = peakIndex + Math.ceil((peakIndexAfter - peakIndex) / 2);
            }

            // shift whole region of influence around peak to shifted peak
            let startOffset = startIndex - peakIndex;
            let endOffset = endIndex - peakIndex;
            for (var j = startOffset; j < endOffset; j++) {
                let binIndex = peakIndex + j;
                let binIndexShifted = peakIndexShifted + j;

                if (binIndexShifted >= this.magnitudes.length) {
                    break;
                }

                // apply phase correction
                let omegaDelta = 2 * Math.PI * (binIndexShifted - binIndex) / this.fftSize;
                let phaseShiftReal = Math.cos(omegaDelta * this.timeCursor);
                let phaseShiftImag = Math.sin(omegaDelta * this.timeCursor);

                let indexReal = binIndex * 2;
                let indexImag = indexReal + 1;
                let valueReal = this.freqComplexBuffer[indexReal];
                let valueImag = this.freqComplexBuffer[indexImag];

                let valueShiftedReal = valueReal * phaseShiftReal - valueImag * phaseShiftImag;
                let valueShiftedImag = valueReal * phaseShiftImag + valueImag * phaseShiftReal;

                let indexShiftedReal = binIndexShifted * 2;
                let indexShiftedImag = indexShiftedReal + 1;
                this.freqComplexBufferShifted[indexShiftedReal] += valueShiftedReal;
                this.freqComplexBufferShifted[indexShiftedImag] += valueShiftedImag;
            }
        }
    }
}

registerProcessor("phase-vocoder-processor", PhaseVocoderProcessor);


},{"./ola-processor.js":2,"fft.js":1}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJub2RlX21vZHVsZXMvZmZ0LmpzL2xpYi9mZnQuanMiLCJzcmMvb2xhLXByb2Nlc3Nvci5qcyIsInNyYy9waGFzZS12b2NvZGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbExBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBIiwiZmlsZSI6ImdlbmVyYXRlZC5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzQ29udGVudCI6WyIoZnVuY3Rpb24oKXtmdW5jdGlvbiByKGUsbix0KXtmdW5jdGlvbiBvKGksZil7aWYoIW5baV0pe2lmKCFlW2ldKXt2YXIgYz1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlO2lmKCFmJiZjKXJldHVybiBjKGksITApO2lmKHUpcmV0dXJuIHUoaSwhMCk7dmFyIGE9bmV3IEVycm9yKFwiQ2Fubm90IGZpbmQgbW9kdWxlICdcIitpK1wiJ1wiKTt0aHJvdyBhLmNvZGU9XCJNT0RVTEVfTk9UX0ZPVU5EXCIsYX12YXIgcD1uW2ldPXtleHBvcnRzOnt9fTtlW2ldWzBdLmNhbGwocC5leHBvcnRzLGZ1bmN0aW9uKHIpe3ZhciBuPWVbaV1bMV1bcl07cmV0dXJuIG8obnx8cil9LHAscC5leHBvcnRzLHIsZSxuLHQpfXJldHVybiBuW2ldLmV4cG9ydHN9Zm9yKHZhciB1PVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmUsaT0wO2k8dC5sZW5ndGg7aSsrKW8odFtpXSk7cmV0dXJuIG99cmV0dXJuIHJ9KSgpIiwiJ3VzZSBzdHJpY3QnO1xuXG5mdW5jdGlvbiBGRlQoc2l6ZSkge1xuICB0aGlzLnNpemUgPSBzaXplIHwgMDtcbiAgaWYgKHRoaXMuc2l6ZSA8PSAxIHx8ICh0aGlzLnNpemUgJiAodGhpcy5zaXplIC0gMSkpICE9PSAwKVxuICAgIHRocm93IG5ldyBFcnJvcignRkZUIHNpemUgbXVzdCBiZSBhIHBvd2VyIG9mIHR3byBhbmQgYmlnZ2VyIHRoYW4gMScpO1xuXG4gIHRoaXMuX2NzaXplID0gc2l6ZSA8PCAxO1xuXG4gIC8vIE5PVEU6IFVzZSBvZiBgdmFyYCBpcyBpbnRlbnRpb25hbCBmb3Igb2xkIFY4IHZlcnNpb25zXG4gIHZhciB0YWJsZSA9IG5ldyBBcnJheSh0aGlzLnNpemUgKiAyKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCB0YWJsZS5sZW5ndGg7IGkgKz0gMikge1xuICAgIGNvbnN0IGFuZ2xlID0gTWF0aC5QSSAqIGkgLyB0aGlzLnNpemU7XG4gICAgdGFibGVbaV0gPSBNYXRoLmNvcyhhbmdsZSk7XG4gICAgdGFibGVbaSArIDFdID0gLU1hdGguc2luKGFuZ2xlKTtcbiAgfVxuICB0aGlzLnRhYmxlID0gdGFibGU7XG5cbiAgLy8gRmluZCBzaXplJ3MgcG93ZXIgb2YgdHdvXG4gIHZhciBwb3dlciA9IDA7XG4gIGZvciAodmFyIHQgPSAxOyB0aGlzLnNpemUgPiB0OyB0IDw8PSAxKVxuICAgIHBvd2VyKys7XG5cbiAgLy8gQ2FsY3VsYXRlIGluaXRpYWwgc3RlcCdzIHdpZHRoOlxuICAvLyAgICogSWYgd2UgYXJlIGZ1bGwgcmFkaXgtNCAtIGl0IGlzIDJ4IHNtYWxsZXIgdG8gZ2l2ZSBpbml0YWwgbGVuPThcbiAgLy8gICAqIE90aGVyd2lzZSBpdCBpcyB0aGUgc2FtZSBhcyBgcG93ZXJgIHRvIGdpdmUgbGVuPTRcbiAgdGhpcy5fd2lkdGggPSBwb3dlciAlIDIgPT09IDAgPyBwb3dlciAtIDEgOiBwb3dlcjtcblxuICAvLyBQcmUtY29tcHV0ZSBiaXQtcmV2ZXJzYWwgcGF0dGVybnNcbiAgdGhpcy5fYml0cmV2ID0gbmV3IEFycmF5KDEgPDwgdGhpcy5fd2lkdGgpO1xuICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuX2JpdHJldi5sZW5ndGg7IGorKykge1xuICAgIHRoaXMuX2JpdHJldltqXSA9IDA7XG4gICAgZm9yICh2YXIgc2hpZnQgPSAwOyBzaGlmdCA8IHRoaXMuX3dpZHRoOyBzaGlmdCArPSAyKSB7XG4gICAgICB2YXIgcmV2U2hpZnQgPSB0aGlzLl93aWR0aCAtIHNoaWZ0IC0gMjtcbiAgICAgIHRoaXMuX2JpdHJldltqXSB8PSAoKGogPj4+IHNoaWZ0KSAmIDMpIDw8IHJldlNoaWZ0O1xuICAgIH1cbiAgfVxuXG4gIHRoaXMuX291dCA9IG51bGw7XG4gIHRoaXMuX2RhdGEgPSBudWxsO1xuICB0aGlzLl9pbnYgPSAwO1xufVxubW9kdWxlLmV4cG9ydHMgPSBGRlQ7XG5cbkZGVC5wcm90b3R5cGUuZnJvbUNvbXBsZXhBcnJheSA9IGZ1bmN0aW9uIGZyb21Db21wbGV4QXJyYXkoY29tcGxleCwgc3RvcmFnZSkge1xuICB2YXIgcmVzID0gc3RvcmFnZSB8fCBuZXcgQXJyYXkoY29tcGxleC5sZW5ndGggPj4+IDEpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IGNvbXBsZXgubGVuZ3RoOyBpICs9IDIpXG4gICAgcmVzW2kgPj4+IDFdID0gY29tcGxleFtpXTtcbiAgcmV0dXJuIHJlcztcbn07XG5cbkZGVC5wcm90b3R5cGUuY3JlYXRlQ29tcGxleEFycmF5ID0gZnVuY3Rpb24gY3JlYXRlQ29tcGxleEFycmF5KCkge1xuICBjb25zdCByZXMgPSBuZXcgQXJyYXkodGhpcy5fY3NpemUpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcy5sZW5ndGg7IGkrKylcbiAgICByZXNbaV0gPSAwO1xuICByZXR1cm4gcmVzO1xufTtcblxuRkZULnByb3RvdHlwZS50b0NvbXBsZXhBcnJheSA9IGZ1bmN0aW9uIHRvQ29tcGxleEFycmF5KGlucHV0LCBzdG9yYWdlKSB7XG4gIHZhciByZXMgPSBzdG9yYWdlIHx8IHRoaXMuY3JlYXRlQ29tcGxleEFycmF5KCk7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgcmVzLmxlbmd0aDsgaSArPSAyKSB7XG4gICAgcmVzW2ldID0gaW5wdXRbaSA+Pj4gMV07XG4gICAgcmVzW2kgKyAxXSA9IDA7XG4gIH1cbiAgcmV0dXJuIHJlcztcbn07XG5cbkZGVC5wcm90b3R5cGUuY29tcGxldGVTcGVjdHJ1bSA9IGZ1bmN0aW9uIGNvbXBsZXRlU3BlY3RydW0oc3BlY3RydW0pIHtcbiAgdmFyIHNpemUgPSB0aGlzLl9jc2l6ZTtcbiAgdmFyIGhhbGYgPSBzaXplID4+PiAxO1xuICBmb3IgKHZhciBpID0gMjsgaSA8IGhhbGY7IGkgKz0gMikge1xuICAgIHNwZWN0cnVtW3NpemUgLSBpXSA9IHNwZWN0cnVtW2ldO1xuICAgIHNwZWN0cnVtW3NpemUgLSBpICsgMV0gPSAtc3BlY3RydW1baSArIDFdO1xuICB9XG59O1xuXG5GRlQucHJvdG90eXBlLnRyYW5zZm9ybSA9IGZ1bmN0aW9uIHRyYW5zZm9ybShvdXQsIGRhdGEpIHtcbiAgaWYgKG91dCA9PT0gZGF0YSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IGFuZCBvdXRwdXQgYnVmZmVycyBtdXN0IGJlIGRpZmZlcmVudCcpO1xuXG4gIHRoaXMuX291dCA9IG91dDtcbiAgdGhpcy5fZGF0YSA9IGRhdGE7XG4gIHRoaXMuX2ludiA9IDA7XG4gIHRoaXMuX3RyYW5zZm9ybTQoKTtcbiAgdGhpcy5fb3V0ID0gbnVsbDtcbiAgdGhpcy5fZGF0YSA9IG51bGw7XG59O1xuXG5GRlQucHJvdG90eXBlLnJlYWxUcmFuc2Zvcm0gPSBmdW5jdGlvbiByZWFsVHJhbnNmb3JtKG91dCwgZGF0YSkge1xuICBpZiAob3V0ID09PSBkYXRhKVxuICAgIHRocm93IG5ldyBFcnJvcignSW5wdXQgYW5kIG91dHB1dCBidWZmZXJzIG11c3QgYmUgZGlmZmVyZW50Jyk7XG5cbiAgdGhpcy5fb3V0ID0gb3V0O1xuICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgdGhpcy5faW52ID0gMDtcbiAgdGhpcy5fcmVhbFRyYW5zZm9ybTQoKTtcbiAgdGhpcy5fb3V0ID0gbnVsbDtcbiAgdGhpcy5fZGF0YSA9IG51bGw7XG59O1xuXG5GRlQucHJvdG90eXBlLmludmVyc2VUcmFuc2Zvcm0gPSBmdW5jdGlvbiBpbnZlcnNlVHJhbnNmb3JtKG91dCwgZGF0YSkge1xuICBpZiAob3V0ID09PSBkYXRhKVxuICAgIHRocm93IG5ldyBFcnJvcignSW5wdXQgYW5kIG91dHB1dCBidWZmZXJzIG11c3QgYmUgZGlmZmVyZW50Jyk7XG5cbiAgdGhpcy5fb3V0ID0gb3V0O1xuICB0aGlzLl9kYXRhID0gZGF0YTtcbiAgdGhpcy5faW52ID0gMTtcbiAgdGhpcy5fdHJhbnNmb3JtNCgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IG91dC5sZW5ndGg7IGkrKylcbiAgICBvdXRbaV0gLz0gdGhpcy5zaXplO1xuICB0aGlzLl9vdXQgPSBudWxsO1xuICB0aGlzLl9kYXRhID0gbnVsbDtcbn07XG5cbi8vIHJhZGl4LTQgaW1wbGVtZW50YXRpb25cbi8vXG4vLyBOT1RFOiBVc2VzIG9mIGB2YXJgIGFyZSBpbnRlbnRpb25hbCBmb3Igb2xkZXIgVjggdmVyc2lvbiB0aGF0IGRvIG5vdFxuLy8gc3VwcG9ydCBib3RoIGBsZXQgY29tcG91bmQgYXNzaWdubWVudHNgIGFuZCBgY29uc3QgcGhpYFxuRkZULnByb3RvdHlwZS5fdHJhbnNmb3JtNCA9IGZ1bmN0aW9uIF90cmFuc2Zvcm00KCkge1xuICB2YXIgb3V0ID0gdGhpcy5fb3V0O1xuICB2YXIgc2l6ZSA9IHRoaXMuX2NzaXplO1xuXG4gIC8vIEluaXRpYWwgc3RlcCAocGVybXV0ZSBhbmQgdHJhbnNmb3JtKVxuICB2YXIgd2lkdGggPSB0aGlzLl93aWR0aDtcbiAgdmFyIHN0ZXAgPSAxIDw8IHdpZHRoO1xuICB2YXIgbGVuID0gKHNpemUgLyBzdGVwKSA8PCAxO1xuXG4gIHZhciBvdXRPZmY7XG4gIHZhciB0O1xuICB2YXIgYml0cmV2ID0gdGhpcy5fYml0cmV2O1xuICBpZiAobGVuID09PSA0KSB7XG4gICAgZm9yIChvdXRPZmYgPSAwLCB0ID0gMDsgb3V0T2ZmIDwgc2l6ZTsgb3V0T2ZmICs9IGxlbiwgdCsrKSB7XG4gICAgICBjb25zdCBvZmYgPSBiaXRyZXZbdF07XG4gICAgICB0aGlzLl9zaW5nbGVUcmFuc2Zvcm0yKG91dE9mZiwgb2ZmLCBzdGVwKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gbGVuID09PSA4XG4gICAgZm9yIChvdXRPZmYgPSAwLCB0ID0gMDsgb3V0T2ZmIDwgc2l6ZTsgb3V0T2ZmICs9IGxlbiwgdCsrKSB7XG4gICAgICBjb25zdCBvZmYgPSBiaXRyZXZbdF07XG4gICAgICB0aGlzLl9zaW5nbGVUcmFuc2Zvcm00KG91dE9mZiwgb2ZmLCBzdGVwKTtcbiAgICB9XG4gIH1cblxuICAvLyBMb29wIHRocm91Z2ggc3RlcHMgaW4gZGVjcmVhc2luZyBvcmRlclxuICB2YXIgaW52ID0gdGhpcy5faW52ID8gLTEgOiAxO1xuICB2YXIgdGFibGUgPSB0aGlzLnRhYmxlO1xuICBmb3IgKHN0ZXAgPj49IDI7IHN0ZXAgPj0gMjsgc3RlcCA+Pj0gMikge1xuICAgIGxlbiA9IChzaXplIC8gc3RlcCkgPDwgMTtcbiAgICB2YXIgcXVhcnRlckxlbiA9IGxlbiA+Pj4gMjtcblxuICAgIC8vIExvb3AgdGhyb3VnaCBvZmZzZXRzIGluIHRoZSBkYXRhXG4gICAgZm9yIChvdXRPZmYgPSAwOyBvdXRPZmYgPCBzaXplOyBvdXRPZmYgKz0gbGVuKSB7XG4gICAgICAvLyBGdWxsIGNhc2VcbiAgICAgIHZhciBsaW1pdCA9IG91dE9mZiArIHF1YXJ0ZXJMZW47XG4gICAgICBmb3IgKHZhciBpID0gb3V0T2ZmLCBrID0gMDsgaSA8IGxpbWl0OyBpICs9IDIsIGsgKz0gc3RlcCkge1xuICAgICAgICBjb25zdCBBID0gaTtcbiAgICAgICAgY29uc3QgQiA9IEEgKyBxdWFydGVyTGVuO1xuICAgICAgICBjb25zdCBDID0gQiArIHF1YXJ0ZXJMZW47XG4gICAgICAgIGNvbnN0IEQgPSBDICsgcXVhcnRlckxlbjtcblxuICAgICAgICAvLyBPcmlnaW5hbCB2YWx1ZXNcbiAgICAgICAgY29uc3QgQXIgPSBvdXRbQV07XG4gICAgICAgIGNvbnN0IEFpID0gb3V0W0EgKyAxXTtcbiAgICAgICAgY29uc3QgQnIgPSBvdXRbQl07XG4gICAgICAgIGNvbnN0IEJpID0gb3V0W0IgKyAxXTtcbiAgICAgICAgY29uc3QgQ3IgPSBvdXRbQ107XG4gICAgICAgIGNvbnN0IENpID0gb3V0W0MgKyAxXTtcbiAgICAgICAgY29uc3QgRHIgPSBvdXRbRF07XG4gICAgICAgIGNvbnN0IERpID0gb3V0W0QgKyAxXTtcblxuICAgICAgICAvLyBNaWRkbGUgdmFsdWVzXG4gICAgICAgIGNvbnN0IE1BciA9IEFyO1xuICAgICAgICBjb25zdCBNQWkgPSBBaTtcblxuICAgICAgICBjb25zdCB0YWJsZUJyID0gdGFibGVba107XG4gICAgICAgIGNvbnN0IHRhYmxlQmkgPSBpbnYgKiB0YWJsZVtrICsgMV07XG4gICAgICAgIGNvbnN0IE1CciA9IEJyICogdGFibGVCciAtIEJpICogdGFibGVCaTtcbiAgICAgICAgY29uc3QgTUJpID0gQnIgKiB0YWJsZUJpICsgQmkgKiB0YWJsZUJyO1xuXG4gICAgICAgIGNvbnN0IHRhYmxlQ3IgPSB0YWJsZVsyICoga107XG4gICAgICAgIGNvbnN0IHRhYmxlQ2kgPSBpbnYgKiB0YWJsZVsyICogayArIDFdO1xuICAgICAgICBjb25zdCBNQ3IgPSBDciAqIHRhYmxlQ3IgLSBDaSAqIHRhYmxlQ2k7XG4gICAgICAgIGNvbnN0IE1DaSA9IENyICogdGFibGVDaSArIENpICogdGFibGVDcjtcblxuICAgICAgICBjb25zdCB0YWJsZURyID0gdGFibGVbMyAqIGtdO1xuICAgICAgICBjb25zdCB0YWJsZURpID0gaW52ICogdGFibGVbMyAqIGsgKyAxXTtcbiAgICAgICAgY29uc3QgTURyID0gRHIgKiB0YWJsZURyIC0gRGkgKiB0YWJsZURpO1xuICAgICAgICBjb25zdCBNRGkgPSBEciAqIHRhYmxlRGkgKyBEaSAqIHRhYmxlRHI7XG5cbiAgICAgICAgLy8gUHJlLUZpbmFsIHZhbHVlc1xuICAgICAgICBjb25zdCBUMHIgPSBNQXIgKyBNQ3I7XG4gICAgICAgIGNvbnN0IFQwaSA9IE1BaSArIE1DaTtcbiAgICAgICAgY29uc3QgVDFyID0gTUFyIC0gTUNyO1xuICAgICAgICBjb25zdCBUMWkgPSBNQWkgLSBNQ2k7XG4gICAgICAgIGNvbnN0IFQyciA9IE1CciArIE1EcjtcbiAgICAgICAgY29uc3QgVDJpID0gTUJpICsgTURpO1xuICAgICAgICBjb25zdCBUM3IgPSBpbnYgKiAoTUJyIC0gTURyKTtcbiAgICAgICAgY29uc3QgVDNpID0gaW52ICogKE1CaSAtIE1EaSk7XG5cbiAgICAgICAgLy8gRmluYWwgdmFsdWVzXG4gICAgICAgIGNvbnN0IEZBciA9IFQwciArIFQycjtcbiAgICAgICAgY29uc3QgRkFpID0gVDBpICsgVDJpO1xuXG4gICAgICAgIGNvbnN0IEZDciA9IFQwciAtIFQycjtcbiAgICAgICAgY29uc3QgRkNpID0gVDBpIC0gVDJpO1xuXG4gICAgICAgIGNvbnN0IEZCciA9IFQxciArIFQzaTtcbiAgICAgICAgY29uc3QgRkJpID0gVDFpIC0gVDNyO1xuXG4gICAgICAgIGNvbnN0IEZEciA9IFQxciAtIFQzaTtcbiAgICAgICAgY29uc3QgRkRpID0gVDFpICsgVDNyO1xuXG4gICAgICAgIG91dFtBXSA9IEZBcjtcbiAgICAgICAgb3V0W0EgKyAxXSA9IEZBaTtcbiAgICAgICAgb3V0W0JdID0gRkJyO1xuICAgICAgICBvdXRbQiArIDFdID0gRkJpO1xuICAgICAgICBvdXRbQ10gPSBGQ3I7XG4gICAgICAgIG91dFtDICsgMV0gPSBGQ2k7XG4gICAgICAgIG91dFtEXSA9IEZEcjtcbiAgICAgICAgb3V0W0QgKyAxXSA9IEZEaTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn07XG5cbi8vIHJhZGl4LTIgaW1wbGVtZW50YXRpb25cbi8vXG4vLyBOT1RFOiBPbmx5IGNhbGxlZCBmb3IgbGVuPTRcbkZGVC5wcm90b3R5cGUuX3NpbmdsZVRyYW5zZm9ybTIgPSBmdW5jdGlvbiBfc2luZ2xlVHJhbnNmb3JtMihvdXRPZmYsIG9mZixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGVwKSB7XG4gIGNvbnN0IG91dCA9IHRoaXMuX291dDtcbiAgY29uc3QgZGF0YSA9IHRoaXMuX2RhdGE7XG5cbiAgY29uc3QgZXZlblIgPSBkYXRhW29mZl07XG4gIGNvbnN0IGV2ZW5JID0gZGF0YVtvZmYgKyAxXTtcbiAgY29uc3Qgb2RkUiA9IGRhdGFbb2ZmICsgc3RlcF07XG4gIGNvbnN0IG9kZEkgPSBkYXRhW29mZiArIHN0ZXAgKyAxXTtcblxuICBjb25zdCBsZWZ0UiA9IGV2ZW5SICsgb2RkUjtcbiAgY29uc3QgbGVmdEkgPSBldmVuSSArIG9kZEk7XG4gIGNvbnN0IHJpZ2h0UiA9IGV2ZW5SIC0gb2RkUjtcbiAgY29uc3QgcmlnaHRJID0gZXZlbkkgLSBvZGRJO1xuXG4gIG91dFtvdXRPZmZdID0gbGVmdFI7XG4gIG91dFtvdXRPZmYgKyAxXSA9IGxlZnRJO1xuICBvdXRbb3V0T2ZmICsgMl0gPSByaWdodFI7XG4gIG91dFtvdXRPZmYgKyAzXSA9IHJpZ2h0STtcbn07XG5cbi8vIHJhZGl4LTRcbi8vXG4vLyBOT1RFOiBPbmx5IGNhbGxlZCBmb3IgbGVuPThcbkZGVC5wcm90b3R5cGUuX3NpbmdsZVRyYW5zZm9ybTQgPSBmdW5jdGlvbiBfc2luZ2xlVHJhbnNmb3JtNChvdXRPZmYsIG9mZixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGVwKSB7XG4gIGNvbnN0IG91dCA9IHRoaXMuX291dDtcbiAgY29uc3QgZGF0YSA9IHRoaXMuX2RhdGE7XG4gIGNvbnN0IGludiA9IHRoaXMuX2ludiA/IC0xIDogMTtcbiAgY29uc3Qgc3RlcDIgPSBzdGVwICogMjtcbiAgY29uc3Qgc3RlcDMgPSBzdGVwICogMztcblxuICAvLyBPcmlnaW5hbCB2YWx1ZXNcbiAgY29uc3QgQXIgPSBkYXRhW29mZl07XG4gIGNvbnN0IEFpID0gZGF0YVtvZmYgKyAxXTtcbiAgY29uc3QgQnIgPSBkYXRhW29mZiArIHN0ZXBdO1xuICBjb25zdCBCaSA9IGRhdGFbb2ZmICsgc3RlcCArIDFdO1xuICBjb25zdCBDciA9IGRhdGFbb2ZmICsgc3RlcDJdO1xuICBjb25zdCBDaSA9IGRhdGFbb2ZmICsgc3RlcDIgKyAxXTtcbiAgY29uc3QgRHIgPSBkYXRhW29mZiArIHN0ZXAzXTtcbiAgY29uc3QgRGkgPSBkYXRhW29mZiArIHN0ZXAzICsgMV07XG5cbiAgLy8gUHJlLUZpbmFsIHZhbHVlc1xuICBjb25zdCBUMHIgPSBBciArIENyO1xuICBjb25zdCBUMGkgPSBBaSArIENpO1xuICBjb25zdCBUMXIgPSBBciAtIENyO1xuICBjb25zdCBUMWkgPSBBaSAtIENpO1xuICBjb25zdCBUMnIgPSBCciArIERyO1xuICBjb25zdCBUMmkgPSBCaSArIERpO1xuICBjb25zdCBUM3IgPSBpbnYgKiAoQnIgLSBEcik7XG4gIGNvbnN0IFQzaSA9IGludiAqIChCaSAtIERpKTtcblxuICAvLyBGaW5hbCB2YWx1ZXNcbiAgY29uc3QgRkFyID0gVDByICsgVDJyO1xuICBjb25zdCBGQWkgPSBUMGkgKyBUMmk7XG5cbiAgY29uc3QgRkJyID0gVDFyICsgVDNpO1xuICBjb25zdCBGQmkgPSBUMWkgLSBUM3I7XG5cbiAgY29uc3QgRkNyID0gVDByIC0gVDJyO1xuICBjb25zdCBGQ2kgPSBUMGkgLSBUMmk7XG5cbiAgY29uc3QgRkRyID0gVDFyIC0gVDNpO1xuICBjb25zdCBGRGkgPSBUMWkgKyBUM3I7XG5cbiAgb3V0W291dE9mZl0gPSBGQXI7XG4gIG91dFtvdXRPZmYgKyAxXSA9IEZBaTtcbiAgb3V0W291dE9mZiArIDJdID0gRkJyO1xuICBvdXRbb3V0T2ZmICsgM10gPSBGQmk7XG4gIG91dFtvdXRPZmYgKyA0XSA9IEZDcjtcbiAgb3V0W291dE9mZiArIDVdID0gRkNpO1xuICBvdXRbb3V0T2ZmICsgNl0gPSBGRHI7XG4gIG91dFtvdXRPZmYgKyA3XSA9IEZEaTtcbn07XG5cbi8vIFJlYWwgaW5wdXQgcmFkaXgtNCBpbXBsZW1lbnRhdGlvblxuRkZULnByb3RvdHlwZS5fcmVhbFRyYW5zZm9ybTQgPSBmdW5jdGlvbiBfcmVhbFRyYW5zZm9ybTQoKSB7XG4gIHZhciBvdXQgPSB0aGlzLl9vdXQ7XG4gIHZhciBzaXplID0gdGhpcy5fY3NpemU7XG5cbiAgLy8gSW5pdGlhbCBzdGVwIChwZXJtdXRlIGFuZCB0cmFuc2Zvcm0pXG4gIHZhciB3aWR0aCA9IHRoaXMuX3dpZHRoO1xuICB2YXIgc3RlcCA9IDEgPDwgd2lkdGg7XG4gIHZhciBsZW4gPSAoc2l6ZSAvIHN0ZXApIDw8IDE7XG5cbiAgdmFyIG91dE9mZjtcbiAgdmFyIHQ7XG4gIHZhciBiaXRyZXYgPSB0aGlzLl9iaXRyZXY7XG4gIGlmIChsZW4gPT09IDQpIHtcbiAgICBmb3IgKG91dE9mZiA9IDAsIHQgPSAwOyBvdXRPZmYgPCBzaXplOyBvdXRPZmYgKz0gbGVuLCB0KyspIHtcbiAgICAgIGNvbnN0IG9mZiA9IGJpdHJldlt0XTtcbiAgICAgIHRoaXMuX3NpbmdsZVJlYWxUcmFuc2Zvcm0yKG91dE9mZiwgb2ZmID4+PiAxLCBzdGVwID4+PiAxKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgLy8gbGVuID09PSA4XG4gICAgZm9yIChvdXRPZmYgPSAwLCB0ID0gMDsgb3V0T2ZmIDwgc2l6ZTsgb3V0T2ZmICs9IGxlbiwgdCsrKSB7XG4gICAgICBjb25zdCBvZmYgPSBiaXRyZXZbdF07XG4gICAgICB0aGlzLl9zaW5nbGVSZWFsVHJhbnNmb3JtNChvdXRPZmYsIG9mZiA+Pj4gMSwgc3RlcCA+Pj4gMSk7XG4gICAgfVxuICB9XG5cbiAgLy8gTG9vcCB0aHJvdWdoIHN0ZXBzIGluIGRlY3JlYXNpbmcgb3JkZXJcbiAgdmFyIGludiA9IHRoaXMuX2ludiA/IC0xIDogMTtcbiAgdmFyIHRhYmxlID0gdGhpcy50YWJsZTtcbiAgZm9yIChzdGVwID4+PSAyOyBzdGVwID49IDI7IHN0ZXAgPj49IDIpIHtcbiAgICBsZW4gPSAoc2l6ZSAvIHN0ZXApIDw8IDE7XG4gICAgdmFyIGhhbGZMZW4gPSBsZW4gPj4+IDE7XG4gICAgdmFyIHF1YXJ0ZXJMZW4gPSBoYWxmTGVuID4+PiAxO1xuICAgIHZhciBocXVhcnRlckxlbiA9IHF1YXJ0ZXJMZW4gPj4+IDE7XG5cbiAgICAvLyBMb29wIHRocm91Z2ggb2Zmc2V0cyBpbiB0aGUgZGF0YVxuICAgIGZvciAob3V0T2ZmID0gMDsgb3V0T2ZmIDwgc2l6ZTsgb3V0T2ZmICs9IGxlbikge1xuICAgICAgZm9yICh2YXIgaSA9IDAsIGsgPSAwOyBpIDw9IGhxdWFydGVyTGVuOyBpICs9IDIsIGsgKz0gc3RlcCkge1xuICAgICAgICB2YXIgQSA9IG91dE9mZiArIGk7XG4gICAgICAgIHZhciBCID0gQSArIHF1YXJ0ZXJMZW47XG4gICAgICAgIHZhciBDID0gQiArIHF1YXJ0ZXJMZW47XG4gICAgICAgIHZhciBEID0gQyArIHF1YXJ0ZXJMZW47XG5cbiAgICAgICAgLy8gT3JpZ2luYWwgdmFsdWVzXG4gICAgICAgIHZhciBBciA9IG91dFtBXTtcbiAgICAgICAgdmFyIEFpID0gb3V0W0EgKyAxXTtcbiAgICAgICAgdmFyIEJyID0gb3V0W0JdO1xuICAgICAgICB2YXIgQmkgPSBvdXRbQiArIDFdO1xuICAgICAgICB2YXIgQ3IgPSBvdXRbQ107XG4gICAgICAgIHZhciBDaSA9IG91dFtDICsgMV07XG4gICAgICAgIHZhciBEciA9IG91dFtEXTtcbiAgICAgICAgdmFyIERpID0gb3V0W0QgKyAxXTtcblxuICAgICAgICAvLyBNaWRkbGUgdmFsdWVzXG4gICAgICAgIHZhciBNQXIgPSBBcjtcbiAgICAgICAgdmFyIE1BaSA9IEFpO1xuXG4gICAgICAgIHZhciB0YWJsZUJyID0gdGFibGVba107XG4gICAgICAgIHZhciB0YWJsZUJpID0gaW52ICogdGFibGVbayArIDFdO1xuICAgICAgICB2YXIgTUJyID0gQnIgKiB0YWJsZUJyIC0gQmkgKiB0YWJsZUJpO1xuICAgICAgICB2YXIgTUJpID0gQnIgKiB0YWJsZUJpICsgQmkgKiB0YWJsZUJyO1xuXG4gICAgICAgIHZhciB0YWJsZUNyID0gdGFibGVbMiAqIGtdO1xuICAgICAgICB2YXIgdGFibGVDaSA9IGludiAqIHRhYmxlWzIgKiBrICsgMV07XG4gICAgICAgIHZhciBNQ3IgPSBDciAqIHRhYmxlQ3IgLSBDaSAqIHRhYmxlQ2k7XG4gICAgICAgIHZhciBNQ2kgPSBDciAqIHRhYmxlQ2kgKyBDaSAqIHRhYmxlQ3I7XG5cbiAgICAgICAgdmFyIHRhYmxlRHIgPSB0YWJsZVszICoga107XG4gICAgICAgIHZhciB0YWJsZURpID0gaW52ICogdGFibGVbMyAqIGsgKyAxXTtcbiAgICAgICAgdmFyIE1EciA9IERyICogdGFibGVEciAtIERpICogdGFibGVEaTtcbiAgICAgICAgdmFyIE1EaSA9IERyICogdGFibGVEaSArIERpICogdGFibGVEcjtcblxuICAgICAgICAvLyBQcmUtRmluYWwgdmFsdWVzXG4gICAgICAgIHZhciBUMHIgPSBNQXIgKyBNQ3I7XG4gICAgICAgIHZhciBUMGkgPSBNQWkgKyBNQ2k7XG4gICAgICAgIHZhciBUMXIgPSBNQXIgLSBNQ3I7XG4gICAgICAgIHZhciBUMWkgPSBNQWkgLSBNQ2k7XG4gICAgICAgIHZhciBUMnIgPSBNQnIgKyBNRHI7XG4gICAgICAgIHZhciBUMmkgPSBNQmkgKyBNRGk7XG4gICAgICAgIHZhciBUM3IgPSBpbnYgKiAoTUJyIC0gTURyKTtcbiAgICAgICAgdmFyIFQzaSA9IGludiAqIChNQmkgLSBNRGkpO1xuXG4gICAgICAgIC8vIEZpbmFsIHZhbHVlc1xuICAgICAgICB2YXIgRkFyID0gVDByICsgVDJyO1xuICAgICAgICB2YXIgRkFpID0gVDBpICsgVDJpO1xuXG4gICAgICAgIHZhciBGQnIgPSBUMXIgKyBUM2k7XG4gICAgICAgIHZhciBGQmkgPSBUMWkgLSBUM3I7XG5cbiAgICAgICAgb3V0W0FdID0gRkFyO1xuICAgICAgICBvdXRbQSArIDFdID0gRkFpO1xuICAgICAgICBvdXRbQl0gPSBGQnI7XG4gICAgICAgIG91dFtCICsgMV0gPSBGQmk7XG5cbiAgICAgICAgLy8gT3V0cHV0IGZpbmFsIG1pZGRsZSBwb2ludFxuICAgICAgICBpZiAoaSA9PT0gMCkge1xuICAgICAgICAgIHZhciBGQ3IgPSBUMHIgLSBUMnI7XG4gICAgICAgICAgdmFyIEZDaSA9IFQwaSAtIFQyaTtcbiAgICAgICAgICBvdXRbQ10gPSBGQ3I7XG4gICAgICAgICAgb3V0W0MgKyAxXSA9IEZDaTtcbiAgICAgICAgICBjb250aW51ZTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIERvIG5vdCBvdmVyd3JpdGUgb3Vyc2VsdmVzXG4gICAgICAgIGlmIChpID09PSBocXVhcnRlckxlbilcbiAgICAgICAgICBjb250aW51ZTtcblxuICAgICAgICAvLyBJbiB0aGUgZmxpcHBlZCBjYXNlOlxuICAgICAgICAvLyBNQWkgPSAtTUFpXG4gICAgICAgIC8vIE1Ccj0tTUJpLCBNQmk9LU1CclxuICAgICAgICAvLyBNQ3I9LU1DclxuICAgICAgICAvLyBNRHI9TURpLCBNRGk9TURyXG4gICAgICAgIHZhciBTVDByID0gVDFyO1xuICAgICAgICB2YXIgU1QwaSA9IC1UMWk7XG4gICAgICAgIHZhciBTVDFyID0gVDByO1xuICAgICAgICB2YXIgU1QxaSA9IC1UMGk7XG4gICAgICAgIHZhciBTVDJyID0gLWludiAqIFQzaTtcbiAgICAgICAgdmFyIFNUMmkgPSAtaW52ICogVDNyO1xuICAgICAgICB2YXIgU1QzciA9IC1pbnYgKiBUMmk7XG4gICAgICAgIHZhciBTVDNpID0gLWludiAqIFQycjtcblxuICAgICAgICB2YXIgU0ZBciA9IFNUMHIgKyBTVDJyO1xuICAgICAgICB2YXIgU0ZBaSA9IFNUMGkgKyBTVDJpO1xuXG4gICAgICAgIHZhciBTRkJyID0gU1QxciArIFNUM2k7XG4gICAgICAgIHZhciBTRkJpID0gU1QxaSAtIFNUM3I7XG5cbiAgICAgICAgdmFyIFNBID0gb3V0T2ZmICsgcXVhcnRlckxlbiAtIGk7XG4gICAgICAgIHZhciBTQiA9IG91dE9mZiArIGhhbGZMZW4gLSBpO1xuXG4gICAgICAgIG91dFtTQV0gPSBTRkFyO1xuICAgICAgICBvdXRbU0EgKyAxXSA9IFNGQWk7XG4gICAgICAgIG91dFtTQl0gPSBTRkJyO1xuICAgICAgICBvdXRbU0IgKyAxXSA9IFNGQmk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG4vLyByYWRpeC0yIGltcGxlbWVudGF0aW9uXG4vL1xuLy8gTk9URTogT25seSBjYWxsZWQgZm9yIGxlbj00XG5GRlQucHJvdG90eXBlLl9zaW5nbGVSZWFsVHJhbnNmb3JtMiA9IGZ1bmN0aW9uIF9zaW5nbGVSZWFsVHJhbnNmb3JtMihvdXRPZmYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBvZmYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBzdGVwKSB7XG4gIGNvbnN0IG91dCA9IHRoaXMuX291dDtcbiAgY29uc3QgZGF0YSA9IHRoaXMuX2RhdGE7XG5cbiAgY29uc3QgZXZlblIgPSBkYXRhW29mZl07XG4gIGNvbnN0IG9kZFIgPSBkYXRhW29mZiArIHN0ZXBdO1xuXG4gIGNvbnN0IGxlZnRSID0gZXZlblIgKyBvZGRSO1xuICBjb25zdCByaWdodFIgPSBldmVuUiAtIG9kZFI7XG5cbiAgb3V0W291dE9mZl0gPSBsZWZ0UjtcbiAgb3V0W291dE9mZiArIDFdID0gMDtcbiAgb3V0W291dE9mZiArIDJdID0gcmlnaHRSO1xuICBvdXRbb3V0T2ZmICsgM10gPSAwO1xufTtcblxuLy8gcmFkaXgtNFxuLy9cbi8vIE5PVEU6IE9ubHkgY2FsbGVkIGZvciBsZW49OFxuRkZULnByb3RvdHlwZS5fc2luZ2xlUmVhbFRyYW5zZm9ybTQgPSBmdW5jdGlvbiBfc2luZ2xlUmVhbFRyYW5zZm9ybTQob3V0T2ZmLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2ZmLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RlcCkge1xuICBjb25zdCBvdXQgPSB0aGlzLl9vdXQ7XG4gIGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhO1xuICBjb25zdCBpbnYgPSB0aGlzLl9pbnYgPyAtMSA6IDE7XG4gIGNvbnN0IHN0ZXAyID0gc3RlcCAqIDI7XG4gIGNvbnN0IHN0ZXAzID0gc3RlcCAqIDM7XG5cbiAgLy8gT3JpZ2luYWwgdmFsdWVzXG4gIGNvbnN0IEFyID0gZGF0YVtvZmZdO1xuICBjb25zdCBCciA9IGRhdGFbb2ZmICsgc3RlcF07XG4gIGNvbnN0IENyID0gZGF0YVtvZmYgKyBzdGVwMl07XG4gIGNvbnN0IERyID0gZGF0YVtvZmYgKyBzdGVwM107XG5cbiAgLy8gUHJlLUZpbmFsIHZhbHVlc1xuICBjb25zdCBUMHIgPSBBciArIENyO1xuICBjb25zdCBUMXIgPSBBciAtIENyO1xuICBjb25zdCBUMnIgPSBCciArIERyO1xuICBjb25zdCBUM3IgPSBpbnYgKiAoQnIgLSBEcik7XG5cbiAgLy8gRmluYWwgdmFsdWVzXG4gIGNvbnN0IEZBciA9IFQwciArIFQycjtcblxuICBjb25zdCBGQnIgPSBUMXI7XG4gIGNvbnN0IEZCaSA9IC1UM3I7XG5cbiAgY29uc3QgRkNyID0gVDByIC0gVDJyO1xuXG4gIGNvbnN0IEZEciA9IFQxcjtcbiAgY29uc3QgRkRpID0gVDNyO1xuXG4gIG91dFtvdXRPZmZdID0gRkFyO1xuICBvdXRbb3V0T2ZmICsgMV0gPSAwO1xuICBvdXRbb3V0T2ZmICsgMl0gPSBGQnI7XG4gIG91dFtvdXRPZmYgKyAzXSA9IEZCaTtcbiAgb3V0W291dE9mZiArIDRdID0gRkNyO1xuICBvdXRbb3V0T2ZmICsgNV0gPSAwO1xuICBvdXRbb3V0T2ZmICsgNl0gPSBGRHI7XG4gIG91dFtvdXRPZmYgKyA3XSA9IEZEaTtcbn07XG4iLCJcInVzZSBzdHJpY3RcIjtcblxuY29uc3QgV0VCQVVESU9fQkxPQ0tfU0laRSA9IDEyODtcblxuLyoqIE92ZXJsYXAtQWRkIE5vZGUgKi9cbmNsYXNzIE9MQVByb2Nlc3NvciBleHRlbmRzIEF1ZGlvV29ya2xldFByb2Nlc3NvciB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgICAgICBzdXBlcihvcHRpb25zKTtcblxuICAgICAgICB0aGlzLm5iSW5wdXRzID0gb3B0aW9ucy5udW1iZXJPZklucHV0cztcbiAgICAgICAgdGhpcy5uYk91dHB1dHMgPSBvcHRpb25zLm51bWJlck9mT3V0cHV0cztcblxuICAgICAgICB0aGlzLmJsb2NrU2l6ZSA9IG9wdGlvbnMucHJvY2Vzc29yT3B0aW9ucy5ibG9ja1NpemU7XG4gICAgICAgICAvLyBUT0RPIGZvciBub3csIHRoZSBvbmx5IHN1cHBvcnQgaG9wIHNpemUgaXMgdGhlIHNpemUgb2YgYSB3ZWIgYXVkaW8gYmxvY2tcbiAgICAgICAgdGhpcy5ob3BTaXplID0gV0VCQVVESU9fQkxPQ0tfU0laRTtcblxuICAgICAgICB0aGlzLm5iT3ZlcmxhcHMgPSB0aGlzLmJsb2NrU2l6ZSAvIHRoaXMuaG9wU2l6ZTtcblxuICAgICAgICAvLyBwcmUtYWxsb2NhdGUgaW5wdXQgYnVmZmVycyAod2lsbCBiZSByZWFsbG9jYXRlZCBpZiBuZWVkZWQpXG4gICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzID0gbmV3IEFycmF5KHRoaXMubmJJbnB1dHMpO1xuICAgICAgICB0aGlzLmlucHV0QnVmZmVyc0hlYWQgPSBuZXcgQXJyYXkodGhpcy5uYklucHV0cyk7XG4gICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzVG9TZW5kID0gbmV3IEFycmF5KHRoaXMubmJJbnB1dHMpO1xuICAgICAgICAvLyBkZWZhdWx0IHRvIDEgY2hhbm5lbCBwZXIgaW5wdXQgdW50aWwgd2Uga25vdyBtb3JlXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYklucHV0czsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLmFsbG9jYXRlSW5wdXRDaGFubmVscyhpLCAxKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcmUtYWxsb2NhdGUgaW5wdXQgYnVmZmVycyAod2lsbCBiZSByZWFsbG9jYXRlZCBpZiBuZWVkZWQpXG4gICAgICAgIHRoaXMub3V0cHV0QnVmZmVycyA9IG5ldyBBcnJheSh0aGlzLm5iT3V0cHV0cyk7XG4gICAgICAgIHRoaXMub3V0cHV0QnVmZmVyc1RvUmV0cmlldmUgPSBuZXcgQXJyYXkodGhpcy5uYk91dHB1dHMpO1xuICAgICAgICAvLyBkZWZhdWx0IHRvIDEgY2hhbm5lbCBwZXIgb3V0cHV0IHVudGlsIHdlIGtub3cgbW9yZVxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmJPdXRwdXRzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuYWxsb2NhdGVPdXRwdXRDaGFubmVscyhpLCAxKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBIYW5kbGVzIGR5bmFtaWMgcmVhbGxvY2F0aW9uIG9mIGlucHV0L291dHB1dCBjaGFubmVscyBidWZmZXJcbiAgICAgKGNoYW5uZWwgbnVtYmVycyBtYXkgdmFyeSBkdXJpbmcgbGlmZWN5Y2xlKSAqKi9cbiAgICByZWFsbG9jYXRlQ2hhbm5lbHNJZk5lZWRlZChpbnB1dHMsIG91dHB1dHMpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iSW5wdXRzOyBpKyspIHtcbiAgICAgICAgICAgIGxldCBuYkNoYW5uZWxzID0gaW5wdXRzW2ldLmxlbmd0aDtcbiAgICAgICAgICAgIGlmIChuYkNoYW5uZWxzICE9IHRoaXMuaW5wdXRCdWZmZXJzW2ldLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWxsb2NhdGVJbnB1dENoYW5uZWxzKGksIG5iQ2hhbm5lbHMpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iT3V0cHV0czsgaSsrKSB7XG4gICAgICAgICAgICBsZXQgbmJDaGFubmVscyA9IG91dHB1dHNbaV0ubGVuZ3RoO1xuICAgICAgICAgICAgaWYgKG5iQ2hhbm5lbHMgIT0gdGhpcy5vdXRwdXRCdWZmZXJzW2ldLmxlbmd0aCkge1xuICAgICAgICAgICAgICAgIHRoaXMuYWxsb2NhdGVPdXRwdXRDaGFubmVscyhpLCBuYkNoYW5uZWxzKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIGFsbG9jYXRlSW5wdXRDaGFubmVscyhpbnB1dEluZGV4LCBuYkNoYW5uZWxzKSB7XG4gICAgICAgIC8vIGFsbG9jYXRlIGlucHV0IGJ1ZmZlcnNcblxuICAgICAgICB0aGlzLmlucHV0QnVmZmVyc1tpbnB1dEluZGV4XSA9IG5ldyBBcnJheShuYkNoYW5uZWxzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuYkNoYW5uZWxzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzW2lucHV0SW5kZXhdW2ldID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmJsb2NrU2l6ZSArIFdFQkFVRElPX0JMT0NLX1NJWkUpO1xuICAgICAgICAgICAgdGhpcy5pbnB1dEJ1ZmZlcnNbaW5wdXRJbmRleF1baV0uZmlsbCgwKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGFsbG9jYXRlIGlucHV0IGJ1ZmZlcnMgdG8gc2VuZCBhbmQgaGVhZCBwb2ludGVycyB0byBjb3B5IGZyb21cbiAgICAgICAgLy8gKGNhbm5vdCBkaXJlY3RseSBzZW5kIGEgcG9pbnRlci9zdWJhcnJheSBiZWNhdXNlIGlucHV0IG1heSBiZSBtb2RpZmllZClcbiAgICAgICAgdGhpcy5pbnB1dEJ1ZmZlcnNIZWFkW2lucHV0SW5kZXhdID0gbmV3IEFycmF5KG5iQ2hhbm5lbHMpO1xuICAgICAgICB0aGlzLmlucHV0QnVmZmVyc1RvU2VuZFtpbnB1dEluZGV4XSA9IG5ldyBBcnJheShuYkNoYW5uZWxzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCBuYkNoYW5uZWxzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzSGVhZFtpbnB1dEluZGV4XVtpXSA9IHRoaXMuaW5wdXRCdWZmZXJzW2lucHV0SW5kZXhdW2ldIC5zdWJhcnJheSgwLCB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgICAgICB0aGlzLmlucHV0QnVmZmVyc1RvU2VuZFtpbnB1dEluZGV4XVtpXSA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5ibG9ja1NpemUpO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgYWxsb2NhdGVPdXRwdXRDaGFubmVscyhvdXRwdXRJbmRleCwgbmJDaGFubmVscykge1xuICAgICAgICAvLyBhbGxvY2F0ZSBvdXRwdXQgYnVmZmVyc1xuICAgICAgICB0aGlzLm91dHB1dEJ1ZmZlcnNbb3V0cHV0SW5kZXhdID0gbmV3IEFycmF5KG5iQ2hhbm5lbHMpO1xuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IG5iQ2hhbm5lbHM7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzW291dHB1dEluZGV4XVtpXSA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzW291dHB1dEluZGV4XVtpXS5maWxsKDApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gYWxsb2NhdGUgb3V0cHV0IGJ1ZmZlcnMgdG8gcmV0cmlldmVcbiAgICAgICAgLy8gKGNhbm5vdCBzZW5kIGEgcG9pbnRlci9zdWJhcnJheSBiZWNhdXNlIG5ldyBvdXRwdXQgaGFzIHRvIGJlIGFkZCB0byBleGlzaW5nIG91dHB1dClcbiAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzVG9SZXRyaWV2ZVtvdXRwdXRJbmRleF0gPSBuZXcgQXJyYXkobmJDaGFubmVscyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgbmJDaGFubmVsczsgaSsrKSB7XG4gICAgICAgICAgICB0aGlzLm91dHB1dEJ1ZmZlcnNUb1JldHJpZXZlW291dHB1dEluZGV4XVtpXSA9IG5ldyBGbG9hdDMyQXJyYXkodGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzVG9SZXRyaWV2ZVtvdXRwdXRJbmRleF1baV0uZmlsbCgwKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBSZWFkIG5leHQgd2ViIGF1ZGlvIGJsb2NrIHRvIGlucHV0IGJ1ZmZlcnMgKiovXG4gICAgcmVhZElucHV0cyhpbnB1dHMpIHtcbiAgICAgICAgLy8gd2hlbiBwbGF5YmFjayBpcyBwYXVzZWQsIHdlIG1heSBzdG9wIHJlY2VpdmluZyBuZXcgc2FtcGxlc1xuICAgICAgICBpZiAoaW5wdXRzWzBdWzBdLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmJJbnB1dHM7IGkrKykge1xuICAgICAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5pbnB1dEJ1ZmZlcnNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5pbnB1dEJ1ZmZlcnNbaV1bal0uZmlsbCgwLCB0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iSW5wdXRzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5pbnB1dEJ1ZmZlcnNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBsZXQgd2ViQXVkaW9CbG9jayA9IGlucHV0c1tpXVtqXTtcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0QnVmZmVyc1tpXVtqXS5zZXQod2ViQXVkaW9CbG9jaywgdGhpcy5ibG9ja1NpemUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIFdyaXRlIG5leHQgd2ViIGF1ZGlvIGJsb2NrIGZyb20gb3V0cHV0IGJ1ZmZlcnMgKiovXG4gICAgd3JpdGVPdXRwdXRzKG91dHB1dHMpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iSW5wdXRzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5pbnB1dEJ1ZmZlcnNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBsZXQgd2ViQXVkaW9CbG9jayA9IHRoaXMub3V0cHV0QnVmZmVyc1tpXVtqXS5zdWJhcnJheSgwLCBXRUJBVURJT19CTE9DS19TSVpFKTtcbiAgICAgICAgICAgICAgICBvdXRwdXRzW2ldW2pdLnNldCh3ZWJBdWRpb0Jsb2NrKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBTaGlmdCBsZWZ0IGNvbnRlbnQgb2YgaW5wdXQgYnVmZmVycyB0byByZWNlaXZlIG5ldyB3ZWIgYXVkaW8gYmxvY2sgKiovXG4gICAgc2hpZnRJbnB1dEJ1ZmZlcnMoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYklucHV0czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMuaW5wdXRCdWZmZXJzW2ldLmxlbmd0aDsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbnB1dEJ1ZmZlcnNbaV1bal0uY29weVdpdGhpbigwLCBXRUJBVURJT19CTE9DS19TSVpFKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBTaGlmdCBsZWZ0IGNvbnRlbnQgb2Ygb3V0cHV0IGJ1ZmZlcnMgdG8gcmVjZWl2ZSBuZXcgd2ViIGF1ZGlvIGJsb2NrICoqL1xuICAgIHNoaWZ0T3V0cHV0QnVmZmVycygpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iT3V0cHV0czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMub3V0cHV0QnVmZmVyc1tpXS5sZW5ndGg7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXMub3V0cHV0QnVmZmVyc1tpXVtqXS5jb3B5V2l0aGluKDAsIFdFQkFVRElPX0JMT0NLX1NJWkUpO1xuICAgICAgICAgICAgICAgIHRoaXMub3V0cHV0QnVmZmVyc1tpXVtqXS5zdWJhcnJheSh0aGlzLmJsb2NrU2l6ZSAtIFdFQkFVRElPX0JMT0NLX1NJWkUpLmZpbGwoMCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogQ29weSBjb250ZW50cyBvZiBpbnB1dCBidWZmZXJzIHRvIGJ1ZmZlciBhY3R1YWxseSBzZW50IHRvIHByb2Nlc3MgKiovXG4gICAgcHJlcGFyZUlucHV0QnVmZmVyc1RvU2VuZCgpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iSW5wdXRzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5pbnB1dEJ1ZmZlcnNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICB0aGlzLmlucHV0QnVmZmVyc1RvU2VuZFtpXVtqXS5zZXQodGhpcy5pbnB1dEJ1ZmZlcnNIZWFkW2ldW2pdKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBBZGQgY29udGVudHMgb2Ygb3V0cHV0IGJ1ZmZlcnMganVzdCBwcm9jZXNzZWQgdG8gb3V0cHV0IGJ1ZmZlcnMgKiovXG4gICAgaGFuZGxlT3V0cHV0QnVmZmVyc1RvUmV0cmlldmUoKSB7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYk91dHB1dHM7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLm91dHB1dEJ1ZmZlcnNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICBmb3IgKHZhciBrID0gMDsgayA8IHRoaXMuYmxvY2tTaXplOyBrKyspIHtcbiAgICAgICAgICAgICAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzW2ldW2pdW2tdICs9IHRoaXMub3V0cHV0QnVmZmVyc1RvUmV0cmlldmVbaV1bal1ba10gLyB0aGlzLm5iT3ZlcmxhcHM7XG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvY2VzcyhpbnB1dHMsIG91dHB1dHMsIHBhcmFtcykge1xuICAgICAgICB0aGlzLnJlYWxsb2NhdGVDaGFubmVsc0lmTmVlZGVkKGlucHV0cywgb3V0cHV0cyk7XG5cbiAgICAgICAgdGhpcy5yZWFkSW5wdXRzKGlucHV0cyk7XG4gICAgICAgIHRoaXMuc2hpZnRJbnB1dEJ1ZmZlcnMoKTtcbiAgICAgICAgdGhpcy5wcmVwYXJlSW5wdXRCdWZmZXJzVG9TZW5kKClcbiAgICAgICAgdGhpcy5wcm9jZXNzT0xBKHRoaXMuaW5wdXRCdWZmZXJzVG9TZW5kLCB0aGlzLm91dHB1dEJ1ZmZlcnNUb1JldHJpZXZlLCBwYXJhbXMpO1xuICAgICAgICB0aGlzLmhhbmRsZU91dHB1dEJ1ZmZlcnNUb1JldHJpZXZlKCk7XG4gICAgICAgIHRoaXMud3JpdGVPdXRwdXRzKG91dHB1dHMpO1xuICAgICAgICB0aGlzLnNoaWZ0T3V0cHV0QnVmZmVycygpO1xuXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIHByb2Nlc3NPTEEoaW5wdXRzLCBvdXRwdXRzLCBwYXJhbXMpIHtcbiAgICAgICAgY29uc29sZS5hc3NlcnQoZmFsc2UsIFwiTm90IG92ZXJyaWRlblwiKTtcbiAgICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gT0xBUHJvY2Vzc29yO1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmNvbnN0IE9MQVByb2Nlc3NvciA9IHJlcXVpcmUoJy4vb2xhLXByb2Nlc3Nvci5qcycpO1xuY29uc3QgRkZUID0gcmVxdWlyZSgnZmZ0LmpzJyk7XG5cbmNvbnN0IEJVRkZFUkVEX0JMT0NLX1NJWkUgPSAyMDQ4O1xuXG5mdW5jdGlvbiBnZW5IYW5uV2luZG93KGxlbmd0aCkge1xuICAgIGxldCB3aW4gPSBuZXcgRmxvYXQzMkFycmF5KGxlbmd0aCk7XG4gICAgZm9yICh2YXIgaSA9IDA7IGkgPCBsZW5ndGg7IGkrKykge1xuICAgICAgICB3aW5baV0gPSAwLjUgKiAoMSAtIE1hdGguY29zKDIgKiBNYXRoLlBJICogaSAvIGxlbmd0aCkpO1xuICAgIH1cbiAgICByZXR1cm4gd2luO1xufVxuXG5jbGFzcyBQaGFzZVZvY29kZXJQcm9jZXNzb3IgZXh0ZW5kcyBPTEFQcm9jZXNzb3Ige1xuICAgIHN0YXRpYyBnZXQgcGFyYW1ldGVyRGVzY3JpcHRvcnMoKSB7XG4gICAgICAgIHJldHVybiBbe1xuICAgICAgICAgICAgbmFtZTogJ3BpdGNoRmFjdG9yJyxcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZTogMS4wXG4gICAgICAgIH1dO1xuICAgIH1cblxuICAgIGNvbnN0cnVjdG9yKG9wdGlvbnMpIHtcbiAgICAgICAgb3B0aW9ucy5wcm9jZXNzb3JPcHRpb25zID0ge1xuICAgICAgICAgICAgYmxvY2tTaXplOiBCVUZGRVJFRF9CTE9DS19TSVpFLFxuICAgICAgICB9O1xuICAgICAgICBzdXBlcihvcHRpb25zKTtcblxuICAgICAgICB0aGlzLmZmdFNpemUgPSB0aGlzLmJsb2NrU2l6ZTtcbiAgICAgICAgdGhpcy50aW1lQ3Vyc29yID0gMDtcblxuICAgICAgICB0aGlzLmhhbm5XaW5kb3cgPSBnZW5IYW5uV2luZG93KHRoaXMuYmxvY2tTaXplKTtcblxuICAgICAgICAvLyBwcmVwYXJlIEZGVCBhbmQgcHJlLWFsbG9jYXRlIGJ1ZmZlcnNcbiAgICAgICAgdGhpcy5mZnQgPSBuZXcgRkZUKHRoaXMuZmZ0U2l6ZSk7XG4gICAgICAgIHRoaXMuZnJlcUNvbXBsZXhCdWZmZXIgPSB0aGlzLmZmdC5jcmVhdGVDb21wbGV4QXJyYXkoKTtcbiAgICAgICAgdGhpcy5mcmVxQ29tcGxleEJ1ZmZlclNoaWZ0ZWQgPSB0aGlzLmZmdC5jcmVhdGVDb21wbGV4QXJyYXkoKTtcbiAgICAgICAgdGhpcy50aW1lQ29tcGxleEJ1ZmZlciA9IHRoaXMuZmZ0LmNyZWF0ZUNvbXBsZXhBcnJheSgpO1xuICAgICAgICB0aGlzLm1hZ25pdHVkZXMgPSBuZXcgRmxvYXQzMkFycmF5KHRoaXMuZmZ0U2l6ZSAvIDIgKyAxKTtcbiAgICAgICAgdGhpcy5wZWFrSW5kZXhlcyA9IG5ldyBJbnQzMkFycmF5KHRoaXMubWFnbml0dWRlcy5sZW5ndGgpO1xuICAgICAgICB0aGlzLm5iUGVha3MgPSAwO1xuICAgIH1cblxuICAgIHByb2Nlc3NPTEEoaW5wdXRzLCBvdXRwdXRzLCBwYXJhbWV0ZXJzKSB7XG4gICAgICAgIC8vIG5vIGF1dG9tYXRpb24sIHRha2UgbGFzdCB2YWx1ZVxuICAgICAgICBjb25zdCBwaXRjaEZhY3RvciA9IHBhcmFtZXRlcnMucGl0Y2hGYWN0b3JbcGFyYW1ldGVycy5waXRjaEZhY3Rvci5sZW5ndGggLSAxXTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmJJbnB1dHM7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCBpbnB1dHNbaV0ubGVuZ3RoOyBqKyspIHtcbiAgICAgICAgICAgICAgICAvLyBiaWcgYXNzdW1wdGlvbiBoZXJlOiBvdXRwdXQgaXMgc3ltZXRyaWMgdG8gaW5wdXRcbiAgICAgICAgICAgICAgICB2YXIgaW5wdXQgPSBpbnB1dHNbaV1bal07XG4gICAgICAgICAgICAgICAgdmFyIG91dHB1dCA9IG91dHB1dHNbaV1bal07XG5cbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5SGFubldpbmRvdyhpbnB1dCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmZmdC5yZWFsVHJhbnNmb3JtKHRoaXMuZnJlcUNvbXBsZXhCdWZmZXIsIGlucHV0KTtcblxuICAgICAgICAgICAgICAgIHRoaXMuY29tcHV0ZU1hZ25pdHVkZXMoKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZpbmRQZWFrcygpO1xuICAgICAgICAgICAgICAgIHRoaXMuc2hpZnRQZWFrcyhwaXRjaEZhY3Rvcik7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmZmdC5jb21wbGV0ZVNwZWN0cnVtKHRoaXMuZnJlcUNvbXBsZXhCdWZmZXJTaGlmdGVkKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZmdC5pbnZlcnNlVHJhbnNmb3JtKHRoaXMudGltZUNvbXBsZXhCdWZmZXIsIHRoaXMuZnJlcUNvbXBsZXhCdWZmZXJTaGlmdGVkKTtcbiAgICAgICAgICAgICAgICB0aGlzLmZmdC5mcm9tQ29tcGxleEFycmF5KHRoaXMudGltZUNvbXBsZXhCdWZmZXIsIG91dHB1dCk7XG5cbiAgICAgICAgICAgICAgICB0aGlzLmFwcGx5SGFubldpbmRvdyhvdXRwdXQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy50aW1lQ3Vyc29yICs9IHRoaXMuaG9wU2l6ZTtcbiAgICB9XG5cbiAgICAvKiogQXBwbHkgSGFubiB3aW5kb3cgaW4tcGxhY2UgKi9cbiAgICBhcHBseUhhbm5XaW5kb3coaW5wdXQpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLmJsb2NrU2l6ZTsgaSsrKSB7XG4gICAgICAgICAgICBpbnB1dFtpXSA9IGlucHV0W2ldICogdGhpcy5oYW5uV2luZG93W2ldO1xuICAgICAgICB9XG4gICAgfVxuXG4gICAgLyoqIENvbXB1dGUgc3F1YXJlZCBtYWduaXR1ZGVzIGZvciBwZWFrIGZpbmRpbmcgKiovXG4gICAgY29tcHV0ZU1hZ25pdHVkZXMoKSB7XG4gICAgICAgIHZhciBpID0gMCwgaiA9IDA7XG4gICAgICAgIHdoaWxlIChpIDwgdGhpcy5tYWduaXR1ZGVzLmxlbmd0aCkge1xuICAgICAgICAgICAgbGV0IHJlYWwgPSB0aGlzLmZyZXFDb21wbGV4QnVmZmVyW2pdO1xuICAgICAgICAgICAgbGV0IGltYWcgPSB0aGlzLmZyZXFDb21wbGV4QnVmZmVyW2ogKyAxXTtcbiAgICAgICAgICAgIC8vIG5vIG5lZWQgdG8gc3FydCBmb3IgcGVhayBmaW5kaW5nXG4gICAgICAgICAgICB0aGlzLm1hZ25pdHVkZXNbaV0gPSByZWFsICoqIDIgKyBpbWFnICoqIDI7XG4gICAgICAgICAgICBpKz0xO1xuICAgICAgICAgICAgais9MjtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIC8qKiBGaW5kIHBlYWtzIGluIHNwZWN0cnVtIG1hZ25pdHVkZXMgKiovXG4gICAgZmluZFBlYWtzKCkge1xuICAgICAgICB0aGlzLm5iUGVha3MgPSAwO1xuICAgICAgICB2YXIgaSA9IDI7XG4gICAgICAgIGxldCBlbmQgPSB0aGlzLm1hZ25pdHVkZXMubGVuZ3RoIC0gMjtcblxuICAgICAgICB3aGlsZSAoaSA8IGVuZCkge1xuICAgICAgICAgICAgbGV0IG1hZyA9IHRoaXMubWFnbml0dWRlc1tpXTtcblxuICAgICAgICAgICAgaWYgKHRoaXMubWFnbml0dWRlc1tpIC0gMV0gPj0gbWFnIHx8IHRoaXMubWFnbml0dWRlc1tpIC0gMl0gPj0gbWFnKSB7XG4gICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgaWYgKHRoaXMubWFnbml0dWRlc1tpICsgMV0gPj0gbWFnIHx8IHRoaXMubWFnbml0dWRlc1tpICsgMl0gPj0gbWFnKSB7XG4gICAgICAgICAgICAgICAgaSsrO1xuICAgICAgICAgICAgICAgIGNvbnRpbnVlO1xuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLnBlYWtJbmRleGVzW3RoaXMubmJQZWFrc10gPSBpO1xuICAgICAgICAgICAgdGhpcy5uYlBlYWtzKys7XG4gICAgICAgICAgICBpICs9IDI7XG4gICAgICAgIH1cbiAgICB9XG5cbiAgICAvKiogU2hpZnQgcGVha3MgYW5kIHJlZ2lvbnMgb2YgaW5mbHVlbmNlIGJ5IHBpdGNoRmFjdG9yIGludG8gbmV3IHNwZWN0dXJtICovXG4gICAgc2hpZnRQZWFrcyhwaXRjaEZhY3Rvcikge1xuICAgICAgICAvLyB6ZXJvLWZpbGwgbmV3IHNwZWN0cnVtXG4gICAgICAgIHRoaXMuZnJlcUNvbXBsZXhCdWZmZXJTaGlmdGVkLmZpbGwoMCk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iUGVha3M7IGkrKykge1xuICAgICAgICAgICAgbGV0IHBlYWtJbmRleCA9IHRoaXMucGVha0luZGV4ZXNbaV07XG4gICAgICAgICAgICBsZXQgcGVha0luZGV4U2hpZnRlZCA9IE1hdGgucm91bmQocGVha0luZGV4ICogcGl0Y2hGYWN0b3IpO1xuXG4gICAgICAgICAgICBpZiAocGVha0luZGV4U2hpZnRlZCA+IHRoaXMubWFnbml0dWRlcy5sZW5ndGgpIHtcbiAgICAgICAgICAgICAgICBicmVhaztcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gZmluZCByZWdpb24gb2YgaW5mbHVlbmNlXG4gICAgICAgICAgICB2YXIgc3RhcnRJbmRleCA9IDA7XG4gICAgICAgICAgICB2YXIgZW5kSW5kZXggPSB0aGlzLmZmdFNpemU7XG4gICAgICAgICAgICBpZiAoaSA+IDApIHtcbiAgICAgICAgICAgICAgICBsZXQgcGVha0luZGV4QmVmb3JlID0gdGhpcy5wZWFrSW5kZXhlc1tpIC0gMV07XG4gICAgICAgICAgICAgICAgc3RhcnRJbmRleCA9IHBlYWtJbmRleCAtIE1hdGguZmxvb3IoKHBlYWtJbmRleCAtIHBlYWtJbmRleEJlZm9yZSkgLyAyKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIGlmIChpIDwgdGhpcy5uYlBlYWtzIC0gMSkge1xuICAgICAgICAgICAgICAgIGxldCBwZWFrSW5kZXhBZnRlciA9IHRoaXMucGVha0luZGV4ZXNbaSArIDFdO1xuICAgICAgICAgICAgICAgIGVuZEluZGV4ID0gcGVha0luZGV4ICsgTWF0aC5jZWlsKChwZWFrSW5kZXhBZnRlciAtIHBlYWtJbmRleCkgLyAyKTtcbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgLy8gc2hpZnQgd2hvbGUgcmVnaW9uIG9mIGluZmx1ZW5jZSBhcm91bmQgcGVhayB0byBzaGlmdGVkIHBlYWtcbiAgICAgICAgICAgIGxldCBzdGFydE9mZnNldCA9IHN0YXJ0SW5kZXggLSBwZWFrSW5kZXg7XG4gICAgICAgICAgICBsZXQgZW5kT2Zmc2V0ID0gZW5kSW5kZXggLSBwZWFrSW5kZXg7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gc3RhcnRPZmZzZXQ7IGogPCBlbmRPZmZzZXQ7IGorKykge1xuICAgICAgICAgICAgICAgIGxldCBiaW5JbmRleCA9IHBlYWtJbmRleCArIGo7XG4gICAgICAgICAgICAgICAgbGV0IGJpbkluZGV4U2hpZnRlZCA9IHBlYWtJbmRleFNoaWZ0ZWQgKyBqO1xuXG4gICAgICAgICAgICAgICAgaWYgKGJpbkluZGV4U2hpZnRlZCA+PSB0aGlzLm1hZ25pdHVkZXMubGVuZ3RoKSB7XG4gICAgICAgICAgICAgICAgICAgIGJyZWFrO1xuICAgICAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgICAgIC8vIGFwcGx5IHBoYXNlIGNvcnJlY3Rpb25cbiAgICAgICAgICAgICAgICBsZXQgb21lZ2FEZWx0YSA9IDIgKiBNYXRoLlBJICogKGJpbkluZGV4U2hpZnRlZCAtIGJpbkluZGV4KSAvIHRoaXMuZmZ0U2l6ZTtcbiAgICAgICAgICAgICAgICBsZXQgcGhhc2VTaGlmdFJlYWwgPSBNYXRoLmNvcyhvbWVnYURlbHRhICogdGhpcy50aW1lQ3Vyc29yKTtcbiAgICAgICAgICAgICAgICBsZXQgcGhhc2VTaGlmdEltYWcgPSBNYXRoLnNpbihvbWVnYURlbHRhICogdGhpcy50aW1lQ3Vyc29yKTtcblxuICAgICAgICAgICAgICAgIGxldCBpbmRleFJlYWwgPSBiaW5JbmRleCAqIDI7XG4gICAgICAgICAgICAgICAgbGV0IGluZGV4SW1hZyA9IGluZGV4UmVhbCArIDE7XG4gICAgICAgICAgICAgICAgbGV0IHZhbHVlUmVhbCA9IHRoaXMuZnJlcUNvbXBsZXhCdWZmZXJbaW5kZXhSZWFsXTtcbiAgICAgICAgICAgICAgICBsZXQgdmFsdWVJbWFnID0gdGhpcy5mcmVxQ29tcGxleEJ1ZmZlcltpbmRleEltYWddO1xuXG4gICAgICAgICAgICAgICAgbGV0IHZhbHVlU2hpZnRlZFJlYWwgPSB2YWx1ZVJlYWwgKiBwaGFzZVNoaWZ0UmVhbCAtIHZhbHVlSW1hZyAqIHBoYXNlU2hpZnRJbWFnO1xuICAgICAgICAgICAgICAgIGxldCB2YWx1ZVNoaWZ0ZWRJbWFnID0gdmFsdWVSZWFsICogcGhhc2VTaGlmdEltYWcgKyB2YWx1ZUltYWcgKiBwaGFzZVNoaWZ0UmVhbDtcblxuICAgICAgICAgICAgICAgIGxldCBpbmRleFNoaWZ0ZWRSZWFsID0gYmluSW5kZXhTaGlmdGVkICogMjtcbiAgICAgICAgICAgICAgICBsZXQgaW5kZXhTaGlmdGVkSW1hZyA9IGluZGV4U2hpZnRlZFJlYWwgKyAxO1xuICAgICAgICAgICAgICAgIHRoaXMuZnJlcUNvbXBsZXhCdWZmZXJTaGlmdGVkW2luZGV4U2hpZnRlZFJlYWxdICs9IHZhbHVlU2hpZnRlZFJlYWw7XG4gICAgICAgICAgICAgICAgdGhpcy5mcmVxQ29tcGxleEJ1ZmZlclNoaWZ0ZWRbaW5kZXhTaGlmdGVkSW1hZ10gKz0gdmFsdWVTaGlmdGVkSW1hZztcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgIH1cbn1cblxucmVnaXN0ZXJQcm9jZXNzb3IoXCJwaGFzZS12b2NvZGVyLXByb2Nlc3NvclwiLCBQaGFzZVZvY29kZXJQcm9jZXNzb3IpO1xuXG4iXX0=
