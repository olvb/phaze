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
        if (inputs[0].length && inputs[0][0].length == 0) {
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


},{"./ola-processor.js":2,"fft.js":1}]},{},[3]);
