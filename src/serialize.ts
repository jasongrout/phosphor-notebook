// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

"use strict";

import kernel = require("./kernel");
import IKernelMsg = kernel.IKernelMsg;

/**
 * Deserialize a message and return a promise for the unpacked message.
 */
export
function deserialize(data: ArrayBuffer | string): IKernelMsg {
  var value: IKernelMsg;
  if (typeof data === "string") {
    // text JSON message
    value = JSON.parse(data);
  } else {
    // binary message
    value = deserializeArrayBuffer(data);
  }
  return value;
}


/**
 * Serialize a kernel message for transport.
 */
export
function serialize(msg: IKernelMsg): string | ArrayBuffer {
  var value: string | ArrayBuffer;
  if (msg.buffers && msg.buffers.length) {
    value = serializeBinary(msg);
  } else {
    value = JSON.stringify(msg);
  }
  return value;
}


/**
 * Deserialize an ArrayBuffer to a Kernel Message.
 */
function deserializeArrayBuffer(buf: ArrayBuffer): IKernelMsg {
  var data = new DataView(buf);
  // read the header: 1 + nbufs 32b integers
  var nbufs = data.getUint32(0);
  var offsets: number[] = [];
  for (var i = 1; i <= nbufs; i++) {
    offsets.push(data.getUint32(i * 4));
  }
  var json_bytes = new Uint8Array(buf.slice(offsets[0], offsets[1]));
  var msg = JSON.parse((new TextDecoder('utf8')).decode(json_bytes));
  // the remaining chunks are stored as DataViews in msg.buffers
  msg.buffers = [];
  for (var i = 1; i < nbufs; i++) {
      var start = offsets[i];
      var stop = offsets[i + 1] || buf.byteLength;
      msg.buffers.push(new DataView(buf.slice(start, stop)));
  }
  return msg;
}


/**
 * Implement the binary serialization protocol.
 * Serialize JSON message to ArrayBuffer.
 */
function serializeBinary(msg: IKernelMsg): ArrayBuffer {
    var offsets: number[] = [];
    var buffers: ArrayBuffer[] = [];
    for (var i = 0; i < msg.buffers.length; i++) {
      // msg.buffers elements could be either views or ArrayBuffers
      // buffers elements are ArrayBuffers
      var b: any = msg.buffers[i];
      buffers.push(b instanceof ArrayBuffer ? b : b.buffer);
    }
    msg.buffers = void 0;
    var json_utf8 = (new TextEncoder('utf8')).encode(JSON.stringify(msg));
    msg.buffers = buffers;
    buffers.unshift(Array.prototype.slice.call(json_utf8));
    var nbufs = buffers.length;
    offsets.push(4 * (nbufs + 1));
    for (i = 0; i + 1 < buffers.length; i++) {
        offsets.push(offsets[offsets.length - 1] + buffers[i].byteLength);
    }
    var msg_buf = new Uint8Array(
        offsets[offsets.length - 1] + buffers[buffers.length - 1].byteLength
        );
    // use DataView.setUint32 for network byte-order
    var view = new DataView(msg_buf.buffer);
    // write nbufs to first 4 bytes
    view.setUint32(0, nbufs);
    // write offsets to next 4 * nbufs bytes
    for (i = 0; i < offsets.length; i++) {
        view.setUint32(4 * (i + 1), offsets[i]);
    }
    // write all the buffers at their respective offsets
    for (i = 0; i < buffers.length; i++) {
        msg_buf.set(new Uint8Array(buffers[i]), offsets[i]);
    }
    return msg_buf.buffer;
}
