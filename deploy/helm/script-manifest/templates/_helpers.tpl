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
