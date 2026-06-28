{{- define "ai-engine.labels" -}}
app.kubernetes.io/name: ai-engine
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "ai-engine.selectorLabels" -}}
app.kubernetes.io/name: ai-engine
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "ai-engine.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}
