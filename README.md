# AWS Serverless Datadog — Observabilidade Ponta a Ponta

| Tag | Valor |
|-----|-------|
| `env` | dev |
| `service` | aws-serverless-datadog |
| `version` | 1.0.0 |
| `runtime` | nodejs22.x |
| `region` | us-east-1 |
| `language` | JavaScript |
| `iac` | Serverless Framework (YAML) |

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

## Instalação do Datadog (Lambda)

A instrumentação Datadog em Lambda é feita via **Lambda Layers** — não há pacote para instalar via npm.

### 1. Adicionar as Layers no `serverless.yml`

```yaml
functions:
  hello:
    handler: /opt/nodejs/node_modules/datadog-lambda-js/handler.handler
    layers:
      # Extension — coleta e envia logs, métricas e traces via HTTP
      - arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:65
      # Tracer Node.js — instrumentação APM automática (dd-trace)
      - arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node22-x:113
```

### 2. Configurar variáveis de ambiente

```yaml
provider:
  environment:
    DD_ENV: dev
    DD_SERVICE: aws-serverless-datadog
    DD_VERSION: '1.0.0'
    DD_TRACE_ENABLED: 'true'
    DD_LAMBDA_HANDLER: src/handler.hello       # handler real da aplicação
    DD_SERVERLESS_LOGS_ENABLED: 'true'         # logs via Extension (sem Forwarder)
    DD_API_KEY: ${env:DD_API_KEY}              # chave da API Datadog
```

### 3. Redirecionar o handler

O `handler` da função aponta para o wrapper do Datadog:

```
/opt/nodejs/node_modules/datadog-lambda-js/handler.handler
```

O wrapper lê `DD_LAMBDA_HANDLER` para invocar o handler real (`src/handler.hello`).

### 4. Instrumentação no código

```javascript
const tracer = require('dd-trace').init();         // APM — fornecido pela Layer
const StatsD = require('hot-shots');               // métricas customizadas via DogStatsD

const dogstatsd = new StatsD({ host: '127.0.0.1', port: 8125 });
```

- `dd-trace` vem da Layer (não precisa instalar via npm em produção, mas está no `package.json` para desenvolvimento local).
- `hot-shots` envia métricas customizadas para a Extension na porta 8125.

### 5. Deploy

```bash
export DD_API_KEY="sua-api-key"
npx serverless deploy --stage dev
```

### Resumo das Layers

| Layer | ARN | Função |
|-------|-----|--------|
| Extension | `arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Extension:65` | Coleta e envia logs, métricas e traces |
| Tracer Node22 | `arn:aws:lambda:us-east-1:464622532012:layer:Datadog-Node22-x:113` | Instrumentação APM automática |

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
