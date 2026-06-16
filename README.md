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

## Instalação do Datadog (Step Functions)

Step Functions é um serviço totalmente gerenciado — o Datadog Agent não pode ser instalado diretamente. O Datadog monitora Step Functions via **métricas do CloudWatch** e **logs do CloudWatch**.

> **Como funciona:** O Datadog coleta logs do CloudWatch (via Forwarder ou Amazon Data Firehose) e gera enhanced metrics + traces a partir deles.

### Requisitos

- Execução completa da Step Function deve ter menos de 6 horas
- [AWS Step Functions Integration](https://docs.datadoghq.com/integrations/amazon_step_functions) instalada no Datadog
- [Datadog Lambda Forwarder](https://docs.datadoghq.com/logs/guide/forwarder) v3.130.0+ (ou Amazon Data Firehose)

### 1. Instalar o plugin

```bash
npm install --save-dev serverless-step-functions
```

### 2. Habilitar logging na State Machine

O log group deve seguir o padrão `/aws/vendedlogs/states/<NOME>-Logs`:

```yaml
stepFunctions:
  stateMachines:
    orderProcessing:
      name: order-processing-${sls:stage}
      tags:
        DD_TRACE_ENABLED: 'true'
        env: ${self:custom.env}
        service: ${self:custom.service}
        version: ${self:custom.version}
      loggingConfig:
        level: ALL
        includeExecutionData: true
        destinations:
          - Fn::GetAtt: [OrderProcessingLogGroup, Arn]

resources:
  Resources:
    OrderProcessingLogGroup:
      Type: AWS::Logs::LogGroup
      Properties:
        LogGroupName: /aws/vendedlogs/states/order-processing-${sls:stage}-Logs
        RetentionInDays: 14
```

### 3. Tags obrigatórias na State Machine

| Tag | Valor | Descrição |
|-----|-------|-----------|
| `DD_TRACE_ENABLED` | `true` | Habilita tracing para esta Step Function |
| `env` | `dev` | Ambiente (obrigatório para ver traces) |
| `service` | `aws-serverless-datadog` | Nome do serviço |
| `version` | `1.0.0` | Versão do deploy |

### 4. Subscrever o Forwarder ao Log Group

O Datadog Lambda Forwarder precisa estar subscrito ao CloudWatch Log Group:

- **Automática:** AWS Integration tile → Configuration → Log Collection → Autosubscribe → toggle "Step Functions CloudWatch Logs"
- **Manual:** Forwarder Lambda → Add trigger → CloudWatch Logs → `/aws/vendedlogs/states/order-processing-dev-Logs`
- **Amazon Data Firehose:** Alternativa ao Forwarder (requer log group começando com `/aws/vendedlogs/states/`)

### 5. Instrumentar as Lambdas dos Steps

Cada Lambda invocada pela Step Function usa as Layers Datadog:

```yaml
functions:
  processOrder:
    handler: /opt/nodejs/node_modules/datadog-lambda-js/handler.handler
    environment:
      DD_LAMBDA_HANDLER: src/steps/processOrder.handler
    layers: ${self:custom.datadogLayers}

  sendNotification:
    handler: /opt/nodejs/node_modules/datadog-lambda-js/handler.handler
    environment:
      DD_LAMBDA_HANDLER: src/steps/sendNotification.handler
    layers: ${self:custom.datadogLayers}
```

### 6. Instrumentação no código dos Steps

```javascript
const tracer = require('dd-trace').init();
const StatsD = require('hot-shots');

const dogstatsd = new StatsD({ host: '127.0.0.1', port: 8125 });

function log(level, message, extra = {}) {
  const span = tracer.scope().active();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    dd: {
      trace_id: span ? span.context().toTraceId() : '0',
      span_id: span ? span.context().toSpanId() : '0',
      env: process.env.DD_ENV,
      service: process.env.DD_SERVICE,
      version: process.env.DD_VERSION,
    },
    ...extra,
  };
  process.stdout.write(JSON.stringify(entry) + '\n');
}

module.exports.handler = async (event) => {
  log('info', 'Step started', { orderId: event.orderId });
  dogstatsd.increment('step_function.my_step.invocations');

  // lógica de negócio aqui

  log('info', 'Step completed', { orderId: event.orderId });
  return { ...event, status: 'done', completedAt: new Date().toISOString() };
};
```

### 7. Deploy

```bash
export DD_API_KEY="sua-api-key"
npx serverless deploy --stage dev
```

### 8. Testar a execução

```bash
aws stepfunctions start-execution \
  --state-machine-arn arn:aws:states:us-east-1:<ACCOUNT_ID>:stateMachine:order-processing-dev \
  --input '{"orderId": "123"}' \
  --profile danilo-profile \
  --region us-east-1
```

### Arquitetura de Observabilidade (Step Functions)

```
Step Function (order-processing-dev)
  │
  ├── Tags: DD_TRACE_ENABLED=true, env=dev, service=aws-serverless-datadog
  │
  ├── CloudWatch Logs (/aws/vendedlogs/states/order-processing-dev-Logs)
  │     └── Datadog Forwarder (ou Firehose) → Datadog
  │           ├── Enhanced Metrics (duração, erros, throttles)
  │           └── Traces (execução completa como trace distribuído)
  │
  ├── ProcessOrder Lambda
  │     ├── dd-trace (span com trace_id)
  │     ├── hot-shots → DogStatsD → Extension → Datadog
  │     └── stdout JSON → Extension → Datadog Logs
  │
  └── SendNotification Lambda
        ├── dd-trace (span com trace_id)
        ├── hot-shots → DogStatsD → Extension → Datadog
        └── stdout JSON → Extension → Datadog Logs
```

### Verificação no Datadog (Step Functions)

1. **Serverless App** → Buscar `service:aws-serverless-datadog` na aba Step Functions
2. **APM → Traces** → Traces das execuções com spans de cada step
3. **Logs** → Logs das Lambdas com `dd.trace_id` correlacionados
4. **Metrics → Explorer** → Enhanced metrics + métricas customizadas
5. **AWS Integration → Step Functions** → Métricas nativas do CloudWatch

> 📄 Referência: [Datadog Step Functions Installation](https://docs.datadoghq.com/serverless/step_functions/installation/)

---

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
├── serverless.yml              # Configuração Lambda + Step Function + Layers Datadog
├── src/
│   ├── handler.js              # Handler standalone com dd-trace e hot-shots
│   └── steps/
│       ├── processOrder.js     # Step 1 — processa o pedido
│       └── sendNotification.js # Step 2 — envia notificação
├── docs/
│   └── datadog-agent-setup.html
├── package.json
└── README.md
```
