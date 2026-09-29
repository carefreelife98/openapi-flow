import { z } from 'zod';
import { isJsonLiteral } from './json-literal.js';

export function createOperationPlanSchema(
  inputNames: string[],
  responseNames: string[],
) {
  // An empty enum has no valid value; keep the wire schema usable and reject bindings locally.
  const inputKey = inputNames.length
    ? z
        .enum([inputNames[0], ...inputNames.slice(1)])
        .describe(
          'An exact request input key from the selected operation, such as path.id, query.page, body, or body.name.',
        )
    : z
        .string()
        .refine((key) => inputNames.includes(key), {
          message: 'The selected operation has no request input keys.',
        })
        .describe('No request input keys are available for this operation.');
  const responseKey = responseNames.length
    ? z
        .enum([responseNames[0], ...responseNames.slice(1)])
        .describe(
          'An exact response-body field name declared by the selected operation.',
        )
    : z
        .string()
        .refine((key) => responseNames.includes(key), {
          message: 'The selected operation has no response-body field names.',
        })
        .describe('No response-body field names are available.');
  const valueJson = z.string().refine(isJsonLiteral, {
    message: 'valueJson must be a valid JSON literal encoded as a string.',
  });

  return z
    .object({
      inputs: z
        .array(
          z
            .object({
              key: inputKey,
              valueJson: valueJson.describe(
                'The explicitly supplied input value encoded as a JSON literal string. For example: "42", true, [1,2], or {"name":"demo"}. Do not invent a value.',
              ),
            })
            .strict()
            .describe(
              'One explicitly supplied value for an OpenAPI request input.',
            ),
        )
        .describe(
          'Request parameter and body values explicitly provided by the scenario. Return an empty array if none are provided.',
        ),
      expectedBody: z
        .array(
          z
            .object({
              key: responseKey,
              valueJson: valueJson.describe(
                'The explicitly expected response-body value encoded as a JSON literal string. For example: true, 200, or ["a","b"]. Do not invent an assertion.',
              ),
            })
            .strict()
            .describe(
              'One explicitly requested OpenAPI response-body assertion.',
            ),
        )
        .describe(
          'Response-body field assertions explicitly requested by the scenario. Return an empty array if none are requested.',
        ),
    })
    .strict()
    .describe(
      'Values and response-body assertions explicitly stated in the scenario for the selected OpenAPI operation.',
    );
}
