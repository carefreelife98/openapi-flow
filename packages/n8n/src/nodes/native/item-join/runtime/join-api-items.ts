import type {
  ItemJoinGroup,
  ItemJoinOutputItem,
  JoinApiItemsInput,
} from '../../../../types/item-join.js';

/** Join only reader-attested ancestry, never JSON business fields or stream positions. */
export function joinApiItems({
  items,
  sourceCallIds,
}: JoinApiItemsInput): ItemJoinOutputItem[] {
  if (
    sourceCallIds.length < 2 ||
    new Set(sourceCallIds).size !== sourceCallIds.length
  )
    throw new Error('item join requires unique sourceCallIds');
  const groups = new Map<number, ItemJoinGroup>();
  for (const [inputIndex, item] of items.entries()) {
    const row = item.json;
    if (!row || !Number.isInteger(row.scopeIndex) || row.scopeIndex < 0)
      throw new Error(
        `item join input ${inputIndex}: scopeIndex is missing or invalid`,
      );
    if (!sourceCallIds.includes(row.sourceCallId))
      throw new Error(
        `item join input ${inputIndex}: unknown sourceCallId ${row.sourceCallId}`,
      );
    if (!Object.hasOwn(row, 'response') || row.response === undefined)
      throw new Error(`item join input ${inputIndex}: response is missing`);
    let group = groups.get(row.scopeIndex);
    if (!group) {
      group = { values: new Map(), inputIndexes: [] };
      groups.set(row.scopeIndex, group);
    }
    if (group.values.has(row.sourceCallId))
      throw new Error(
        `item join scope item ${row.scopeIndex}: duplicate response ${row.sourceCallId}`,
      );
    group.values.set(row.sourceCallId, row.response);
    group.inputIndexes.push(inputIndex);
  }
  for (const [scopeIndex, group] of groups)
    for (const id of sourceCallIds)
      if (!group.values.has(id))
        throw new Error(
          `item join scope item ${scopeIndex}: missing response ${id}`,
        );
  return [...groups]
    .sort(([left], [right]) => left - right)
    .map(([, group]) => ({
      json: {
        responses: Object.fromEntries(
          sourceCallIds.map((id) => [id, group.values.get(id)!]),
        ),
      },
      pairedItem: group.inputIndexes.map((item) => ({ item })),
    }));
}
