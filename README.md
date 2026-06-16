# AWS Serverless Datadog — Observabilidade Ponta a Ponta

| Tag | Valor |
|-----|-------|
| `env` | dev |
| `service` | aws-serverless-datadog |
| `version` | 1.0.0 |
| `runtime` | nodejs22.x |
| `region` | us-east-1 |

## Pré-requisitos

- Node.js 18+
- AWS CLI configurado com profile `danilo-profile`
- Serverless Framework v3
- Variáveis de ambiente `DD_API_KEY` e `DD_APP_KEY` exportadas

## Configuração de credenciais

```bash
# AWS (já configurado em ~/.aws/credentials com profile danilo-profile)
aws configure --profile danilo-profile

# Datadog — exporte antes do deploy
export DD_API_KEY="sua-api-key"
export DD_APP_KEY="sua-app-key"
```

## Deploy

```bash
npm install
npx serverless deploy --stage dev
```

## Instalação do Agent Datadog (Lambda)

O agent Datadog em Lambda funciona via **Layers** (sem instalação de pacote):

| Layer | Função |
|-------|--------|
| `Datadog-Extension:65` | Envia logs, métricas e traces via HTTP |
| `Datadog-Node22-x:113` | Instrumentação APM automática (dd-trace) |

O handler aponta para o wrapper da Datadog (`/opt/nodejs/node_modules/datadog-lambda-js/handler.handler`) e a variável `DD_LAMBDA_HANDLER` indica o handler real (`src/handler.hello`).

> 📄 Documentação detalhada: [docs/datadog-agent-setup.html](docs/datadog-agent-setup.html)

## Verificação no Datadog

1. **Logs** → Filtre por `service:aws-serverless-datadog` — cada log contém `dd.trace_id` e `dd.span_id`
2. **APM → Traces** → Spans com `operation_name:aws.lambda`, correlação com logs
3. **Metrics → Explorer** → `business.request.count` com tags `env`, `service`, `version`

## Arquitetura de Observabilidade

```
Lambda Handler
  ├── dd-trace (APM nativo, injeta trace_id/span_id nos logs)
  ├── hot-shots → DogStatsD (porta 8125) → Extension → Datadog
  └── stdout JSON → Extension (DD_SERVERLESS_LOGS_ENABLED) → Datadog
```

Sem Forwarder. A Extension envia logs, métricas e traces diretamente via HTTP.

## Estrutura do Projeto

```
aws-serverless/
├── serverless.yml          # Configuração Lambda + Layers Datadog
├── src/handler.js          # Handler com dd-trace e hot-shots
├── docs/
│   └── datadog-agent-setup.html  # Documentação completa de instalação
├── package.json
└── README.md
```
