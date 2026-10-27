export function connectionGoalReviewOutput(description, status = 'covered') {
  return {
    assessments: Object.fromEntries(
      description.requirements.map((fact) => [
        fact.id,
        {
          status,
          goalIds:
            status === 'covered'
              ? description.goals.map((goal) => goal.id)
              : [],
          policyIds: [],
          sourceQuotes: [fact.text],
          reason:
            status === 'covered'
              ? 'The fixture judgment covers the original clauses.'
              : 'The fixture judgment identifies the omitted independent execution clause.',
        },
      ]),
    ),
  };
}
