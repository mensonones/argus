#!/usr/bin/env node
import { startServer } from "../mcp.js";
startServer().catch((err) => {
    console.error(err);
    process.exit(1);
});
