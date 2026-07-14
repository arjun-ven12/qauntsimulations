# AI provider abstraction

Business services depend on `AIProvider`, not a vendor SDK. All provider outputs cross Zod validation before use. The interface supports experiment planning, invariant compilation, finding explanation, follow-up generation, and evidence summary.

OpenAI is the implemented remote adapter and reads separate planner, explanation, and vision model names. Kimi implements the port shape but intentionally throws a clear not-implemented error. The factory returns `MockAIProvider` whenever configured credentials are unavailable, preserving a runnable local flow.

Nosana is separate because GPU/visual execution is a different concern. No provider may persist hidden chain-of-thought; only concise explanations and cited observations are stored.
