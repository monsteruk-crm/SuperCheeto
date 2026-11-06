import React, { useState } from 'react'

type Props = {
  output: string
  isQuerying: boolean
  canStopQuery: boolean
  canRunAgain: boolean
  onStopQuery: () => void
  onRunAgain: () => void
  screenshotDataUrl: string | null
  onClearScreenshot: () => void
  latencyMs: number | null
  model: string
  screenshotUsed: boolean
  selectedTextDraft: string
  onSelectedTextDraftChange: (value: string) => void
  onAnswer: () => void
  canAnswer: boolean
  onResetSelectedTextDraft: () => void
  canResetSelectedTextDraft: boolean
  collapsedRows: number
  focusedRows: number
}

const OutputPane: React.FC<Props> = ({
  output,
  isQuerying,
  canStopQuery,
  canRunAgain,
  onStopQuery,
  onRunAgain,
  screenshotDataUrl,
  onClearScreenshot,
  latencyMs,
  model,
  screenshotUsed,
  selectedTextDraft,
  onSelectedTextDraftChange,
  onAnswer,
  canAnswer,
  onResetSelectedTextDraft,
  canResetSelectedTextDraft,
  collapsedRows,
  focusedRows
}) => {
  const [textFocused, setTextFocused] = useState(false)

  return (
    <section className="pane output">
      <header>
        <div>
          <h2>Response</h2>
          <p>Latest answer from AI Gateway based on the selected transcript.</p>
        </div>
        <div className="response-header-actions">
          {isQuerying ? <div className="querying-pill">Streaming response...</div> : null}
          <button className="ghost" onClick={onStopQuery} disabled={!canStopQuery || !isQuerying}>
            Stop
          </button>
          <button className="primary" onClick={onRunAgain} disabled={!canRunAgain || isQuerying}>
            Do it again
          </button>
        </div>
      </header>
      <div className="output-body">
        {latencyMs !== null ? (
          <div className="response-meta">
            <span>Latency: {Math.round(latencyMs)} ms</span>
            <span>Model: {model || '-'}</span>
            <span>Screenshot sent: {screenshotUsed ? 'yes' : 'no'}</span>
          </div>
        ) : null}
        {screenshotDataUrl ? (
          <div className="screenshot-preview">
            <img src={screenshotDataUrl} alt="Captured screen thumbnail" />
            <button className="ghost danger overlay-trash" onClick={onClearScreenshot}>Trash</button>
          </div>
        ) : null}
        <div className="input-wrap selected-text-editor">
          <div className="selected-text-editor-header">
            <label>Selected text to send (editable)</label>
            <div className="selected-text-editor-actions">
              <button className="primary" onClick={onAnswer} disabled={!canAnswer || isQuerying}>
                Answer
              </button>
              <button className="ghost" onClick={onResetSelectedTextDraft} disabled={!canResetSelectedTextDraft}>
                Reset to selection
              </button>
            </div>
          </div>
          <textarea
            value={selectedTextDraft}
            rows={textFocused ? focusedRows : collapsedRows}
            onFocus={() => setTextFocused(true)}
            onBlur={() => setTextFocused(false)}
            onChange={(event) => onSelectedTextDraftChange(event.target.value)}
            placeholder="Select transcript text, then edit it here before sending your prompt."
          />
        </div>
        {output ? <pre>{output}</pre> : <p className="muted">No response yet.</p>}
      </div>
    </section>
  )
}

export default OutputPane
