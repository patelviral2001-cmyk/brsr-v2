{{- define "copilot.labels" -}}
app.kubernetes.io/name: copilot
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "copilot.selectorLabels" -}}
app.kubernetes.io/name: copilot
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "copilot.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}
