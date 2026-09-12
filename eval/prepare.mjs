import { dataset } from "./score.mjs";

// Public tasks omit ground truth; do not load dataset.json into the reviewer.
console.log(JSON.stringify({ schemaVersion: 1, dataset: dataset.id,
  cases: dataset.cases.map(({file,source,requirement}, index) => ({
    caseId:`task-${String(index + 1).padStart(2,"0")}`,file,source,requirement
  }))
}, null, 2));
