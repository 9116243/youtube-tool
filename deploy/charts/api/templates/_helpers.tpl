{{- define "api.name" -}}
{{- default "youtube-api" .Chart.Name -}}
{{- end -}}

{{- define "api.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "api.name" .) -}}
{{- end -}}

{{- define "api.labels" -}}
app.kubernetes.io/name: {{ include "api.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Chart.AppVersion }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "api.image" -}}
{{- $repo := .Values.image.repository -}}
{{- $name := .Values.image.name -}}
{{- $tag := .Values.image.tag -}}
{{- printf "%s/%s:%s" $repo $name $tag -}}
{{- end -}}
