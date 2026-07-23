export type Patient = {
  patient_id: string
  name: string
  age: string
  gender: string
  summary: string
  timeline?: string
  keywords: string
  prescriptions?: string
  conversation?: string
  note?: string
  relevance_score?: number
  updated_at?: string
}

export type ToolTrace = {
  tool: string
  arguments?: Record<string, unknown>
  error?: string
}

const request = async <T>(path: string, options?: RequestInit): Promise<T> => {
  const response = await fetch(path, options)
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body.detail || body.error || `Request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export const api = {
  health: () => request<Record<string, unknown>>('/api/health'),
  patients: () => request<Patient[]>('/api/patients'),
  patient: (id: string) => request<Patient>(`/api/patient/${id}`),
  search: (query: string) =>
    request<{ results: Patient[]; retrieval: string }>('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }),
  saveRecord: (payload: { idx: string; conversation: string; notes: string }) =>
    request<{ message: string; patient: Patient }>('/save_record', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }),
  labelConversation: (conversation: string) =>
    request<{ labeled_conversation: string }>('/label_conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversation }),
    }),
  transcribe: async (audio: Blob) => {
    const form = new FormData()
    form.append('file', audio, 'recording.webm')
    return request<{ transcription: string }>('/transcribe', {
      method: 'POST',
      body: form,
    })
  },
}
