export type ZipEntry = { name: string; data: Buffer };
const crcTable = Array.from({ length: 256 }, (_, n) => { let c=n; for(let k=0;k<8;k++) c=(c&1)?0xedb88320^(c>>>1):c>>>1; return c>>>0; });
function crc32(data: Buffer) { let c=0xffffffff; for(const byte of data)c=crcTable[(c^byte)&255]^(c>>>8); return (c^0xffffffff)>>>0; }
export function zip(entries: ZipEntry[]): Buffer {
  const local: Buffer[]=[]; const central: Buffer[]=[]; let offset=0;
  for(const entry of entries){ const name=Buffer.from(entry.name.replace(/[^\w.\-/ ]/g,'_')); const crc=crc32(entry.data); const h=Buffer.alloc(30); h.writeUInt32LE(0x04034b50); h.writeUInt16LE(20,4); h.writeUInt16LE(0,6); h.writeUInt16LE(0,8); h.writeUInt32LE(crc,14); h.writeUInt32LE(entry.data.length,18); h.writeUInt32LE(entry.data.length,22); h.writeUInt16LE(name.length,26); local.push(h,name,entry.data); const ch=Buffer.alloc(46); ch.writeUInt32LE(0x02014b50); ch.writeUInt16LE(20,4); ch.writeUInt16LE(20,6); ch.writeUInt32LE(crc,16); ch.writeUInt32LE(entry.data.length,20); ch.writeUInt32LE(entry.data.length,24); ch.writeUInt16LE(name.length,28); ch.writeUInt32LE(offset,42); central.push(ch,name); offset+=h.length+name.length+entry.data.length; }
  const center=Buffer.concat(central); const end=Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(center.length,12); end.writeUInt32LE(offset,16); return Buffer.concat([...local,center,end]);
}
