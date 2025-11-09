{{- define "worker-gpu.name" -}}
{{- default "worker-gpu" .Chart.Name -}}
{{- end -}}

{{- define "worker-gpu.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "worker-gpu.name" .) -}}
{{- end -}}

{{- define "worker-gpu.labels" -}}
app.kubernetes.io/name: {{ include "worker-gpu.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Chart.AppVersion }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "worker-gpu.image" -}}
{{- $repo := .Values.image.repository -}}
{{- $name := .Values.image.name -}}
{{- $tag := .Values.image.tag -}}
{{- printf "%s/%s:%s" $repo $name $tag -}}
{{- end -}}
