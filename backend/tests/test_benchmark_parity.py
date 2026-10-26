"""M06 actual benchmark orchestration; synthetic Gateway, isolated persistence."""
import dataclasses
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
import app.main as main
BASE=main.Settings()
class BenchmarkParityTests(unittest.IsolatedAsyncioTestCase):
    async def test_models_repeats_images_progress_failures_logs_and_final_summary(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(main,'Settings',lambda:dataclasses.replace(BASE,rag_db_path=str(Path(tmp)/'rag.sqlite'))):app=main.AppController()
            calls=[]
            async def query(**kwargs):
                calls.append(kwargs)
                if kwargs['model']=='synthetic/failing':raise RuntimeError('Synthetic provider failure')
                return SimpleNamespace(text=json.dumps({'test_id':'synthetic','image_used':True,'image_capability_claim':'worked','answer':'Synthetic answer','confidence':.9,'self_check':['fixture'],'failure_modes':[]}),latency_ms=30,first_token_latency_ms=12,input_tokens=10,output_tokens=5,total_tokens=15)
            app._ai_gateway_client=SimpleNamespace(run_query=query)
            app.hub.broadcast=AsyncMock()
            try:
                await app.run_benchmark({'benchmarkId':'m06','models':['synthetic/ok','synthetic/failing'],'instruction':'Synthetic instruction','tests':[{'testId':'a','userPrompt':'Synthetic question','imageRef':'IMAGE_1','imageDataUrl':'data:image/png;base64,YWJj'},{'testId':'b','userPrompt':'Synthetic second question'}],'repeats':2})
                self.assertEqual(len(calls),8)
                self.assertEqual(calls[0]['screenshot_data_url'],'data:image/png;base64,YWJj')
                messages=app.hub.broadcast.call_args_list
                logs=[c.args[1] for c in messages if c.args[0]=='benchmark_log']
                self.assertEqual(len(logs),8)
                self.assertTrue(any(row.get('error')=='Synthetic provider failure' for row in logs))
                progress=[c.args[1] for c in messages if c.args[0]=='benchmark_progress']
                self.assertEqual(progress[-1]['completed'],8)
                result=next(c.args[1] for c in messages if c.args[0]=='benchmark_complete')
                self.assertEqual(len(result['attempts']),8);self.assertEqual(len(result['results']),4)
                self.assertEqual(sum(r['failures'] for r in result['results']),4)
                self.assertEqual(sum(r['runs'] for r in result['results']),4)
                self.assertTrue(all(row['ttcMs']==30 for row in logs if row['success']))
            finally:app._rag_store.close()
