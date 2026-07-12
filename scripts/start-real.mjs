/** Local convenience launcher: forces OKTA_CLIENT_MODE=real before starting the server. */
process.env.OKTA_CLIENT_MODE = "real";
await import(new URL("../dist/index.js", import.meta.url).href);
