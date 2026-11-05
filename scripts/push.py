#!/usr/bin/env python3
"""Upload a freshly exported state.json. Token stays in GITHUB_DASH_TOKEN.

Does not upload when export fails, validation fails, or the canonical content
hash is unchanged. Generation timestamps are not part of that hash.
"""
import hashlib, json, os, subprocess, tempfile, urllib.error, urllib.request

REPO = 'fynnabi15-lang/live-dashboard'
DROP = {'generatedAt', 'builtAt', 'receivedAt', 'uploadAt', 'ageMin'}
REQUIRED = {'MAIN','A1','A2','A3','A4','A5','B1','B2','B3','C1','C2','C3','D1','D2','D3','D4','D5','TRADES'}

def strip(o):
    if isinstance(o, dict):
        return {k: strip(o[k]) for k in sorted(o) if k not in DROP}
    if isinstance(o, list):
        return [strip(x) for x in o]
    return o

def content_hash(state):
    raw = json.dumps(strip(state), sort_keys=True, separators=(',', ':'), ensure_ascii=False)
    return hashlib.sha256(raw.encode()).hexdigest()

def validate_state(state):
    if not isinstance(state, dict) or state.get('schemaVersion') != 1:
        raise ValueError('schemaVersion')
    ids = [b.get('id') for b in state.get('bots') or []]
    if set(ids) != REQUIRED or len(ids) != len(REQUIRED):
        raise ValueError('bots')
    for b in state['bots']:
        for key in ('lastActionAt', 'observedAt', 'sourceUpdatedAt', 'actionKind', 'status'):
            if key not in b:
                raise ValueError('bot ' + b.get('id', '') + ' ' + key)
    if state.get('perf') not in (None,):
        raise ValueError('perf')
    if state.get('pnlByToken') not in (None, []):
        raise ValueError('pnl')
    if state.get('positions') not in (None, []):
        raise ValueError('positions')
    blob = json.dumps(state)
    for banned in ('realized_result', 'cost_eur', 'fifo', '/home/'):
        if banned in blob:
            raise ValueError('banned ' + banned)

def atomic_write(dest, data: bytes):
    d = os.path.dirname(dest) or '.'
    fd, tmp = tempfile.mkstemp(prefix='.state-', dir=d)
    try:
        os.write(fd, data)
        os.fsync(fd)
        os.close(fd)
        fd = None
        os.replace(tmp, dest)
        tmp = None
    finally:
        if fd is not None:
            os.close(fd)
        if tmp and os.path.exists(tmp):
            os.remove(tmp)

def run_export(cmd, env):
    proc = subprocess.run(cmd, env=env, capture_output=True, timeout=90)
    return proc.returncode

def upload(request, url, sha, raw):
    body = {'message': 'bot-state', 'content': __import__('base64').b64encode(raw).decode(), 'branch': 'data'}
    if sha:
        body['sha'] = sha
    try:
        return request('PUT', url, body)['content']['sha']
    except urllib.error.HTTPError as e:
        if e.code not in (409, 422):
            raise
        fresh = request('GET', url + '?ref=data')['sha']
        body['sha'] = fresh
        return request('PUT', url, body)['content']['sha']

def cycle(export_code, raw, request, url, sha, last_hash):
    if export_code != 0 or raw is None:
        return sha, last_hash, 'export-failed'
    try:
        state = json.loads(raw)
        validate_state(state)
    except (ValueError, json.JSONDecodeError):
        return sha, last_hash, 'invalid'
    digest = content_hash(state)
    if digest == last_hash:
        return sha, last_hash, 'unchanged'
    try:
        sha = upload(request, url, sha, raw)
    except Exception:
        return sha, last_hash, 'upload-failed'
    return sha, digest, 'pushed'

def main():
    if os.environ.get('ALLOW_UPLOAD') != '1':
        print('upload disabled; dry-run is node export-state-safe.js only', flush=True)
        return 2
    token = os.environ['GITHUB_DASH_TOKEN']
    url = f'https://api.github.com/repos/{REPO}/contents/state.json'
    headers = {'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'bot-push'}
    def request(method, u, data=None):
        req = urllib.request.Request(u, data=json.dumps(data).encode() if data is not None else None, headers=headers, method=method)
        with urllib.request.urlopen(req, timeout=30) as res:
            return json.load(res)
    script = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'export-state-safe.js')
    out = os.environ.get('OUT_DIR') or tempfile.mkdtemp(prefix='botpush-')
    sha = None
    try:
        sha = request('GET', url + '?ref=data')['sha']
    except Exception as e:
        print('noexisting', type(e).__name__, flush=True)
    last = ''
    while True:
        work = tempfile.mkdtemp(prefix='botpush-')
        env = {**os.environ, 'OUT_DIR': work, 'SHARED_DIR': os.environ['SHARED_DIR']}
        code = run_export(['node', script], env)
        raw = None
        path = os.path.join(work, 'state.json')
        if code == 0 and os.path.isfile(path):
            with open(path, 'rb') as f:
                raw = f.read()
        sha, last, status = cycle(code, raw, request, url, sha, last)
        if status == 'pushed' and raw is not None:
            atomic_write(os.path.join(out, 'state.json'), raw)
        print(status, flush=True)
        import time
        time.sleep(int(os.environ.get('PUSH_INTERVAL', '60')))

if __name__ == '__main__':
    main()
