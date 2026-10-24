/** One immutable request per form session. Failed/ambiguous saves retry that same request. */
export function createSubmissionController<Input, Result>(
  save: (snapshot: Input, requestId: string) => Promise<Result>,
  randomId: () => string = () => crypto.randomUUID(),
) {
  let snapshot: Input | undefined;
  let requestId: string | undefined;
  let pending: Promise<Result> | null = null;
  let result: Result | undefined;
  return {
    get snapshot() {
      return snapshot === undefined ? undefined : structuredClone(snapshot);
    },
    submit(input: Input): Promise<Result> {
      if (result !== undefined) return Promise.resolve(result);
      if (pending) return pending;
      if (snapshot === undefined) {
        snapshot = structuredClone(input);
        requestId = randomId();
      }
      const frozen = snapshot;
      pending = Promise.resolve()
        .then(() => save(frozen, requestId!))
        .then((saved) => {
          result = saved;
          return saved;
        })
        .finally(() => {
          pending = null;
        });
      return pending;
    },
  };
}
