import { createApp } from "./app";
import { createContainer } from "./container";

export { createApp, createContainer };
export type { App } from "./app";
export type { Container } from "./container";

/** Instância única por processo (reaproveitada entre invocações quentes em ambiente serverless). */
let singleton: ReturnType<typeof createApp> | undefined;
export function getApp() {
  singleton ??= createApp(createContainer());
  return singleton;
}
