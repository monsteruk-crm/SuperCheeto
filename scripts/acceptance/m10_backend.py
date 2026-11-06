"""Isolated M10 acceptance host. Never opens the user's runtime RAG database.

Synthetic mode injects only external/audio dependencies, preserving the real
controller, protocol, SQLite, file readers, scheduler and WebSocket transport.
Live mode preserves real capture/STT/Gateway and enforces bounded inference.
The control server is loopback-only and exists only in synthetic mode.
"""
from __future__ import annotations
import argparse
import asyncio
import dataclasses
import json
import signal
import sys
from pathlib import Path
from time import perf_counter
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'backend'))
from dotenv import load_dotenv
load_dotenv(ROOT / 'backend/.env.local')
import app.main as main
from app.audio_capture import AudioSourceInfo
from app.stt import Segment

parser = argparse.ArgumentParser()
parser.add_argument('--workdir', required=True, type=Path)
parser.add_argument('--mode', choices=['synthetic', 'live'], default='synthetic')
parser.add_argument('--port', type=int, default=8765)
args = parser.parse_args()
work = args.workdir.resolve()
if work == ROOT or ROOT in work.parents:
    parser.error('Use an external temporary acceptance workdir, never repository storage')
work.mkdir(parents=True, exist_ok=True)
if args.mode == 'synthetic':
    from docx import Document
    from pypdf import PdfWriter
    from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
    fixtures = work / 'fixtures'
    fixtures.mkdir(exist_ok=True)
    if not (fixtures/'a.txt').exists():
        (fixtures/'a.txt').write_text('Synthetic acceptance reference: cobalt-lantern-42. Review rollback before deployment.')
    if not (fixtures/'b.md').exists():
        (fixtures/'b.md').write_text('# Synthetic acceptance\nAster owns this fictional checklist.')
    if not (fixtures/'c.docx').exists():
        doc=Document();doc.add_paragraph('Synthetic Word evidence: rollback readiness.');doc.save(fixtures/'c.docx')
    if not (fixtures/'d.pdf').exists():
        writer=PdfWriter();page=writer.add_blank_page(width=300,height=300)
        font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
        page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
        stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 20 200 Td (Synthetic PDF evidence: rollback review) Tj ET')
        page[NameObject('/Contents')]=writer._add_object(stream)
        with (fixtures/'d.pdf').open('wb') as out:writer.write(out)
base = main.Settings()
main.Settings = lambda: dataclasses.replace(base, rag_db_path=str(work/'rag.sqlite'), ws_port=args.port)
app = main.AppController()
started = perf_counter()
stats = {'mode': args.mode, 'defaultModel': base.ai_gateway_model, 'commands': [], 'events': [], 'answers': [], 'calls': 0,
         'detectorCalls': 0, 'concurrent': 0, 'maxConcurrent': 0, 'segments': [], 'errors': []}
scenario = {'generation': 'success', 'detector': 'success'}

def save():
    (work/'stats.json').write_text(json.dumps(stats, indent=2, default=str))

original_handle = app._handle_message
async def handle(data, connection):
    stats['commands'].append({'type':data.get('type'), 'commandId':data.get('commandId'), 'atMs':(perf_counter()-started)*1000})
    save()
    await original_handle(data, connection)
app.hub._handler = handle
original_send = app._send_v2
async def send(connection_id, kind, payload):
    if kind.startswith('answer_') or kind == 'request_error':
        stats['events'].append({'type':kind, 'requestId':payload.get('requestId'), 'answerId':payload.get('answerId'), 'status':payload.get('status'), 'metadata':payload.get('metadata') if kind == 'answer_finished' else None, 'timing':payload.get('timing'), 'atMs':(perf_counter()-started)*1000})
        save()
    return await original_send(connection_id, kind, payload)
app._send_v2 = send
original_segment = app._on_segment
async def segment(value):
    stats['segments'].append({'t0':value.t0,'t1':value.t1,'chars':len(value.text),'atMs':(perf_counter()-started)*1000})
    save()
    await original_segment(value)
app._on_segment = segment

async def generate(**kwargs):
    if args.mode == 'live' and stats['calls'] >= 2:
        raise RuntimeError('M10 live answer budget exhausted (two starts maximum)')
    stats['calls'] += 1
    stats['concurrent'] += 1
    stats['maxConcurrent'] = max(stats['maxConcurrent'],stats['concurrent'])
    begin = perf_counter(); first = None; count = 0
    callback = kwargs['on_stream_delta']
    async def delta(text):
        nonlocal first, count
        if first is None: first = (perf_counter()-begin)*1000
        count += 1
        await callback(text)
    kwargs['on_stream_delta'] = delta
    save()
    try:
        if args.mode == 'live':
            client = await app._ensure_ai_gateway_client()
            result = await client.run_query(**kwargs)
        else:
            mode = scenario['generation']
            if mode == 'pre_error': raise RuntimeError('Synthetic pre-stream failure')
            if mode == 'empty':
                result = SimpleNamespace(text='',latency_ms=1,input_tokens=10,output_tokens=0,total_tokens=10)
            else:
                await delta('**M10 synthetic lead** — source-linked draft.\n\n')
                await asyncio.sleep(2)
                if mode == 'partial_error': raise RuntimeError('Synthetic partial failure')
                tail = '| Check | Result |\n|---|---|\n| Local fixture | Read |\n\n`code` and [safe link](https://example.com).'
                await delta(tail)
                result = SimpleNamespace(text='**M10 synthetic lead** — source-linked draft.\n\n'+tail,latency_ms=2000,input_tokens=10,output_tokens=20,total_tokens=30)
        stats['answers'].append({'model':kwargs.get('model'),'firstDeltaMs':first,'deltaCount':count,'elapsedMs':(perf_counter()-begin)*1000,'inputTokens':result.input_tokens,'outputTokens':result.output_tokens})
        return result
    except asyncio.CancelledError:
        stats['errors'].append('generation_cancelled'); raise
    except Exception as exc:
        stats['errors'].append(str(exc)); raise
    finally:
        stats['concurrent'] -= 1; save()
app._generation_runner = generate

async def detect(frozen, settings):
    if args.mode == 'live' and stats['detectorCalls'] >= 3:
        raise RuntimeError('M10 detector budget exhausted')
    stats['detectorCalls'] += 1; save()
    if args.mode == 'live':
        client = await app._ensure_ai_gateway_client()
        return await client.detect_questions(frozen,settings)
    if scenario['detector'] == 'error': raise RuntimeError('Synthetic detector failure')
    if scenario['detector'] == 'stall': await asyncio.sleep(30)
    if scenario['detector'] == 'empty': return {'proposals':[]}
    record = frozen.records[-1]
    return {'proposals':[{'wording':'Explain the synthetic rollback plan.','state':'proposed','reason':'','reviewReasons':[],'sourceSpans':[{'segmentKey':record.segment_key,'revision':record.revision,'start':0,'end':len(record.text)}]}]}
app.questions._runner = detect
if args.mode == 'live':
    app.questions.detector.enabled = False

if args.mode == 'synthetic':
    main.discover_audio_sources = lambda: AudioSourceInfo(None,'Synthetic microphone','Synthetic monitor','Synthetic monitor','Synthetic microphone',['Synthetic monitor'],['Synthetic microphone'])
    class Catalog:
        async def list_models(self): return [base.ai_gateway_model,base.detector_model]
        async def list_model_details(self): return [{'id':base.ai_gateway_model,'type':'language','owned_by':'acceptance-fixture'}]
        async def embed_texts(self,texts,**kwargs): return [[1.,0.,0.] for _ in texts]
        async def run_query(self,**kwargs):
            return SimpleNamespace(text=json.dumps({'test_id':'m10','image_used':bool(kwargs.get('screenshot_data_url')),'image_capability_claim':'synthetic','answer':'Synthetic benchmark answer','confidence':.9,'self_check':['fixture'],'failure_modes':[]}),latency_ms=30,first_token_latency_ms=12,input_tokens=10,output_tokens=5,total_tokens=15)
        async def close(self): pass
    app._ai_gateway_client = Catalog()
    async def ensure(*args): pass
    app._ensure_meter_loop = ensure
    async def start_capture():
        app.state.running=True
        await app._invalidate_session('capture_started')
        await app.hub.broadcast('status',{'state':'transcribing','details':'Synthetic capture only'})
    async def stop_capture(emit_status=True):
        app.state.running=False
        await app._invalidate_session('capture_stopped')
        if emit_status: await app.hub.broadcast('status',{'state':'stopped'})
    app.start_transcription=start_capture; app.stop_transcription=stop_capture

async def seed(text='Explain the synthetic rollback plan and its risks.'):
    index=len(app.transcript.records())+1
    value=Segment(id=index,t0=index*4,t1=index*4+2,text=text,is_final=True)
    if app.state.running:
        await app._on_segment(value)
    else:
        app.transcript.add_segment(value)
        r=app.transcript.records()[-1]
        await app.hub.broadcast('transcript_segment',{'segment':{**value.__dict__,'segmentKey':r.segment_key,'audioEpoch':r.audio_epoch,'revision':r.revision}})

async def control(reader,writer):
    try:
        line=await reader.readline(); method,path,_=line.decode().split(' ',2); length=0
        while (line:=await reader.readline()) not in (b'\r\n',b''):
            if line.lower().startswith(b'content-length:'): length=int(line.split(b':')[1])
        body=json.loads(await reader.readexactly(length)) if length else {}
        if method=='POST' and path=='/seed': await seed(body.get('text','Explain the new synthetic release risk.'))
        elif method=='POST' and path=='/scenario': scenario.update({k:v for k,v in body.items() if k in scenario})
        elif path!='/stats': raise ValueError('Unknown acceptance endpoint')
        payload=json.dumps(stats).encode();writer.write(b'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: '+str(len(payload)).encode()+b'\r\nConnection: close\r\n\r\n'+payload)
        await writer.drain()
    finally:writer.close();await writer.wait_closed()

async def telemetry():
    seeded=set(); real_start=None
    while True:
        if args.mode=='synthetic':
            owner=app.lease.owner_connection_id
            if owner and owner not in seeded:
                seeded.add(owner)
                if not app.transcript.records(): await seed()
                else:
                    for r in app.transcript.records(): await app.hub.broadcast('transcript_segment',{'segment':{'id':r.segment_id,'segmentKey':r.segment_key,'audioEpoch':r.audio_epoch,'revision':r.revision,'t0':r.t0,'t1':r.t1,'text':r.text,'is_final':True}})
            for kind,source in [('system',app.state.monitor_source),('mic',app.state.mic_source)]: await app._emit_audio_level(kind,source,.03,.2,.3,perf_counter())
        else:
            if app.state.running and real_start is None: real_start=perf_counter(); stats['captureStartMs']=(real_start-started)*1000; save()
            if real_start and perf_counter()-real_start>=90:
                await app.questions.detector.set_enabled(False)
                await app.auto.invalidate('acceptance_time_limit')
                await app.stop_transcription()
                stats['captureStoppedByLimit']=True;save();real_start=None
            if stats['detectorCalls']>=3 and not app.questions.detector.in_flight and app.questions.detector.enabled:
                await app.questions.detector.set_enabled(False)
            if stats['calls']>=2 and stats['concurrent']==0 and app.auto.state.armed:
                await app.auto.invalidate('acceptance_answer_limit')
                await app.questions.detector.set_enabled(False)
        await asyncio.sleep(.1)

async def run():
    stop=asyncio.Event()
    for sig in (signal.SIGINT,signal.SIGTERM):asyncio.get_running_loop().add_signal_handler(sig,stop.set)
    await app.start();save(); task=asyncio.create_task(telemetry())
    server=await asyncio.start_server(control,'127.0.0.1',args.port+14) if args.mode=='synthetic' else None
    try:await stop.wait()
    finally:
        task.cancel();await asyncio.gather(task,return_exceptions=True)
        if server:server.close();await server.wait_closed()
        await app.stop();save()
asyncio.run(run())
