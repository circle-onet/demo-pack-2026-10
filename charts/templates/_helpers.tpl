{{- define "circleci.labels" -}}
circleci.com/component-name: demo-go-to-green-staging
circleci.com/version: {{ .Values.images.name.app.tag }}
{{- end }}

{{- define "circleci.annotations" -}}
circleci.com/project-id: {{ .Values.circleProjectId }}
circleci.com/helm-revision-number: {{ .Release.Revision | quote }}
{{- end }}
