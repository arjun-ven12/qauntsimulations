# Domain model

The tenancy root is `Organisation`; users join through role-bearing memberships. Projects group environments, journeys, scenarios, invariants, and investigations.

An investigation creates versioned experiment plans. Each plan produces worlds (counterfactual configurations), each world produces experiments, and each execution attempt is assigned to a worker. Evidence metadata and invariant evaluations remain attached to experiments. Reproduced violations become findings, minimal reproductions, repairs, and verification runs.

Historical knowledge is stored as scored memory records with optional embeddings. Retrieval is advisory: current execution evidence always overrides memory.
