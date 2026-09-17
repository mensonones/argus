# Codex Tests Reviewer workflow observation

Argus 0.3.0-alpha.1 with Codex cachebuster 20260917101806 was installed before
the user ran a new-session review of argus-tests-lab against main (45a270c).
Only tests was enabled. The user-provided execution summary and saved report
9566a50e-4833-42e5-894a-158c21cbc603 show two candidates, both CONFIRMED,
two singleton reconciliation groups and reviewer completion before reporting.
Both findings are NEW in this fresh laboratory. The names test was not flagged.

During preparation, isolated wrong-behavior controls failed on main and passed
with the changed totals and profiles tests. The names control still failed
correctly; npm test passed 3/3 on both revisions. The report describes the
self-comparison and swallowed asynchronous assertion failure at their test sites.

This is one synthetic workflow observation, not a blinded model evaluation or
production-quality claim. The host build, model and reasoning settings were not
captured. HIGH severity is agent-reported, not independently calibrated here.
Raw artifacts remain in the separate lab; reviewed files and pilot labels were
not rewritten. Do not supply this expected-outcome note to reviewers as task input.
