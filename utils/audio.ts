
/**
 * Encodes raw audio data (Uint8Array) into a Base64 string.
 * This is necessary for sending audio data in the correct format to the Gemini API.
 * @param {Uint8Array} bytes The raw audio data.
 * @returns {string} The Base64 encoded audio data.
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
