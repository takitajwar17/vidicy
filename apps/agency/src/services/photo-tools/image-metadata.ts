export interface PhotoImageMetadata {
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "image/gif";
  width: number;
  height: number;
}

function readUint16BE(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);
}

function hasPrefix(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) {
    return false;
  }

  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix[index]) {
      return false;
    }
  }

  return true;
}

function parsePng(bytes: Uint8Array): PhotoImageMetadata | null {
  if (
    bytes.length < 24
    || !hasPrefix(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  ) {
    return null;
  }

  return {
    mimeType: "image/png",
    width: ((bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19]) >>> 0,
    height: ((bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]) >>> 0,
  };
}

function parseGif(bytes: Uint8Array): PhotoImageMetadata | null {
  if (bytes.length < 10) {
    return null;
  }

  const header = String.fromCharCode(...bytes.slice(0, 6));
  if (header !== "GIF87a" && header !== "GIF89a") {
    return null;
  }

  return {
    mimeType: "image/gif",
    width: readUint16LE(bytes, 6),
    height: readUint16LE(bytes, 8),
  };
}

function parseJpeg(bytes: Uint8Array): PhotoImageMetadata | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    return null;
  }

  let offset = 2;
  while (offset + 1 < bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    let marker = bytes[offset + 1];
    while (marker === 0xff) {
      offset += 1;
      marker = bytes[offset + 1];
    }

    if (marker === 0xd9 || marker === 0xda) {
      break;
    }

    if (offset + 3 >= bytes.length) {
      break;
    }

    const segmentLength = readUint16BE(bytes, offset + 2);
    if (segmentLength < 2) {
      return null;
    }

    const isSofMarker =
      (marker >= 0xc0 && marker <= 0xc3)
      || (marker >= 0xc5 && marker <= 0xc7)
      || (marker >= 0xc9 && marker <= 0xcb)
      || (marker >= 0xcd && marker <= 0xcf);

    if (isSofMarker) {
      if (offset + 8 >= bytes.length) {
        return null;
      }

      return {
        mimeType: "image/jpeg",
        height: readUint16BE(bytes, offset + 5),
        width: readUint16BE(bytes, offset + 7),
      };
    }

    offset += 2 + segmentLength;
  }

  return null;
}

function parseWebp(bytes: Uint8Array): PhotoImageMetadata | null {
  if (
    bytes.length < 16
    || String.fromCharCode(...bytes.slice(0, 4)) !== "RIFF"
    || String.fromCharCode(...bytes.slice(8, 12)) !== "WEBP"
  ) {
    return null;
  }

  const chunkType = String.fromCharCode(...bytes.slice(12, 16));

  if (chunkType === "VP8X") {
    if (bytes.length < 30) {
      return null;
    }

    const width = readUint24LE(bytes, 24) + 1;
    const height = readUint24LE(bytes, 27) + 1;

    return {
      mimeType: "image/webp",
      width,
      height,
    };
  }

  if (chunkType === "VP8 ") {
    if (bytes.length < 30) {
      return null;
    }

    const hasStartCode = bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a;
    if (!hasStartCode) {
      return null;
    }

    const width = readUint16LE(bytes, 26) & 0x3fff;
    const height = readUint16LE(bytes, 28) & 0x3fff;

    return {
      mimeType: "image/webp",
      width,
      height,
    };
  }

  if (chunkType === "VP8L") {
    if (bytes.length < 25 || bytes[20] !== 0x2f) {
      return null;
    }

    const bits0 = bytes[21];
    const bits1 = bytes[22];
    const bits2 = bytes[23];
    const bits3 = bytes[24];

    const width = 1 + (bits0 | ((bits1 & 0x3f) << 8));
    const height = 1 + (((bits1 >> 6) & 0x03) | (bits2 << 2) | ((bits3 & 0x0f) << 10));

    return {
      mimeType: "image/webp",
      width,
      height,
    };
  }

  return null;
}

export function sniffPhotoImageMetadata(bytes: Uint8Array): PhotoImageMetadata | null {
  const metadata = parsePng(bytes) ?? parseGif(bytes) ?? parseJpeg(bytes) ?? parseWebp(bytes);

  if (!metadata || metadata.width <= 0 || metadata.height <= 0) {
    return null;
  }

  return metadata;
}
