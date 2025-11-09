{{- define "minio.name" -}}
{{- default "minio" .Chart.Name -}}
{{- end -}}

{{- define "minio.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "minio.name" .) -}}
{{- end -}}

{{- define "minio.labels" -}}
app.kubernetes.io/name: {{ include "minio.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Chart.AppVersion }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "minio.image" -}}
{{- $repo := .Values.image.repository -}}
{{- $tag := .Values.image.tag -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
