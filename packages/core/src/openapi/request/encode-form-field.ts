/** WHATWG form percent-encode set; works in restricted n8n Code VMs too. */
export function encodeFormField(value: string): string {
  return encodeURIComponent(value.toWellFormed())
    .replace(
      /[!'()~]/g,
      (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase(),
    )
    .replaceAll('%20', '+');
}
