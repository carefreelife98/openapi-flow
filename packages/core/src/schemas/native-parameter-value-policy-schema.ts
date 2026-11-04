import { z } from 'zod';

/** Capability-owned paths. A * segment matches one array index, never an arbitrary object key. */
const path = z.string().regex(/^(?:\/(?:[^~]|~[01])*)?$/u);
export const nativeParameterValuePolicySchema = z
  .strictObject({
    businessInputPaths: z.array(path),
    generatedTextPaths: z.array(path),
  })
  .superRefine((policy, ctx) => {
    for (const paths of [policy.businessInputPaths, policy.generatedTextPaths])
      if (new Set(paths).size !== paths.length)
        ctx.addIssue({
          code: 'custom',
          message: 'Native parameter value policy paths must be distinct',
        });
    for (const business of policy.businessInputPaths)
      for (const generated of policy.generatedTextPaths) {
        const left = business === '' ? [] : business.split('/').slice(1);
        const right = generated === '' ? [] : generated.split('/').slice(1);
        const overlap = left
          .slice(0, Math.min(left.length, right.length))
          .every(
            (token, index) =>
              token === right[index] ||
              (token === '*' && /^(0|[1-9]\d*|\*)$/u.test(right[index])) ||
              (right[index] === '*' && /^(0|[1-9]\d*|\*)$/u.test(token)),
          );
        if (overlap)
          ctx.addIssue({
            code: 'custom',
            message:
              'Native parameter value policy business inputs and generated text must not overlap',
          });
      }
  });
