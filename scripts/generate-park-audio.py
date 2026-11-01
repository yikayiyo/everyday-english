import importlib.util,json,subprocess,os
from pathlib import Path
os.chdir(Path(__file__).resolve().parent.parent)
spec=importlib.util.spec_from_file_location('b','/workspace/ielts-riki/daily-ielts-speaking/scripts/build.py');b=importlib.util.module_from_spec(spec);spec.loader.exec_module(b)
d=json.loads(Path('lessons/park.json').read_text());b.validate(d)
f=Path('audio/park');f.mkdir(parents=True,exist_ok=True);m=json.loads((f/'manifest.json').read_text()) if (f/'manifest.json').exists() else {}
assert b.api_key(), 'OPENAI_API_KEY is required'
for i,line in enumerate(d['dialogue'],1):
 name=f'{i:02}.mp3';voice=d['voices'][line['speaker']]; mismatch=None
 if (f/name).exists():
  record=m.get(name,{})
  assert record.get('text_sha256')==b.digest(line['en'].encode()) and record.get('audio_sha256')==b.digest((f/name).read_bytes()) and record.get('voice')==voice and record.get('model')==b.MODEL, f'{name}: existing audio does not match manifest'
  continue
 try: audio=b.speech(dict(model=b.MODEL,voice=voice,input=line['en'],instructions=b.INSTRUCTIONS),b.api_key())
 except b.TranscriptMismatch as e: audio=e.audio;mismatch=e
 (f/name).write_bytes(audio)
 m[name]=dict(text_sha256=b.digest(line['en'].encode()),audio_sha256=b.digest(audio),voice=voice,model=b.MODEL,transcript_check='review' if mismatch else 'matched')
 if mismatch:m[name]['transcript']=mismatch.transcript
 (f/'manifest.json').write_text(json.dumps(m,ensure_ascii=False,indent=2)+'\n');print(name,m[name]['transcript_check'],flush=True)
(f/'concat.txt').write_text(''.join(f"file '{i:02}.mp3'\n" for i in range(1,13)))
subprocess.run(['ffmpeg','-v','error','-y','-f','concat','-safe','0','-i',str(f/'concat.txt'),'-c','copy',str(f/'dialogue-full.mp3')],check=True);(f/'concat.txt').unlink()
