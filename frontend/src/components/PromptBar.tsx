import React, { useState } from 'react'
import { Preset } from '../types'

type Props = {
  presets: Preset[]
  selectedPresetId: string
  onPresetChange: (value: string) => void
  customInstruction: string
  onCustomInstructionChange: (value: string) => void
  models: string[]
  selectedModel: string
  onModelChange: (model: string) => void
  onCaptureScreen: () => void
  onRunPreset: () => void
  onRunCustom: () => void
  canRun: boolean
  isQuerying: boolean
  status: string
  backendError: string | null
  isRunning: boolean
  audioMode: 'system' | 'mic'
  onAudioModeChange: (mode: 'system' | 'mic') => void
  systemAudioLevel: number
  systemAudioRms: number
  systemAudioSources: string[]
  selectedSystemAudioSource: string
  onSystemAudioSourceChange: (sourceName: string) => void
  micAudioLevel: number
  micAudioRms: number
  micAudioSources: string[]
  selectedMicAudioSource: string
  onMicAudioSourceChange: (sourceName: string) => void
  onRefreshAudioSources: () => void
  onStart: () => void
  onStop: () => void
  onToggleAudioMode: () => void
}

const PromptBar: React.FC<Props> = ({
  presets,
  selectedPresetId,
  onPresetChange,
  customInstruction,
  onCustomInstructionChange,
  models,
  selectedModel,
  onModelChange,
  onCaptureScreen,
  onRunPreset,
  onRunCustom,
  canRun,
  isQuerying,
  status,
  backendError,
  isRunning,
  audioMode,
  onAudioModeChange,
  systemAudioLevel,
  systemAudioRms,
  systemAudioSources,
  selectedSystemAudioSource,
  onSystemAudioSourceChange,
  micAudioLevel,
  micAudioRms,
  micAudioSources,
  selectedMicAudioSource,
  onMicAudioSourceChange,
  onRefreshAudioSources,
  onStart,
  onStop,
  onToggleAudioMode
}) => {
  const [customExpanded, setCustomExpanded] = useState(false)
  const meterWidth = (value: number) => `${Math.max(0, Math.min(100, value * 100)).toFixed(2)}%`

  return (
    <section className="prompt-bar">
      <div className="prompt-sections">
        <section className="prompt-panel">
          {backendError ? <div className="backend-error-banner">Backend error: {backendError}</div> : null}
          <div className="prompt-controls">
            <div className="status-pill">{status}</div>
            <div className={`meter-wrap system ${audioMode === 'system' ? 'active' : 'inactive'}`} aria-label="System audio level">
              <div className="meter-track">
                <div className="meter-fill" style={{ width: meterWidth(systemAudioLevel) }} />
              </div>
              <div className="meter-label">
                <span className={`recording-dot ${isRunning && audioMode === 'system' ? 'active' : ''}`} />
                System {systemAudioRms.toFixed(4)}
              </div>
            </div>
            <div className={`meter-wrap mic ${audioMode === 'mic' ? 'active' : 'inactive'}`} aria-label="Microphone level">
              <div className="meter-track">
                <div className="meter-fill" style={{ width: meterWidth(micAudioLevel) }} />
              </div>
              <div className="meter-label">
                <span className={`recording-dot ${isRunning && audioMode === 'mic' ? 'active' : ''}`} />
                Mic {micAudioRms.toFixed(4)}
              </div>
            </div>
            <button className={isRunning ? 'ghost' : 'primary'} onClick={onStart}>Start</button>
            <button className={isRunning ? 'primary' : 'ghost'} onClick={onStop}>Stop</button>
          </div>
          <div className="prompt-controls">
            <div className="select-wrap">
              <label>Input mode</label>
              <select value={audioMode} onChange={(event) => onAudioModeChange(event.target.value === 'mic' ? 'mic' : 'system')}>
                <option value="system">System audio</option>
                <option value="mic">Microphone</option>
              </select>
            </div>
            <button className="ghost" onClick={onToggleAudioMode}>
              Switch to {audioMode === 'mic' ? 'System Audio' : 'Microphone'}
            </button>
            <div className="select-wrap">
              <label>System source</label>
              <select value={selectedSystemAudioSource} onChange={(event) => onSystemAudioSourceChange(event.target.value)}>
                {systemAudioSources.length === 0 ? (
                  <option value="">No monitor sources</option>
                ) : (
                  systemAudioSources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))
                )}
              </select>
            </div>
            <div className="select-wrap">
              <label>Mic source</label>
              <select value={selectedMicAudioSource} onChange={(event) => onMicAudioSourceChange(event.target.value)}>
                {micAudioSources.length === 0 ? (
                  <option value="">No mic sources</option>
                ) : (
                  micAudioSources.map((source) => (
                    <option key={source} value={source}>
                      {source}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button className="ghost" onClick={onRefreshAudioSources}>Refresh sources</button>
          </div>
        </section>

        <section className="prompt-panel">
          <div className="prompt-controls">
            <div className="select-wrap">
              <label>Model</label>
              <select value={selectedModel} onChange={(event) => onModelChange(event.target.value)}>
                {models.length === 0 ? (
                  <option value="">No models loaded</option>
                ) : (
                  models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))
                )}
              </select>
            </div>
            <button className="ghost" onClick={onCaptureScreen}>Capture Screen</button>
            <div className="select-wrap">
              <label>Preset</label>
              <select value={selectedPresetId} onChange={(event) => onPresetChange(event.target.value)}>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
              </select>
            </div>
            <button className="primary" onClick={onRunPreset} disabled={!canRun || isQuerying}>
              Run preset
            </button>
            <div className="input-wrap prompt-ai-instruction">
              <label>Custom instruction</label>
              {customExpanded ? (
                <textarea
                  className="custom-instruction"
                  placeholder="Type your own instruction"
                  value={customInstruction}
                  onChange={(event) => onCustomInstructionChange(event.target.value)}
                  onBlur={() => setCustomExpanded(false)}
                  autoFocus
                  rows={4}
                />
              ) : (
                <input
                  type="text"
                  placeholder="Type your own instruction"
                  value={customInstruction}
                  onChange={(event) => onCustomInstructionChange(event.target.value)}
                  onFocus={() => setCustomExpanded(true)}
                />
              )}
            </div>
            <button className="ghost" onClick={onRunCustom} disabled={!canRun || !customInstruction.trim() || isQuerying}>
              Run custom
            </button>
          </div>
        </section>
      </div>
    </section>
  )
}

export default PromptBar
