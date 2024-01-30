export function loadStylesheet(
  url: string,
  options?: { type?: string | null } | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    options = options ?? {};
    let link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = url;
    if (options.type != null) link.type = options.type;

    link.onload = () => resolve();
    link.onerror = () => reject(new Error(`Failed to load stylesheet '${url}'`));
    document.head.appendChild(link);
  });
}

export function loadScript(
  url: string,
  options?: { type?: string | null; async?: boolean | null } | null,
): Promise<void> {
  return new Promise((resolve, reject) => {
    options = options ?? {};
    let script = document.createElement('script');
    script.src = url;
    if (options.type != null) script.type = options.type;
    if (options.async != null) script.async = options.async;

    script.onload = () => resolve();
    script.onerror = () => reject(new Error(`Failed to load script '${url}'`));
    document.body.appendChild(script);
  });
}
