{{- define "shoutout.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "shoutout.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "shoutout.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Common labels. Call with (dict "ctx" $ "component" "app") */}}
{{- define "shoutout.labels" -}}
helm.sh/chart: {{ include "shoutout.chart" .ctx }}
{{ include "shoutout.selectorLabels" . }}
app.kubernetes.io/version: {{ .ctx.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .ctx.Release.Service }}
app.kubernetes.io/part-of: shoutout
{{- end }}

{{- define "shoutout.selectorLabels" -}}
app.kubernetes.io/name: {{ include "shoutout.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "shoutout.secretName" -}}
{{- default (printf "%s-secrets" (include "shoutout.fullname" .)) .Values.secrets.existingSecret }}
{{- end }}

{{/*
Resolve a secret value: explicit value > value already in the cluster > random.
Call with (dict "ctx" $ "key" "auth-secret" "value" .Values.secrets.authSecret)
*/}}
{{- define "shoutout.secretValue" -}}
{{- $existing := lookup "v1" "Secret" .ctx.Release.Namespace (include "shoutout.secretName" .ctx) -}}
{{- $data := (get $existing "data") | default dict -}}
{{- if .value -}}
{{- .value -}}
{{- else if hasKey $data .key -}}
{{- index $data .key | b64dec -}}
{{- else -}}
{{- randAlphaNum 32 -}}
{{- end -}}
{{- end }}

{{- define "shoutout.postgres.host" -}}
{{- printf "%s-postgres" (include "shoutout.fullname" .) }}
{{- end }}

{{- define "shoutout.keycloak.url" -}}
{{- .Values.keycloak.url | trimSuffix "/" }}
{{- end }}

{{- define "shoutout.auth.issuer" -}}
{{- if .Values.auth.issuer }}
{{- .Values.auth.issuer | trimSuffix "/" }}
{{- else if .Values.keycloak.enabled }}
{{- printf "%s/realms/%s" (include "shoutout.keycloak.url" .) .Values.keycloak.realm.name }}
{{- else }}
{{- fail "auth.issuer is required when keycloak.enabled=false" }}
{{- end }}
{{- end }}

{{- define "shoutout.app.image" -}}
{{- $tag := default .Chart.AppVersion .Values.app.image.tag -}}
{{- printf "%s:%s" .Values.app.image.repository $tag }}
{{- end }}

{{/* Env var that provides DATABASE_URL to the app and migrations. */}}
{{- define "shoutout.databaseUrlEnv" -}}
{{- if .Values.postgres.enabled }}
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "shoutout.secretName" . }}
      key: postgres-password
- name: DATABASE_URL
  value: "postgresql://{{ .Values.postgres.username }}:$(POSTGRES_PASSWORD)@{{ include "shoutout.postgres.host" . }}:5432/{{ .Values.database.name }}?schema=public"
{{- else if .Values.database.existingSecret }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.database.existingSecret }}
      key: {{ .Values.database.existingSecretKey }}
{{- else if .Values.database.url }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ include "shoutout.secretName" . }}
      key: database-url
{{- else }}
{{- fail "database.url or database.existingSecret is required when postgres.enabled=false" }}
{{- end }}
{{- end }}

{{- define "shoutout.extraCaCerts.enabled" -}}
{{- if or .Values.app.extraCaCerts.configMap .Values.app.extraCaCerts.secret }}true{{ end }}
{{- end }}

{{- define "shoutout.validateConfig" -}}
{{- if not (has .Values.config.analyticsVisibility (list "admins" "everyone")) }}
{{- fail (printf "config.analyticsVisibility must be \"admins\" or \"everyone\", got %q" .Values.config.analyticsVisibility) }}
{{- end }}
{{- if not (has .Values.logging.level (list "debug" "info" "warn" "error")) }}
{{- fail (printf "logging.level must be debug, info, warn or error, got %q" .Values.logging.level) }}
{{- end }}
{{- if and .Values.app.extraCaCerts.configMap .Values.app.extraCaCerts.secret }}
{{- fail "app.extraCaCerts: set configMap or secret, not both" }}
{{- end }}
{{- with .Values.notifications.email }}
{{- if .enabled }}
{{- if not .smtp.host }}
{{- fail "notifications.email.smtp.host is required when notifications.email.enabled is true" }}
{{- end }}
{{- if not .from }}
{{- fail "notifications.email.from is required when notifications.email.enabled is true" }}
{{- end }}
{{- if not (has .smtp.tls (list "auto" "starttls" "tls" "none")) }}
{{- fail (printf "notifications.email.smtp.tls must be auto, starttls, tls or none, got %q" .smtp.tls) }}
{{- end }}
{{- if or (lt (int .reminderDaysBeforeReset) 0) (gt (int .reminderDaysBeforeReset) 60) }}
{{- fail "notifications.email.reminderDaysBeforeReset must be from 0 to 60" }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Pod securityContext. Fixed IDs are left out on OpenShift, where the restricted-v2
SCC assigns runAsUser/fsGroup from the namespace's range (and rejects others).
Call with (dict "ctx" $ "runAsUser" 70 "runAsGroup" 70 "fsGroup" 70); IDs are optional.
*/}}
{{- define "shoutout.podSecurityContext" -}}
runAsNonRoot: true
{{- if not .ctx.Values.openshift.enabled }}
{{- with .runAsUser }}
runAsUser: {{ . }}
{{- end }}
{{- with .runAsGroup }}
runAsGroup: {{ . }}
{{- end }}
{{- with .fsGroup }}
fsGroup: {{ . }}
{{- end }}
{{- end }}
seccompProfile:
  type: RuntimeDefault
{{- end }}

{{/*
Container securityContext meeting the restricted Pod Security Standard (and restricted-v2).
Call with (dict "readOnlyRootFilesystem" true), or an empty dict.
*/}}
{{- define "shoutout.containerSecurityContext" -}}
allowPrivilegeEscalation: false
{{- if .readOnlyRootFilesystem }}
readOnlyRootFilesystem: true
{{- end }}
capabilities:
  drop: ["ALL"]
{{- end }}

{{/*
Checksum of a ConfigMap/Secret template's contents only, for "restart on change"
annotations. Hashing the whole manifest would include labels such as the chart
version, restarting pods (including PostgreSQL) on every chart upgrade.
Call with (dict "ctx" $ "template" "/postgres/initdb-configmap.yaml")
*/}}
{{- define "shoutout.contentChecksum" -}}
{{- $manifest := include (print .ctx.Template.BasePath .template) .ctx | fromYaml | default dict -}}
{{- pick $manifest "data" "stringData" "binaryData" | toYaml | sha256sum -}}
{{- end }}
