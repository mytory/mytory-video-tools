// metadata-writer.js
// JPEG/PNG/WebP 이미지 파일에 EXIF/IPTC/XMP 메타데이터를 직접 기록합니다.
// 참고: ~/workspace/tools.mytory.net/video-frame-capture/app.js

const path = require('path');
const fs = require('fs');

// sharp는 optional. WebP canvas 크기 추출에만 사용.
let sharpInstance = null;
try { sharpInstance = require('sharp'); } catch (e) { /* sharp 없음 */ }

// --- 헬퍼 함수 ---

function utf8Bytes(text) {
    return Buffer.from(text, 'utf-8');
}

function utf16leBytes(text) {
    const buf = Buffer.alloc((text.length + 1) * 2);
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        buf[i * 2] = code & 0xff;
        buf[i * 2 + 1] = code >> 8;
    }
    buf[(text.length) * 2] = 0;
    buf[(text.length) * 2 + 1] = 0;
    return buf;
}

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// --- EXIF 바이너리 빌드 (TIFF 헤더부터) ---

function buildExifBuffer(metadata) {
    const dateTime = metadata.dateTimeOriginal || '';
    const make = metadata.make || '';
    const model = metadata.model || '';
    const software = metadata.software || 'Mytory Video Tools';
    const artist = metadata.artist || '';

    const ascii = (text) => utf8Bytes(text + '\0');
    const makeEntry = (tag, type, value) => ({ tag, type, value });

    const ifd0Entries = [];
    if (dateTime) ifd0Entries.push(makeEntry(0x0132, 2, ascii(dateTime))); // DateTime
    if (make) ifd0Entries.push(makeEntry(0x010f, 2, ascii(make)));       // Make
    if (model) ifd0Entries.push(makeEntry(0x0110, 2, ascii(model)));     // Model
    if (software) ifd0Entries.push(makeEntry(0x0131, 2, ascii(software))); // Software
    if (artist) ifd0Entries.push(makeEntry(0x013b, 2, ascii(artist)));   // Artist
    if (artist) ifd0Entries.push(makeEntry(0x9c9d, 1, utf16leBytes(artist))); // XPAuthor

    const exifEntries = [];
    if (dateTime) {
        exifEntries.push(makeEntry(0x9003, 2, ascii(dateTime))); // DateTimeOriginal
        exifEntries.push(makeEntry(0x9004, 2, ascii(dateTime))); // DateTimeDigitized
    }

    const ifd0Count = ifd0Entries.length + 1; // +1 for ExifIFD pointer
    const exifIfdCount = exifEntries.length;

    const tiffStart = 0; // TIFF 헤더부터 시작
    const ifd0Offset = 8; // TIFF 헤더(8바이트) 직후
    const ifd0Size = 2 + ifd0Count * 12 + 4;
    const exifIfdOffset = ifd0Offset + ifd0Size;
    const exifIfdSize = 2 + exifIfdCount * 12 + 4;
    let dataOffset = exifIfdOffset + exifIfdSize;

    const attachData = (entry) => {
        if (entry.value.length > 4) {
            entry.dataOffset = dataOffset;
            dataOffset += entry.value.length;
            if (dataOffset % 2 !== 0) dataOffset += 1;
        }
        return entry;
    };

    const ifd0 = ifd0Entries.map(attachData);
    const exifIfd = exifEntries.map(attachData);

    const totalSize = tiffStart + dataOffset;
    const buf = Buffer.alloc(totalSize);

    // TIFF 헤더 (Little-Endian)
    buf[0] = 0x49; // 'I'
    buf[1] = 0x49; // 'I'
    buf.writeUInt16LE(42, 2);  // TIFF magic
    buf.writeUInt32LE(8, 4);   // IFD0 offset

    const writeIfd = (offset, entries, nextIfdOffset) => {
        buf.writeUInt16LE(entries.length, offset);
        let cursor = offset + 2;
        for (const entry of entries) {
            buf.writeUInt16LE(entry.tag, cursor);
            buf.writeUInt16LE(entry.type, cursor + 2);
            const isNumeric = typeof entry.value === 'number';
            const count = isNumeric ? 1 : entry.value.length;
            buf.writeUInt32LE(count, cursor + 4);
            if (isNumeric) {
                buf.writeUInt32LE(entry.value, cursor + 8);
            } else if (entry.value.length > 4) {
                buf.writeUInt32LE(entry.dataOffset, cursor + 8);
            } else {
                entry.value.copy(buf, cursor + 8);
            }
            cursor += 12;
        }
        buf.writeUInt32LE(nextIfdOffset, cursor);
    };

    // IFD0에 ExifIFD 포인터 추가
    ifd0.push(makeEntry(0x8769, 4, exifIfdOffset)); // ExifIFD pointer
    writeIfd(ifd0Offset, ifd0, 0);
    writeIfd(exifIfdOffset, exifIfd, 0);

    // 데이터 쓰기
    for (const entry of [...ifd0, ...exifIfd]) {
        if (entry.dataOffset !== undefined) {
            entry.value.copy(buf, entry.dataOffset);
        }
    }

    return buf;
}

// --- JPEG 세그먼트 빌드 ---

function buildJpegExifSegment(metadata) {
    const exifBuffer = buildExifBuffer(metadata);
    // JPEG APP1 마커: FFE1 + length(2) + "Exif\0\0" + exifBuffer
    const prefix = utf8Bytes('Exif\0\0');
    const payload = Buffer.concat([prefix, exifBuffer]);
    const segment = Buffer.alloc(4 + payload.length);
    segment[0] = 0xff;
    segment[1] = 0xe1;
    segment.writeUInt16BE(payload.length + 2, 2);
    payload.copy(segment, 4);
    return segment;
}

function buildJpegIptcSegment(metadata) {
    const artist = metadata.artist || '';
    const dateTimeOriginal = metadata.dateTimeOriginal || '';
    if (!artist && !dateTimeOriginal) return null;

    // IPTC 데이터 블록
    const blocks = [];

    // Coded Character Set (ESC % G)
    const ccs = Buffer.alloc(3);
    ccs[0] = 0x1b;
    ccs[1] = 0x25;
    ccs[2] = 0x47;
    blocks.push({ record: 1, dataset: 90, value: ccs });

    if (dateTimeOriginal) {
        const timeCreated = dateTimeOriginal.replace(/[: ]/g, '');
        // DateCreated (2:55)
        const dateStr = timeCreated.slice(0, 8); // YYYYMMDD
        blocks.push({ record: 2, dataset: 55, value: utf8Bytes(dateStr) });
        // TimeCreated (2:60)
        const timeStr = timeCreated.slice(9, 15) + '+0000'; // HHMMSS+0000
        blocks.push({ record: 2, dataset: 60, value: utf8Bytes(timeStr) });
    }
    if (artist) {
        // Byline (2:80)
        blocks.push({ record: 2, dataset: 80, value: utf8Bytes(artist) });
    }

    // IPTC 데이터 직렬화
    const parts = [];
    for (const block of blocks) {
        const record = Buffer.alloc(5 + block.value.length);
        record[0] = 0x1c;
        record[1] = block.record;
        record[2] = block.dataset;
        record.writeUInt16BE(block.value.length, 3);
        block.value.copy(record, 5);
        parts.push(record);
    }

    const iptcData = Buffer.concat(parts);

    // Photoshop IRB (APP13, 0xFFED)
    const resourceHeader = utf8Bytes('Photoshop 3.0\0');
    const signature = utf8Bytes('8BIM');
    const resourceId = 0x0404; // IPTC-NAA
    const name = Buffer.alloc(1, 0);
    const namePadding = name.length % 2 === 0 ? 0 : 1;
    const dataPadding = iptcData.length % 2 === 0 ? 0 : 1;

    const payloadLength = resourceHeader.length + 4 + 2 + name.length + namePadding + 4 + iptcData.length + dataPadding;
    const segment = Buffer.alloc(2 + 2 + payloadLength);
    segment[0] = 0xff;
    segment[1] = 0xed;
    segment.writeUInt16BE(payloadLength + 2, 2);

    let offset = 4;
    resourceHeader.copy(segment, offset);
    offset += resourceHeader.length;
    signature.copy(segment, offset);
    offset += 4;
    segment.writeUInt16BE(resourceId, offset);
    offset += 2;
    name.copy(segment, offset);
    offset += name.length;
    if (namePadding) { segment[offset] = 0; offset++; }
    segment.writeUInt32BE(iptcData.length, offset);
    offset += 4;
    iptcData.copy(segment, offset);

    return segment;
}

function buildJpegXmpSegment(metadata) {
    const artist = metadata.artist || '';
    const dateTimeOriginal = metadata.dateTimeOriginal || '';
    if (!artist && !dateTimeOriginal) return null;

    const coreFields = [];
    if (artist) {
        coreFields.push(`<dc:creator><rdf:Seq><rdf:li>${xmlEscape(artist)}</rdf:li></rdf:Seq></dc:creator>`);
        coreFields.push(`<photoshop:AuthorsPosition>${xmlEscape(artist)}</photoshop:AuthorsPosition>`);
    }
    if (dateTimeOriginal) {
        coreFields.push(`<xmp:CreateDate>${xmlEscape(dateTimeOriginal)}</xmp:CreateDate>`);
        coreFields.push(`<exif:DateTimeOriginal>${xmlEscape(dateTimeOriginal)}</exif:DateTimeOriginal>`);
    }

    const xmpXml = '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
        '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
        '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#" ' +
        'xmlns:dc="http://purl.org/dc/elements/1.1/" ' +
        'xmlns:xmp="http://ns.adobe.com/xap/1.0/" ' +
        'xmlns:exif="http://ns.adobe.com/exif/1.0/" ' +
        'xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/">' +
        '<rdf:Description rdf:about="">' +
        coreFields.join('') +
        '</rdf:Description>' +
        '</rdf:RDF>' +
        '</x:xmpmeta>' +
        '<?xpacket end="w"?>';

    const header = utf8Bytes('http://ns.adobe.com/xap/1.0/\0');
    const xmlBytes = utf8Bytes(xmpXml);
    const payload = Buffer.concat([header, xmlBytes]);
    const segment = Buffer.alloc(4 + payload.length);
    segment[0] = 0xff;
    segment[1] = 0xe1;
    segment.writeUInt16BE(payload.length + 2, 2);
    payload.copy(segment, 4);
    return segment;
}

// --- JPEG에 메타데이터 주입 ---

function injectJpegMetadata(imagePath, metadata) {
    const sourceBytes = fs.readFileSync(imagePath);
    if (sourceBytes[0] !== 0xff || sourceBytes[1] !== 0xd8) return; // not JPEG

    const exifSegment = buildJpegExifSegment(metadata);
    const iptcSegment = buildJpegIptcSegment(metadata);
    const xmpSegment = buildJpegXmpSegment(metadata);

    // SOI(0xFFD8) 직후, 첫 번째 segment 이후에 삽입
    let insertAt = 2;
    while (insertAt + 4 < sourceBytes.length && sourceBytes[insertAt] === 0xff) {
        const marker = sourceBytes[insertAt + 1];
        // APP marker or COM marker
        const isSegment = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
        if (!isSegment) break;
        const length = sourceBytes.readUInt16BE(insertAt + 2);
        insertAt += 2 + length;
    }

    const parts = [sourceBytes.subarray(0, insertAt)];
    if (exifSegment) parts.push(exifSegment);
    if (iptcSegment) parts.push(iptcSegment);
    if (xmpSegment) parts.push(xmpSegment);
    parts.push(sourceBytes.subarray(insertAt));

    const merged = Buffer.concat(parts);
    fs.writeFileSync(imagePath, merged);
}

// --- PNG에 EXIF 주입 (eXIf 청크) ---

function injectPngMetadata(imagePath, metadata) {
    const sourceBytes = fs.readFileSync(imagePath);

    // PNG 시그니처 확인
    const pngSig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    if (!sourceBytes.subarray(0, 8).equals(pngSig)) return;

    const exifBuffer = buildExifBuffer(metadata);
    // eXIf 청크: length(4) + "eXIf"(4) + data + CRC(4)
    const chunkType = utf8Bytes('eXIf');
    const chunkData = Buffer.concat([chunkType, exifBuffer]);
    const crc = crc32(chunkData);
    const chunk = Buffer.alloc(4 + 4 + exifBuffer.length + 4);
    chunk.writeUInt32BE(exifBuffer.length, 0);
    chunkType.copy(chunk, 4);
    exifBuffer.copy(chunk, 8);
    chunk.writeUInt32BE(crc, 8 + exifBuffer.length);

    // IHDR 청크 뒤, IDAT 청크 앞에 삽입
    const ihdrEnd = findPngChunk(sourceBytes, 'IHDR');
    if (ihdrEnd === -1) return;

    const parts = [
        sourceBytes.subarray(0, ihdrEnd),
        chunk,
        sourceBytes.subarray(ihdrEnd)
    ];
    const merged = Buffer.concat(parts);
    fs.writeFileSync(imagePath, merged);
}

// --- WebP에 EXIF 주입 ---
// WebP 확장 포맷은 VP8X 청크가 필요하며, EXIF 비트(0x04)를 설정해야 함

function injectWebpMetadata(imagePath, metadata) {
    const sourceBytes = fs.readFileSync(imagePath);
    if (sourceBytes.readUInt32BE(0) !== 0x52494646) return;
    if (sourceBytes.readUInt32BE(8) !== 0x57454250) return;

    const exifBuffer = buildExifBuffer(metadata);

    // sharp로 이미지 크기 얻기 (가장 정확)
    let canvasWidth = 0;
    let canvasHeight = 0;
    if (sharpInstance) {
        try {
            const meta = sharpInstance(imagePath).metadataSync();
            canvasWidth = meta.width || 0;
            canvasHeight = meta.height || 0;
        } catch (e) {}
    }

    // WebP 청크 파싱
    let offset = 12;
    const chunks = [];
    let hasVp8x = false;
    let firstVpChunkIndex = -1;

    while (offset + 8 <= sourceBytes.length) {
        const chunkId = sourceBytes.toString('ascii', offset, offset + 4);
        const chunkSize = sourceBytes.readUInt32LE(offset + 4);
        const chunkEnd = offset + 8 + chunkSize + (chunkSize % 2);
        if (chunkEnd > sourceBytes.length) break;

        const chunk = sourceBytes.subarray(offset, chunkEnd);

        if (chunkId === 'VP8X') {
            hasVp8x = true;
            if (!canvasWidth) {
                canvasWidth = chunk.readUInt16LE(12) | ((chunk[14] & 0x0f) << 16);
                canvasHeight = chunk.readUInt16LE(15) | ((chunk[17] & 0x0f) << 16);
            }
            chunks.push({ id: chunkId, data: chunk });
        } else if (chunkId === 'VP8 ' || chunkId === 'VP8L') {
            if (firstVpChunkIndex === -1) firstVpChunkIndex = chunks.length;
            chunks.push({ id: chunkId, data: chunk });
        } else if (chunkId === 'EXIF') {
            // 기존 EXIF 제거 (덮어쓰기)
        } else {
            chunks.push({ id: chunkId, data: chunk });
        }

        offset = chunkEnd;
    }

    // EXIF 청크 생성
    const exifChunkId = utf8Bytes('EXIF');
    const exifChunkData = Buffer.concat([exifChunkId, exifBuffer]);
    const exifCrc = crc32(exifChunkData);
    const exifChunk = Buffer.alloc(8 + exifBuffer.length);
    exifChunk.writeUInt32LE(exifBuffer.length, 0);
    exifChunkId.copy(exifChunk, 4);
    exifBuffer.copy(exifChunk, 8);

    // 새 청크 목록 구성
    const newChunks = [];

    if (hasVp8x) {
        // 기존 VP8X 업데이트: EXIF 비트 (0x04) 설정
        const oldVp8x = chunks.find(c => c.id === 'VP8X').data;
        const newVp8x = Buffer.from(oldVp8x);
        newVp8x[8] = newVp8x[8] | 0x04; // EXIF bit
        newChunks.push({ id: 'VP8X', data: newVp8x });
        
        // 모든 청크를 순서대로 넣고, EXIF는 VP8X 바로 뒤에
        for (const c of chunks) {
            if (c.id === 'VP8X') {
                // 이미 처리됨 (위에서 추가)
                continue;
            }
            newChunks.push(c);
        }
        // EXIF 청크를 VP8X 바로 뒤에 삽입
        const vp8xIdx = newChunks.findIndex(c => c.id === 'VP8X');
        newChunks.splice(vp8xIdx + 1, 0, { id: 'EXIF', data: exifChunk });
    } else {
        // VP8X 청크 생성
        const vp8xLen = 12; // 4(id) + 4(size) + 1(flags) + 3(reserved) + 2(width) + 2(height)?? 
        // 실제 VP8X 크기는 10 (flags 1 + reserved 3 + width 3 + height 3)
        // 청크 헤더 포함: 4(id) + 4(size) + 10(data) = 18
        
        // VP8X: flags(1) + reserved(3) + width_1(3) + height_1(3) = 10 bytes
        // Chunk: id(4) + size(4) + data(10) = 18 bytes
        const vp8xDataSize = 10;
        const vp8xBuf = Buffer.alloc(4 + 4 + vp8xDataSize);
        vp8xBuf.write('VP8X', 0, 4, 'ascii');
        vp8xBuf.writeUInt32LE(vp8xDataSize, 4);
        vp8xBuf[8] = 0x04; // EXIF bit
        // reserved: 3 bytes (0)
        // width-1 (3 bytes LE): bits 0-15, bits 16-17
        const w = Math.max(1, canvasWidth - 1);
        const h = Math.max(1, canvasHeight - 1);
        vp8xBuf[12] = w & 0xff;
        vp8xBuf[13] = (w >> 8) & 0xff;
        vp8xBuf[14] = (w >> 16) & 0x0f;
        vp8xBuf[15] = h & 0xff;
        vp8xBuf[16] = (h >> 8) & 0xff;
        vp8xBuf[17] = (h >> 16) & 0x0f;

        // 첫 번째 VP8/VP8L 청크 앞에 VP8X + EXIF 삽입
        if (firstVpChunkIndex >= 0) {
            for (let i = 0; i < chunks.length; i++) {
                if (i === firstVpChunkIndex) {
                    newChunks.push({ id: 'VP8X', data: vp8xBuf });
                    newChunks.push({ id: 'EXIF', data: exifChunk });
                }
                newChunks.push(chunks[i]);
            }
        } else {
            newChunks.push({ id: 'VP8X', data: vp8xBuf });
            newChunks.push({ id: 'EXIF', data: exifChunk });
            newChunks.push(...chunks);
        }
    }

    // 새 파일 조립
    const riffHeader = sourceBytes.subarray(0, 12);
    const newChunkBuffers = newChunks.map(c => c.data);
    const newDataSize = newChunkBuffers.reduce((sum, b) => sum + b.length, 0);
    
    const newFile = Buffer.alloc(12 + newDataSize);
    riffHeader.copy(newFile, 0);
    newFile.writeUInt32LE(newDataSize, 4); // RIFF size 업데이트
    let pos = 12;
    for (const buf of newChunkBuffers) {
        buf.copy(newFile, pos);
        pos += buf.length;
    }

    fs.writeFileSync(imagePath, newFile);
}

// --- PNG 청크 찾기 ---

function findPngChunk(data, typeName) {
    let offset = 8; // PNG 시그니처 다음
    while (offset + 8 < data.length) {
        const length = data.readUInt32BE(offset);
        const type = data.toString('ascii', offset + 4, offset + 8);
        if (type === typeName) {
            return offset + 8 + length + 4; // 청크 끝 (CRC 다음)
        }
        offset += 12 + length;
    }
    return -1;
}

// --- CRC-32 (PNG/WebP 청크용) ---

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c;
    }
    return table;
})();

function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// --- 메인 함수: 포맷 자동 감지 후 메타데이터 주입 ---

function injectImageMetadata(imagePath, metadata) {
    if (!metadata || (!metadata.artist && !metadata.dateTimeOriginal)) return;

    const ext = path.extname(imagePath).toLowerCase();
    const buf = fs.readFileSync(imagePath);

    if (ext === '.jpg' || ext === '.jpeg' || (buf[0] === 0xff && buf[1] === 0xd8)) {
        injectJpegMetadata(imagePath, metadata);
    } else if (ext === '.png' || (buf[0] === 137 && buf[1] === 80)) {
        injectPngMetadata(imagePath, metadata);
    } else if (ext === '.webp' || (buf.readUInt32BE(0) === 0x52494646 && buf.readUInt32BE(8) === 0x57454250)) {
        injectWebpMetadata(imagePath, metadata);
    }
}

module.exports = { injectImageMetadata, buildExifBuffer };
