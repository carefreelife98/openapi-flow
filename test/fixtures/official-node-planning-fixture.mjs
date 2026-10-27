// Synthetic metadata for boundary tests. Real distribution coverage is in integration/official-native-metadata.mjs.
export function officialNodePlanningFixture() {
  const definitions = [
    {
      name: 'fixture.nodes.combine',
      displayName: 'Combine fixture',
      description: 'Synthetic configurable node',
      group: ['transform'],
      version: [1, 2],
      defaultVersion: 2,
      properties: [
        {
          name: 'mode',
          displayName: 'Mode',
          type: 'options',
          default: 'append',
          options: [
            { name: 'Append', value: 'append' },
            {
              name: 'New mode',
              value: 'new',
              displayOptions: { show: { '@version': [2] } },
            },
          ],
        },
        {
          name: 'newOnly',
          displayName: 'New field',
          type: 'string',
          default: 'not-a-user-value',
          displayOptions: { show: { '@version': [2] } },
        },
        {
          name: 'options',
          displayName: 'Options',
          type: 'fixedCollection',
          default: {},
          options: [
            {
              name: 'nested',
              displayName: 'Nested',
              values: [
                {
                  name: 'old',
                  displayName: 'Old',
                  type: 'string',
                  default: '',
                },
                {
                  name: 'new',
                  displayName: 'New',
                  type: 'string',
                  default: '',
                  displayOptions: { show: { '@version': [2] } },
                },
              ],
            },
          ],
        },
      ],
      inputs: '={{ $parameter.numberInputs }}',
      outputs: ['main'],
    },
    {
      name: 'fixture.nodes.trigger',
      displayName: 'Trigger fixture',
      group: ['trigger'],
      version: 1,
      properties: [],
      inputs: [],
      outputs: [{ type: 'main', displayName: 'Output' }],
    },
  ];
  return {
    definitions,
    selections: [
      { nodeType: definitions[0].name, version: 1 },
      { nodeType: definitions[0].name, version: 2 },
      { nodeType: definitions[1].name, version: 1 },
    ],
  };
}
