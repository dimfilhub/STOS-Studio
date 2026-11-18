/**
 * The Atari ST character set. STOS reads and writes text in it, so the .asc file must use it too:
 * bytes 32-126 are plain ASCII, bytes 128-255 are the accented letters and symbols below
 * (for example "é" is byte 0x82). This is the standard Atari ST character map (as in Unicode's
 * ATARIST.TXT mapping table).
 */

/** Characters 0x80 to 0xFF, sixteen per line. */
const HIGH =
    'ÇüéâäàåçêëèïîìÄÅ' +   // 0x80
    'ÉæÆôöòûùÿÖÜ¢£¥ßƒ' +   // 0x90
    'áíóúñÑªº¿⌐¬½¼¡«»' +   // 0xA0
    'ãõØøœŒÀÃÕ¨´†¶©®™' +   // 0xB0
    'ĳĲאבגדהוזחטיכלמנ' +   // 0xC0 (0xC2-0xDC: Hebrew letters)
    'סעפצקרשתןךםףץ§∧∞' +   // 0xD0
    'αβΓπΣσµτΦΘΩδ∮ϕ∈∩' +   // 0xE0
    '≡±≥≤⌠⌡÷≈°∙·√ⁿ²³¯';    // 0xF0

/** Character -> byte, for the characters above 127. */
const BYTE_OF = new Map<string, number>([...HIGH].map((ch, i) => [ch, 0x80 + i]));

/** The Atari ST byte for one character, or undefined if the character set does not have it. */
export function atariByte(ch: string): number | undefined {
    const code = ch.codePointAt(0)!;
    if (code >= 32 && code <= 126) { return code; }
    if (ch === '\r' || ch === '\n') { return code; }
    return BYTE_OF.get(ch);
}

/** Text -> bytes in the Atari ST character set. Throws on a character it does not have (check first). */
export function encodeAtari(text: string): Buffer {
    const bytes: number[] = [];
    for (const ch of text) {
        const b = atariByte(ch);
        if (b === undefined) { throw new Error(`character "${ch}" is not in the Atari ST character set`); }
        bytes.push(b);
    }
    return Buffer.from(bytes);
}

/** Bytes in the Atari ST character set -> text (the opposite of encodeAtari). */
export function decodeAtari(bytes: Buffer): string {
    let text = '';
    for (const b of bytes) { text += b >= 0x80 ? HIGH[b - 0x80] : String.fromCharCode(b); }
    return text;
}
