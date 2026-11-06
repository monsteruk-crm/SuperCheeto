import type { AutoState } from '../cockpit/types'

type Props = {state: AutoState; available: boolean; owner: boolean; connected: boolean; settingsReady: boolean; settingsError: boolean; onMode:(armed:boolean)=>void; onRetry:()=>void}
const labels:Record<string,string>={not_armed:'Assist · automatic drafts off',ready:'Waiting for new eligible questions',paused:'AUTO paused',hold:'AUTO held while you select or edit',not_listening:'Start transcription before arming AUTO',detection_disabled:'Enable question suggestions before arming AUTO',configuration_required:'Apply generation settings before arming AUTO',generation_busy:'An answer is running',deferred:'An answer is waiting for publication',capacity:'AUTO paused: answer capacity reached',failed:'AUTO paused after a failure',answer_stopped:'AUTO paused after Stop answer',owner_lost:'AUTO paused: controller disconnected',capture_stopped:'AUTO paused: transcription stopped',capture_started:'Assist after capture restart',source_changed:'AUTO paused: source changed',transcript_cleared:'AUTO paused: transcript cleared',no_owner:'No controller',no_capability:'FULL AUTO requires protocol v6'}
export default function AutoControls(props:Props){
 const {state:s}=props
 const canArm=props.available&&props.connected&&props.owner&&props.settingsReady&&s.listening&&s.detectionEnabled
 return <section className="auto-controls" aria-label="Automatic assistance">
  <div role="group" aria-label="Assistance mode"><button aria-pressed={!s.autoArmed} disabled={!props.available||!props.connected||!props.owner} onClick={()=>props.onMode(false)}>Assist</button><button aria-pressed={s.autoArmed} disabled={!canArm} onClick={()=>props.onMode(true)}>FULL AUTO</button></div>
  {s.autoArmed?<button disabled={!props.connected||!props.owner} onClick={()=>props.onMode(false)}>Pause AUTO</button>:null}
  <span role="status">{!props.available?'FULL AUTO requires a v6 backend.':!props.connected?'Offline · AUTO is off':!props.owner?'Read-only · another window controls assistance':!props.settingsReady?props.settingsError?'AUTO settings rejected; review your choices.':'Applying AUTO settings…':labels[s.pauseReason]||`AUTO paused: ${s.pauseReason.replace(/_/g,' ')}`}</span>
  {!s.autoArmed&&props.available&&props.owner&&props.settingsReady&&(!s.listening||!s.detectionEnabled)?<small>{!s.listening?'Start transcription. ':''}{!s.detectionEnabled?'Enable question suggestions.':''}</small>:null}
  {s.holdReasons.length?<small>Held: {s.holdReasons.map(r=>r.replace(/_/g,' ')).join(', ')}</small>:null}
  {s.pendingCandidate?<small>Newest question queued · earlier questions stay in the inbox</small>:null}
  {s.deferredAnswerId?<small>Generation finished · publication held</small>:null}
  {s.lastError?<p className="auto-error">{s.lastError}</p>:null}
  {props.settingsError?<button disabled={!props.connected||!props.owner} onClick={props.onRetry}>Retry AUTO settings</button>:null}
  <details><summary>Automatic drafts</summary><p>New complete detector proposals only. Drafts remain unreviewed. Selection and editing hold AUTO; manual answers take priority. Arming is never saved.</p></details>
 </section>
}
