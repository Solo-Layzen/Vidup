/**
 * Générateur de ZIP "streamé" (format classique, méthode STORE).
 * Les fichiers sont produits à la volée par des async generators :
 * aucune écriture sur disque, aucune mise en mémoire du fichier complet.
 *
 * Chaque entrée utilise un "data descriptor" (bit 3 des flags) pour
 * écrire le CRC et les tailles APRÈS le flux de données — indispensable
 * pour un téléchargement dont on ne connaît pas la taille à l'avance.
 */

export type ZipFileProducer = () => AsyncGenerator<Uint8Array>;

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** CRC32 incrémental (IEEE). Passer le retour précédent comme `crc` pour chaîner. */
export function crc32(buf: Uint8Array, crc = 0): number {
  let c = crc ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

const encoder = new TextEncoder();

export function streamZip(
  files: { name: string; produce: ZipFileProducer }[],
  opts?: {
    /** Si défini, crée ce fichier texte listant les fichiers qui ont échoué. */
    failureFileName?: string;
    onError?: (name: string, message: string) => void;
  }
): { stream: ReadableStream<Uint8Array> } {
  async function* gen() {
    const cd: { name: string; crc: number; size: number; offset: number; flags: number }[] = [];
    let offset = 0;
    const failures: string[] = [];

    for (const file of files) {
      const nameBuf = Buffer.from(file.name, "utf8");
      const header = new Uint8Array(30 + nameBuf.length);
      const dv = new DataView(header.buffer);
      dv.setUint32(0, 0x04034b50, true); // signature local header
      dv.setUint16(4, 20, true); // version nécessaire
      dv.setUint16(6, 0x0808, true); // flags : data descriptor + noms UTF-8
      dv.setUint16(8, 0, true); // méthode STORE
      dv.setUint16(10, 0, true); // heure
      dv.setUint16(12, 0x0021, true); // date DOS (1980-01-01)
      // crc / csize / usize = 0 (remplis via data descriptor)
      dv.setUint16(26, nameBuf.length, true);
      dv.setUint16(28, 0, true);
      header.set(nameBuf, 30);

      let crc = 0;
      let size = 0;
      let fileStart = 0;
      let started = false;

      try {
        for await (const chunk of file.produce()) {
          if (!started) {
            fileStart = offset;
            offset += header.length;
            started = true;
            yield header;
          }
          crc = crc32(chunk, crc);
          size += chunk.length;
          yield chunk;
          offset += chunk.length;
        }
      } catch (e) {
        if (started) throw e; // flux interrompu au milieu → ZIP corrompu, on abandonne
        const msg = (e as Error).message;
        failures.push(`- ${file.name} : ${msg}`);
        opts?.onError?.(file.name, msg);
        continue;
      }

      if (started) {
        const desc = new Uint8Array(16);
        const dd = new DataView(desc.buffer);
        dd.setUint32(0, 0x08074b50, true); // signature data descriptor
        dd.setUint32(4, crc, true);
        dd.setUint32(8, size, true);
        dd.setUint32(12, size, true);
        yield desc;
        offset += 16;
        cd.push({ name: file.name, crc, size, offset: fileStart, flags: 0x0808 });
      }
    }

    // Rapport des échecs intégré à l'archive.
    if (failures.length > 0 && opts?.failureFileName) {
      const text = "# Vidéos non téléchargées\n\n" + failures.join("\n") + "\n";
      yield* emitStored(opts.failureFileName, encoder.encode(text));
    }

    const cdOffset = offset;
    let cdSize = 0;
    for (const entry of cd) {
      const nameBuf = Buffer.from(entry.name, "utf8");
      const e = new Uint8Array(46 + nameBuf.length);
      const dv = new DataView(e.buffer);
      dv.setUint32(0, 0x02014b50, true); // signature central directory
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 20, true);
      dv.setUint16(8, entry.flags, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0, true);
      dv.setUint16(14, 0x0021, true);
      dv.setUint32(16, entry.crc, true);
      dv.setUint32(20, entry.size, true);
      dv.setUint32(24, entry.size, true);
      dv.setUint16(28, nameBuf.length, true);
      dv.setUint16(30, 0, true);
      // Offset du local header : SANS cette valeur, tous les fichiers pointent
      // vers la première entrée → archive « cassée » (entrées qui se chevauchent).
      dv.setUint32(42, entry.offset, true);
      e.set(nameBuf, 46);
      yield e;
      cdSize += e.length;
    }

    const eocd = new Uint8Array(22);
    const dv = new DataView(eocd.buffer);
    dv.setUint32(0, 0x06054b50, true); // signature end of central directory
    dv.setUint16(8, cd.length, true);
    dv.setUint16(10, cd.length, true);
    dv.setUint32(12, cdSize, true);
    dv.setUint32(16, cdOffset, true);
    yield eocd;

    /** Émet une entrée dont la taille est connue (sans data descriptor). */
    async function* emitStored(name: string, data: Uint8Array) {
      const nameBuf = Buffer.from(name, "utf8");
      const header = new Uint8Array(30 + nameBuf.length);
      const dv = new DataView(header.buffer);
      dv.setUint32(0, 0x04034b50, true);
      dv.setUint16(4, 20, true);
      dv.setUint16(6, 0x0800, true);
      dv.setUint16(8, 0, true);
      dv.setUint16(10, 0, true);
      dv.setUint16(12, 0x0021, true);
      dv.setUint32(14, crc32(data), true);
      dv.setUint32(18, data.length, true);
      dv.setUint32(22, data.length, true);
      dv.setUint16(26, nameBuf.length, true);
      dv.setUint16(28, 0, true);
      header.set(nameBuf, 30);
      const start = offset;
      yield header;
      offset += header.length;
      yield data;
      offset += data.length;
      cd.push({ name, crc: crc32(data), size: data.length, offset: start, flags: 0x0800 });
    }
  }

  const iter = gen();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { value, done } = await iter.next();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (e) {
        controller.error(e);
      }
    },
    cancel() {
      iter.return?.().catch(() => {});
    },
  });

  return { stream };
}
