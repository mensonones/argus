#!/usr/bin/env node
import { main } from "../cli.js";
main(process.argv.slice(2))
    .then((code) => {
    process.exitCode = code;
})
    .catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
