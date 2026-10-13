# Temporary hash-checked test-loader update; remove before merge.
import hashlib
from pathlib import Path
p=Path('scripts/test-marketing-answer-first.mjs')
s=p.read_text(encoding='utf-8')
before='78c81cfae9e2084685c0e228fa182bf193f3bf8ed6bef22d9ccb1fb1e5a6ac11'
after='f96ebd3f02f0d5ec5b847aa5dda551649073080e2d9dba3de78cdf9cffe9907a'
hash=lambda v:hashlib.sha256(v.encode()).hexdigest()
if hash(s)!=after:
    if hash(s)!=before: raise RuntimeError('Test source changed')
    s=s.replace('vm.runInNewContext(js,{module,exports:module.exports,',"const editorFirstModule={exports:{}};\nvm.runInNewContext(ts.transpileModule(read('src/lib/marketing-editor-first.ts'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:editorFirstModule,exports:editorFirstModule.exports});\nvm.runInNewContext(js,{module,exports:module.exports,")
    s=s.replace("require:name=>{if(name==='./marketing-carousel-template')", "require:name=>{if(name==='./marketing-editor-first')return editorFirstModule.exports;if(name==='./marketing-carousel-template')")
    if hash(s)!=after: raise RuntimeError('Test result mismatch')
    p.write_text(s,encoding='utf-8')
print('Test dependency loader verified')
