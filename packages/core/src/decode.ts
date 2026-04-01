export function decode(data: Uint8Array): string {
  const decoder = new TextDecoder("shift_jis")
  return decoder.decode(data)
}
