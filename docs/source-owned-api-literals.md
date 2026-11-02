# Source-owned API literal selection

Tracked `generateApiArguments` calls select original sources rather than generating both request values and evidence for those values. Core copies the selected value once, preserves its JSON type, and validates the result against the operation's literal input contract. The public `ApiCallArguments` result still contains `values` and verified `literalSources`.

## Model wire contract

The tracked `provided` branch contains `literalSources` only:

```json
{
  "literalInputs": {
    "state": "provided",
    "literalSources": [
      {
        "targetPointer": "/path/id",
        "sourceFormat": "json",
        "candidateId": "<original candidate ID from this input's choices>"
      }
    ]
  },
  "requestedInputs": ["/path/id"]
}
```

`literalSourceChoices` groups model-visible JSON candidates by original message and input root. Root candidates must satisfy the OAS-derived literal value schema. A numeric token cannot be selected for a string root. Object, array, open and referenced contracts can expose descendant choices; concrete descendant assignments remain OAS-validated. Candidate existence does not establish user intent: the selected call role and original request still govern which value the model may select.

For an unquoted string, the model supplies one exact `sourceText` span with `sourceFormat: "text"`. Core checks its complete occurrence in the original message and uses that text as the value. A separate `values` field is forbidden. Quoted JSON values require JSON candidates; they are not decoded through the text branch. Multiple messages require an explicit original `messageId`; a single message's identity remains code-owned.

An explicit `not-provided` decision still produces no literal values. Missing inputs remain questions or explicit runtime slots. Confirmed inputs and preceding-node bindings keep their existing ownership. Untracked generation remains a separate existing API mode, not a compatibility fallback for an invalid tracked response.

## Core boundary

`resolveApiLiteralValues` resolves selections against their original messages, assigns values using OAS-owned container identities, checks the projected literal contract, and verifies source coverage. It rejects unknown candidates, unavailable messages, duplicate or overlapping assignments, sparse arrays, forbidden fields and incompatible types. It does not convert types, replace a selected source, invent an absent input, or retry a model call.

The earlier `resolveApiLiteralSourceSelections` API remains available for consumers that already hold values and need to verify attribution. Tracked generation no longer uses that two-input construction path.

## Source token boundaries

An explicit assignment boundary such as `sequence=0` must expose the complete original numeric token. The scanner resumes after `=` even when the JSON scanner initially treats a prose assignment as one token. Signs, fractional parts, exponents, malformed number-like runs and quoted-string protection remain intact. This change does not infer the target request field or supply an OAS default.

## Compatibility and verification

Custom models, mocks and recorded provider responses for tracked generation must remove `literalInputs.values`. Text selections must provide `sourceText` once. The model context changes from an unscoped `literalJsonSources` list to `literalSourceChoices`. There is no old-wire recovery branch. Returned request values, original source receipts, cancellation and host-owned retry policy keep their existing responsibilities.

Regression coverage includes original typed values, empty strings and containers, false and zero, partial inputs, source identity, confirmed inputs, binding ownership, source mutation, explicit rejection feedback, source-only HTTP wire schemas, and numeric assignment boundaries. Passing source extraction does not prove semantic intent, a generated workflow's execution, or service deployment.

Local implementation verification: 86 focused tests passed; the full suite passed 1897 of 1898 tests, retaining the previously documented Ajv `__proto__` regression. Build, typecheck, lint and formatting passed. A private consumer evaluated six original API argument tasks with a real model: all six matched supplied values with no unresolved inputs. Private specifications and records are not included here. This is argument-stage verification, not a complete consumer UI or n8n engine run. These checks preceded version preparation; see the [0.6.0 release record](releases/0.6.0.md) for publication validation.
