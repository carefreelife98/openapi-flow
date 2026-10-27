import { z } from 'zod';

/** Fresh synthetic values and contracts, never a business classification policy. */
export function nativeComparisonFixture() {
  const rowSchema = z.strictObject({
    amount: z.number(),
    enabled: z.boolean(),
    nothing: z.null(),
    code: z.string(),
    values: z.array(z.string()),
    'a/b~c': z.string(),
    optional: z.string().optional(),
  });
  const schema = z.strictObject({ item: rowSchema });
  const source = {
    nodeId: 'joined',
    nodeName: 'Joined original item',
    schema: z.toJSONSchema(schema),
  };
  const rows = [
    {
      item: {
        amount: 0,
        enabled: false,
        nothing: null,
        code: '0007',
        values: ['={{ literal }}'],
        'a/b~c': '',
      },
    },
    {
      item: {
        amount: -2,
        enabled: true,
        nothing: null,
        code: '0008',
        values: [],
        'a/b~c': '={{ original }}',
      },
    },
  ];
  const check = {
    left: {
      source: 'node-output',
      nodeId: source.nodeId,
      pointer: '/item/amount',
    },
    operator: 'greaterThan',
    right: { source: 'literal', value: -1 },
  };
  return {
    rowSchema,
    schema,
    source,
    rows,
    check,
    parameters: { combinator: 'and', conditions: [check] },
  };
}
