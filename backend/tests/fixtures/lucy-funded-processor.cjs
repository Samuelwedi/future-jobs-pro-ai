// Legacy worker/HTTP fixtures inject fake processors but still exercise explicit
// provider selection. No provider, model, budget grant or expiring rate card is used.
process.env.LUCY_BACKGROUND_PROVIDER = 'self_hosted';
process.env.LUCY_BACKGROUND_LLM_BASE_URL = 'http://127.0.0.1:1/v1';
process.env.LUCY_BACKGROUND_LLM_MODEL = 'offline-fixture';
