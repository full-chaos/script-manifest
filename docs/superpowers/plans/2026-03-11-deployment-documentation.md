# Deployment & Documentation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create deployment configs (Docker Swarm, Kubernetes/Helm, raw manifests) and comprehensive documentation (setup guide, deployment guide) for all 15 Script Manifest services.

**Architecture:** Hybrid Helm umbrella chart with per-service subcharts. Infrastructure deps use Bitnami subcharts (local/staging) or external managed services (prod). Docker Swarm stack mirrors compose.prod.yml with overlay networks and secrets. Raw K8s manifests generated from Helm via render.sh.

**Tech Stack:** Helm 3, Kubernetes, Docker Swarm, Kustomize, Bitnami charts (PostgreSQL, Redis)

**Spec:** `docs/superpowers/specs/2026-03-11-deployment-documentation-design.md`

---

## Parallelization Map

Tasks 1–4 are sequential (Helm foundation → subcharts → infra+values → values files).
Task 5 (Swarm) is independent — can run in parallel with Tasks 1–4.
Task 6 (K8s manifests) depends on Tasks 1–4.
Tasks 7–9 (Documentation) depend on all others. Task 10 is final validation.

```
Task 1 (Helm foundation) ──→ Task 2 (subcharts) ──→ Task 3 (infra) ──→ Task 4 (values) ──→ Task 6 (K8s manifests) ──→ Tasks 7-9 (docs) ──→ Task 10 (validate)
Task 5 (Swarm) ──────────────────────────────────────────────────────────────────────────────────────────────────────↗
```

## Chunk 1: Helm Chart Foundation

### Task 1: Umbrella Chart + Canonical Subchart Template

**Files:**
- Create: `deploy/helm/script-manifest/Chart.yaml`
- Create: `deploy/helm/script-manifest/templates/_helpers.tpl`
- Create: `deploy/helm/script-manifest/templates/namespace.yaml`
- Create: `deploy/helm/script-manifest/templates/NOTES.txt`
- Create: `deploy/helm/script-manifest/.helmignore`
- Create: `deploy/helm/script-manifest/charts/notification-service/Chart.yaml`
- Create: `deploy/helm/script-manifest/charts/notification-service/values.yaml`
- Create: `deploy/helm/script-manifest/charts/notification-service/templates/_helpers.tpl`
- Create: `deploy/helm/script-manifest/charts/notification-service/templates/deployment.yaml`
- Create: `deploy/helm/script-manifest/charts/notification-service/templates/service.yaml`
- Create: `deploy/helm/script-manifest/charts/notification-service/templates/configmap.yaml`
- Create: `deploy/helm/script-manifest/charts/notification-service/templates/hpa.yaml`
- Create: `deploy/helm/script-manifest/charts/notification-service/templates/serviceaccount.yaml`

This task creates the umbrella chart and one reference subchart (`notification-service`) that serves as the canonical template for all 15 service subcharts.

- [ ] **Step 1: Create umbrella Chart.yaml**

```yaml
# deploy/helm/script-manifest/Chart.yaml
apiVersion: v2
name: script-manifest
description: Writer-first platform — umbrella Helm chart
type: application
version: 0.1.0
appVersion: "1.0.0"

dependencies:
  # Bitnami infrastructure (pulled from registry)
  - name: postgresql
    version: "16.x.x"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: postgresql.enabled
  - name: redis
    version: "20.x.x"
    repository: oci://registry-1.docker.io/bitnamicharts
    condition: redis.enabled
```

- [ ] **Step 2: Create .helmignore**

```
# deploy/helm/script-manifest/.helmignore
.git
.gitignore
*.md
.DS_Store
```

- [ ] **Step 3: Create umbrella _helpers.tpl**

```yaml
# deploy/helm/script-manifest/templates/_helpers.tpl
{{/*
Global registry helper. Resolves image reference from global + subchart values.
Usage: {{ include "script-manifest.image" (dict "global" .Values.global "image" .Values.image) }}
*/}}
{{- define "script-manifest.image" -}}
{{- $registry := .global.registry | default "ghcr.io/full-chaos/script-manifest" -}}
{{- $tag := .image.tag | default .global.imageTag | default "latest" -}}
{{- printf "%s/%s:%s" $registry .image.repository $tag -}}
{{- end -}}

{{/*
Common labels applied to all resources.
*/}}
{{- define "script-manifest.labels" -}}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: script-manifest
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}
```

- [ ] **Step 4: Create NOTES.txt**

```
# deploy/helm/script-manifest/templates/NOTES.txt
Script Manifest deployed to namespace {{ .Release.Namespace }}.

{{- if .Values.ingress.enabled }}
Access the application at:
  - Frontend: https://{{ .Values.ingress.webDomain }}
  - API:      https://{{ .Values.ingress.apiDomain }}
{{- else }}
Port-forward to access locally:
  kubectl port-forward svc/api-gateway 4000:4000 -n {{ .Release.Namespace }}
  kubectl port-forward svc/writer-web 3000:3000 -n {{ .Release.Namespace }}
{{- end }}
```

- [ ] **Step 4b: Create umbrella namespace.yaml**

```yaml
# deploy/helm/script-manifest/templates/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: {{ .Release.Namespace }}
  labels:
    {{- include "script-manifest.labels" . | nindent 4 }}
```

- [ ] **Step 6: Create notification-service subchart Chart.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/Chart.yaml
apiVersion: v2
name: notification-service
description: Event notification service (Redpanda consumer)
type: application
version: 0.1.0
appVersion: "1.0.0"
```

- [ ] **Step 6: Create notification-service subchart values.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/values.yaml
replicaCount: 1

image:
  repository: notification-service
  tag: ""  # defaults to global.imageTag
  pullPolicy: IfNotPresent

service:
  type: ClusterIP
  port: 4010

env:
  PORT: "4010"
  NODE_ENV: production
  KAFKA_BROKERS: "script-manifest-redpanda:9092"

# Secret env vars — keys referencing K8s Secret objects
secretEnv: {}
  # DATABASE_URL:
  #   secretName: script-manifest-db
  #   secretKey: DATABASE_URL

resources:
  requests:
    cpu: 100m
    memory: 128Mi
  limits:
    cpu: 250m
    memory: 256Mi

probes:
  liveness:
    path: /health/live
    port: 4010
  readiness:
    path: /health/ready
    port: 4010
  startup:
    path: /health
    port: 4010
    failureThreshold: 30
    periodSeconds: 5

autoscaling:
  enabled: false
  minReplicas: 1
  maxReplicas: 3
  targetCPUUtilizationPercentage: 80

serviceAccount:
  create: true
  name: ""

nodeSelector: {}
tolerations: []
affinity: {}
```

- [ ] **Step 7: Create notification-service subchart _helpers.tpl**

```yaml
# deploy/helm/script-manifest/charts/notification-service/templates/_helpers.tpl
{{- define "notification-service.fullname" -}}
{{- printf "%s-%s" .Release.Name .Chart.Name | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "notification-service.name" -}}
{{- .Chart.Name -}}
{{- end -}}

{{- define "notification-service.labels" -}}
app.kubernetes.io/name: {{ include "notification-service.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{ include "script-manifest.labels" . }}
{{- end -}}

{{- define "notification-service.selectorLabels" -}}
app.kubernetes.io/name: {{ include "notification-service.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end -}}
```

- [ ] **Step 8: Create notification-service deployment.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "notification-service.fullname" . }}
  labels:
    {{- include "notification-service.labels" . | nindent 4 }}
spec:
  {{- if not .Values.autoscaling.enabled }}
  replicas: {{ .Values.replicaCount }}
  {{- end }}
  selector:
    matchLabels:
      {{- include "notification-service.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "notification-service.selectorLabels" . | nindent 8 }}
    spec:
      serviceAccountName: {{ include "notification-service.fullname" . }}
      containers:
        - name: {{ .Chart.Name }}
          image: {{ include "script-manifest.image" (dict "global" .Values.global "image" .Values.image) }}
          imagePullPolicy: {{ .Values.image.pullPolicy }}
          ports:
            - name: http
              containerPort: {{ .Values.service.port }}
              protocol: TCP
          envFrom:
            - configMapRef:
                name: {{ include "notification-service.fullname" . }}
          {{- if .Values.secretEnv }}
          env:
            {{- range $key, $ref := .Values.secretEnv }}
            - name: {{ $key }}
              valueFrom:
                secretKeyRef:
                  name: {{ $ref.secretName }}
                  key: {{ $ref.secretKey }}
            {{- end }}
          {{- end }}
          livenessProbe:
            httpGet:
              path: {{ .Values.probes.liveness.path }}
              port: {{ .Values.probes.liveness.port }}
            periodSeconds: 15
            timeoutSeconds: 5
            failureThreshold: 5
          readinessProbe:
            httpGet:
              path: {{ .Values.probes.readiness.path }}
              port: {{ .Values.probes.readiness.port }}
            periodSeconds: 10
            timeoutSeconds: 5
            failureThreshold: 3
          startupProbe:
            httpGet:
              path: {{ .Values.probes.startup.path }}
              port: {{ .Values.probes.startup.port }}
            periodSeconds: {{ .Values.probes.startup.periodSeconds }}
            failureThreshold: {{ .Values.probes.startup.failureThreshold }}
          resources:
            {{- toYaml .Values.resources | nindent 12 }}
      {{- with .Values.nodeSelector }}
      nodeSelector:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.tolerations }}
      tolerations:
        {{- toYaml . | nindent 8 }}
      {{- end }}
      {{- with .Values.affinity }}
      affinity:
        {{- toYaml . | nindent 8 }}
      {{- end }}
```

- [ ] **Step 9: Create notification-service service.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: {{ include "notification-service.fullname" . }}
  labels:
    {{- include "notification-service.labels" . | nindent 4 }}
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
  selector:
    {{- include "notification-service.selectorLabels" . | nindent 4 }}
```

- [ ] **Step 10: Create notification-service configmap.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/templates/configmap.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: {{ include "notification-service.fullname" . }}
  labels:
    {{- include "notification-service.labels" . | nindent 4 }}
data:
  {{- range $key, $value := .Values.env }}
  {{ $key }}: {{ $value | quote }}
  {{- end }}
```

- [ ] **Step 11: Create notification-service hpa.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/templates/hpa.yaml
{{- if .Values.autoscaling.enabled }}
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: {{ include "notification-service.fullname" . }}
  labels:
    {{- include "notification-service.labels" . | nindent 4 }}
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: {{ include "notification-service.fullname" . }}
  minReplicas: {{ .Values.autoscaling.minReplicas }}
  maxReplicas: {{ .Values.autoscaling.maxReplicas }}
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: {{ .Values.autoscaling.targetCPUUtilizationPercentage }}
{{- end }}
```

- [ ] **Step 12: Create notification-service serviceaccount.yaml**

```yaml
# deploy/helm/script-manifest/charts/notification-service/templates/serviceaccount.yaml
{{- if .Values.serviceAccount.create }}
apiVersion: v1
kind: ServiceAccount
metadata:
  name: {{ include "notification-service.fullname" . }}
  labels:
    {{- include "notification-service.labels" . | nindent 4 }}
{{- end }}
```

- [ ] **Step 13: Validate with helm lint**

Run: `helm lint deploy/helm/script-manifest --set global.registry=ghcr.io/full-chaos/script-manifest --set global.imageTag=latest`
Expected: "1 chart(s) linted, 0 chart(s) failed"

- [ ] **Step 14: Validate with helm template**

Run: `helm template sm deploy/helm/script-manifest --set global.registry=ghcr.io/full-chaos/script-manifest --set global.imageTag=latest --set postgresql.enabled=false --set redis.enabled=false > /dev/null`
Expected: exits 0, no errors

- [ ] **Step 15: Commit**

```bash
git add deploy/helm/script-manifest/
git commit -m "feat(helm): add umbrella chart and notification-service reference subchart"
```

---

## Chunk 2: All Service Subcharts

### Task 2: Create Remaining 14 Service Subcharts

**Files:** For each service below, create the same 8-file structure as `notification-service` in Task 1. Use the canonical template — only `Chart.yaml` (name/description), `values.yaml` (port, env, secretEnv), and `_helpers.tpl` (name references) differ per service.

**Approach:** Copy `notification-service/` as the template for each, then modify the 3 files that differ. The `deployment.yaml`, `service.yaml`, `configmap.yaml`, `hpa.yaml`, and `serviceaccount.yaml` templates are identical across all subcharts except for the helper name prefix.

The fastest approach: create a script `scripts/scaffold-subchart.sh` that copies the canonical template and does sed replacements.

- [ ] **Step 1: Create scaffold script**

```bash
# scripts/scaffold-subchart.sh
#!/usr/bin/env bash
set -euo pipefail
TEMPLATE_DIR="deploy/helm/script-manifest/charts/notification-service"
SERVICE="$1"
TARGET="deploy/helm/script-manifest/charts/${SERVICE}"

if [ -d "$TARGET" ]; then echo "Already exists: $TARGET"; exit 0; fi

cp -r "$TEMPLATE_DIR" "$TARGET"

# Replace notification-service with new service name in all files
find "$TARGET" -type f -exec sed -i '' "s/notification-service/${SERVICE}/g" {} +
echo "Created subchart: $TARGET"
```

- [ ] **Step 2: Scaffold all 14 remaining subcharts**

Run:
```bash
chmod +x scripts/scaffold-subchart.sh
for svc in identity-service profile-project-service competition-directory-service \
  search-indexer-service submission-tracking-service feedback-exchange-service \
  ranking-service coverage-marketplace-service industry-portal-service \
  script-storage-service programs-service partner-dashboard-service \
  api-gateway writer-web; do
  ./scripts/scaffold-subchart.sh "$svc"
done
```

- [ ] **Step 3: Update Chart.yaml descriptions for each subchart**

Per-service descriptions:

| Service | Description |
|---------|-------------|
| identity-service | Authentication and session management |
| profile-project-service | Writer profiles and project management |
| competition-directory-service | Competition listings and calendar |
| search-indexer-service | OpenSearch indexing service |
| submission-tracking-service | Script submission tracking (in-memory) |
| feedback-exchange-service | Peer-to-peer feedback with token ledger |
| ranking-service | Scoring algorithm and leaderboard |
| coverage-marketplace-service | Paid coverage marketplace (Stripe) |
| industry-portal-service | Industry professional vetting and access |
| script-storage-service | Script file storage (S3/MinIO) |
| programs-service | Writing programs and cohorts |
| partner-dashboard-service | Partner analytics dashboard |
| api-gateway | API gateway and request routing |
| writer-web | Next.js frontend application |

- [ ] **Step 4: Update values.yaml for each subchart**

Per-service values (port, env vars, secretEnv). Reference table:

| Service | Port | Key Env Vars | Secret Env Vars |
|---------|------|-------------|-----------------|
| identity-service | 4005 | `PORT`, `NODE_ENV`, `SMTP_HOST`(local), `FRONTEND_URL` | `DATABASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `EMAIL_API_KEY`(staging/prod), `SERVICE_TOKEN_SECRET` |
| profile-project-service | 4001 | `PORT`, `NODE_ENV`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| competition-directory-service | 4002 | `PORT`, `NODE_ENV`, `SEARCH_INDEXER_URL`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| search-indexer-service | 4003 | `PORT`, `NODE_ENV`, `OPENSEARCH_URL`, `OPENSEARCH_INDEX` | — |
| submission-tracking-service | 4004 | `PORT`, `NODE_ENV` | — |
| feedback-exchange-service | 4006 | `PORT`, `NODE_ENV`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| ranking-service | 4007 | `PORT`, `NODE_ENV`, `NOTIFICATION_SERVICE_URL`, `SUBMISSION_TRACKING_SERVICE_URL`, `COMPETITION_DIRECTORY_SERVICE_URL`, `PROFILE_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| coverage-marketplace-service | 4008 | `PORT`, `NODE_ENV`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS`, `PLATFORM_COMMISSION_RATE`, `STORAGE_BUCKET`, `STORAGE_S3_ENDPOINT` | `DATABASE_URL` (from `script-manifest-db-secret`), `STRIPE_SECRET_KEY`+`STRIPE_WEBHOOK_SECRET` (from `script-manifest-stripe-secret`), `STORAGE_S3_ACCESS_KEY`+`STORAGE_S3_SECRET_KEY`+`MINIO_ROOT_PASSWORD` (from `script-manifest-storage-secret`) |
| industry-portal-service | 4009 | `PORT`, `NODE_ENV`, `SCRIPT_STORAGE_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| script-storage-service | 4011 | `PORT`, `NODE_ENV`, `STORAGE_BUCKET`, `STORAGE_UPLOAD_BASE_URL`, `STORAGE_PUBLIC_BASE_URL`, `STORAGE_S3_ENDPOINT`, `STORAGE_S3_REGION`, `STORAGE_S3_FORCE_PATH_STYLE` | `STORAGE_S3_ACCESS_KEY`, `STORAGE_S3_SECRET_KEY` |
| programs-service | 4012 | `PORT`, `NODE_ENV`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| partner-dashboard-service | 4013 | `PORT`, `NODE_ENV`, `RANKING_SERVICE_URL`, `NOTIFICATION_SERVICE_URL`, `KAFKA_BROKERS` | `DATABASE_URL` |
| api-gateway | 4000 | `PORT`, `NODE_ENV`, all `*_SERVICE_URL` vars (11), `COMPETITION_ADMIN_ALLOWLIST`, `COVERAGE_ADMIN_ALLOWLIST`, `INDUSTRY_ADMIN_ALLOWLIST`, `CORS_ALLOWED_ORIGINS` | `REDIS_URL`, `SERVICE_TOKEN_SECRET` |
| writer-web | 3000 | `PORT`, `NODE_ENV`, `HOSTNAME: "0.0.0.0"`, `SCRIPT_STORAGE_SERVICE_URL`, `API_GATEWAY_URL`, `SCRIPT_UPLOAD_INTERNAL_BASE_URL` | — |

For `writer-web`: also update `image.repository` to `writer-web` (uses `frontend.Dockerfile`, not `service.Dockerfile`).

Inter-service URLs use K8s service DNS: `http://<release>-<service>:<port>`. Example: `NOTIFICATION_SERVICE_URL: "http://{{ .Release.Name }}-notification-service:4010"`. These go in ConfigMap env vars. To make them templatable, use a helper or hardcode with release-name prefix in values.

**Important:** For inter-service URLs, set defaults in values.yaml using the Helm release name convention:
```yaml
env:
  NOTIFICATION_SERVICE_URL: "http://sm-notification-service:4010"
```
These will be overridden by umbrella values.yaml if the release name differs.

- [ ] **Step 5: Handle api-gateway and writer-web NodePort service type**

For `api-gateway/values.yaml` and `writer-web/values.yaml`, add:

```yaml
service:
  type: ClusterIP  # overridden to NodePort in local values
  port: 4000       # (or 3000 for writer-web)
  nodePort: null    # set to 30400/30300 in local values
```

Update `service.yaml` template for these two to support nodePort:

```yaml
spec:
  type: {{ .Values.service.type }}
  ports:
    - port: {{ .Values.service.port }}
      targetPort: http
      protocol: TCP
      name: http
      {{- if .Values.service.nodePort }}
      nodePort: {{ .Values.service.nodePort }}
      {{- end }}
```

- [ ] **Step 6: Validate all subcharts**

Run: `helm lint deploy/helm/script-manifest --set global.registry=ghcr.io/full-chaos/script-manifest --set global.imageTag=latest --set postgresql.enabled=false --set redis.enabled=false`
Expected: "1 chart(s) linted, 0 chart(s) failed"

- [ ] **Step 7: Commit**

```bash
git add deploy/helm/script-manifest/charts/ scripts/scaffold-subchart.sh
git commit -m "feat(helm): add all 15 service subcharts"
```

---

## Chunk 3: Infrastructure Subcharts + Values Files

### Task 3: Custom Infrastructure Subcharts

**Files:**
- Create: `deploy/helm/script-manifest/charts/opensearch/` (Chart.yaml, values.yaml, templates/)
- Create: `deploy/helm/script-manifest/charts/minio/` (Chart.yaml, values.yaml, templates/)
- Create: `deploy/helm/script-manifest/charts/redpanda/` (Chart.yaml, values.yaml, templates/)
- Create: `deploy/helm/script-manifest/charts/mailpit/` (Chart.yaml, values.yaml, templates/)

These are simpler than service subcharts — StatefulSets (or Deployments) with PVCs. No HPA, no configmap templating.

- [ ] **Step 1: Create OpenSearch subchart**

StatefulSet with single-node config, PVC for data, Service on port 9200.

Key values:
```yaml
# charts/opensearch/values.yaml
enabled: true
replicaCount: 1
image:
  repository: opensearchproject/opensearch
  tag: "2.17.1"
persistence:
  size: 10Gi
resources:
  limits:
    cpu: "2.0"
    memory: 2Gi
javaOpts: "-Xms512m -Xmx512m"
```

Templates: `statefulset.yaml`, `service.yaml`, `_helpers.tpl`. The statefulset sets `discovery.type: single-node`, `plugins.security.disabled: "true"`, ulimits via securityContext (not Docker ulimits — K8s doesn't have ulimits, use `memlock` via init container or securityContext `capabilities`).

- [ ] **Step 2: Create MinIO subchart**

StatefulSet with `server /data --console-address ":9001"`, PVC, Service on ports 9000 (API) + 9001 (console).

Key values:
```yaml
# charts/minio/values.yaml
enabled: true
image:
  repository: minio/minio
  tag: "RELEASE.2025-09-07T16-13-09Z"
persistence:
  size: 10Gi
resources:
  limits:
    cpu: "1.0"
    memory: 1Gi
```

Secret env vars: `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD` from K8s Secret named `script-manifest-storage-secret`.

- [ ] **Step 3: Create Redpanda subchart**

StatefulSet with Redpanda start command (matching compose.yml flags), Service on port 9092 (Kafka) + 8082 (HTTP proxy).

Key values:
```yaml
# charts/redpanda/values.yaml
enabled: true
image:
  repository: redpandadata/redpanda
  tag: "v24.3.1"
resources:
  limits:
    cpu: "1.0"
    memory: 1Gi
```

- [ ] **Step 4: Create Mailpit subchart**

Simple Deployment (not StatefulSet — no persistent data), Service on ports 1025 (SMTP) + 8025 (UI).

Key values:
```yaml
# charts/mailpit/values.yaml
enabled: true  # only enabled in local
image:
  repository: axllent/mailpit
  tag: "v1.20.3"
resources:
  limits:
    cpu: "0.25"
    memory: 256Mi
```

- [ ] **Step 5: Validate infra subcharts**

Run: `helm lint deploy/helm/script-manifest --set global.registry=ghcr.io/full-chaos/script-manifest --set global.imageTag=latest --set postgresql.enabled=false --set redis.enabled=false`
Expected: passes

- [ ] **Step 6: Commit**

```bash
git add deploy/helm/script-manifest/charts/{opensearch,minio,redpanda,mailpit}/
git commit -m "feat(helm): add custom infrastructure subcharts (opensearch, minio, redpanda, mailpit)"
```

### Task 4: Values Files (local, staging, prod)

**Files:**
- Create: `deploy/helm/script-manifest/values.yaml` (local defaults)
- Create: `deploy/helm/script-manifest/values-staging.yaml`
- Create: `deploy/helm/script-manifest/values-prod.yaml`

- [ ] **Step 1: Create values.yaml (local defaults)**

```yaml
# deploy/helm/script-manifest/values.yaml
global:
  registry: ghcr.io/full-chaos/script-manifest
  imageTag: latest
  environment: local

# -- Ingress (disabled for local; use NodePort)
ingress:
  enabled: false
  apiDomain: ""
  webDomain: ""

# -- Bitnami infrastructure
postgresql:
  enabled: true
  auth:
    database: manifest
    username: manifest
    existingSecret: script-manifest-db-secret
  primary:
    resources:
      limits:
        cpu: "1.0"
        memory: 1Gi

redis:
  enabled: true
  auth:
    existingSecret: script-manifest-redis-secret
  master:
    resources:
      limits:
        cpu: "0.5"
        memory: 512Mi

# -- Custom infrastructure
opensearch:
  enabled: true
minio:
  enabled: true
redpanda:
  enabled: true
mailpit:
  enabled: true

# -- Service overrides for local
api-gateway:
  service:
    type: NodePort
    nodePort: 30400
  env:
    RATE_LIMIT_MAX: "1000"

writer-web:
  service:
    type: NodePort
    nodePort: 30300

# -- Default resource limits for all services (local, smaller)
# Individual subchart values.yaml has defaults; override here for local env.
```

- [ ] **Step 2: Create values-staging.yaml**

```yaml
# deploy/helm/script-manifest/values-staging.yaml
global:
  registry: ghcr.io/full-chaos/script-manifest
  imageTag: latest
  environment: staging

ingress:
  enabled: true
  className: nginx
  apiDomain: api.staging.scriptmanifest.com
  webDomain: staging.scriptmanifest.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-staging

postgresql:
  enabled: true
  auth:
    database: manifest
    username: manifest
    existingSecret: script-manifest-db-secret

redis:
  enabled: true
  auth:
    existingSecret: script-manifest-redis-secret

opensearch:
  enabled: true
minio:
  enabled: true
redpanda:
  enabled: true
mailpit:
  enabled: false  # use Resend in staging

identity-service:
  env:
    FRONTEND_URL: "https://staging.scriptmanifest.com"
  secretEnv:
    EMAIL_API_KEY:
      secretName: script-manifest-email-secret
      secretKey: EMAIL_API_KEY
```

- [ ] **Step 3: Create values-prod.yaml**

```yaml
# deploy/helm/script-manifest/values-prod.yaml
global:
  registry: ghcr.io/full-chaos/script-manifest
  imageTag: ""  # MUST be set at deploy time: --set global.imageTag=sha-abc1234
  environment: production

ingress:
  enabled: true
  className: nginx
  apiDomain: api.scriptmanifest.com
  webDomain: scriptmanifest.com
  tls:
    enabled: true
    clusterIssuer: letsencrypt-prod

# -- Disable all infrastructure subcharts (use external managed services)
postgresql:
  enabled: false
redis:
  enabled: false
opensearch:
  enabled: false
minio:
  enabled: false
redpanda:
  enabled: false
mailpit:
  enabled: false

# -- External service connection strings (injected via ExternalSecret)
# Services read DATABASE_URL, REDIS_URL, etc. from K8s Secrets
# created by External Secrets Operator (see deploy/kubernetes/prod/external-secrets/)

# -- HPA for public-facing services
api-gateway:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 70
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

writer-web:
  autoscaling:
    enabled: true
    minReplicas: 2
    maxReplicas: 5
    targetCPUUtilizationPercentage: 70
  resources:
    requests:
      cpu: 250m
      memory: 256Mi
    limits:
      cpu: 500m
      memory: 512Mi

identity-service:
  secretEnv:
    EMAIL_API_KEY:
      secretName: script-manifest-email-secret
      secretKey: EMAIL_API_KEY
```

- [ ] **Step 4: Run helm dependency build**

Run: `cd deploy/helm/script-manifest && helm dependency build`
Expected: Downloads Bitnami PostgreSQL and Redis charts, creates `Chart.lock`

Note: This requires network access. If it fails due to OCI registry auth, run `helm registry login registry-1.docker.io` first (anonymous works for public Bitnami charts).

- [ ] **Step 5: Full lint + template validation**

Run:
```bash
helm lint deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml > /dev/null
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values-staging.yaml > /dev/null
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values-prod.yaml > /dev/null
```
Expected: All pass without errors

- [ ] **Step 6: Commit**

```bash
git add deploy/helm/script-manifest/values*.yaml deploy/helm/script-manifest/Chart.lock
git commit -m "feat(helm): add values files for local, staging, and production"
```

---

## Chunk 4: Docker Swarm

### Task 5: Docker Swarm Stack Files

**Files:**
- Create: `deploy/swarm/stack.yml`
- Create: `deploy/swarm/stack.staging.yml`

These are derived from `compose.prod.yml` but adapted for Swarm mode.

- [ ] **Step 1: Create deploy/swarm/stack.yml**

Base this on `compose.prod.yml` (line-by-line port). Key changes from Compose → Swarm:
- Replace `restart: unless-stopped` with `deploy.restart_policy`
- Add `deploy.update_config: { parallelism: 1, delay: 10s, order: start-first }` to all services
- Add `deploy.placement.constraints` (infra on managers, services on workers)
- Networks: `driver: overlay` with `internal` network having `driver_opts: encrypted: "true"`
- Add `secrets:` top-level section declaring external Docker secrets
- Reference secrets in service environment: `DATABASE_URL` assembled from secret file
- Add Prometheus + AlertManager (from compose.prod.yml)
- Exclude BugSink

Services to include (in dependency order):
1. Infrastructure: postgres, redis, opensearch, minio, redpanda, traefik
2. Observability: prometheus, alertmanager
3. Backend: notification → identity → profile-project → search-indexer → competition-directory → script-storage → submission-tracking → feedback-exchange → ranking → coverage-marketplace → industry-portal → programs → partner-dashboard → api-gateway
4. Frontend: writer-web

Each service gets:
```yaml
deploy:
  replicas: 1
  update_config:
    parallelism: 1
    delay: 10s
    order: start-first
  restart_policy:
    condition: on-failure
    delay: 5s
    max_attempts: 3
  resources:
    limits:
      cpus: '0.5'
      memory: 512M
```

**Secrets approach:** Use `env_file:` with a `.env` file (same pattern as compose.prod.yml). Docker Swarm supports `env_file:` just like Compose. This means secrets are in the `.env` file on the Swarm manager, not in Docker's secret store. This is the simplest approach that works with Node.js services reading `process.env` directly. The `.env` file should be mode 600, owned by root.

Do NOT declare a top-level `secrets:` block — that would require file-mount consumption which these services don't support. The `environment:` block assembles values from `.env` interpolation:

```yaml
env_file: ./.env
environment:
  DATABASE_URL: "postgresql://${POSTGRES_USER:-manifest}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB:-manifest}"
```

- [ ] **Step 2: Create deploy/swarm/stack.staging.yml**

Override file with:
- `IMAGE_TAG: latest` for all images
- Single replicas
- Relaxed resource limits (256M memory)
- Staging-specific Traefik domain

```yaml
# deploy/swarm/stack.staging.yml
# Usage: docker stack deploy -c stack.yml -c stack.staging.yml script-manifest
services:
  api-gateway:
    image: ghcr.io/full-chaos/script-manifest/api-gateway:latest
    labels:
      traefik.http.routers.api.rule: "Host(`api.staging.scriptmanifest.com`)"
  writer-web:
    image: ghcr.io/full-chaos/script-manifest/writer-web:latest
    labels:
      traefik.http.routers.web.rule: "Host(`staging.scriptmanifest.com`)"
  # ... repeat image override for all services
```

- [ ] **Step 3: Validate YAML syntax**

Run: `python3 -c "import yaml; yaml.safe_load(open('deploy/swarm/stack.yml'))" && echo OK`
Run: `python3 -c "import yaml; yaml.safe_load(open('deploy/swarm/stack.staging.yml'))" && echo OK`
Expected: OK (no YAML parse errors)

- [ ] **Step 4: Commit**

```bash
git add deploy/swarm/
git commit -m "feat(swarm): add Docker Swarm stack files for prod and staging"
```

---

## Chunk 5: Kubernetes Raw Manifests Pipeline

### Task 6: Render Pipeline + Kustomize + K8s Support Files

**Files:**
- Create: `deploy/kubernetes/README.md`
- Create: `deploy/kubernetes/render.sh`
- Create: `deploy/kubernetes/kind.yaml`
- Create: `deploy/kubernetes/local/namespace.yaml`
- Create: `deploy/kubernetes/local/secrets/.secrets.yaml.example`
- Create: `deploy/kubernetes/local/kustomization.yaml`
- Create: `deploy/kubernetes/staging/namespace.yaml`
- Create: `deploy/kubernetes/staging/ingress.yaml`
- Create: `deploy/kubernetes/staging/secrets/.secrets.yaml.example`
- Create: `deploy/kubernetes/staging/kustomization.yaml`
- Create: `deploy/kubernetes/prod/namespace.yaml`
- Create: `deploy/kubernetes/prod/ingress.yaml`
- Create: `deploy/kubernetes/prod/external-secrets/secret-store.yaml`
- Create: `deploy/kubernetes/prod/external-secrets/external-secrets.yaml`
- Create: `deploy/kubernetes/prod/kustomization.yaml`
- Modify: `.gitignore` — add `deploy/kubernetes/*/generated/` and `deploy/kubernetes/*/secrets/*.yaml` (not examples)

- [ ] **Step 1: Create render.sh**

```bash
#!/usr/bin/env bash
# deploy/kubernetes/render.sh
# Renders Helm chart to static YAML manifests for each environment.
# Run from deploy/kubernetes/ directory.
set -euo pipefail
cd "$(dirname "$0")"

CHART="../helm/script-manifest"

# Ensure Bitnami dependencies are fetched
if [ ! -d "${CHART}/charts/postgresql" ] || [ ! -d "${CHART}/charts/redis" ]; then
  echo "Fetching Helm dependencies..."
  helm dependency build "$CHART"
fi

for env in local staging prod; do
  echo "Rendering ${env}..."
  rm -rf "./${env}/generated"

  values_file="${CHART}/values.yaml"
  if [ "$env" != "local" ]; then
    values_file="${CHART}/values-${env}.yaml"
  fi

  # Render to temp dir, then flatten all YAML into generated/
  tmp=$(mktemp -d)
  helm template script-manifest "$CHART" \
    -f "$values_file" \
    --namespace "script-manifest-${env}" \
    --output-dir "$tmp"

  # Flatten subchart directory tree into a single directory
  mkdir -p "./${env}/generated"
  find "$tmp" -name '*.yaml' -exec cp {} "./${env}/generated/" \;
  rm -rf "$tmp"

  echo "  → ./${env}/generated/ ($(ls ./${env}/generated/*.yaml 2>/dev/null | wc -l) files)"
done

echo "Done. Apply with: kubectl apply -k <env>/"
```

- [ ] **Step 2: Create kind.yaml**

```yaml
# deploy/kubernetes/kind.yaml
# kind cluster config with port mappings for local development.
# Usage: kind create cluster --config kind.yaml --name script-manifest
kind: Cluster
apiVersion: kind.x-k8s.io/v1alpha4
nodes:
  - role: control-plane
    extraPortMappings:
      # api-gateway NodePort
      - containerPort: 30400
        hostPort: 4000
        protocol: TCP
      # writer-web NodePort
      - containerPort: 30300
        hostPort: 3000
        protocol: TCP
```

- [ ] **Step 3: Create namespace files**

```yaml
# deploy/kubernetes/local/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: script-manifest-local
```

```yaml
# deploy/kubernetes/staging/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: script-manifest-staging
```

```yaml
# deploy/kubernetes/prod/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: script-manifest-prod
```

- [ ] **Step 4: Create secrets templates**

```yaml
# deploy/kubernetes/local/secrets/.secrets.yaml.example
# Copy to secrets.yaml and fill in values. DO NOT commit secrets.yaml.
apiVersion: v1
kind: Secret
metadata:
  name: script-manifest-db-secret
  namespace: script-manifest-local
type: Opaque
stringData:
  POSTGRES_PASSWORD: "manifest"
  DATABASE_URL: "postgresql://manifest:manifest@script-manifest-postgresql:5432/manifest"
---
apiVersion: v1
kind: Secret
metadata:
  name: script-manifest-redis-secret
  namespace: script-manifest-local
type: Opaque
stringData:
  REDIS_URL: "redis://:manifest@script-manifest-redis-master:6379"
  redis-password: "manifest"
---
apiVersion: v1
kind: Secret
metadata:
  name: script-manifest-storage-secret
  namespace: script-manifest-local
type: Opaque
stringData:
  MINIO_ROOT_PASSWORD: "manifest123"
  STORAGE_S3_ACCESS_KEY: "manifest"
  STORAGE_S3_SECRET_KEY: "manifest123"
---
apiVersion: v1
kind: Secret
metadata:
  name: script-manifest-service-secret
  namespace: script-manifest-local
type: Opaque
stringData:
  SERVICE_TOKEN_SECRET: "local-dev-token-secret"
---
apiVersion: v1
kind: Secret
metadata:
  name: script-manifest-oauth-secret
  namespace: script-manifest-local
type: Opaque
stringData:
  GOOGLE_CLIENT_ID: ""      # leave blank to disable Google sign-in locally
  GOOGLE_CLIENT_SECRET: ""
---
apiVersion: v1
kind: Secret
metadata:
  name: script-manifest-stripe-secret
  namespace: script-manifest-local
type: Opaque
stringData:
  STRIPE_SECRET_KEY: ""      # leave blank if not testing payments locally
  STRIPE_WEBHOOK_SECRET: ""
```

Create the staging example too (same structure, different namespace `script-manifest-staging`, placeholder values).

- [ ] **Step 5: Create ingress files**

```yaml
# deploy/kubernetes/staging/ingress.yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: script-manifest-ingress
  namespace: script-manifest-staging
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-staging
spec:
  ingressClassName: nginx
  tls:
    - hosts:
        - staging.scriptmanifest.com
        - api.staging.scriptmanifest.com
      secretName: script-manifest-staging-tls
  rules:
    - host: staging.scriptmanifest.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: script-manifest-writer-web
                port:
                  number: 3000
    - host: api.staging.scriptmanifest.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: script-manifest-api-gateway
                port:
                  number: 4000
```

Create `deploy/kubernetes/prod/ingress.yaml` with prod domains and `letsencrypt-prod` issuer.

- [ ] **Step 6: Create External Secrets resources (prod)**

```yaml
# deploy/kubernetes/prod/external-secrets/secret-store.yaml
apiVersion: external-secrets.io/v1beta1
kind: SecretStore
metadata:
  name: aws-secrets-manager
  namespace: script-manifest-prod
spec:
  provider:
    aws:
      service: SecretsManager
      region: us-east-1
      # Auth: uses IRSA (IAM Roles for Service Accounts) or explicit accessKeyID/secretAccessKeyID
```

```yaml
# deploy/kubernetes/prod/external-secrets/external-secrets.yaml
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-db-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-db-secret
  data:
    - secretKey: DATABASE_URL
      remoteRef:
        key: script-manifest/prod/database-url
    - secretKey: POSTGRES_PASSWORD
      remoteRef:
        key: script-manifest/prod/postgres-password
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-redis-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-redis-secret
  data:
    - secretKey: REDIS_URL
      remoteRef:
        key: script-manifest/prod/redis-url
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-stripe-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-stripe-secret
  data:
    - secretKey: STRIPE_SECRET_KEY
      remoteRef:
        key: script-manifest/prod/stripe-secret-key
    - secretKey: STRIPE_WEBHOOK_SECRET
      remoteRef:
        key: script-manifest/prod/stripe-webhook-secret
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-storage-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-storage-secret
  data:
    - secretKey: STORAGE_S3_ACCESS_KEY
      remoteRef:
        key: script-manifest/prod/s3-access-key
    - secretKey: STORAGE_S3_SECRET_KEY
      remoteRef:
        key: script-manifest/prod/s3-secret-key
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-email-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-email-secret
  data:
    - secretKey: EMAIL_API_KEY
      remoteRef:
        key: script-manifest/prod/email-api-key
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-service-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-service-secret
  data:
    - secretKey: SERVICE_TOKEN_SECRET
      remoteRef:
        key: script-manifest/prod/service-token-secret
---
apiVersion: external-secrets.io/v1beta1
kind: ExternalSecret
metadata:
  name: script-manifest-oauth-secret
  namespace: script-manifest-prod
spec:
  refreshInterval: 1h
  secretStoreRef:
    name: aws-secrets-manager
    kind: SecretStore
  target:
    name: script-manifest-oauth-secret
  data:
    - secretKey: GOOGLE_CLIENT_ID
      remoteRef:
        key: script-manifest/prod/google-client-id
    - secretKey: GOOGLE_CLIENT_SECRET
      remoteRef:
        key: script-manifest/prod/google-client-secret
```

- [ ] **Step 7: Create kustomization.yaml files**

```yaml
# deploy/kubernetes/local/kustomization.yaml
# Prerequisite: run ./render.sh to populate generated/ directory
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: script-manifest-local
resources:
  - namespace.yaml
  - secrets/secrets.yaml
  - generated/
```

```yaml
# deploy/kubernetes/staging/kustomization.yaml
# Prerequisite: run ./render.sh to populate generated/ directory
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: script-manifest-staging
resources:
  - namespace.yaml
  - secrets/secrets.yaml
  - ingress.yaml
  - generated/
```

```yaml
# deploy/kubernetes/prod/kustomization.yaml
# Prerequisite: run ./render.sh to populate generated/ directory
# Note: HPA resources are generated by Helm (autoscaling.enabled=true in values-prod.yaml)
# and included in generated/. No separate hpa.yaml needed.
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: script-manifest-prod
resources:
  - namespace.yaml
  - external-secrets/secret-store.yaml
  - external-secrets/external-secrets.yaml
  - ingress.yaml
  - generated/
```

- [ ] **Step 8: Update .gitignore**

Add:
```
# Helm-generated K8s manifests (regenerate with deploy/kubernetes/render.sh)
deploy/kubernetes/*/generated/

# K8s secrets (use .secrets.yaml.example as template)
deploy/kubernetes/*/secrets/*.yaml
!deploy/kubernetes/*/secrets/*.example
```

- [ ] **Step 9: Create deploy/kubernetes/README.md**

Content covering:
- What this directory contains
- Helm vs kubectl usage
- Local K8s tool setup (Minikube, kind, k3d, Docker Desktop) with commands
- `render.sh` usage
- Secrets setup instructions per environment

- [ ] **Step 10: Validate render.sh works**

Run:
```bash
cd deploy/kubernetes && chmod +x render.sh && ./render.sh
ls local/generated/ staging/generated/ prod/generated/
```
Expected: Each directory contains rendered YAML files for all services

- [ ] **Step 11: Commit**

```bash
git add deploy/kubernetes/ .gitignore
git commit -m "feat(k8s): add raw manifest render pipeline, kustomize overlays, and external secrets"
```

---

## Chunk 6: Documentation

### Task 7: Getting Started Guide (docs/setup.md)

**Files:**
- Create: `docs/setup.md`

- [ ] **Step 1: Write docs/setup.md**

Sections (per spec):
1. **Prerequisites** — Node 25 (via nvm/fnm), pnpm 10, Docker + Docker Compose, git
2. **Quick Start** — `git clone`, `cp .env.example .env`, `docker compose up -d`, `pnpm install`, `pnpm test`, `pnpm typecheck`
3. **Running Services Natively** — `pnpm dev` for all, `pnpm --filter @script-manifest/<name> dev` for individual. Requires infra running via `docker compose up -d postgres redis opensearch minio redpanda mailpit`
4. **Running via Docker Compose** — `compose.yml` (dev with hot-reload), `compose.prod.yml` (production images), `compose.stage.yml` (staging), `compose.harness.yml` (integration tests)
5. **Accessing the Stack** — URL table:

| Service | URL |
|---------|-----|
| Frontend | http://writer.localhost:9100 |
| API Gateway | http://api.localhost:9100 |
| OpenSearch | http://opensearch.localhost:9100 |
| MinIO Console | http://minio-console.localhost:9100 |
| Redpanda Console | http://redpanda.localhost:9100 |
| Mailpit | http://mailpit.localhost:9100 |
| SigNoz | http://signoz.localhost:9100 |

6. **Environment Variables** — Reference to `.env.example`, explain REQUIRED vs OPTIONAL
7. **Database Setup** — Auto-created by compose; for native dev: `createdb manifest`, run migrations
8. **Running Tests** — `pnpm test` (all), `pnpm --filter <pkg> test` (single), `pnpm typecheck`, integration harness
9. **Troubleshooting** — Empty JSON body gotcha, TIMESTAMPTZ dates, port conflicts, OpenSearch `vm.max_map_count`

- [ ] **Step 2: Commit**

```bash
git add docs/setup.md
git commit -m "docs: add comprehensive getting started guide"
```

### Task 8: Deployment Guide (docs/deployment.md)

**Files:**
- Create: `docs/deployment.md`

- [ ] **Step 1: Write docs/deployment.md**

Sections (per spec):
1. **Overview** — Service architecture summary, 15 services table, 4 deployment targets
2. **Building Images** — `service.Dockerfile` for backend (with `--build-arg SERVICE_NAME`), `frontend.Dockerfile` for writer-web. Reference CI workflow `.github/workflows/docker.yml` for automated multi-arch builds.
3. **Docker Compose**
   - Development: `docker compose up -d` (compose.yml, hot-reload)
   - Staging: `docker compose -f compose.stage.yml up -d` (with `.env`)
   - Production: `docker compose -f compose.prod.yml up -d` (requires `IMAGE_TAG`, `POSTGRES_PASSWORD`, `STRIPE_SECRET_KEY`, etc.)
4. **Docker Swarm**
   - Init: `docker swarm init`
   - Create secrets: `echo "value" | docker secret create name -`
   - Deploy: `docker stack deploy -c deploy/swarm/stack.yml script-manifest`
   - Staging: `docker stack deploy -c deploy/swarm/stack.yml -c deploy/swarm/stack.staging.yml script-manifest`
   - Update: `docker service update --image ghcr.io/.../service:newtag script-manifest_service-name`
   - Monitor: `docker service ls`, `docker service logs`
5. **Kubernetes with Helm** (recommended)
   - Install: `helm install sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml -n script-manifest-local --create-namespace`
   - Staging: `helm install sm ... -f values-staging.yaml -n script-manifest-staging`
   - Production: `helm install sm ... -f values-prod.yaml --set global.imageTag=sha-abc1234 -n script-manifest-prod`
   - Upgrade: `helm upgrade sm ... --set global.imageTag=sha-def5678`
   - Rollback: `helm rollback sm 1`
6. **Kubernetes with kubectl**
   - Generate: `cd deploy/kubernetes && ./render.sh`
   - Apply: `kubectl apply -k deploy/kubernetes/local/`
   - Note: re-run render.sh after Helm chart changes
7. **External Services (Production)** — Notes for RDS, ElastiCache, AWS OpenSearch, S3 (replacing MinIO), MSK (replacing Redpanda). What env vars to set, what secrets to create.
8. **Health Checks & Monitoring** — Endpoint table (`/health`, `/health/live`, `/health/ready`), Prometheus scraping config reference, alerting rules reference
9. **TLS & Ingress** — Traefik (Compose/Swarm) with Let's Encrypt, K8s Ingress with cert-manager

- [ ] **Step 2: Commit**

```bash
git add docs/deployment.md
git commit -m "docs: add comprehensive deployment guide (compose, swarm, k8s, helm)"
```

### Task 9: README Updates

**Files:**
- Modify: `README.md`
- Modify: `docs/README.md`

- [ ] **Step 1: Update root README.md**

Add after the "Workspace Bootstrap" section:

```markdown
## Deployment

See [Getting Started](docs/setup.md) for local development setup.

See [Deployment Guide](docs/deployment.md) for Docker Compose, Docker Swarm, Kubernetes, and Helm deployment instructions.
```

- [ ] **Step 2: Update docs/README.md**

Add links to setup.md and deployment.md in the documentation index.

- [ ] **Step 3: Commit**

```bash
git add README.md docs/README.md
git commit -m "docs: add deployment and setup links to READMEs"
```

### Task 10: Final Validation

- [ ] **Step 1: Run full lint pass**

```bash
helm lint deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml
helm lint deploy/helm/script-manifest -f deploy/helm/script-manifest/values-staging.yaml
helm lint deploy/helm/script-manifest -f deploy/helm/script-manifest/values-prod.yaml
```

- [ ] **Step 2: Run helm template for all environments**

```bash
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values.yaml > /dev/null
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values-staging.yaml > /dev/null
helm template sm deploy/helm/script-manifest -f deploy/helm/script-manifest/values-prod.yaml > /dev/null
```

- [ ] **Step 3: Verify render.sh produces valid YAML**

```bash
cd deploy/kubernetes && ./render.sh
```

- [ ] **Step 4: Validate Swarm YAML**

```bash
python3 -c "import yaml; yaml.safe_load(open('deploy/swarm/stack.yml'))"
python3 -c "import yaml; yaml.safe_load(open('deploy/swarm/stack.staging.yml'))"
```

- [ ] **Step 5: Run existing project tests (no regressions)**

```bash
pnpm test
pnpm typecheck
```

- [ ] **Step 6: Final commit if any fixes needed, then push**

```bash
git push
```
