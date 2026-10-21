// stdout is the MCP JSON-RPC channel (stdio transport); a stray console.log from our code or a
// dependency would corrupt it. Side-effect-only module: `main.ts` imports it as its first import.
console.log = console.error;
console.info = console.error;
console.debug = console.error;
