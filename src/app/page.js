'use client';

import { useState } from 'react';

// GF(2^8) multiplication
function gfMul(a, b, p) {
  let r = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 0x01) {
      r ^= a;
    }
    const highBit = a & 0x80;
    a = (a << 1) & 0xFF;
    if (highBit) a ^= p;
    b >>= 1;
  }
  return r >>> 0;
}
const ROUND_SUBKEYS = 20; // Adjust this based on your configuration
const ROUNDS = 16;
const SK_STEP = 0x02020202;
const SK_BUMP = 0x01010101;
const SK_ROTL = 9;
const primitivePoly = 0x1B;

const rs = [
  [0x01, 0xA4, 0x55, 0x87, 0x5A, 0x58, 0xDB, 0x9E],
  [0xA4, 0x56, 0x82, 0xF3, 0x1E, 0xC6, 0x68, 0xE5],
  [0x02, 0xA1, 0xFC, 0xC1, 0x47, 0xAE, 0x3D, 0x19],
  [0xA4, 0x55, 0x87, 0x5A, 0x58, 0xDB, 0x9E, 0x03],
];

const P0 = [
  0xA9, 0x67, 0xB3, 0xE8, 0x04, 0xFD, 0xA3, 0x6D, 0xD4, 0xA2, 0xAF, 0x9C, 0xA4, 0x72, 0xC0, 0xB7,
  0xFD, 0x93, 0x26, 0x36, 0x3F, 0xF7, 0xCC, 0x34, 0xA5, 0xE5, 0xF1, 0x71, 0xD8, 0x31, 0x15, 0x04,
  0xC7, 0x23, 0xC3, 0x18, 0x96, 0x05, 0x9A, 0x07, 0x12, 0x80, 0xE2, 0xEB, 0x27, 0xB2, 0x75, 0x09,
  0x83, 0x2C, 0x1A, 0x1B, 0x6E, 0x5A, 0xA0, 0x52, 0x3B, 0xD6, 0xB8, 0x6F, 0x39, 0xA1, 0x59, 0xF0,
];

const P1 = [
  0x75, 0xF3, 0xC6, 0xF4, 0xDB, 0x7B, 0xFB, 0xC8, 0x4A, 0xD3, 0xE6, 0x6B, 0x45, 0x7D, 0xE8, 0x4B,
  0xD6, 0x32, 0xD8, 0xFD, 0x37, 0x71, 0xF1, 0xE1, 0x30, 0x0F, 0xF8, 0x1B, 0x87, 0xFA, 0x06, 0x3F,
];
const P = [P0, P1];
// Mảng MDS
const MDS = (() => {
  const mxX = (x) => x ^ (x >> 2) ^ (x >> 1);
  const mxY = (x) => x ^ (x >> 1) ^ (x >> 2);
  const localMDS = [[], [], [], []];
  for (let i = 0; i < 256; i++) {
      localMDS[0][i] = i ^ mxX(i);
      localMDS[1][i] = i ^ mxY(i);
      localMDS[2][i] = mxX(i);
      localMDS[3][i] = mxY(i);
  }
  return localMDS;
})();

// Các hàm byte
const b0 = (x) => x & 0xFF;
const b1 = (x) => (x >>> 8) & 0xFF;
const b2 = (x) => (x >>> 16) & 0xFF;
const b3 = (x) => (x >>> 24) & 0xFF;
// Hàm rsMDSEncode
const rsMDSEncode = (k0, k1) => {
  for (let i = 0; i < 4; i++) {
      k1 = rsRem(k1);
  }
  k1 ^= k0;
  for (let i = 0; i < 4; i++) {
      k1 = rsRem(k1);
  }
  return k1;
};
// Kiểm tra mảng
const isAnArray = (value) => Array.isArray(value) || value instanceof Uint8Array;

// Hàm rsRem
const rsRem = (x) => {
    const b = (x >>> 24) & 0xFF;
    const g2 = (b << 1) ^ ((b & 0x80) ? 0x14D : 0);
    const g3 = (b >>> 1) ^ ((b & 0x01) ? 0x14D >>> 1 : 0) ^ g2;
    return (x << 8) ^ (g3 << 24) ^ (g2 << 16) ^ (g3 << 8) ^ b;
};

// Hàm f32
const f32 = (k64Cnt, x, k32) => {
  let lB0 = b0(x), lB1 = b1(x), lB2 = b2(x), lB3 = b3(x);
  const k0 = k32[0] || 0, k1 = k32[1] || 0, k2 = k32[2] || 0, k3 = k32[3] || 0;
  let result = 0;

  switch (k64Cnt & 3) {
      case 1:
          result = MDS[0][P[0][lB0] ^ b0(k0)] ^
                   MDS[1][P[1][lB1] ^ b1(k0)] ^
                   MDS[2][P[0][lB2] ^ b2(k0)] ^
                   MDS[3][P[1][lB3] ^ b3(k0)];
          break;
      case 0:
          lB0 = P[0][lB0] ^ b0(k3);
          lB1 = P[1][lB1] ^ b1(k3);
          lB2 = P[0][lB2] ^ b2(k3);
          lB3 = P[1][lB3] ^ b3(k3);
      case 3:
          lB0 = P[0][lB0] ^ b0(k2);
          lB1 = P[1][lB1] ^ b1(k2);
          lB2 = P[0][lB2] ^ b2(k2);
          lB3 = P[1][lB3] ^ b3(k2);
      case 2:
          result = MDS[0][P[0][lB0] ^ b0(k1)] ^
                   MDS[1][P[1][lB1] ^ b1(k1)] ^
                   MDS[2][P[0][lB2] ^ b2(k1)] ^
                   MDS[3][P[1][lB3] ^ b3(k1)];
          break;
  }
  return result;
};
// Rotate functions
function rotateLeft32(value, shift) {
  return (value << shift) | (value >>> (32 - shift));
}

function rotateRight32(value, shift) {
  return (value >>> shift) | (value << (32 - shift));
}

// S-Box Transform
function sBoxTransform(val, context) {
  return (
    context.s1[val & 0xff] ^
    context.s2[(val >> 8) & 0xff] ^
    context.s3[(val >> 16) & 0xff] ^
    context.s4[(val >> 24) & 0xff]
  );
}

// Key Expansion
const keyExpansion = (aKey) => {
  if (!isAnArray(aKey)) {
      throw new Error("Key must be an array");
  }

  let keyLength = aKey.length;
  const k64Cnt = Math.ceil(keyLength / 8);
  const subKeyCnt = ROUND_SUBKEYS + 2 * ROUNDS;
  const k32e = new Array(4).fill(0);
  const k32o = new Array(4).fill(0);
  const sBoxKey = new Array(4).fill(0);

  // Pad or truncate key
  if (keyLength < 8 || (keyLength > 8 && keyLength < 16) ||
      (keyLength > 16 && keyLength < 24) || keyLength > 32) {
      aKey = Array.from(aKey).concat(new Array(32 - keyLength).fill(0)).slice(0, 32);
  }

  let offset = 0;
  for (let i = 0; i < 4; i++) {
      if (offset >= keyLength) break;
      k32e[i] = (aKey[offset++] & 0xFF) |
                ((aKey[offset++] & 0xFF) << 8) |
                ((aKey[offset++] & 0xFF) << 16) |
                ((aKey[offset++] & 0xFF) << 24);
      k32o[i] = (aKey[offset++] & 0xFF) |
                ((aKey[offset++] & 0xFF) << 8) |
                ((aKey[offset++] & 0xFF) << 16) |
                ((aKey[offset++] & 0xFF) << 24);
      sBoxKey[3 - i] = rsMDSEncode(k32e[i], k32o[i]);
  }

  const subKeys = [];
  for (let i = 0, q = 0; i < subKeyCnt / 2; i++, q += SK_STEP) {
      const A = f32(k64Cnt, q, k32e);
      let B = f32(k64Cnt, q + SK_BUMP, k32o);
      B = (B << 8) | (B >>> 24);
      subKeys[2 * i] = A + B;
      subKeys[2 * i + 1] = ((A + 2 * B) << SK_ROTL) | ((A + 2 * B) >>> (32 - SK_ROTL));
  }

  return [sBoxKey, subKeys];
};

function fromBytes(bytes) {
  const uint32Array = new Uint32Array(bytes.length / 4);
  for (let i = 0; i < uint32Array.length; i++) {
    uint32Array[i] =
      bytes[i * 4] |
      (bytes[i * 4 + 1] << 8) |
      (bytes[i * 4 + 2] << 16) |
      (bytes[i * 4 + 3] << 24);
  }
  return uint32Array;
}

function toBytes(uint32Array) {
  const byteArray = new Uint8Array(uint32Array.length * 4);
  for (let i = 0; i < uint32Array.length; i++) {
    byteArray[i * 4] = uint32Array[i] & 0xff;
    byteArray[i * 4 + 1] = (uint32Array[i] >>> 8) & 0xff;
    byteArray[i * 4 + 2] = (uint32Array[i] >>> 16) & 0xff;
    byteArray[i * 4 + 3] = (uint32Array[i] >>> 24) & 0xff;
  }
  return byteArray;
}

// Xử lý padding
function applyPadding(bytes, blockSize = 16) {
  const padding = blockSize - (bytes.length % blockSize);
  return Uint8Array.from([...bytes, ...new Array(padding).fill(padding)]);
}
function removePadding(bytes) {
  const padding = bytes[bytes.length - 1];
  return bytes.slice(0, bytes.length - padding);
}

function encryptBlock(context, input) {
  let r0 = input[0] ^ context.me[0];
  let r1 = input[1] ^ context.me[1];
  let r2 = input[2] ^ context.me[2];
  let r3 = input[3] ^ context.me[3];

  for (let i = 0; i < 16; i++) {
    const t0 = sBoxTransform(r0, context);
    const t1 = sBoxTransform(r1, context);

    const f0 = (t0 + t1 + context.mo[2 * i]) >>> 0;
    const f1 = (t0 + (2 * t1) + context.mo[2 * i + 1]) >>> 0;

    r2 = rotateRight32(r2 ^ f0, 1);
    r3 = rotateLeft32(r3 ^ f1, 1);

    [r0, r2] = [r2, r0];
    [r1, r3] = [r3, r1];
  }

  const output = new Uint32Array(4);
  output[0] = r2 ^ context.me[36];
  output[1] = r3 ^ context.me[37];
  output[2] = r0 ^ context.me[38];
  output[3] = r1 ^ context.me[39];

  return output;
}

function decryptBlock(context, input) {
  let r2 = input[0] ^ context.me[36];
  let r3 = input[1] ^ context.me[37];
  let r0 = input[2] ^ context.me[38];
  let r1 = input[3] ^ context.me[39];

  for (let i = 15; i >= 0; i--) {
    // Hoán đổi lại thứ tự r0, r2 và r1, r3
    [r0, r2] = [r2, r0];
    [r1, r3] = [r3, r1];

    // Sử dụng các phép toán MDS và S-box transform theo chiều ngược lại
    const t0 = sBoxTransform(r0, context);
    const t1 = sBoxTransform(r1, context);

    const f0 = (t0 + t1 + context.mo[2 * i]) >>> 0;
    const f1 = (t0 + (2 * t1) + context.mo[2 * i + 1]) >>> 0;

    // Dịch bit ngược lại (rotate trái đối với giải mã)
    r2 = rotateLeft32(r2, 1) ^ f0;
    r3 = rotateRight32(r3, 1) ^ f1;
  }

  const output = new Uint32Array(4);
  // Khôi phục lại giá trị bằng cách XOR với các giá trị trong `me` (subkeys)
  output[0] = r0 ^ context.me[0];
  output[1] = r1 ^ context.me[1];
  output[2] = r2 ^ context.me[2];
  output[3] = r3 ^ context.me[3];

  return output;
}

function twofishEncrypt(key, input) {
  const [sBoxKey, subKeys] = keyExpansion(key);

  // Tạo context với sBox và subKeys
  const context = {
    me: subKeys.slice(0, 20), // 20 giá trị đầu
    mo: subKeys.slice(20), // Phần còn lại
    s1: MDS[0],
    s2: MDS[1],
    s3: MDS[2],
    s4: MDS[3],
  };

  const inputBlock = fromBytes(input);
  const encryptedBlock = encryptBlock(context, inputBlock);
  return toBytes(encryptedBlock);
}

// Hàm Twofish Decrypt
function twofishDecrypt(key, input) {
  const [sBoxKey, subKeys] = keyExpansion(key);

  // Tạo context với sBox và subKeys
  const context = {
    me: subKeys.slice(0, 20), // 20 giá trị đầu
    mo: subKeys.slice(20), // Phần còn lại
    s1: MDS[0],
    s2: MDS[1],
    s3: MDS[2],
    s4: MDS[3],
  };

  const inputBlock = fromBytes(input);
  const decryptedBlock = decryptBlock(context, inputBlock);
  return toBytes(decryptedBlock);
}

export default function Home() {
  const [message, setMessage] = useState('0000000000000000');
  const [key, setKey] = useState('0000000000000000');
  const [actionType, setActionType] = useState('Encrypt');
  const [result, setResult] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();

    const keyBytes = new TextEncoder().encode(key).slice(0, 16); // Giới hạn 16 byte
    const messageBytes = new TextEncoder().encode(message);

    let output = '';
    try {
      if (actionType === 'Encrypt') {
        const paddedMessage = applyPadding(messageBytes); // Thêm padding
        const encrypted = twofishEncrypt(keyBytes, paddedMessage);
        output = Array.from(encrypted)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');
      } else if (actionType === 'Decrypt') {
        const encryptedBytes = Uint8Array.from(
          message.match(/.{1,2}/g).map((byte) => parseInt(byte, 16))
        );
        const decrypted = twofishDecrypt(keyBytes, encryptedBytes);
        const unpaddedDecrypted = decrypted; // Bỏ padding
        output = new TextDecoder().decode(unpaddedDecrypted);
      }
    } catch (error) {
      output = `Error: ${error.message}`;
    }

    setResult(output);
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-lg">
        <h2 className="text-2xl font-bold mb-5">Twofish Encryption/Decryption</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-gray-700">Message:</label>
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-md text-red-700"
            />
          </div>
          <div>
            <label className="block text-gray-700">Key:</label>
            <input
              type="text"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              className="w-full px-4 py-2 border rounded-md text-red-700"
            />
          </div>
          <div>
            <label className="block text-gray-700">Action:</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full px-4 py-2 border rounded-md text-red-700"
            >
              <option value="Encrypt">Encrypt</option>
              <option value="Decrypt">Decrypt</option>
            </select>
          </div>
          <button type="submit" className="px-4 py-2 bg-blue-500 text-white rounded-md">
            Submit
          </button>
        </form>
        {result && (
          <div className="mt-5">
            <h3 className="text-xl font-bold">Result:</h3>
            <p>{result}</p>
          </div>
        )}
      </div>
    </div>
  );
}