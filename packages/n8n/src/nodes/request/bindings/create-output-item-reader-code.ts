/** A graph-proven singleton is read as exactly one item, never as an ancestry fallback. */
export function createOutputItemReaderCode(linked: boolean): string {
  const single =
    "const items=$(source.nodeName).all();if(items.length!==1)throw new Error('Response '+source.nodeId+' requires an unambiguous single JSON item; got '+items.length+' items');return items[0];";
  return linked
    ? `const item=source.singleton===true?(()=>{${single}})():$(source.nodeName).itemMatching(inputIndex);`
    : `const item=(()=>{${single}})();`;
}
