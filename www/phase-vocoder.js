(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
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

},{}],2:[function(require,module,exports){
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

},{}],3:[function(require,module,exports){
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


},{"./buffered-processor.js":1,"fft.js":2}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJidWZmZXJlZC1wcm9jZXNzb3IuanMiLCJub2RlX21vZHVsZXMvZmZ0LmpzL2xpYi9mZnQuanMiLCJwaGFzZS12b2NvZGVyLmpzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiJBQUFBO0FDQUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUM5SUE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDM2ZBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQSIsImZpbGUiOiJnZW5lcmF0ZWQuanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlc0NvbnRlbnQiOlsiKGZ1bmN0aW9uKCl7ZnVuY3Rpb24gcihlLG4sdCl7ZnVuY3Rpb24gbyhpLGYpe2lmKCFuW2ldKXtpZighZVtpXSl7dmFyIGM9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZTtpZighZiYmYylyZXR1cm4gYyhpLCEwKTtpZih1KXJldHVybiB1KGksITApO3ZhciBhPW5ldyBFcnJvcihcIkNhbm5vdCBmaW5kIG1vZHVsZSAnXCIraStcIidcIik7dGhyb3cgYS5jb2RlPVwiTU9EVUxFX05PVF9GT1VORFwiLGF9dmFyIHA9bltpXT17ZXhwb3J0czp7fX07ZVtpXVswXS5jYWxsKHAuZXhwb3J0cyxmdW5jdGlvbihyKXt2YXIgbj1lW2ldWzFdW3JdO3JldHVybiBvKG58fHIpfSxwLHAuZXhwb3J0cyxyLGUsbix0KX1yZXR1cm4gbltpXS5leHBvcnRzfWZvcih2YXIgdT1cImZ1bmN0aW9uXCI9PXR5cGVvZiByZXF1aXJlJiZyZXF1aXJlLGk9MDtpPHQubGVuZ3RoO2krKylvKHRbaV0pO3JldHVybiBvfXJldHVybiByfSkoKSIsIlwidXNlIHN0cmljdFwiO1xuXG5jb25zdCBXRUJBVURJT19CTE9DS19TSVpFID0gMTI4O1xuXG5jbGFzcyBCdWZmZXJlZFByb2Nlc3NvciBleHRlbmRzIEF1ZGlvV29ya2xldFByb2Nlc3NvciB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgICAgICBzdXBlcigpXG5cbiAgICAgICAgdGhpcy5uYklucHV0cyA9IG9wdGlvbnMubnVtYmVyT2ZJbnB1dHM7XG4gICAgICAgIHRoaXMubmJPdXRwdXRzID0gb3B0aW9ucy5udW1iZXJPZk91dHB1dHM7XG5cbiAgICAgICAgdGhpcy5uYklucHV0Q2hhbm5lbHMgPSBvcHRpb25zLnByb2Nlc3Nvck9wdGlvbnMubnVtYmVyT2ZJbnB1dENoYW5uZWxzO1xuICAgICAgICAvLyBUT0RPIHRoZXJlIGlzIGFscmVhZHkgYSBidWlsdC1pbiBvcHRpb24gZm9yIHRoaXMgYXBwYXJlbnRseVxuICAgICAgICB0aGlzLm5iT3V0cHV0Q2hhbm5lbHMgPSBvcHRpb25zLnByb2Nlc3Nvck9wdGlvbnMubnVtYmVyT2ZPdXRwdXRDaGFubmVscztcblxuICAgICAgICB0aGlzLmJsb2NrU2l6ZSA9IFdFQkFVRElPX0JMT0NLX1NJWkUgKiBvcHRpb25zLnByb2Nlc3Nvck9wdGlvbnMuYmxvY2tTaXplRmFjdG9yO1xuICAgICAgICB0aGlzLmJ1ZmZlclNpemUgPSB0aGlzLmJsb2NrU2l6ZSAqIDI7XG5cbiAgICAgICAgLy8ga2VlcCB0cmFjayBvZiBidWZmZXIgY29udGVudFxuICAgICAgICB0aGlzLmlucHV0U3RhcnQgPSAwO1xuICAgICAgICB0aGlzLmlucHV0TGVuZ3RoID0gMDtcbiAgICAgICAgdGhpcy5vdXRwdXRTdGFydCA9IDA7XG4gICAgICAgIHRoaXMub3V0cHV0TGVuZ3RoID0gMDtcblxuICAgICAgICAvLyBwcmUtYWxsb2NhdGUgaW5wdXQgYnVmZmVyc1xuICAgICAgICB0aGlzLmlucHV0QnVmZmVycyA9IG5ldyBBcnJheSh0aGlzLm5iSW5wdXRzKTtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iSW5wdXRzOyBpKyspIHtcbiAgICAgICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzW2ldID0gbmV3IEFycmF5KHRoaXMubmJJbnB1dENoYW5uZWxzKTtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5uYklucHV0Q2hhbm5lbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzW2ldW2pdID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmJ1ZmZlclNpemUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gcHJlLWFsbG9jYXRlIG91dHB1dCBidWZmZXJzXG4gICAgICAgIHRoaXMub3V0cHV0QnVmZmVycyA9IG5ldyBBcnJheSh0aGlzLm5iT3V0cHV0cyk7XG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYk91dHB1dHM7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzW2ldID0gbmV3IEFycmF5KHRoaXMubmJPdXRwdXRDaGFubmVscyk7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMubmJPdXRwdXRDaGFubmVsczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5vdXRwdXRCdWZmZXJzW2ldW2pdID0gbmV3IEZsb2F0MzJBcnJheSh0aGlzLmJ1ZmZlclNpemUpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgLy8gcHJlLWFsbG9jYXRlIGlucHV0L2Jsb2NrIGFycmF5cyB0aGF0IHdpbGwgY29udGFpbiBzdWJhcnJheXMgcGFzc2VkIHRvIHByb2Nlc3NCbG9ja3NcbiAgICAgICAgdGhpcy5pbnB1dEJsb2NrcyA9IG5ldyBBcnJheSh0aGlzLm5iSW5wdXRzKVxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmJJbnB1dHM7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5pbnB1dEJsb2Nrc1tpXSA9IG5ldyBBcnJheSh0aGlzLm5iSW5wdXRDaGFubmVscyk7XG4gICAgICAgIH1cbiAgICAgICAgdGhpcy5vdXRwdXRCbG9ja3MgPSBuZXcgQXJyYXkodGhpcy5uYk91dHB1dHMpXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYk91dHB1dHM7IGkrKykge1xuICAgICAgICAgICAgdGhpcy5vdXRwdXRCbG9ja3NbaV0gPSBuZXcgQXJyYXkodGhpcy5uYk91dHB1dENoYW5uZWxzKTtcbiAgICAgICAgfVxuICAgIH1cblxuICAgIHByb2Nlc3MoaW5wdXRzLCBvdXRwdXRzLCBwYXJhbWV0ZXJzKSB7XG4gICAgICAgIC8vIHdoZW4gcGxheWJhY2sgaXMgcGF1c2VkLCB3ZSBtYXkgc3RvcCByZWNlaXZpbmcgbmV3IHNhbXBsZXNcbiAgICAgICAgaWYgKGlucHV0c1swXVswXS5sZW5ndGggIT0gMCkge1xuICAgICAgICAgICAgdGhpcy5yZWFkSW5wdXRzKGlucHV0cyk7XG4gICAgICAgIH1cblxuICAgICAgICBpZiAodGhpcy5pbnB1dExlbmd0aCA+PSB0aGlzLmJsb2NrU2l6ZSkge1xuICAgICAgICAgICAgdGhpcy5wcmVwYXJlQmxvY2tzRm9yUHJvY2Vzc2luZygpO1xuICAgICAgICAgICAgdGhpcy5wcm9jZXNzQnVmZmVyZWQodGhpcy5pbnB1dEJsb2NrcywgdGhpcy5vdXRwdXRCbG9ja3MpO1xuXG4gICAgICAgICAgICB0aGlzLmlucHV0U3RhcnQgPSAodGhpcy5pbnB1dFN0YXJ0ICsgdGhpcy5ibG9ja1NpemUpICUgdGhpcy5idWZmZXJTaXplOztcbiAgICAgICAgICAgIHRoaXMuaW5wdXRMZW5ndGggLT0gdGhpcy5ibG9ja1NpemU7XG4gICAgICAgICAgICB0aGlzLm91dHB1dExlbmd0aCArPSB0aGlzLmJsb2NrU2l6ZTtcblxuICAgICAgICAgICAgY29uc29sZS5hc3NlcnQodGhpcy5pbnB1dExlbmd0aCA8IHRoaXMuYmxvY2tTaXplKTtcbiAgICAgICAgfVxuXG4gICAgICAgIGlmICh0aGlzLm91dHB1dExlbmd0aCA+PSBXRUJBVURJT19CTE9DS19TSVpFKSB7XG4gICAgICAgICAgICB0aGlzLndyaXRlT3V0cHV0cyhvdXRwdXRzKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGRvbid0IGtub3cgaWYvd2hlbiB3ZSBzaG91bGQgcmV0dXJuIGZhbHNlXG4gICAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cblxuICAgIC8qKiBSZWFkIG5leHQgd2ViIGF1ZGlvIGJsb2NrIHRvIGlucHV0IGJ1ZmZlciAqKi9cbiAgICByZWFkSW5wdXRzKGlucHV0cykge1xuICAgICAgICBsZXQgY3Vyc29yID0gKHRoaXMuaW5wdXRTdGFydCArIHRoaXMuaW5wdXRMZW5ndGgpICUgdGhpcy5idWZmZXJTaXplO1xuICAgICAgICBjb25zb2xlLmFzc2VydCgoY3Vyc29yICsgV0VCQVVESU9fQkxPQ0tfU0laRSkgPD0gdGhpcy5idWZmZXJTaXplKTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmJJbnB1dHM7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLm5iSW5wdXRDaGFubmVsczsgaisrKSB7XG4gICAgICAgICAgICAgICAgbGV0IGJsb2NrID0gaW5wdXRzW2ldW2pdO1xuICAgICAgICAgICAgICAgIHRoaXMuaW5wdXRCdWZmZXJzW2ldW2pdLnNldChibG9jaywgY3Vyc29yKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIHRoaXMuaW5wdXRMZW5ndGggKz0gV0VCQVVESU9fQkxPQ0tfU0laRTtcblxuICAgICAgICBjb25zb2xlLmFzc2VydCh0aGlzLmlucHV0TGVuZ3RoIDw9IHRoaXMuYnVmZmVyU2l6ZSk7XG4gICAgfVxuXG4gICAgLyoqIFdyaXRlIG5leHQgd2ViIGF1ZGlvIGJsb2NrIGZyb20gb3V0cHV0IGJ1ZmZlciAqKi9cbiAgICB3cml0ZU91dHB1dHMob3V0cHV0cykge1xuICAgICAgICBjb25zb2xlLmFzc2VydCh0aGlzLm91dHB1dExlbmd0aCA+PSBXRUJBVURJT19CTE9DS19TSVpFKTtcblxuICAgICAgICBsZXQgY3Vyc29yID0gdGhpcy5vdXRwdXRTdGFydCAlIHRoaXMuYnVmZmVyU2l6ZTtcbiAgICAgICAgY29uc29sZS5hc3NlcnQoKGN1cnNvciArIFdFQkFVRElPX0JMT0NLX1NJWkUpIDw9IHRoaXMuYnVmZmVyU2l6ZSk7XG5cbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iT3V0cHV0czsgaSsrKSB7XG4gICAgICAgICAgICBmb3IgKHZhciBqID0gMDsgaiA8IHRoaXMubmJPdXRwdXRDaGFubmVsczsgaisrKSB7XG4gICAgICAgICAgICAgICAgbGV0IGJsb2NrID0gdGhpcy5vdXRwdXRCdWZmZXJzW2ldW2pdLnN1YmFycmF5KGN1cnNvciwgY3Vyc29yICsgV0VCQVVESU9fQkxPQ0tfU0laRSk7XG4gICAgICAgICAgICAgICAgb3V0cHV0c1tpXVtqXS5zZXQoYmxvY2spO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG5cbiAgICAgICAgdGhpcy5vdXRwdXRTdGFydCA9ICh0aGlzLm91dHB1dFN0YXJ0ICsgV0VCQVVESU9fQkxPQ0tfU0laRSkgJSB0aGlzLmJ1ZmZlclNpemU7XG4gICAgICAgIHRoaXMub3V0cHV0TGVuZ3RoIC09IFdFQkFVRElPX0JMT0NLX1NJWkU7XG5cbiAgICAgICAgY29uc29sZS5hc3NlcnQodGhpcy5vdXRwdXRMZW5ndGggPj0gMCk7XG4gICAgfVxuXG4gICAgLyoqIFByZXBhcmUgc3ViYXJyYXlzIHBvaXRpbmcgdG8gYmxvY2tzIHRvIGJlIHJlYWQvd3JpdHRlbiBkdXJpbmcgcHJvY2Vzc2luZyAqKi9cbiAgICBwcmVwYXJlQmxvY2tzRm9yUHJvY2Vzc2luZygpIHtcbiAgICAgICAgbGV0IGlucHV0U3RhcnQgPSB0aGlzLmlucHV0U3RhcnQ7XG4gICAgICAgIGxldCBpbnB1dEVuZCA9IGlucHV0U3RhcnQgKyB0aGlzLmJsb2NrU2l6ZTtcblxuICAgICAgICBmb3IgKHZhciBpID0gMDsgaSA8IHRoaXMubmJJbnB1dHM7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLm5iSW5wdXRDaGFubmVsczsgaisrKSB7XG4gICAgICAgICAgICAgICAgdGhpcy5pbnB1dEJsb2Nrc1tpXVtqXSA9IHRoaXMuaW5wdXRCdWZmZXJzW2ldW2pdLnN1YmFycmF5KGlucHV0U3RhcnQsIGlucHV0RW5kKTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgfVxuXG4gICAgICAgIGxldCBvdXRwdXRTdGFydCA9IHRoaXMub3V0cHV0U3RhcnQ7XG4gICAgICAgIGxldCBvdXRwdXRFbmQgPSBvdXRwdXRTdGFydCArIHRoaXMuYmxvY2tTaXplO1xuXG4gICAgICAgIGZvciAodmFyIGkgPSAwOyBpIDwgdGhpcy5uYk91dHB1dHM7IGkrKykge1xuICAgICAgICAgICAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLm5iT3V0cHV0Q2hhbm5lbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHRoaXMub3V0cHV0QmxvY2tzW2ldW2pdID0gdGhpcy5vdXRwdXRCdWZmZXJzW2ldW2pdLnN1YmFycmF5KG91dHB1dFN0YXJ0LCBvdXRwdXRFbmQpO1xuICAgICAgICAgICAgfVxuICAgICAgICB9XG4gICAgfVxuXG4gICAgcHJvY2Vzc0J1ZmZlcmVkKGlucHV0cywgb3V0cHV0cykge1xuICAgICAgICBjb25zb2xlLmFzc2VydChmYWxzZSwgXCJOb3Qgb3ZlcnJpZGVuXCIpO1xuICAgIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBCdWZmZXJlZFByb2Nlc3NvcjtcbiIsIid1c2Ugc3RyaWN0JztcblxuZnVuY3Rpb24gRkZUKHNpemUpIHtcbiAgdGhpcy5zaXplID0gc2l6ZSB8IDA7XG4gIGlmICh0aGlzLnNpemUgPD0gMSB8fCAodGhpcy5zaXplICYgKHRoaXMuc2l6ZSAtIDEpKSAhPT0gMClcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0ZGVCBzaXplIG11c3QgYmUgYSBwb3dlciBvZiB0d28gYW5kIGJpZ2dlciB0aGFuIDEnKTtcblxuICB0aGlzLl9jc2l6ZSA9IHNpemUgPDwgMTtcblxuICAvLyBOT1RFOiBVc2Ugb2YgYHZhcmAgaXMgaW50ZW50aW9uYWwgZm9yIG9sZCBWOCB2ZXJzaW9uc1xuICB2YXIgdGFibGUgPSBuZXcgQXJyYXkodGhpcy5zaXplICogMik7XG4gIGZvciAodmFyIGkgPSAwOyBpIDwgdGFibGUubGVuZ3RoOyBpICs9IDIpIHtcbiAgICBjb25zdCBhbmdsZSA9IE1hdGguUEkgKiBpIC8gdGhpcy5zaXplO1xuICAgIHRhYmxlW2ldID0gTWF0aC5jb3MoYW5nbGUpO1xuICAgIHRhYmxlW2kgKyAxXSA9IC1NYXRoLnNpbihhbmdsZSk7XG4gIH1cbiAgdGhpcy50YWJsZSA9IHRhYmxlO1xuXG4gIC8vIEZpbmQgc2l6ZSdzIHBvd2VyIG9mIHR3b1xuICB2YXIgcG93ZXIgPSAwO1xuICBmb3IgKHZhciB0ID0gMTsgdGhpcy5zaXplID4gdDsgdCA8PD0gMSlcbiAgICBwb3dlcisrO1xuXG4gIC8vIENhbGN1bGF0ZSBpbml0aWFsIHN0ZXAncyB3aWR0aDpcbiAgLy8gICAqIElmIHdlIGFyZSBmdWxsIHJhZGl4LTQgLSBpdCBpcyAyeCBzbWFsbGVyIHRvIGdpdmUgaW5pdGFsIGxlbj04XG4gIC8vICAgKiBPdGhlcndpc2UgaXQgaXMgdGhlIHNhbWUgYXMgYHBvd2VyYCB0byBnaXZlIGxlbj00XG4gIHRoaXMuX3dpZHRoID0gcG93ZXIgJSAyID09PSAwID8gcG93ZXIgLSAxIDogcG93ZXI7XG5cbiAgLy8gUHJlLWNvbXB1dGUgYml0LXJldmVyc2FsIHBhdHRlcm5zXG4gIHRoaXMuX2JpdHJldiA9IG5ldyBBcnJheSgxIDw8IHRoaXMuX3dpZHRoKTtcbiAgZm9yICh2YXIgaiA9IDA7IGogPCB0aGlzLl9iaXRyZXYubGVuZ3RoOyBqKyspIHtcbiAgICB0aGlzLl9iaXRyZXZbal0gPSAwO1xuICAgIGZvciAodmFyIHNoaWZ0ID0gMDsgc2hpZnQgPCB0aGlzLl93aWR0aDsgc2hpZnQgKz0gMikge1xuICAgICAgdmFyIHJldlNoaWZ0ID0gdGhpcy5fd2lkdGggLSBzaGlmdCAtIDI7XG4gICAgICB0aGlzLl9iaXRyZXZbal0gfD0gKChqID4+PiBzaGlmdCkgJiAzKSA8PCByZXZTaGlmdDtcbiAgICB9XG4gIH1cblxuICB0aGlzLl9vdXQgPSBudWxsO1xuICB0aGlzLl9kYXRhID0gbnVsbDtcbiAgdGhpcy5faW52ID0gMDtcbn1cbm1vZHVsZS5leHBvcnRzID0gRkZUO1xuXG5GRlQucHJvdG90eXBlLmZyb21Db21wbGV4QXJyYXkgPSBmdW5jdGlvbiBmcm9tQ29tcGxleEFycmF5KGNvbXBsZXgsIHN0b3JhZ2UpIHtcbiAgdmFyIHJlcyA9IHN0b3JhZ2UgfHwgbmV3IEFycmF5KGNvbXBsZXgubGVuZ3RoID4+PiAxKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBjb21wbGV4Lmxlbmd0aDsgaSArPSAyKVxuICAgIHJlc1tpID4+PiAxXSA9IGNvbXBsZXhbaV07XG4gIHJldHVybiByZXM7XG59O1xuXG5GRlQucHJvdG90eXBlLmNyZWF0ZUNvbXBsZXhBcnJheSA9IGZ1bmN0aW9uIGNyZWF0ZUNvbXBsZXhBcnJheSgpIHtcbiAgY29uc3QgcmVzID0gbmV3IEFycmF5KHRoaXMuX2NzaXplKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCByZXMubGVuZ3RoOyBpKyspXG4gICAgcmVzW2ldID0gMDtcbiAgcmV0dXJuIHJlcztcbn07XG5cbkZGVC5wcm90b3R5cGUudG9Db21wbGV4QXJyYXkgPSBmdW5jdGlvbiB0b0NvbXBsZXhBcnJheShpbnB1dCwgc3RvcmFnZSkge1xuICB2YXIgcmVzID0gc3RvcmFnZSB8fCB0aGlzLmNyZWF0ZUNvbXBsZXhBcnJheSgpO1xuICBmb3IgKHZhciBpID0gMDsgaSA8IHJlcy5sZW5ndGg7IGkgKz0gMikge1xuICAgIHJlc1tpXSA9IGlucHV0W2kgPj4+IDFdO1xuICAgIHJlc1tpICsgMV0gPSAwO1xuICB9XG4gIHJldHVybiByZXM7XG59O1xuXG5GRlQucHJvdG90eXBlLmNvbXBsZXRlU3BlY3RydW0gPSBmdW5jdGlvbiBjb21wbGV0ZVNwZWN0cnVtKHNwZWN0cnVtKSB7XG4gIHZhciBzaXplID0gdGhpcy5fY3NpemU7XG4gIHZhciBoYWxmID0gc2l6ZSA+Pj4gMTtcbiAgZm9yICh2YXIgaSA9IDI7IGkgPCBoYWxmOyBpICs9IDIpIHtcbiAgICBzcGVjdHJ1bVtzaXplIC0gaV0gPSBzcGVjdHJ1bVtpXTtcbiAgICBzcGVjdHJ1bVtzaXplIC0gaSArIDFdID0gLXNwZWN0cnVtW2kgKyAxXTtcbiAgfVxufTtcblxuRkZULnByb3RvdHlwZS50cmFuc2Zvcm0gPSBmdW5jdGlvbiB0cmFuc2Zvcm0ob3V0LCBkYXRhKSB7XG4gIGlmIChvdXQgPT09IGRhdGEpXG4gICAgdGhyb3cgbmV3IEVycm9yKCdJbnB1dCBhbmQgb3V0cHV0IGJ1ZmZlcnMgbXVzdCBiZSBkaWZmZXJlbnQnKTtcblxuICB0aGlzLl9vdXQgPSBvdXQ7XG4gIHRoaXMuX2RhdGEgPSBkYXRhO1xuICB0aGlzLl9pbnYgPSAwO1xuICB0aGlzLl90cmFuc2Zvcm00KCk7XG4gIHRoaXMuX291dCA9IG51bGw7XG4gIHRoaXMuX2RhdGEgPSBudWxsO1xufTtcblxuRkZULnByb3RvdHlwZS5yZWFsVHJhbnNmb3JtID0gZnVuY3Rpb24gcmVhbFRyYW5zZm9ybShvdXQsIGRhdGEpIHtcbiAgaWYgKG91dCA9PT0gZGF0YSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IGFuZCBvdXRwdXQgYnVmZmVycyBtdXN0IGJlIGRpZmZlcmVudCcpO1xuXG4gIHRoaXMuX291dCA9IG91dDtcbiAgdGhpcy5fZGF0YSA9IGRhdGE7XG4gIHRoaXMuX2ludiA9IDA7XG4gIHRoaXMuX3JlYWxUcmFuc2Zvcm00KCk7XG4gIHRoaXMuX291dCA9IG51bGw7XG4gIHRoaXMuX2RhdGEgPSBudWxsO1xufTtcblxuRkZULnByb3RvdHlwZS5pbnZlcnNlVHJhbnNmb3JtID0gZnVuY3Rpb24gaW52ZXJzZVRyYW5zZm9ybShvdXQsIGRhdGEpIHtcbiAgaWYgKG91dCA9PT0gZGF0YSlcbiAgICB0aHJvdyBuZXcgRXJyb3IoJ0lucHV0IGFuZCBvdXRwdXQgYnVmZmVycyBtdXN0IGJlIGRpZmZlcmVudCcpO1xuXG4gIHRoaXMuX291dCA9IG91dDtcbiAgdGhpcy5fZGF0YSA9IGRhdGE7XG4gIHRoaXMuX2ludiA9IDE7XG4gIHRoaXMuX3RyYW5zZm9ybTQoKTtcbiAgZm9yICh2YXIgaSA9IDA7IGkgPCBvdXQubGVuZ3RoOyBpKyspXG4gICAgb3V0W2ldIC89IHRoaXMuc2l6ZTtcbiAgdGhpcy5fb3V0ID0gbnVsbDtcbiAgdGhpcy5fZGF0YSA9IG51bGw7XG59O1xuXG4vLyByYWRpeC00IGltcGxlbWVudGF0aW9uXG4vL1xuLy8gTk9URTogVXNlcyBvZiBgdmFyYCBhcmUgaW50ZW50aW9uYWwgZm9yIG9sZGVyIFY4IHZlcnNpb24gdGhhdCBkbyBub3Rcbi8vIHN1cHBvcnQgYm90aCBgbGV0IGNvbXBvdW5kIGFzc2lnbm1lbnRzYCBhbmQgYGNvbnN0IHBoaWBcbkZGVC5wcm90b3R5cGUuX3RyYW5zZm9ybTQgPSBmdW5jdGlvbiBfdHJhbnNmb3JtNCgpIHtcbiAgdmFyIG91dCA9IHRoaXMuX291dDtcbiAgdmFyIHNpemUgPSB0aGlzLl9jc2l6ZTtcblxuICAvLyBJbml0aWFsIHN0ZXAgKHBlcm11dGUgYW5kIHRyYW5zZm9ybSlcbiAgdmFyIHdpZHRoID0gdGhpcy5fd2lkdGg7XG4gIHZhciBzdGVwID0gMSA8PCB3aWR0aDtcbiAgdmFyIGxlbiA9IChzaXplIC8gc3RlcCkgPDwgMTtcblxuICB2YXIgb3V0T2ZmO1xuICB2YXIgdDtcbiAgdmFyIGJpdHJldiA9IHRoaXMuX2JpdHJldjtcbiAgaWYgKGxlbiA9PT0gNCkge1xuICAgIGZvciAob3V0T2ZmID0gMCwgdCA9IDA7IG91dE9mZiA8IHNpemU7IG91dE9mZiArPSBsZW4sIHQrKykge1xuICAgICAgY29uc3Qgb2ZmID0gYml0cmV2W3RdO1xuICAgICAgdGhpcy5fc2luZ2xlVHJhbnNmb3JtMihvdXRPZmYsIG9mZiwgc3RlcCk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIGxlbiA9PT0gOFxuICAgIGZvciAob3V0T2ZmID0gMCwgdCA9IDA7IG91dE9mZiA8IHNpemU7IG91dE9mZiArPSBsZW4sIHQrKykge1xuICAgICAgY29uc3Qgb2ZmID0gYml0cmV2W3RdO1xuICAgICAgdGhpcy5fc2luZ2xlVHJhbnNmb3JtNChvdXRPZmYsIG9mZiwgc3RlcCk7XG4gICAgfVxuICB9XG5cbiAgLy8gTG9vcCB0aHJvdWdoIHN0ZXBzIGluIGRlY3JlYXNpbmcgb3JkZXJcbiAgdmFyIGludiA9IHRoaXMuX2ludiA/IC0xIDogMTtcbiAgdmFyIHRhYmxlID0gdGhpcy50YWJsZTtcbiAgZm9yIChzdGVwID4+PSAyOyBzdGVwID49IDI7IHN0ZXAgPj49IDIpIHtcbiAgICBsZW4gPSAoc2l6ZSAvIHN0ZXApIDw8IDE7XG4gICAgdmFyIHF1YXJ0ZXJMZW4gPSBsZW4gPj4+IDI7XG5cbiAgICAvLyBMb29wIHRocm91Z2ggb2Zmc2V0cyBpbiB0aGUgZGF0YVxuICAgIGZvciAob3V0T2ZmID0gMDsgb3V0T2ZmIDwgc2l6ZTsgb3V0T2ZmICs9IGxlbikge1xuICAgICAgLy8gRnVsbCBjYXNlXG4gICAgICB2YXIgbGltaXQgPSBvdXRPZmYgKyBxdWFydGVyTGVuO1xuICAgICAgZm9yICh2YXIgaSA9IG91dE9mZiwgayA9IDA7IGkgPCBsaW1pdDsgaSArPSAyLCBrICs9IHN0ZXApIHtcbiAgICAgICAgY29uc3QgQSA9IGk7XG4gICAgICAgIGNvbnN0IEIgPSBBICsgcXVhcnRlckxlbjtcbiAgICAgICAgY29uc3QgQyA9IEIgKyBxdWFydGVyTGVuO1xuICAgICAgICBjb25zdCBEID0gQyArIHF1YXJ0ZXJMZW47XG5cbiAgICAgICAgLy8gT3JpZ2luYWwgdmFsdWVzXG4gICAgICAgIGNvbnN0IEFyID0gb3V0W0FdO1xuICAgICAgICBjb25zdCBBaSA9IG91dFtBICsgMV07XG4gICAgICAgIGNvbnN0IEJyID0gb3V0W0JdO1xuICAgICAgICBjb25zdCBCaSA9IG91dFtCICsgMV07XG4gICAgICAgIGNvbnN0IENyID0gb3V0W0NdO1xuICAgICAgICBjb25zdCBDaSA9IG91dFtDICsgMV07XG4gICAgICAgIGNvbnN0IERyID0gb3V0W0RdO1xuICAgICAgICBjb25zdCBEaSA9IG91dFtEICsgMV07XG5cbiAgICAgICAgLy8gTWlkZGxlIHZhbHVlc1xuICAgICAgICBjb25zdCBNQXIgPSBBcjtcbiAgICAgICAgY29uc3QgTUFpID0gQWk7XG5cbiAgICAgICAgY29uc3QgdGFibGVCciA9IHRhYmxlW2tdO1xuICAgICAgICBjb25zdCB0YWJsZUJpID0gaW52ICogdGFibGVbayArIDFdO1xuICAgICAgICBjb25zdCBNQnIgPSBCciAqIHRhYmxlQnIgLSBCaSAqIHRhYmxlQmk7XG4gICAgICAgIGNvbnN0IE1CaSA9IEJyICogdGFibGVCaSArIEJpICogdGFibGVCcjtcblxuICAgICAgICBjb25zdCB0YWJsZUNyID0gdGFibGVbMiAqIGtdO1xuICAgICAgICBjb25zdCB0YWJsZUNpID0gaW52ICogdGFibGVbMiAqIGsgKyAxXTtcbiAgICAgICAgY29uc3QgTUNyID0gQ3IgKiB0YWJsZUNyIC0gQ2kgKiB0YWJsZUNpO1xuICAgICAgICBjb25zdCBNQ2kgPSBDciAqIHRhYmxlQ2kgKyBDaSAqIHRhYmxlQ3I7XG5cbiAgICAgICAgY29uc3QgdGFibGVEciA9IHRhYmxlWzMgKiBrXTtcbiAgICAgICAgY29uc3QgdGFibGVEaSA9IGludiAqIHRhYmxlWzMgKiBrICsgMV07XG4gICAgICAgIGNvbnN0IE1EciA9IERyICogdGFibGVEciAtIERpICogdGFibGVEaTtcbiAgICAgICAgY29uc3QgTURpID0gRHIgKiB0YWJsZURpICsgRGkgKiB0YWJsZURyO1xuXG4gICAgICAgIC8vIFByZS1GaW5hbCB2YWx1ZXNcbiAgICAgICAgY29uc3QgVDByID0gTUFyICsgTUNyO1xuICAgICAgICBjb25zdCBUMGkgPSBNQWkgKyBNQ2k7XG4gICAgICAgIGNvbnN0IFQxciA9IE1BciAtIE1DcjtcbiAgICAgICAgY29uc3QgVDFpID0gTUFpIC0gTUNpO1xuICAgICAgICBjb25zdCBUMnIgPSBNQnIgKyBNRHI7XG4gICAgICAgIGNvbnN0IFQyaSA9IE1CaSArIE1EaTtcbiAgICAgICAgY29uc3QgVDNyID0gaW52ICogKE1CciAtIE1Ecik7XG4gICAgICAgIGNvbnN0IFQzaSA9IGludiAqIChNQmkgLSBNRGkpO1xuXG4gICAgICAgIC8vIEZpbmFsIHZhbHVlc1xuICAgICAgICBjb25zdCBGQXIgPSBUMHIgKyBUMnI7XG4gICAgICAgIGNvbnN0IEZBaSA9IFQwaSArIFQyaTtcblxuICAgICAgICBjb25zdCBGQ3IgPSBUMHIgLSBUMnI7XG4gICAgICAgIGNvbnN0IEZDaSA9IFQwaSAtIFQyaTtcblxuICAgICAgICBjb25zdCBGQnIgPSBUMXIgKyBUM2k7XG4gICAgICAgIGNvbnN0IEZCaSA9IFQxaSAtIFQzcjtcblxuICAgICAgICBjb25zdCBGRHIgPSBUMXIgLSBUM2k7XG4gICAgICAgIGNvbnN0IEZEaSA9IFQxaSArIFQzcjtcblxuICAgICAgICBvdXRbQV0gPSBGQXI7XG4gICAgICAgIG91dFtBICsgMV0gPSBGQWk7XG4gICAgICAgIG91dFtCXSA9IEZCcjtcbiAgICAgICAgb3V0W0IgKyAxXSA9IEZCaTtcbiAgICAgICAgb3V0W0NdID0gRkNyO1xuICAgICAgICBvdXRbQyArIDFdID0gRkNpO1xuICAgICAgICBvdXRbRF0gPSBGRHI7XG4gICAgICAgIG91dFtEICsgMV0gPSBGRGk7XG4gICAgICB9XG4gICAgfVxuICB9XG59O1xuXG4vLyByYWRpeC0yIGltcGxlbWVudGF0aW9uXG4vL1xuLy8gTk9URTogT25seSBjYWxsZWQgZm9yIGxlbj00XG5GRlQucHJvdG90eXBlLl9zaW5nbGVUcmFuc2Zvcm0yID0gZnVuY3Rpb24gX3NpbmdsZVRyYW5zZm9ybTIob3V0T2ZmLCBvZmYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RlcCkge1xuICBjb25zdCBvdXQgPSB0aGlzLl9vdXQ7XG4gIGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhO1xuXG4gIGNvbnN0IGV2ZW5SID0gZGF0YVtvZmZdO1xuICBjb25zdCBldmVuSSA9IGRhdGFbb2ZmICsgMV07XG4gIGNvbnN0IG9kZFIgPSBkYXRhW29mZiArIHN0ZXBdO1xuICBjb25zdCBvZGRJID0gZGF0YVtvZmYgKyBzdGVwICsgMV07XG5cbiAgY29uc3QgbGVmdFIgPSBldmVuUiArIG9kZFI7XG4gIGNvbnN0IGxlZnRJID0gZXZlbkkgKyBvZGRJO1xuICBjb25zdCByaWdodFIgPSBldmVuUiAtIG9kZFI7XG4gIGNvbnN0IHJpZ2h0SSA9IGV2ZW5JIC0gb2RkSTtcblxuICBvdXRbb3V0T2ZmXSA9IGxlZnRSO1xuICBvdXRbb3V0T2ZmICsgMV0gPSBsZWZ0STtcbiAgb3V0W291dE9mZiArIDJdID0gcmlnaHRSO1xuICBvdXRbb3V0T2ZmICsgM10gPSByaWdodEk7XG59O1xuXG4vLyByYWRpeC00XG4vL1xuLy8gTk9URTogT25seSBjYWxsZWQgZm9yIGxlbj04XG5GRlQucHJvdG90eXBlLl9zaW5nbGVUcmFuc2Zvcm00ID0gZnVuY3Rpb24gX3NpbmdsZVRyYW5zZm9ybTQob3V0T2ZmLCBvZmYsXG4gICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RlcCkge1xuICBjb25zdCBvdXQgPSB0aGlzLl9vdXQ7XG4gIGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhO1xuICBjb25zdCBpbnYgPSB0aGlzLl9pbnYgPyAtMSA6IDE7XG4gIGNvbnN0IHN0ZXAyID0gc3RlcCAqIDI7XG4gIGNvbnN0IHN0ZXAzID0gc3RlcCAqIDM7XG5cbiAgLy8gT3JpZ2luYWwgdmFsdWVzXG4gIGNvbnN0IEFyID0gZGF0YVtvZmZdO1xuICBjb25zdCBBaSA9IGRhdGFbb2ZmICsgMV07XG4gIGNvbnN0IEJyID0gZGF0YVtvZmYgKyBzdGVwXTtcbiAgY29uc3QgQmkgPSBkYXRhW29mZiArIHN0ZXAgKyAxXTtcbiAgY29uc3QgQ3IgPSBkYXRhW29mZiArIHN0ZXAyXTtcbiAgY29uc3QgQ2kgPSBkYXRhW29mZiArIHN0ZXAyICsgMV07XG4gIGNvbnN0IERyID0gZGF0YVtvZmYgKyBzdGVwM107XG4gIGNvbnN0IERpID0gZGF0YVtvZmYgKyBzdGVwMyArIDFdO1xuXG4gIC8vIFByZS1GaW5hbCB2YWx1ZXNcbiAgY29uc3QgVDByID0gQXIgKyBDcjtcbiAgY29uc3QgVDBpID0gQWkgKyBDaTtcbiAgY29uc3QgVDFyID0gQXIgLSBDcjtcbiAgY29uc3QgVDFpID0gQWkgLSBDaTtcbiAgY29uc3QgVDJyID0gQnIgKyBEcjtcbiAgY29uc3QgVDJpID0gQmkgKyBEaTtcbiAgY29uc3QgVDNyID0gaW52ICogKEJyIC0gRHIpO1xuICBjb25zdCBUM2kgPSBpbnYgKiAoQmkgLSBEaSk7XG5cbiAgLy8gRmluYWwgdmFsdWVzXG4gIGNvbnN0IEZBciA9IFQwciArIFQycjtcbiAgY29uc3QgRkFpID0gVDBpICsgVDJpO1xuXG4gIGNvbnN0IEZCciA9IFQxciArIFQzaTtcbiAgY29uc3QgRkJpID0gVDFpIC0gVDNyO1xuXG4gIGNvbnN0IEZDciA9IFQwciAtIFQycjtcbiAgY29uc3QgRkNpID0gVDBpIC0gVDJpO1xuXG4gIGNvbnN0IEZEciA9IFQxciAtIFQzaTtcbiAgY29uc3QgRkRpID0gVDFpICsgVDNyO1xuXG4gIG91dFtvdXRPZmZdID0gRkFyO1xuICBvdXRbb3V0T2ZmICsgMV0gPSBGQWk7XG4gIG91dFtvdXRPZmYgKyAyXSA9IEZCcjtcbiAgb3V0W291dE9mZiArIDNdID0gRkJpO1xuICBvdXRbb3V0T2ZmICsgNF0gPSBGQ3I7XG4gIG91dFtvdXRPZmYgKyA1XSA9IEZDaTtcbiAgb3V0W291dE9mZiArIDZdID0gRkRyO1xuICBvdXRbb3V0T2ZmICsgN10gPSBGRGk7XG59O1xuXG4vLyBSZWFsIGlucHV0IHJhZGl4LTQgaW1wbGVtZW50YXRpb25cbkZGVC5wcm90b3R5cGUuX3JlYWxUcmFuc2Zvcm00ID0gZnVuY3Rpb24gX3JlYWxUcmFuc2Zvcm00KCkge1xuICB2YXIgb3V0ID0gdGhpcy5fb3V0O1xuICB2YXIgc2l6ZSA9IHRoaXMuX2NzaXplO1xuXG4gIC8vIEluaXRpYWwgc3RlcCAocGVybXV0ZSBhbmQgdHJhbnNmb3JtKVxuICB2YXIgd2lkdGggPSB0aGlzLl93aWR0aDtcbiAgdmFyIHN0ZXAgPSAxIDw8IHdpZHRoO1xuICB2YXIgbGVuID0gKHNpemUgLyBzdGVwKSA8PCAxO1xuXG4gIHZhciBvdXRPZmY7XG4gIHZhciB0O1xuICB2YXIgYml0cmV2ID0gdGhpcy5fYml0cmV2O1xuICBpZiAobGVuID09PSA0KSB7XG4gICAgZm9yIChvdXRPZmYgPSAwLCB0ID0gMDsgb3V0T2ZmIDwgc2l6ZTsgb3V0T2ZmICs9IGxlbiwgdCsrKSB7XG4gICAgICBjb25zdCBvZmYgPSBiaXRyZXZbdF07XG4gICAgICB0aGlzLl9zaW5nbGVSZWFsVHJhbnNmb3JtMihvdXRPZmYsIG9mZiA+Pj4gMSwgc3RlcCA+Pj4gMSk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIC8vIGxlbiA9PT0gOFxuICAgIGZvciAob3V0T2ZmID0gMCwgdCA9IDA7IG91dE9mZiA8IHNpemU7IG91dE9mZiArPSBsZW4sIHQrKykge1xuICAgICAgY29uc3Qgb2ZmID0gYml0cmV2W3RdO1xuICAgICAgdGhpcy5fc2luZ2xlUmVhbFRyYW5zZm9ybTQob3V0T2ZmLCBvZmYgPj4+IDEsIHN0ZXAgPj4+IDEpO1xuICAgIH1cbiAgfVxuXG4gIC8vIExvb3AgdGhyb3VnaCBzdGVwcyBpbiBkZWNyZWFzaW5nIG9yZGVyXG4gIHZhciBpbnYgPSB0aGlzLl9pbnYgPyAtMSA6IDE7XG4gIHZhciB0YWJsZSA9IHRoaXMudGFibGU7XG4gIGZvciAoc3RlcCA+Pj0gMjsgc3RlcCA+PSAyOyBzdGVwID4+PSAyKSB7XG4gICAgbGVuID0gKHNpemUgLyBzdGVwKSA8PCAxO1xuICAgIHZhciBoYWxmTGVuID0gbGVuID4+PiAxO1xuICAgIHZhciBxdWFydGVyTGVuID0gaGFsZkxlbiA+Pj4gMTtcbiAgICB2YXIgaHF1YXJ0ZXJMZW4gPSBxdWFydGVyTGVuID4+PiAxO1xuXG4gICAgLy8gTG9vcCB0aHJvdWdoIG9mZnNldHMgaW4gdGhlIGRhdGFcbiAgICBmb3IgKG91dE9mZiA9IDA7IG91dE9mZiA8IHNpemU7IG91dE9mZiArPSBsZW4pIHtcbiAgICAgIGZvciAodmFyIGkgPSAwLCBrID0gMDsgaSA8PSBocXVhcnRlckxlbjsgaSArPSAyLCBrICs9IHN0ZXApIHtcbiAgICAgICAgdmFyIEEgPSBvdXRPZmYgKyBpO1xuICAgICAgICB2YXIgQiA9IEEgKyBxdWFydGVyTGVuO1xuICAgICAgICB2YXIgQyA9IEIgKyBxdWFydGVyTGVuO1xuICAgICAgICB2YXIgRCA9IEMgKyBxdWFydGVyTGVuO1xuXG4gICAgICAgIC8vIE9yaWdpbmFsIHZhbHVlc1xuICAgICAgICB2YXIgQXIgPSBvdXRbQV07XG4gICAgICAgIHZhciBBaSA9IG91dFtBICsgMV07XG4gICAgICAgIHZhciBCciA9IG91dFtCXTtcbiAgICAgICAgdmFyIEJpID0gb3V0W0IgKyAxXTtcbiAgICAgICAgdmFyIENyID0gb3V0W0NdO1xuICAgICAgICB2YXIgQ2kgPSBvdXRbQyArIDFdO1xuICAgICAgICB2YXIgRHIgPSBvdXRbRF07XG4gICAgICAgIHZhciBEaSA9IG91dFtEICsgMV07XG5cbiAgICAgICAgLy8gTWlkZGxlIHZhbHVlc1xuICAgICAgICB2YXIgTUFyID0gQXI7XG4gICAgICAgIHZhciBNQWkgPSBBaTtcblxuICAgICAgICB2YXIgdGFibGVCciA9IHRhYmxlW2tdO1xuICAgICAgICB2YXIgdGFibGVCaSA9IGludiAqIHRhYmxlW2sgKyAxXTtcbiAgICAgICAgdmFyIE1CciA9IEJyICogdGFibGVCciAtIEJpICogdGFibGVCaTtcbiAgICAgICAgdmFyIE1CaSA9IEJyICogdGFibGVCaSArIEJpICogdGFibGVCcjtcblxuICAgICAgICB2YXIgdGFibGVDciA9IHRhYmxlWzIgKiBrXTtcbiAgICAgICAgdmFyIHRhYmxlQ2kgPSBpbnYgKiB0YWJsZVsyICogayArIDFdO1xuICAgICAgICB2YXIgTUNyID0gQ3IgKiB0YWJsZUNyIC0gQ2kgKiB0YWJsZUNpO1xuICAgICAgICB2YXIgTUNpID0gQ3IgKiB0YWJsZUNpICsgQ2kgKiB0YWJsZUNyO1xuXG4gICAgICAgIHZhciB0YWJsZURyID0gdGFibGVbMyAqIGtdO1xuICAgICAgICB2YXIgdGFibGVEaSA9IGludiAqIHRhYmxlWzMgKiBrICsgMV07XG4gICAgICAgIHZhciBNRHIgPSBEciAqIHRhYmxlRHIgLSBEaSAqIHRhYmxlRGk7XG4gICAgICAgIHZhciBNRGkgPSBEciAqIHRhYmxlRGkgKyBEaSAqIHRhYmxlRHI7XG5cbiAgICAgICAgLy8gUHJlLUZpbmFsIHZhbHVlc1xuICAgICAgICB2YXIgVDByID0gTUFyICsgTUNyO1xuICAgICAgICB2YXIgVDBpID0gTUFpICsgTUNpO1xuICAgICAgICB2YXIgVDFyID0gTUFyIC0gTUNyO1xuICAgICAgICB2YXIgVDFpID0gTUFpIC0gTUNpO1xuICAgICAgICB2YXIgVDJyID0gTUJyICsgTURyO1xuICAgICAgICB2YXIgVDJpID0gTUJpICsgTURpO1xuICAgICAgICB2YXIgVDNyID0gaW52ICogKE1CciAtIE1Ecik7XG4gICAgICAgIHZhciBUM2kgPSBpbnYgKiAoTUJpIC0gTURpKTtcblxuICAgICAgICAvLyBGaW5hbCB2YWx1ZXNcbiAgICAgICAgdmFyIEZBciA9IFQwciArIFQycjtcbiAgICAgICAgdmFyIEZBaSA9IFQwaSArIFQyaTtcblxuICAgICAgICB2YXIgRkJyID0gVDFyICsgVDNpO1xuICAgICAgICB2YXIgRkJpID0gVDFpIC0gVDNyO1xuXG4gICAgICAgIG91dFtBXSA9IEZBcjtcbiAgICAgICAgb3V0W0EgKyAxXSA9IEZBaTtcbiAgICAgICAgb3V0W0JdID0gRkJyO1xuICAgICAgICBvdXRbQiArIDFdID0gRkJpO1xuXG4gICAgICAgIC8vIE91dHB1dCBmaW5hbCBtaWRkbGUgcG9pbnRcbiAgICAgICAgaWYgKGkgPT09IDApIHtcbiAgICAgICAgICB2YXIgRkNyID0gVDByIC0gVDJyO1xuICAgICAgICAgIHZhciBGQ2kgPSBUMGkgLSBUMmk7XG4gICAgICAgICAgb3V0W0NdID0gRkNyO1xuICAgICAgICAgIG91dFtDICsgMV0gPSBGQ2k7XG4gICAgICAgICAgY29udGludWU7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBEbyBub3Qgb3ZlcndyaXRlIG91cnNlbHZlc1xuICAgICAgICBpZiAoaSA9PT0gaHF1YXJ0ZXJMZW4pXG4gICAgICAgICAgY29udGludWU7XG5cbiAgICAgICAgLy8gSW4gdGhlIGZsaXBwZWQgY2FzZTpcbiAgICAgICAgLy8gTUFpID0gLU1BaVxuICAgICAgICAvLyBNQnI9LU1CaSwgTUJpPS1NQnJcbiAgICAgICAgLy8gTUNyPS1NQ3JcbiAgICAgICAgLy8gTURyPU1EaSwgTURpPU1EclxuICAgICAgICB2YXIgU1QwciA9IFQxcjtcbiAgICAgICAgdmFyIFNUMGkgPSAtVDFpO1xuICAgICAgICB2YXIgU1QxciA9IFQwcjtcbiAgICAgICAgdmFyIFNUMWkgPSAtVDBpO1xuICAgICAgICB2YXIgU1QyciA9IC1pbnYgKiBUM2k7XG4gICAgICAgIHZhciBTVDJpID0gLWludiAqIFQzcjtcbiAgICAgICAgdmFyIFNUM3IgPSAtaW52ICogVDJpO1xuICAgICAgICB2YXIgU1QzaSA9IC1pbnYgKiBUMnI7XG5cbiAgICAgICAgdmFyIFNGQXIgPSBTVDByICsgU1QycjtcbiAgICAgICAgdmFyIFNGQWkgPSBTVDBpICsgU1QyaTtcblxuICAgICAgICB2YXIgU0ZCciA9IFNUMXIgKyBTVDNpO1xuICAgICAgICB2YXIgU0ZCaSA9IFNUMWkgLSBTVDNyO1xuXG4gICAgICAgIHZhciBTQSA9IG91dE9mZiArIHF1YXJ0ZXJMZW4gLSBpO1xuICAgICAgICB2YXIgU0IgPSBvdXRPZmYgKyBoYWxmTGVuIC0gaTtcblxuICAgICAgICBvdXRbU0FdID0gU0ZBcjtcbiAgICAgICAgb3V0W1NBICsgMV0gPSBTRkFpO1xuICAgICAgICBvdXRbU0JdID0gU0ZCcjtcbiAgICAgICAgb3V0W1NCICsgMV0gPSBTRkJpO1xuICAgICAgfVxuICAgIH1cbiAgfVxufTtcblxuLy8gcmFkaXgtMiBpbXBsZW1lbnRhdGlvblxuLy9cbi8vIE5PVEU6IE9ubHkgY2FsbGVkIGZvciBsZW49NFxuRkZULnByb3RvdHlwZS5fc2luZ2xlUmVhbFRyYW5zZm9ybTIgPSBmdW5jdGlvbiBfc2luZ2xlUmVhbFRyYW5zZm9ybTIob3V0T2ZmLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgb2ZmLFxuICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgc3RlcCkge1xuICBjb25zdCBvdXQgPSB0aGlzLl9vdXQ7XG4gIGNvbnN0IGRhdGEgPSB0aGlzLl9kYXRhO1xuXG4gIGNvbnN0IGV2ZW5SID0gZGF0YVtvZmZdO1xuICBjb25zdCBvZGRSID0gZGF0YVtvZmYgKyBzdGVwXTtcblxuICBjb25zdCBsZWZ0UiA9IGV2ZW5SICsgb2RkUjtcbiAgY29uc3QgcmlnaHRSID0gZXZlblIgLSBvZGRSO1xuXG4gIG91dFtvdXRPZmZdID0gbGVmdFI7XG4gIG91dFtvdXRPZmYgKyAxXSA9IDA7XG4gIG91dFtvdXRPZmYgKyAyXSA9IHJpZ2h0UjtcbiAgb3V0W291dE9mZiArIDNdID0gMDtcbn07XG5cbi8vIHJhZGl4LTRcbi8vXG4vLyBOT1RFOiBPbmx5IGNhbGxlZCBmb3IgbGVuPThcbkZGVC5wcm90b3R5cGUuX3NpbmdsZVJlYWxUcmFuc2Zvcm00ID0gZnVuY3Rpb24gX3NpbmdsZVJlYWxUcmFuc2Zvcm00KG91dE9mZixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIG9mZixcbiAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIHN0ZXApIHtcbiAgY29uc3Qgb3V0ID0gdGhpcy5fb3V0O1xuICBjb25zdCBkYXRhID0gdGhpcy5fZGF0YTtcbiAgY29uc3QgaW52ID0gdGhpcy5faW52ID8gLTEgOiAxO1xuICBjb25zdCBzdGVwMiA9IHN0ZXAgKiAyO1xuICBjb25zdCBzdGVwMyA9IHN0ZXAgKiAzO1xuXG4gIC8vIE9yaWdpbmFsIHZhbHVlc1xuICBjb25zdCBBciA9IGRhdGFbb2ZmXTtcbiAgY29uc3QgQnIgPSBkYXRhW29mZiArIHN0ZXBdO1xuICBjb25zdCBDciA9IGRhdGFbb2ZmICsgc3RlcDJdO1xuICBjb25zdCBEciA9IGRhdGFbb2ZmICsgc3RlcDNdO1xuXG4gIC8vIFByZS1GaW5hbCB2YWx1ZXNcbiAgY29uc3QgVDByID0gQXIgKyBDcjtcbiAgY29uc3QgVDFyID0gQXIgLSBDcjtcbiAgY29uc3QgVDJyID0gQnIgKyBEcjtcbiAgY29uc3QgVDNyID0gaW52ICogKEJyIC0gRHIpO1xuXG4gIC8vIEZpbmFsIHZhbHVlc1xuICBjb25zdCBGQXIgPSBUMHIgKyBUMnI7XG5cbiAgY29uc3QgRkJyID0gVDFyO1xuICBjb25zdCBGQmkgPSAtVDNyO1xuXG4gIGNvbnN0IEZDciA9IFQwciAtIFQycjtcblxuICBjb25zdCBGRHIgPSBUMXI7XG4gIGNvbnN0IEZEaSA9IFQzcjtcblxuICBvdXRbb3V0T2ZmXSA9IEZBcjtcbiAgb3V0W291dE9mZiArIDFdID0gMDtcbiAgb3V0W291dE9mZiArIDJdID0gRkJyO1xuICBvdXRbb3V0T2ZmICsgM10gPSBGQmk7XG4gIG91dFtvdXRPZmYgKyA0XSA9IEZDcjtcbiAgb3V0W291dE9mZiArIDVdID0gMDtcbiAgb3V0W291dE9mZiArIDZdID0gRkRyO1xuICBvdXRbb3V0T2ZmICsgN10gPSBGRGk7XG59O1xuIiwiXCJ1c2Ugc3RyaWN0XCI7XG5cbmNvbnN0IEJ1ZmZlcmVkUHJvY2Vzc29yID0gcmVxdWlyZSgnLi9idWZmZXJlZC1wcm9jZXNzb3IuanMnKTtcbmNvbnN0IEZGVCA9IHJlcXVpcmUoJ2ZmdC5qcycpO1xuXG5jbGFzcyBQaGFzZVZvY29kZXJQcm9jZXNzb3IgZXh0ZW5kcyBCdWZmZXJlZFByb2Nlc3NvciB7XG4gICAgY29uc3RydWN0b3Iob3B0aW9ucykge1xuICAgICAgICBvcHRpb25zLnByb2Nlc3Nvck9wdGlvbnMgPSB7XG4gICAgICAgICAgICBudW1iZXJPZklucHV0Q2hhbm5lbHM6IDEsXG4gICAgICAgICAgICBudW1iZXJPZk91dHB1dENoYW5uZWxzOiAxLFxuICAgICAgICAgICAgYmxvY2tTaXplRmFjdG9yOiA0XG4gICAgICAgIH07XG4gICAgICAgIHN1cGVyKG9wdGlvbnMpXG5cbiAgICAgICAgLy8gcHJlcGFyZSBGRlQgYW5kIHByZS1hbGxvY2F0ZSBidWZmZXJzXG4gICAgICAgIHRoaXMuZmZ0ID0gbmV3IEZGVCh0aGlzLmJsb2NrU2l6ZSk7XG4gICAgICAgIHRoaXMuZnJlcUNvbXBsZXhCdWZmZXIgPSB0aGlzLmZmdC5jcmVhdGVDb21wbGV4QXJyYXkoKTtcbiAgICAgICAgdGhpcy50aW1lQ29tcGxleEJ1ZmZlciA9IHRoaXMuZmZ0LmNyZWF0ZUNvbXBsZXhBcnJheSgpO1xuICAgIH1cblxuICAgIHByb2Nlc3NCdWZmZXJlZChpbnB1dHMsIG91dHB1dHMpIHtcbiAgICAgICAgZm9yICh2YXIgaSA9IDA7IGkgPCB0aGlzLm5iSW5wdXRzOyBpKyspIHtcbiAgICAgICAgICAgIGZvciAodmFyIGogPSAwOyBqIDwgdGhpcy5uYklucHV0Q2hhbm5lbHM7IGorKykge1xuICAgICAgICAgICAgICAgIHZhciBpbnB1dENoYW5uZWwgPSBpbnB1dHNbaV1bal07XG4gICAgICAgICAgICAgICAgdmFyIG91dHB1dENoYW5uZWwgPSBvdXRwdXRzW2ldW2pdO1xuXG4gICAgICAgICAgICAgICAgdGhpcy5mZnQucmVhbFRyYW5zZm9ybSh0aGlzLmZyZXFDb21wbGV4QnVmZmVyLCBpbnB1dENoYW5uZWwpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmZ0LmNvbXBsZXRlU3BlY3RydW0odGhpcy5mcmVxQ29tcGxleEJ1ZmZlcik7XG5cbiAgICAgICAgICAgICAgICAvLyBsZXQgY29tcGxleEJ1ZmZlckxlbmd0aCA9IHRoaXMuY29tcGxleEJ1ZmZlci5sZW5ndGg7XG4gICAgICAgICAgICAgICAgLy8gZm9yKHZhciBrID0gMDsgayA8IGNvbXBsZXhCdWZmZXJMZW5ndGg7IGsrPSAyKSB7XG4gICAgICAgICAgICAgICAgLy8gICAgIHRoaXMuY29tcGxleEJ1ZmZlcltrXSA9IDBcbiAgICAgICAgICAgICAgICAvLyAgICAgdGhpcy5jb21wbGV4QnVmZmVyW2sgKyAxXSA9IDBcbiAgICAgICAgICAgICAgICAvLyB9XG5cbiAgICAgICAgICAgICAgICB0aGlzLmZmdC5pbnZlcnNlVHJhbnNmb3JtKHRoaXMudGltZUNvbXBsZXhCdWZmZXIsIHRoaXMuZnJlcUNvbXBsZXhCdWZmZXIpO1xuICAgICAgICAgICAgICAgIHRoaXMuZmZ0LmZyb21Db21wbGV4QXJyYXkodGhpcy50aW1lQ29tcGxleEJ1ZmZlciwgb3V0cHV0Q2hhbm5lbCk7XG4gICAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICB9XG59XG5cbnJlZ2lzdGVyUHJvY2Vzc29yKFwicGhhc2Utdm9jb2Rlci1wcm9jZXNzb3JcIiwgUGhhc2VWb2NvZGVyUHJvY2Vzc29yKTtcblxuIl19
