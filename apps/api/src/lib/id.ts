export const uid = (prefix = ""): string => `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
