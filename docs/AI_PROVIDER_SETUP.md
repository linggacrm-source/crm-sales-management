# AI Command Center Provider Setup

AI Command Center supports multiple providers without changing the frontend.

## Recommended free-tier test

Use Gemini:

AI_PROVIDER=gemini
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.8-flash

The API key must stay server-side. Do not put it in frontend code or commit it to Git.

## Other supported providers

### OpenAI
AI_PROVIDER=openai
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5.6-luna

### Groq
AI_PROVIDER=groq
GROQ_API_KEY=...
GROQ_MODEL=openai/gpt-oss-120b

## Optional endpoint overrides

GEMINI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent
OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
GROQ_API_URL=https://api.groq.com/openai/v1/chat/completions

Normally these are not required.

## Railway

Add the selected provider variables under the service's production environment.

For Gemini:

- AI_PROVIDER=gemini
- GEMINI_API_KEY=<secret>
- GEMINI_MODEL=gemini-3.8-flash

Then redeploy/restart the service.

## Coolify / VPS

The same environment variables are used. This makes the application portable between Railway and Coolify.

When migrating, copy the production environment variables to the Coolify application's Environment Variables. Do not commit secrets to the repository.

The database connection variables are independent from the AI provider. If MongoDB remains on the existing managed MongoDB service, only the application hosting changes.

## Security

The AI Command Center sends a compact, permission-scoped CRM context to the selected AI provider only when a user asks a question.

Free-tier provider policies may allow provider-side use of submitted content to improve their products. For sensitive production CRM data, review the provider's current data-use terms before enabling a free tier in production.
