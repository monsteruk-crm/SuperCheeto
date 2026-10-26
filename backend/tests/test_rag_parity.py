"""M06 real file readers and SQLite, deterministic local embedding fixture."""
import tempfile
import unittest
from pathlib import Path
from docx import Document
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from app.rag_store import LocalRagStore

class RagParityTests(unittest.IsolatedAsyncioTestCase):
    async def test_file_folder_formats_update_skip_metadata_reopen_search_and_clear(self):
        async def embeddings(texts): return [[1.,0.,0.] for _ in texts]
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);folder=root/'fixtures';folder.mkdir()
            (folder/'a.txt').write_text('Synthetic plain text rollback checklist')
            (folder/'b.md').write_text('# Synthetic markdown\nRestore the healthy deployment')
            doc=Document();doc.add_paragraph('Synthetic Word evidence');doc.save(folder/'c.docx')
            writer=PdfWriter();page=writer.add_blank_page(width=300,height=300)
            font=DictionaryObject({NameObject('/Type'):NameObject('/Font'),NameObject('/Subtype'):NameObject('/Type1'),NameObject('/BaseFont'):NameObject('/Helvetica')})
            page[NameObject('/Resources')]=DictionaryObject({NameObject('/Font'):DictionaryObject({NameObject('/F1'):writer._add_object(font)})})
            stream=DecodedStreamObject();stream.set_data(b'BT /F1 12 Tf 20 200 Td (Synthetic PDF evidence) Tj ET')
            page[NameObject('/Contents')]=writer._add_object(stream)
            with (folder/'d.pdf').open('wb') as out:writer.write(out)
            store=LocalRagStore(str(root/'isolated.sqlite'))
            try:
                one=await store.ingest_paths([str(folder/'a.txt')],embeddings)
                self.assertEqual(one.ingested,1)
                report=await store.ingest_paths([str(folder)],embeddings)
                self.assertEqual((report.ingested,report.skipped,report.failed),(3,1,0))
                docs=store.list_documents();self.assertEqual(len(docs),4)
                self.assertTrue(all(d.doc_id and d.file_path and d.title and d.chunk_count>0 and d.updated_at>0 for d in docs))
                chunks=await store.search('Synthetic',top_k=6,embed_texts=embeddings)
                self.assertEqual(len(chunks),4)
                self.assertTrue(any('PDF evidence' in chunk.text for chunk in chunks))
                self.assertTrue(any('Word evidence' in chunk.text for chunk in chunks))
                (folder/'a.txt').write_text('Updated synthetic checklist')
                updated=await store.ingest_paths([str(folder/'a.txt')],embeddings);self.assertEqual(updated.updated,1)
                failed=await store.ingest_paths([str(folder/'missing.txt')],embeddings);self.assertTrue(failed.errors)
                store.close();store=LocalRagStore(str(root/'isolated.sqlite'))
                self.assertEqual(len(store.list_documents()),4)
                store.clear();self.assertEqual(store.list_documents(),[])
                self.assertEqual(await store.search('Synthetic',top_k=6,embed_texts=embeddings),[])
            finally:store.close()
