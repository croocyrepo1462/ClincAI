import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Activity,
  Bot,
  BrainCircuit,
  Database,
  FileAudio,
  LayoutDashboard,
  Mic,
  Pause,
  Search,
  Send,
  Sparkles,
  Square,
  Stethoscope,
  UserRound,
} from 'lucide-react'
import { api } from './api'
import type { Patient, ToolTrace } from './api'
import './style.css'

type View = 'dashboard' | 'capture' | 'search' | 'agent'
type ChatMessage = { role: 'user' | 'assistant'; content: string; tools?: ToolTrace[] }

const newPatientId = () => Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0')

function App() {
  const [view, setView] = useState<View>('dashboard')
  const [patients, setPatients] = useState<Patient[]>([])
  const [selected, setSelected] = useState<Patient | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const refreshPatients = () => api.patients().then(setPatients).catch((e) => setError(e.message))
  useEffect(() => void refreshPatients(), [])

  const navigate = (next: View) => {
    setError('')
    setView(next)
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark"><Stethoscope size={24} /></span>
          <div><strong>ClinAI</strong><small>Clinical Intelligence</small></div>
        </div>
        <nav>
          <NavItem active={view === 'dashboard'} icon={<LayoutDashboard />} label="Overview" onClick={() => navigate('dashboard')} />
          <NavItem active={view === 'capture'} icon={<FileAudio />} label="Capture Visit" onClick={() => navigate('capture')} />
          <NavItem active={view === 'search'} icon={<Search />} label="Semantic Search" onClick={() => navigate('search')} />
          <NavItem active={view === 'agent'} icon={<Bot />} label="Agent Assistant" onClick={() => navigate('agent')} />
        </nav>
        <div className="stack-card">
          <div><span className="status-dot" /> Systems online</div>
          <small>Groq · Chroma · SQLite</small>
        </div>
      </aside>

      <main>
        <header className="topbar">
          <div>
            <p className="eyebrow">AGENTIC HEALTHCARE WORKSPACE</p>
            <h1>{viewTitle[view]}</h1>
          </div>
          <div className="model-pill"><Sparkles size={15} /> Llama 3.3 70B via Groq</div>
        </header>
        {error && <div className="alert">{error}<button onClick={() => setError('')}>×</button></div>}
        {view === 'dashboard' && <Dashboard patients={patients} onSelect={setSelected} onNavigate={navigate} />}
        {view === 'capture' && <Capture loading={loading} setLoading={setLoading} setError={setError} onSaved={() => { refreshPatients(); navigate('dashboard') }} />}
        {view === 'search' && <SemanticSearch setError={setError} onSelect={setSelected} />}
        {view === 'agent' && <AgentChat setError={setError} />}
      </main>
      {selected && <PatientPanel patient={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}

const viewTitle: Record<View, string> = {
  dashboard: 'Patient intelligence',
  capture: 'Capture a clinical visit',
  search: 'Semantic patient retrieval',
  agent: 'ClinAI agent',
}

function NavItem({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button className={active ? 'nav-item active' : 'nav-item'} onClick={onClick}>{icon}<span>{label}</span></button>
}

function Dashboard({ patients, onSelect, onNavigate }: { patients: Patient[]; onSelect: (p: Patient) => void; onNavigate: (v: View) => void }) {
  return (
    <section className="content">
      <div className="hero">
        <div>
          <span className="hero-tag"><BrainCircuit size={16} /> Agentic clinical intelligence</span>
          <h2>Turn clinical conversations into actionable patient context.</h2>
          <p>Voice capture, structured extraction, vector retrieval, and tool-calling workflows in one local-first workspace.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => onNavigate('capture')}><Mic size={17} /> Capture visit</button>
            <button className="secondary" onClick={() => onNavigate('agent')}><Bot size={17} /> Ask ClinAI</button>
          </div>
        </div>
        <div className="orb"><Activity size={72} /></div>
      </div>
      <div className="stats">
        <Stat icon={<UserRound />} value={String(patients.length)} label="Patient records" />
        <Stat icon={<Database />} value="SQLite" label="Structured store" />
        <Stat icon={<BrainCircuit />} value="Chroma" label="Vector retrieval" />
      </div>
      <div className="section-heading"><div><p className="eyebrow">RECENT ACTIVITY</p><h3>Patient records</h3></div></div>
      <div className="patient-grid">
        {patients.length === 0 && <Empty text="No patient records yet. Capture a visit or ask the agent to create one." />}
        {patients.map((patient) => <PatientCard key={patient.patient_id} patient={patient} onClick={() => onSelect(patient)} />)}
      </div>
    </section>
  )
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return <div className="stat-card"><span>{icon}</span><div><strong>{value}</strong><small>{label}</small></div></div>
}

function PatientCard({ patient, onClick }: { patient: Patient; onClick: () => void }) {
  return (
    <button className="patient-card" onClick={onClick}>
      <div className="patient-top"><span className="avatar">{(patient.name || 'P').charAt(0)}</span><span className="id">#{patient.patient_id}</span></div>
      <h4>{patient.name || 'Unknown patient'}</h4>
      <p>{patient.summary || 'No clinical summary available.'}</p>
      <div className="patient-meta"><span>{patient.age || 'NA'} yrs</span><span>{patient.gender || 'NA'}</span></div>
    </button>
  )
}

function Capture({ loading, setLoading, setError, onSaved }: { loading: boolean; setLoading: (v: boolean) => void; setError: (v: string) => void; onSaved: () => void }) {
  const [id, setId] = useState(newPatientId)
  const [conversation, setConversation] = useState('')
  const [notes, setNotes] = useState('')
  const [recording, setRecording] = useState(false)
  const [paused, setPaused] = useState(false)
  const recorder = useRef<MediaRecorder | null>(null)
  const chunks = useRef<Blob[]>([])

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      recorder.current = new MediaRecorder(stream)
      chunks.current = []
      recorder.current.ondataavailable = (event) => chunks.current.push(event.data)
      recorder.current.onstop = async () => {
        setLoading(true)
        try {
          const { transcription } = await api.transcribe(new Blob(chunks.current, { type: 'audio/webm' }))
          const { labeled_conversation } = await api.labelConversation(transcription)
          setConversation((current) => [current, labeled_conversation].filter(Boolean).join('\n'))
        } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
        stream.getTracks().forEach((track) => track.stop())
      }
      recorder.current.start()
      setRecording(true)
    } catch (e) { setError((e as Error).message) }
  }
  const togglePause = () => {
    if (!recorder.current) return
    paused ? recorder.current.resume() : recorder.current.pause()
    setPaused(!paused)
  }
  const stop = () => {
    recorder.current?.stop()
    setRecording(false)
    setPaused(false)
  }
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setLoading(true)
    try { await api.saveRecord({ idx: id, conversation, notes }); onSaved() }
    catch (e) { setError((e as Error).message) }
    finally { setLoading(false) }
  }
  return (
    <section className="content split">
      <form className="surface capture-form" onSubmit={save}>
        <div className="surface-head"><div><p className="eyebrow">STRUCTURED EXTRACTION</p><h3>Visit details</h3></div><span className="step">01</span></div>
        <label>Patient ID<input value={id} onChange={(e) => setId(e.target.value)} required /></label>
        <label>Doctor–patient conversation<textarea rows={11} value={conversation} onChange={(e) => setConversation(e.target.value)} placeholder="Record audio or paste the conversation..." /></label>
        <label>Clinical notes<textarea rows={5} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional supporting notes..." /></label>
        <button className="primary full" disabled={loading || (!conversation && !notes)}>{loading ? 'Processing with Groq…' : 'Extract & save record'}</button>
      </form>
      <div className="surface recorder">
        <p className="eyebrow">GROQ WHISPER</p><h3>Voice capture</h3>
        <div className={recording ? 'record-disc active' : 'record-disc'}><Mic size={46} /></div>
        <p>{recording ? paused ? 'Recording paused' : 'Listening to the clinical conversation…' : 'Start a secure browser recording. Audio is transcribed through Groq Whisper.'}</p>
        <div className="recorder-actions">
          {!recording && <button className="primary" type="button" onClick={start}><Mic size={17} /> Start recording</button>}
          {recording && <><button className="secondary" type="button" onClick={togglePause}><Pause size={17} /> {paused ? 'Resume' : 'Pause'}</button><button className="danger" type="button" onClick={stop}><Square size={15} /> Stop</button></>}
        </div>
      </div>
    </section>
  )
}

function SemanticSearch({ setError, onSelect }: { setError: (v: string) => void; onSelect: (p: Patient) => void }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Patient[]>([])
  const [loading, setLoading] = useState(false)
  const search = async (event: FormEvent) => {
    event.preventDefault(); setLoading(true)
    try { setResults((await api.search(query)).results) } catch (e) { setError((e as Error).message) } finally { setLoading(false) }
  }
  return (
    <section className="content">
      <div className="search-hero"><p className="eyebrow">CHROMA VECTOR RAG</p><h2>Search clinical meaning, not just keywords.</h2><p>Try “older patients taking diabetes medication” or “history of chest pain with hypertension”.</p>
        <form className="search-box" onSubmit={search}><Search /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Describe the patient cohort…" /><button disabled={loading || !query}>{loading ? 'Retrieving…' : 'Search'}</button></form>
      </div>
      <div className="result-list">
        {results.map((patient) => <button className="result-card" key={patient.patient_id} onClick={() => onSelect(patient)}><div><span className="id">#{patient.patient_id}</span><h3>{patient.name}</h3><p>{patient.summary}</p></div><strong>{patient.relevance_score}%<small>semantic match</small></strong></button>)}
      </div>
      {!loading && results.length === 0 && <Empty text="Results will appear here with vector similarity scores." />}
    </section>
  )
}

function AgentChat({ setError }: { setError: (v: string) => void }) {
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([{ role: 'assistant', content: 'I can search patient records, retrieve a patient, list recent records, or create a structured record from clinical text.' }])
  const [busy, setBusy] = useState(false)
  const sessionId = useRef(crypto.randomUUID())
  const send = async (event: FormEvent) => {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setMessages((current) => [...current, { role: 'user', content: text }, { role: 'assistant', content: '' }])
    setInput(''); setBusy(true)
    try {
      const response = await fetch('/api/chat/stream', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: text, session_id: sessionId.current }) })
      if (!response.ok || !response.body) throw new Error('Agent stream failed')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''; const tools: ToolTrace[] = []
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n'); buffer = events.pop() || ''
        for (const eventText of events) {
          const line = eventText.split('\n').find((line) => line.startsWith('data: '))
          if (!line) continue
          const eventData = JSON.parse(line.slice(6))
          if (eventData.type === 'tool') tools.push(eventData)
          if (eventData.type === 'token') setMessages((current) => current.map((message, index) => index === current.length - 1 ? { ...message, content: message.content + eventData.content, tools: [...tools] } : message))
        }
      }
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <section className="content chat-layout">
      <div className="surface chat-panel">
        <div className="chat-head"><span className="bot-avatar"><Bot /></span><div><h3>ClinAI Orchestrator</h3><small><span className="status-dot" /> Tool use and session memory active</small></div></div>
        <div className="messages">{messages.map((message, index) => <div key={index} className={`message ${message.role}`}><div>{message.content || <span className="typing">Planning and calling tools…</span>}</div>{message.tools && message.tools.length > 0 && <div className="tool-trace">{message.tools.map((tool, i) => <span key={i}><BrainCircuit size={13} /> {tool.tool}</span>)}</div>}</div>)}</div>
        <form className="composer" onSubmit={send}><input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask ClinAI to search, retrieve, or create a record…" /><button disabled={busy}><Send size={18} /></button></form>
      </div>
      <div className="agent-info">
        <p className="eyebrow">AGENT CAPABILITIES</p>
        {['Agentic RAG retrieval', 'Patient record lookup', 'Structured record creation', 'Multi-turn session context'].map((item) => <div className="capability" key={item}><Sparkles size={16} /> {item}</div>)}
      </div>
    </section>
  )
}

function PatientPanel({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  let timeline: string[] = []
  try { timeline = JSON.parse(patient.timeline || '[]') } catch { timeline = patient.timeline ? [patient.timeline] : [] }
  return <div className="overlay" onClick={onClose}><aside className="patient-panel" onClick={(e) => e.stopPropagation()}><button className="close" onClick={onClose}>×</button><span className="avatar large">{(patient.name || 'P').charAt(0)}</span><p className="eyebrow">PATIENT #{patient.patient_id}</p><h2>{patient.name}</h2><div className="patient-meta"><span>{patient.age} years</span><span>{patient.gender}</span></div><Detail title="Clinical summary" value={patient.summary} /><Detail title="Keywords" value={patient.keywords} /><Detail title="Prescriptions" value={patient.prescriptions || 'None recorded'} />{timeline.length > 0 && <div className="detail"><h4>Timeline</h4><ol>{timeline.map((event, i) => <li key={i}>{event}</li>)}</ol></div>}</aside></div>
}

function Detail({ title, value }: { title: string; value?: string }) { return <div className="detail"><h4>{title}</h4><p>{value || 'Not available'}</p></div> }
function Empty({ text }: { text: string }) { return <div className="empty"><BrainCircuit size={30} /><p>{text}</p></div> }

export default App
