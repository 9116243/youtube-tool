{{- define "worker-cpu.name" -}}
{{- default "worker-cpu" .Chart.Name -}}
{{- end -}}

{{- define "worker-cpu.fullname" -}}
{{- printf "%s-%s" .Release.Name (include "worker-cpu.name" .) -}}
{{- end -}}

{{- define "worker-cpu.labels" -}}
app.kubernetes.io/name: {{ include "worker-cpu.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ default .Chart.AppVersion .Chart.AppVersion }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version }}
{{- end -}}

{{- define "worker-cpu.image" -}}
{{- $repo := .Values.image.repository -}}
{{- $name := .Values.image.name -}}
{{- $tag := .Values.image.tag -}}
{{- printf "%s/%s:%s" $repo $name $tag -}}
{{- end -}}
