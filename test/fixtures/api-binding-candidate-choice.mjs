import assert from 'node:assert/strict';

function selectionsFor(template, pointer) {
  const tokens =
    pointer === ''
      ? []
      : pointer
          .slice(1)
          .split('/')
          .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
  const selections = {};
  let cursor = 0;
  for (const segment of template.segments) {
    const token = tokens[cursor++];
    if (segment.kind === 'property') {
      if (token !== segment.value) return undefined;
    } else if (segment.kind === 'index') {
      if (token === undefined || !/^(0|[1-9][0-9]*)$/.test(token))
        return undefined;
      selections['s' + Object.keys(selections).length] = Number(token);
    } else if (segment.kind === 'key') {
      if (
        token === undefined ||
        segment.excludedKeys?.includes(token) ||
        segment.excludedPatterns?.some((pattern) =>
          new RegExp(pattern).test(token),
        )
      )
        return undefined;
      selections['s' + Object.keys(selections).length] = token;
    } else {
      if (token === undefined) return undefined;
      selections['s' + Object.keys(selections).length] = tokens.slice(
        cursor - 1,
      );
      cursor = tokens.length;
    }
  }
  return cursor === tokens.length ? selections : undefined;
}

/** Test-only encoder: the expected binding is independent of the production decoder. */
export function candidateChoices(context, bindings) {
  const candidates =
    context.bindingSourceFields === undefined
      ? context.bindingCandidates
      : context.bindingCandidates.map((candidate) => {
          const source = context.bindingSourceFields.find(
            (field) => field.id === candidate.sourceId,
          );
          const target = context.bindingTargetFields.find(
            (field) => field.id === candidate.targetId,
          );
          assert.ok(source);
          assert.ok(target);
          return {
            id: candidate.id,
            sourceNodeId: source.nodeId,
            source,
            target,
          };
        });
  return bindings.map((binding) => {
    const matches = candidates
      .filter((candidate) => candidate.sourceNodeId === binding.sourceNodeId)
      .flatMap((candidate) => {
        const sourceSelections = selectionsFor(
          candidate.source,
          binding.sourcePointer,
        );
        const targetSelections = selectionsFor(
          candidate.target,
          binding.targetPointer,
        );
        return sourceSelections === undefined || targetSelections === undefined
          ? []
          : [{ candidateId: candidate.id, sourceSelections, targetSelections }];
      });
    assert.ok(matches.length, `No candidate for ${JSON.stringify(binding)}`);
    matches.sort(
      (left, right) =>
        Object.keys(left.sourceSelections).length +
        Object.keys(left.targetSelections).length -
        Object.keys(right.sourceSelections).length -
        Object.keys(right.targetSelections).length,
    );
    return matches[0];
  });
}
