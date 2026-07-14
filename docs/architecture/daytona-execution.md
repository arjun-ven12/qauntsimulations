# Daytona execution

`SandboxProvider` isolates the API from Daytona. It defines sandbox creation, file transfer, command/process execution, logs, artifact download, status, stop, and deletion. The Daytona adapter is a typed boundary awaiting SDK binding; the mock is functional for local product development.

The sandbox payload is the compiled standalone Playwright worker plus one `WorkerJob`. The worker validates input, runs with a hard timeout, emits evidence and a validated `WorkerResult`, and then the API stores metadata before deleting the sandbox. Cleanup jobs handle abandoned sandboxes.
