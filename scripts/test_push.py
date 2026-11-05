import json, os, tempfile, unittest
import push

def sample():
    bots = []
    for i in sorted(push.REQUIRED):
        bots.append({'id': i, 'lastActionAt': None, 'observedAt': None, 'sourceUpdatedAt': None, 'actionKind': None, 'status': 'UNKNOWN'})
    return {
        'schemaVersion': 1,
        'generatedAt': '2026-11-05T19:00:00Z',
        'bots': bots,
        'perf': None,
        'pnlByToken': [],
        'positions': [],
        'v4': {'builtAt': 1, 'a1': {'total': 0}}
    }

class PushTest(unittest.TestCase):
    def test_hash_ignores_generation_fields(self):
        a = sample(); b = sample()
        b['generatedAt'] = '2026-11-05T20:00:00Z'
        b['v4']['builtAt'] = 999
        self.assertEqual(push.content_hash(a), push.content_hash(b))
        b['bots'][0]['status'] = 'IDLE'
        self.assertNotEqual(push.content_hash(a), push.content_hash(b))

    def test_validate_rejects_tax_and_bad_ids(self):
        ok = sample()
        push.validate_state(ok)
        bad = sample(); bad['perf'] = {'totalEur': -0.67}
        with self.assertRaises(ValueError):
            push.validate_state(bad)
        leaked = sample(); leaked['note'] = 'realized_result'
        with self.assertRaises(ValueError):
            push.validate_state(leaked)

    def test_no_upload_when_export_fails_or_unchanged(self):
        calls = []
        def request(method, url, data=None):
            calls.append(method)
            if method == 'PUT':
                return {'content': {'sha': 'new'}}
            return {'sha': 'old'}
        sha, last, status = push.cycle(1, b'{}', request, 'u', None, '')
        self.assertEqual(status, 'export-failed')
        self.assertEqual(calls, [])
        raw = json.dumps(sample()).encode()
        sha, last, status = push.cycle(0, raw, request, 'u', 'old', '')
        self.assertEqual(status, 'pushed')
        self.assertEqual(sha, 'new')
        sha, last, status = push.cycle(0, raw, request, 'u', sha, last)
        self.assertEqual(status, 'unchanged')

    def test_conflict_retries_once(self):
        import urllib.error
        seen = []
        def request(method, url, data=None):
            seen.append((method, None if data is None else data.get('sha')))
            if method == 'PUT' and data.get('sha') == 'stale':
                raise urllib.error.HTTPError(url, 409, 'conflict', None, None)
            if method == 'GET':
                return {'sha': 'fresh'}
            return {'content': {'sha': 'fresh'}}
        sha = push.upload(request, 'u', 'stale', b'{}')
        self.assertEqual(sha, 'fresh')
        self.assertEqual(seen[1][0], 'GET')
        self.assertEqual(seen[2][1], 'fresh')

    def test_atomic_replace(self):
        d = tempfile.mkdtemp()
        dest = os.path.join(d, 'state.json')
        push.atomic_write(dest, b'{"ok":true}')
        with open(dest, 'rb') as fh:
            self.assertEqual(fh.read(), b'{"ok":true}')
        self.assertEqual(os.listdir(d), ['state.json'])

if __name__ == '__main__':
    unittest.main()
