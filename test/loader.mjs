export function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('/shared/')) {
    return nextResolve(new URL('../shared/' + specifier.slice('/shared/'.length), import.meta.url).href, context);
  }
  return nextResolve(specifier, context);
}
