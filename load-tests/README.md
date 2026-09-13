# Capacity testing

Run only against an isolated staging deployment with disposable data. The soak runner defaults to two hours and records database waiters, memory, event-loop delay, process start changes, and Lucy latency from `/api/health`.

```powershell
$env:TARGET_URL = "https://your-staging-service.example"
$env:ALLOW_REMOTE_LOAD_TEST = "YES"
$env:VUS = "100"
$env:DURATION_SECONDS = "7200"
$env:TEST_PATH = "/api/health"
node .\load-tests\soak-runner.mjs
```

Advance 100 → 500 → 1,000 → 5,000 virtual users only after each level passes. One million DAU is tested as expected peak requests per second and concurrent sessions, not by creating one million requests simultaneously. Use distributed generators for tests above one machine's capacity.
