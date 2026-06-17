{{- define "workflow.labels" -}}
app.kubernetes.io/name: workflow
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "workflow.selectorLabels" -}}
app.kubernetes.io/name: workflow
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "workflow.fullname" -}}
{{- printf "%s" .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- end }}
