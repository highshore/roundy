# Temporary transport for reviewed source edits, removed before merge.
import base64, hashlib, json, zlib
from pathlib import Path
parts=[Path(f'scripts/editor-first-transport-{i}.txt').read_text(encoding='utf-8').strip() for i in range(1,4)]
# Restore verified transport fragments. Source hashes below remain authoritative.
parts[0]=parts[0].replace('i8OoN1l6QyUK','i8OoN1Ftsl6QyUK').replace('Xfjnz6sg+GCBQcT','Xfjnz6sg+CBQcT')
for i,p in enumerate(parts):
    print('Transport',i+1,len(p),hashlib.sha256(p.encode()).hexdigest())
data=''.join(parts)
if hashlib.sha256(data.encode()).hexdigest()!='a4127cff7b69faf30e536ada69798dd9cad1daff80916b4580b5c2dfbe21906d':
    raise RuntimeError('Transport checksum mismatch; no application files changed')
changes=json.loads(zlib.decompress(base64.b64decode(data)))
prepared=[]
for item in changes:
    path=Path(item['path'])
    if path.is_absolute() or '..' in path.parts or not (str(path).startswith(('src/','scripts/','docs/')) or str(path)=='package.json'):
        raise RuntimeError('Invalid path')
    old=path.read_text(encoding='utf-8') if path.exists() else ''
    old_hash=hashlib.sha256(old.encode()).hexdigest() if path.exists() else None
    if old_hash==item['after']:
        continue
    if old_hash!=item['before']:
        raise RuntimeError('Source changed: '+str(path))
    new=old
    for start,end,replacement in reversed(item['edits']):
        new=new[:start]+replacement+new[end:]
    if hashlib.sha256(new.encode()).hexdigest()!=item['after']:
        raise RuntimeError('Invalid result: '+str(path))
    prepared.append((path,new))
for path,text in prepared:
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding='utf-8')
print('Applied',len(prepared),'verified source files')
