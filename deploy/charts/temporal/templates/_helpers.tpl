{{- define "temporal.name" -}}
{{- default "temporal" .Chart.Name -}}
{{- end -}}

{{- define "temporal.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "temporal.name" .) -}}
{{- end -}}

{{- define "temporal.labels" -}}
app.kubernetes.io/name: {{ include "temporal.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Chart.AppVersion }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "temporal.image" -}}
{{- $repo := .Values.image.repository -}}
{{- $tag := .Values.image.tag -}}
{{- printf "%s:%s" $repo $tag -}}
{{- end -}}
