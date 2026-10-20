/** Explicitly reapply an extension for each actual material revision, instead of inheriting a stale binder. */
export function extendMaterialCompiler(definition, transform) {
  const bind = (sources) => {
    const current = definition.bindMaterialContracts(sources);
    return {
      ...current,
      bindMaterialContracts: bind,
      compile: (input) => transform(current.compile(input)),
    };
  };
  return {
    ...definition,
    bindMaterialContracts: bind,
    compile: (input) => transform(definition.compile(input)),
  };
}
